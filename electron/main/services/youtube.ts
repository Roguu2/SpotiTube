import vm from 'node:vm'
import { join } from 'node:path'
import { app } from 'electron'
import { Innertube, Log, Platform, UniversalCache, YTNodes } from 'youtubei.js'
import { getSecret, setSecret } from './store'

// youtubei.js needs a JavaScript evaluator to run YouTube's signature/n-param
// deciphering functions. Run them in an isolated V8 context with no access to
// Node globals and a hard timeout, rather than `new Function` in the main realm.
Platform.shim.eval = (data, env) => {
  const exports: string[] = []
  if (env.n) exports.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`)
  if (env.sig) exports.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`)
  const script = `(() => {\n${data.output}\nreturn { ${exports.join(', ')} }\n})()`
  return vm.runInNewContext(script, Object.create(null), { timeout: 3_000 }) as Record<string, string>
}

// The parser logs every unknown renderer it meets; keep stdout clean in production.
Log.setLevel(app.isPackaged ? Log.Level.NONE : Log.Level.ERROR)

/**
 * Owns the InnerTube sessions. An anonymous session handles search and stream
 * extraction (the mobile/TV stream clients reject web cookies); an optional
 * cookie-authenticated session reads the user's YouTube Music library.
 */
export class YouTubeClient {
  private anonymous: Promise<Innertube> | null = null
  private authenticated: Promise<Innertube> | null = null
  private cookie: string | null = getSecret('ytmusicCookie')
  private readonly cache = new UniversalCache(true, join(app.getPath('userData'), 'yt-cache'))

  hasCookie(): boolean {
    return this.cookie !== null
  }

  getAnonymous(): Promise<Innertube> {
    this.anonymous ??= Innertube.create({
      cache: this.cache,
      retrieve_player: true,
      generate_session_locally: true,
      // The computer's country, so charts, search and Discover lean local (e.g. Polish hip-hop in Poland).
      location: app.getLocaleCountryCode() || undefined
    }).catch((error: unknown) => {
      this.anonymous = null
      throw error
    })
    return this.anonymous
  }

  getAuthenticated(): Promise<Innertube> {
    if (!this.cookie) return Promise.reject(new Error('YouTube Music is not connected'))
    this.authenticated ??= this.createAuthenticated(this.cookie).catch((error: unknown) => {
      this.authenticated = null
      throw error
    })
    return this.authenticated
  }

  /** Validates a browser cookie header, persists it and returns the account name. */
  async connect(cookie: string): Promise<string> {
    const normalized = normalizeCookie(cookie)
    const session = await this.createAuthenticated(normalized)
    const name = await accountName(session)
    this.cookie = normalized
    this.authenticated = Promise.resolve(session)
    setSecret('ytmusicCookie', normalized)
    return name
  }

  disconnect(): void {
    this.cookie = null
    this.authenticated = null
    setSecret('ytmusicCookie', null)
  }

  private async createAuthenticated(cookie: string): Promise<Innertube> {
    const session = await Innertube.create({ cookie, cache: this.cache, retrieve_player: false })
    if (!session.session.logged_in) {
      throw new Error('YouTube did not accept the cookie — copy it again from a signed-in music.youtube.com tab')
    }
    return session
  }
}

/** Accepts either a raw `Cookie:` header value or a full "Cookie: ..." line. */
function normalizeCookie(input: string): string {
  const value = input
    .trim()
    .replace(/^cookie:\s*/i, '')
    .replace(/\s*\n\s*/g, ' ')
  if (!/(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID)=/.test(value)) {
    throw new Error('Cookie must contain SAPISID / __Secure-3PAPISID from a signed-in music.youtube.com session')
  }
  return value
}

async function accountName(session: Innertube): Promise<string> {
  try {
    const info = await session.account.getInfo()
    const item = info.contents?.contents.firstOfType(YTNodes.AccountItem)
    const name = item?.account_name.toString()
    if (name) return name
  } catch {
    // Brand accounts and some regions do not expose the account menu; the session is still valid.
  }
  return 'YouTube Music account'
}

/** Picks the largest thumbnail and asks Google's image CDN for a crisp square render. */
export function bestThumbnail(thumbnails: { url: string; width: number }[] | undefined, size = 544): string | undefined {
  if (!thumbnails?.length) return undefined
  const best = thumbnails.reduce((a, b) => (b.width > a.width ? b : a))
  return best.url.replace(/=w\d+-h\d+(-[a-z0-9-]+)?$/i, `=w${size}-h${size}-l90-rj`)
}
