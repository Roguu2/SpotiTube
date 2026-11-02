import type { Types } from 'youtubei.js'
import type { YouTubeClient } from './youtube'
import { resolveWithYtDlp } from './ytdlp'
import { getSettings } from './store'
import { errorMessage } from './http'

/**
 * InnerTube clients that currently return directly playable audio without a
 * PO token, in order of preference. WEB/TV/ANDROID_VR are refused upstream.
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

/** Turns a YouTube video id into a short-lived direct googlevideo audio URL. */
export class StreamResolver {
  private readonly cache = new Map<string, CachedStream>()
  private readonly inflight = new Map<string, Promise<string>>()

  constructor(private readonly youtube: YouTubeClient) {}

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
