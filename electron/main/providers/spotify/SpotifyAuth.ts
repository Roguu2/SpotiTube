import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { shell } from 'electron'
import { fetchJson } from '../../services/http'
import { SPOTIFY_REDIRECT_PORT, SPOTIFY_REDIRECT_URI, getSecret, setSecret } from '../../services/store'

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read', 'user-read-private']
const LOGIN_TIMEOUT_MS = 5 * 60_000
/** Refresh slightly before expiry so in-flight requests never carry a stale token. */
const EXPIRY_SKEW_MS = 60_000

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  clientId: string
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
}

const base64Url = (buffer: Buffer): string => buffer.toString('base64url')

function callbackPage(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SpotiTube</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#09090b;color:#e4e4e7;font:15px system-ui,sans-serif}
main{text-align:center}h1{font-size:22px;margin:0 0 8px;background:linear-gradient(90deg,#1DB954,#FF0000);-webkit-background-clip:text;color:transparent}</style>
</head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
}

export class SpotifyAuth {
  private tokens: StoredTokens | null = null
  private refreshing: Promise<StoredTokens> | null = null
  private pendingLogin: Promise<void> | null = null

  constructor(private readonly getClientId: () => string) {
    const raw = getSecret('spotifyTokens')
    if (raw) {
      try {
        this.tokens = JSON.parse(raw) as StoredTokens
      } catch {
        setSecret('spotifyTokens', null)
      }
    }
  }

  isConnected(): boolean {
    return this.tokens !== null && this.tokens.clientId === this.getClientId()
  }

  logout(): void {
    this.tokens = null
    setSecret('spotifyTokens', null)
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens || !this.isConnected()) throw new Error('Spotify is not connected')
    if (Date.now() < this.tokens.expiresAt - EXPIRY_SKEW_MS) return this.tokens.accessToken
    return (await this.refresh()).accessToken
  }

  /** Forces a token refresh, e.g. after the API rejected the current token. */
  async refresh(): Promise<StoredTokens> {
    if (!this.tokens) throw new Error('Spotify is not connected')
    this.refreshing ??= this.requestRefresh(this.tokens).finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  /** Runs the OAuth 2.0 Authorization Code + PKCE flow in the system browser. */
  login(): Promise<void> {
    this.pendingLogin ??= this.runLogin().finally(() => {
      this.pendingLogin = null
    })
    return this.pendingLogin
  }

  private async requestRefresh(current: StoredTokens): Promise<StoredTokens> {
    try {
      const response = await fetchJson<TokenResponse>(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
          client_id: current.clientId
        })
      })
      return this.persist(response, current.clientId, current.refreshToken)
    } catch (error) {
      // A revoked refresh token cannot recover; force the user to reconnect.
      this.logout()
      throw error
    }
  }

  private persist(response: TokenResponse, clientId: string, previousRefreshToken?: string): StoredTokens {
    const refreshToken = response.refresh_token ?? previousRefreshToken
    if (!refreshToken) throw new Error('Spotify did not return a refresh token')
    this.tokens = {
      accessToken: response.access_token,
      refreshToken,
      expiresAt: Date.now() + response.expires_in * 1000,
      clientId
    }
    setSecret('spotifyTokens', JSON.stringify(this.tokens))
    return this.tokens
  }

  private async runLogin(): Promise<void> {
    const clientId = this.getClientId()
    if (!clientId) throw new Error('Add your Spotify Client ID in Settings before connecting')

    const verifier = base64Url(randomBytes(64))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const state = base64Url(randomBytes(16))

    const code = await this.awaitAuthorizationCode(state, () => {
      const url = new URL(AUTHORIZE_URL)
      url.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
        scope: SCOPES.join(' ')
      }).toString()
      void shell.openExternal(url.toString())
    })

    const response = await fetchJson<TokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: clientId,
        code_verifier: verifier
      })
    })
    this.persist(response, clientId)
  }

  private awaitAuthorizationCode(expectedState: string, openBrowser: () => void): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let settled = false
      let server: Server | null = null

      const finish = (error: Error | null, code?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        server?.close()
        if (error) reject(error)
        else resolve(code as string)
      }

      const timer = setTimeout(() => finish(new Error('Spotify login timed out')), LOGIN_TIMEOUT_MS)

      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', SPOTIFY_REDIRECT_URI)
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })

        if (error || !code || state !== expectedState) {
          res.end(callbackPage('Connection failed', 'You can close this tab and try again from SpotiTube.'))
          finish(new Error(error ? `Spotify denied access: ${error}` : 'Invalid Spotify callback'))
          return
        }
        res.end(callbackPage('Spotify connected', 'You can close this tab and return to SpotiTube.'))
        finish(null, code)
      })

      server.on('error', (err: NodeJS.ErrnoException) => {
        finish(
          err.code === 'EADDRINUSE'
            ? new Error(`Port ${SPOTIFY_REDIRECT_PORT} is in use; close the app using it and retry`)
            : err
        )
      })
      server.listen(SPOTIFY_REDIRECT_PORT, '127.0.0.1', openBrowser)
    })
  }
}
