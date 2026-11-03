import { app } from 'electron'
import type { LyricLine, Lyrics } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { fetchJson, HttpError } from './http'

/**
 * Lyrics from LRCLIB (https://lrclib.net) — a free, open lyrics database with
 * time-synced (LRC) lyrics and no API key. Their only request is an
 * identifying User-Agent.
 */
const API = 'https://lrclib.net/api'
const CACHE_LIMIT = 200
/** A match whose length differs by more than this is probably a different recording. */
const MAX_DURATION_DRIFT_S = 10
const REQUEST = { timeoutMs: 8_000, retries: 4 } as const

interface LrclibRecord {
  id: number
  trackName: string
  artistName: string
  albumName?: string | null
  duration?: number | null
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

const cache = new Map<string, Promise<Lyrics | null>>()

function userAgent(): string {
  return `SpotiTube/${app.getVersion()} (https://github.com/Roguu2/SpotiTube)`
}

/** Drops decorations that streaming services add but lyric databases don't use. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([][^)\]]*\b(remaster(ed)?|official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|mono|stereo|radio edit|explicit|clean|feat\.?|ft\.?|with)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|radio edit|single version|mono|stereo)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function cleanArtist(name: string): string {
  return name.replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim()
}

/** Parses `[mm:ss.xx] text` lines; a line may carry several timestamps. Metadata tags are skipped. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = []
  const stamp = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g
  for (const raw of lrc.split(/\r?\n/)) {
    const times: number[] = []
    let match: RegExpExecArray | null
    let end = 0
    stamp.lastIndex = 0
    while ((match = stamp.exec(raw)) && match.index === end) {
      times.push(Number(match[1]) * 60 + Number(match[2].replace(':', '.')))
      end = stamp.lastIndex
    }
    if (!times.length) continue
    const text = raw.slice(end).trim()
    for (const time of times) lines.push({ time, text })
  }
  return lines.sort((a, b) => a.time - b.time)
}

function toLyrics(record: LrclibRecord): Lyrics {
  const synced = record.syncedLyrics ? parseLrc(record.syncedLyrics) : []
  return {
    synced: synced.length ? synced : null,
    plain: record.plainLyrics?.trim() || null,
    instrumental: record.instrumental === true,
    durationSec: record.duration ?? null
  }
}

function hasLyrics(record: LrclibRecord): boolean {
  return record.instrumental === true || !!record.syncedLyrics || !!record.plainLyrics
}

async function getExact(artist: string, title: string, album: string | undefined, duration: number): Promise<LrclibRecord | null> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title, duration: String(duration) })
  if (album) params.set('album_name', album)
  try {
    return await fetchJson<LrclibRecord>(`${API}/get?${params}`, { ...REQUEST, headers: { 'User-Agent': userAgent() } })
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  }
}

async function search(params: Record<string, string>): Promise<LrclibRecord[]> {
  return fetchJson<LrclibRecord[]>(`${API}/search?${new URLSearchParams(params)}`, {
    ...REQUEST,
    headers: { 'User-Agent': userAgent() }
  })
}

/** Closest length first, synced lyrics preferred among equally close matches. */
function pickBest(records: LrclibRecord[], duration: number): LrclibRecord | null {
  const scored = records
    .filter(hasLyrics)
    .map((record) => ({ record, drift: record.duration ? Math.abs(record.duration - duration) : MAX_DURATION_DRIFT_S }))
    .filter(({ drift }) => duration <= 0 || drift <= MAX_DURATION_DRIFT_S)
    .sort((a, b) => a.drift - b.drift || Number(!!b.record.syncedLyrics) - Number(!!a.record.syncedLyrics))
  return scored[0]?.record ?? null
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error })
  )
}

async function lookup(track: UnifiedTrack): Promise<Lyrics | null> {
  const title = cleanTitle(track.title) || track.title
  const artist = cleanArtist(track.artists[0]?.name ?? '')
  const duration = Math.round(track.durationMs / 1000)
  if (!artist) return null

  // The exact endpoint is strict about album and length; search is fuzzier. Ask both at once.
  const [exact, fields] = await Promise.all([
    settle(getExact(artist, title, track.album?.name, duration)),
    settle(search({ track_name: title, artist_name: artist }))
  ])
  const exactRecord = exact.ok && exact.value && hasLyrics(exact.value) ? exact.value : null
  if (exactRecord && (exactRecord.syncedLyrics || exactRecord.instrumental)) return toLyrics(exactRecord)
  const fieldsBest = fields.ok ? pickBest(fields.value, duration) : null
  if (fieldsBest?.syncedLyrics) return toLyrics(fieldsBest)

  const free = await settle(search({ q: `${artist} ${title}` }))
  const freeBest = free.ok ? pickBest(free.value, duration) : null

  // Synced lyrics win over plain text from any of the three answers.
  const candidates = [fieldsBest, freeBest, exactRecord].filter((record): record is LrclibRecord => record !== null)
  const best = candidates.find((record) => record.syncedLyrics) ?? candidates[0]
  if (best) return toLyrics(best)
  // Nothing found is only an answer when LRCLIB actually answered.
  if (!exact.ok && !fields.ok && !free.ok) throw exact.error
  return null
}

export function getLyrics(track: UnifiedTrack): Promise<Lyrics | null> {
  const key = `${track.id}|${track.title}|${track.durationMs}`
  let pending = cache.get(key)
  if (!pending) {
    pending = lookup(track)
    // Failed lookups (offline, rate limited) are retried next time instead of cached.
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  }
  return pending
}
