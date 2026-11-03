import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import QRCode from 'qrcode'
import type { RemoteCommand, RemoteState, RemoteStatus, SearchResults } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { REMOTE_APP_JS, REMOTE_ICON_SVG, REMOTE_MANIFEST, REMOTE_PAGE_HTML } from './page'

/** Fixed, so a phone that bookmarked the remote finds it again after a restart. */
const DEFAULT_PORT = 48620
const PORT_ATTEMPTS = 10
const MAX_CLIENTS = 8
const KEEPALIVE_MS = 20_000
const MAX_BODY_BYTES = 8 * 1024
const SEARCH_RESULTS = 25
const KNOWN_TRACKS_LIMIT = 500
/** Wrong pairing secrets allowed per address before it is locked out for the window. */
const MAX_AUTH_FAILURES = 20
const AUTH_FAILURE_WINDOW_MS = 10 * 60_000

const TRACK_COMMANDS = new Set(['play-now', 'play-next', 'add-to-queue', 'radio'])
const SIMPLE_COMMANDS = new Set(['toggle', 'next', 'previous', 'mute', 'shuffle', 'repeat'])

export interface RemoteServerDeps {
  /** The pairing secret; created on first use. */
  getToken(): string
  search(query: string): Promise<SearchResults>
  onCommand(command: RemoteCommand): void
  onStatusChange(): void
}

/** A fresh pairing secret. */
export function createRemoteToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Private IPv4 addresses first, virtual adapters (VPNs, VMs, WSL) last. */
function lanAddresses(): string[] {
  const virtual = /vethernet|virtualbox|vmware|wsl|hyper-v|docker|vbox|utun|tailscale|zerotier|loopback/i
  const found: { address: string; score: number }[] = []
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal || entry.address.startsWith('169.254.')) continue
      const [a, b] = entry.address.split('.').map(Number)
      const isPrivate = a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
      const score = (isPrivate ? 0 : 10) + (a === 192 ? 0 : 1) + (virtual.test(name) ? 20 : 0)
      found.push({ address: entry.address, score })
    }
  }
  return found.sort((x, y) => x.score - y.score).map((x) => x.address)
}

/**
 * Only IP literals and localhost may be used to reach the remote. A web page
 * that points its own domain at this computer (DNS rebinding) is turned away.
 */
function isAllowedHost(host: string | undefined): boolean {
  if (!host) return false
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.replace(/:\d+$/, '')
  return name === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(':')
}

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY'
}

const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src https: data:',
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

function send(res: ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, JSON.stringify(value))
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * The phone remote: a small HTTP server on the local network that serves a
 * mobile web page, streams the player's state to it (Server-Sent Events) and
 * relays its commands to the renderer. Every API call needs the pairing
 * secret that the QR code carries.
 */
export class RemoteServer {
  private server: Server | null = null
  private port: number | null = null
  private error: string | null = null
  private readonly clients = new Set<ServerResponse>()
  private state: RemoteState | null = null
  private stateAt = 0
  /** Tracks handed out in search results; commands refer to them by id. */
  private readonly knownTracks = new Map<string, UnifiedTrack>()
  private readonly failures = new Map<string, { count: number; since: number }>()
  private keepalive: NodeJS.Timeout | null = null

  constructor(private readonly deps: RemoteServerDeps) {}

  get running(): boolean {
    return this.server !== null
  }

  async start(): Promise<void> {
    if (this.server) return
    this.error = null
    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
      const port = DEFAULT_PORT + attempt
      const server = createServer((req, res) => void this.route(req, res))
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, '0.0.0.0', () => resolve())
        })
      } catch (error) {
        server.close()
        if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') continue
        this.error = error instanceof Error ? error.message : String(error)
        break
      }
      this.server = server
      this.port = port
      this.keepalive = setInterval(() => this.broadcast(': ping\n\n'), KEEPALIVE_MS)
      break
    }
    if (!this.server && !this.error) this.error = `Ports ${DEFAULT_PORT}–${DEFAULT_PORT + PORT_ATTEMPTS - 1} are all in use`
    this.deps.onStatusChange()
  }

  stop(): void {
    this.disconnectAll()
    if (this.keepalive) clearInterval(this.keepalive)
    this.keepalive = null
    this.server?.close()
    this.server = null
    this.port = null
    this.deps.onStatusChange()
  }

  /** Drops every connected phone (after the pairing secret changed). */
  disconnectAll(): void {
    for (const client of this.clients) client.end()
    this.clients.clear()
    this.deps.onStatusChange()
  }

  publish(state: RemoteState): void {
    this.state = state
    this.stateAt = Date.now()
    this.broadcast(`event: state\ndata: ${JSON.stringify(state)}\n\n`)
  }

  async status(enabled: boolean): Promise<RemoteStatus> {
    const [address, ...others] = lanAddresses()
    const base = (ip: string): string => `http://${ip}:${this.port}`
    const url = this.port && address ? base(address) : null
    return {
      enabled,
      running: this.running,
      url,
      otherUrls: this.port ? others.map(base) : [],
      // The secret rides in the fragment, which browsers never send to a server.
      qrDataUrl: url
        ? await QRCode.toDataURL(`${url}/#${this.deps.getToken()}`, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
        : null,
      clients: this.clients.size,
      error: this.error ?? (this.running && !address ? 'No local network connection found' : null)
    }
  }

  private broadcast(chunk: string): void {
    for (const client of this.clients) client.write(chunk)
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isAllowedHost(req.headers.host)) return send(res, 421, 'Misdirected request', 'text/plain')
    const url = new URL(req.url ?? '/', 'http://remote')

    if (req.method === 'GET') {
      switch (url.pathname) {
        case '/':
          res.setHeader('Content-Security-Policy', PAGE_CSP)
          return send(res, 200, REMOTE_PAGE_HTML, 'text/html; charset=utf-8')
        case '/app.js':
          return send(res, 200, REMOTE_APP_JS, 'text/javascript; charset=utf-8')
        case '/manifest.webmanifest':
          return send(res, 200, REMOTE_MANIFEST, 'application/manifest+json')
        case '/icon.svg':
          return send(res, 200, REMOTE_ICON_SVG, 'image/svg+xml')
      }
    }

    if (!url.pathname.startsWith('/api/')) return send(res, 404, 'Not found', 'text/plain')
    if (!this.authorize(req, url)) {
      return sendJson(res, this.isLockedOut(req) ? 429 : 401, { error: 'Not paired' })
    }

    try {
      if (req.method === 'GET' && url.pathname === '/api/events') return this.openEvents(req, res)
      if (req.method === 'GET' && url.pathname === '/api/search') return sendJson(res, 200, await this.search(url))
      if (req.method === 'POST' && url.pathname === '/api/command') {
        const command = this.parseCommand(await readBody(req))
        if (!command) return sendJson(res, 400, { error: 'Unknown command' })
        this.deps.onCommand(command)
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Bad request' })
    }
  }

  private authorize(req: IncomingMessage, url: URL): boolean {
    if (this.isLockedOut(req)) return false
    const header = req.headers.authorization
    const given = header?.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token')
    if (sameSecret(given, this.deps.getToken())) return true

    const ip = req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const entry = this.failures.get(ip)
    if (!entry || now - entry.since > AUTH_FAILURE_WINDOW_MS) this.failures.set(ip, { count: 1, since: now })
    else entry.count++
    return false
  }

  private isLockedOut(req: IncomingMessage): boolean {
    const entry = this.failures.get(req.socket.remoteAddress ?? 'unknown')
    return !!entry && entry.count >= MAX_AUTH_FAILURES && Date.now() - entry.since <= AUTH_FAILURE_WINDOW_MS
  }

  private openEvents(req: IncomingMessage, res: ServerResponse): void {
    if (this.clients.size >= MAX_CLIENTS) return sendJson(res, 503, { error: 'Too many remotes connected' })
    res.writeHead(200, {
      ...BASE_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive'
    })
    res.write('retry: 3000\n\n')
    if (this.state) {
      // The snapshot may be seconds old; move its playhead on to now.
      const elapsed = this.state.isPlaying ? (Date.now() - this.stateAt) / 1000 : 0
      const position = Math.min(this.state.duration || Infinity, this.state.position + elapsed)
      res.write(`event: state\ndata: ${JSON.stringify({ ...this.state, position })}\n\n`)
    }
    this.clients.add(res)
    this.deps.onStatusChange()
    req.on('close', () => {
      this.clients.delete(res)
      this.deps.onStatusChange()
    })
  }

  private async search(url: URL): Promise<{ tracks: UnifiedTrack[] }> {
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200)
    if (!query) return { tracks: [] }
    const results = await this.deps.search(query)
    // Interleave both catalogs so neither drowns out the other.
    const tracks: UnifiedTrack[] = []
    for (let i = 0; tracks.length < SEARCH_RESULTS && (i < results.spotify.length || i < results.ytmusic.length); i++) {
      if (results.spotify[i]) tracks.push(results.spotify[i])
      if (results.ytmusic[i]) tracks.push(results.ytmusic[i])
    }
    for (const track of tracks) {
      this.knownTracks.delete(track.id)
      this.knownTracks.set(track.id, track)
    }
    while (this.knownTracks.size > KNOWN_TRACKS_LIMIT) {
      this.knownTracks.delete(this.knownTracks.keys().next().value as string)
    }
    return { tracks: tracks.slice(0, SEARCH_RESULTS) }
  }

  /** Accepts only well-formed commands; tracks must come from this server's own search results. */
  private parseCommand(body: unknown): RemoteCommand | null {
    if (!body || typeof body !== 'object') return null
    const { type, seconds, volume, position, trackId } = body as Record<string, unknown>
    if (typeof type !== 'string') return null
    if (SIMPLE_COMMANDS.has(type)) return { type } as RemoteCommand
    if (type === 'seek' && typeof seconds === 'number' && Number.isFinite(seconds)) {
      return { type, seconds: Math.max(0, seconds) }
    }
    if (type === 'volume' && typeof volume === 'number' && Number.isFinite(volume)) {
      return { type, volume: Math.min(1, Math.max(0, volume)) }
    }
    if (type === 'jump' && typeof position === 'number' && Number.isInteger(position) && position >= 0) {
      return { type, position }
    }
    if (TRACK_COMMANDS.has(type) && typeof trackId === 'string') {
      const track = this.knownTracks.get(trackId)
      if (track) return { type, track } as RemoteCommand
    }
    return null
  }
}
