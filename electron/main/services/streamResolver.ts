import type { Types } from 'youtubei.js'
import type { YouTubeClient } from './youtube'
import { resolveWithYtDlp } from './ytdlp'
import { getSettings } from './store'
import { errorMessage } from './http'

/**
 * InnerTube clients that return stream URLs, in order of preference. Whether
 * those URLs serve the complete file is checked separately by {@link StreamResolver.hasFullAccess}.
 */
const STREAM_CLIENTS: Types.InnerTubeClient[] = ['YTMUSIC', 'IOS', 'MWEB']
const YT_DLP = 'yt-dlp' as const
const DEFAULT_TTL_MS = 5 * 60 * 60_000
const EXPIRY_SKEW_MS = 5 * 60_000

interface CachedStream {
  url: string
  expiresAt: number
  /** Index into the strategy list that produced this URL. */
  strategy: number
}

/** How long a verdict about full-stream access is trusted before re-checking. */
const ACCESS_TTL_MS = 10 * 60_000
/** Streams are served freely up to roughly this offset even when full access is denied. */
const FREE_PREFIX_BYTES = 1024 * 1024

/** Turns a YouTube video id into a short-lived direct googlevideo audio URL. */
export class StreamResolver {
  private readonly cache = new Map<string, CachedStream>()
  private readonly inflight = new Map<string, Promise<string>>()
  private access: { allowed: boolean; checkedAt: number } | null = null

  constructor(private readonly youtube: YouTubeClient) {}

  /** True when a recent check showed YouTube refusing full direct streams. */
  isKnownBlocked(): boolean {
    return this.access !== null && !this.access.allowed && Date.now() - this.access.checkedAt < ACCESS_TTL_MS
  }

  /** Records that the upstream refused bytes beyond the free prefix mid-playback. */
  markBlocked(): void {
    this.access = { allowed: false, checkedAt: Date.now() }
  }

  /**
   * Checks whether YouTube serves the *whole* stream. Without a proof-of-origin
   * token it only serves about the first megabyte and answers 403 afterwards —
   * playback would go silent after ~1 minute. The verdict is cached because it
   * applies to every stream from this session.
   */
  async hasFullAccess(url: string): Promise<boolean> {
    if (this.access && Date.now() - this.access.checkedAt < ACCESS_TTL_MS) return this.access.allowed

    const size = Number(new URL(url).searchParams.get('clen'))
    // A stream that fits in the free prefix proves nothing either way.
    if (!(size > FREE_PREFIX_BYTES + 64 * 1024)) return true

    const response = await fetch(url, {
      headers: { Range: `bytes=${size - 2}-${size - 1}` },
      signal: AbortSignal.timeout(10_000)
    })
    await response.body?.cancel()
    const allowed = response.status === 206 || response.status === 200
    this.access = { allowed, checkedAt: Date.now() }
    return allowed
  }

  /**
   * @param force Skip the cache and the strategy that produced the cached URL —
   *   used when the upstream rejected it (403/410).
   */
  resolve(videoId: string, force = false): Promise<string> {
    const cached = this.cache.get(videoId)
    if (!force && cached && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
      return Promise.resolve(cached.url)
    }

    const key = `${videoId}:${force ? 'force' : 'normal'}`
    let pending = this.inflight.get(key)
    if (!pending) {
      const startAt = force && cached ? cached.strategy + 1 : 0
      pending = this.extract(videoId, startAt).finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    return pending
  }

  private async extract(videoId: string, startAt: number): Promise<string> {
    const strategies: (Types.InnerTubeClient | typeof YT_DLP)[] = [...STREAM_CLIENTS, YT_DLP]
    const failures: string[] = []

    // Wrap around so a forced refresh still retries earlier strategies last.
    for (let i = 0; i < strategies.length; i++) {
      const index = (startAt + i) % strategies.length
      const strategy = strategies[index]
      try {
        const url =
          strategy === YT_DLP
            ? await resolveWithYtDlp(videoId, getSettings().ytDlpPath)
            : await this.extractWithClient(videoId, strategy)
        this.cache.set(videoId, { url, expiresAt: expiryOf(url), strategy: index })
        return url
      } catch (error) {
        failures.push(`${strategy}: ${errorMessage(error)}`)
      }
    }

    throw new Error(`No playable stream for ${videoId} (${failures.join('; ')})`)
  }

  private async extractWithClient(videoId: string, client: Types.InnerTubeClient): Promise<string> {
    const yt = await this.youtube.getAnonymous()
    const info = await yt.getBasicInfo(videoId, { client })
    const status = info.playability_status?.status
    if (status && status !== 'OK') {
      throw new Error(info.playability_status?.reason || status)
    }
    const format = info.chooseFormat({ type: 'audio', quality: 'best' })
    const url = await format.decipher(yt.session.player)
    if (!url) throw new Error('empty stream URL')
    return url
  }
}

function expiryOf(url: string): number {
  const expire = Number(new URL(url).searchParams.get('expire'))
  return Number.isFinite(expire) && expire > 0 ? expire * 1000 : Date.now() + DEFAULT_TTL_MS
}
