import { artistLine, type StreamCandidate, type UnifiedTrack } from '@core/types'
import type { YouTubeClient } from './youtube'
import { collectListItems, listItemToCandidate } from '../providers/ytmusic/mapping'

/**
 * Words that mark an alternate rendition. A candidate carrying one the source
 * title does not is almost certainly the wrong cut for automatic matching.
 */
const VERSION_MARKERS = [
  'live',
  'remix',
  'slowed',
  'sped up',
  'nightcore',
  'reverb',
  'cover',
  'karaoke',
  'instrumental',
  'acoustic',
  'demo',
  '8d',
  'bass boosted',
  'reaction',
  'tutorial',
  'tribute',
  'originally performed',
  'in the style of',
  'made famous',
  'piano version',
  'lullaby'
]

/** Decoration that differs between catalogs but does not change the recording. */
const NOISE = /\b(feat\.?|ft\.?|featuring|with|official|audio|video|music|lyrics?|visualizer|hd|hq|4k|remaster(ed)?(\s+\d{4})?|\d{4}\s+remaster(ed)?|explicit|clean|version|edit|radio|original|mix|prod\.?)\b/g

const MIN_RELEVANCE = 0.4
const MIN_DURATION_TOLERANCE_MS = 20_000
const DURATION_TOLERANCE = 0.15
const MAX_STREAM_ATTEMPTS = 4
const CACHE_LIMIT = 2_000

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function coreTitle(title: string): string {
  return normalize(title.replace(/[([{].*?[)\]}]/g, ' ').replace(/\s-\s.*$/, ' ')).replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
}

function tokens(text: string): Set<string> {
  return new Set(text.split(' ').filter(Boolean))
}

/** Sørensen–Dice coefficient over word tokens. */
function dice(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const token of ta) if (tb.has(token)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

function markersIn(text: string): Set<string> {
  const normalized = ` ${normalize(text)} `
  return new Set(VERSION_MARKERS.filter((marker) => normalized.includes(` ${marker} `)))
}

/**
 * Whether a candidate may be auto-played for a track. Stricter than ranking:
 * unrelated recordings, unrequested renditions (live, remix, cover…) and clips
 * of the wrong length are left for the user to pick manually.
 */
function isAutoAcceptable(track: UnifiedTrack, candidate: Omit<StreamCandidate, 'score'>): boolean {
  // Duration and catalog type only break ties; relevance is title + artist.
  const { titleScore, artistScore } = similarity(track, candidate)
  if (0.6 * titleScore + 0.4 * artistScore < MIN_RELEVANCE) return false

  const sourceMarkers = markersIn(track.title)
  for (const marker of markersIn(candidate.title)) {
    if (!sourceMarkers.has(marker)) return false
  }

  if (track.durationMs > 0 && candidate.durationMs > 0) {
    const tolerance = Math.max(MIN_DURATION_TOLERANCE_MS, track.durationMs * DURATION_TOLERANCE)
    if (Math.abs(track.durationMs - candidate.durationMs) > tolerance) return false
  }
  return true
}

function similarity(
  track: UnifiedTrack,
  candidate: Omit<StreamCandidate, 'score'>
): { titleScore: number; artistScore: number } {
  const titleScore = Math.max(
    dice(coreTitle(track.title), coreTitle(candidate.title)),
    // Video uploads often prefix "Artist - Title".
    dice(coreTitle(track.title), coreTitle(candidate.title.replace(/^.*?\s[-–]\s/, '')))
  )

  const sourceArtists = track.artists.map((a) => normalize(a.name))
  const candidateArtistText = normalize(`${candidate.artists.join(' ')} ${candidate.title}`)
  const artistScore = sourceArtists.length
    ? sourceArtists.filter((name) => name && candidateArtistText.includes(name)).length / sourceArtists.length
    : 0.5

  return { titleScore, artistScore }
}

export function scoreCandidate(track: UnifiedTrack, candidate: Omit<StreamCandidate, 'score'>): number {
  const { titleScore, artistScore } = similarity(track, candidate)

  let durationScore = 0.5
  if (track.durationMs > 0 && candidate.durationMs > 0) {
    const delta = Math.abs(track.durationMs - candidate.durationMs)
    durationScore = delta <= 3_000 ? 1 : Math.max(0, 1 - (delta - 3_000) / 45_000)
  }

  const sourceMarkers = markersIn(track.title)
  let penalty = 0
  for (const marker of markersIn(candidate.title)) {
    if (!sourceMarkers.has(marker)) penalty += 0.3
  }

  const kindBonus = candidate.kind === 'song' ? 0.05 : 0
  const score = 0.42 * titleScore + 0.3 * artistScore + 0.28 * durationScore + kindBonus - penalty
  return Math.round(Math.min(1, Math.max(0, score)) * 1000) / 1000
}

/**
 * Finds the YouTube Music upload that best represents a track from another
 * catalog (Spotify, demo data, hybrid playlists).
 */
export class TrackMatcher {
  /** Acceptable candidates per track, best first. */
  private readonly ranked = new Map<string, StreamCandidate[]>()
  /** The candidate that actually produced playable audio. */
  private readonly playable = new Map<string, StreamCandidate>()
  private readonly inflight = new Map<string, Promise<StreamCandidate[]>>()

  constructor(private readonly youtube: YouTubeClient) {}

  /** The upload currently backing a track, if one was resolved this session. */
  peek(trackId: string): StreamCandidate | undefined {
    return this.playable.get(trackId) ?? this.ranked.get(trackId)?.[0]
  }

  /**
   * Resolves audio for the best match, falling through to the next acceptable
   * upload when one is region-locked, age-gated or otherwise unplayable.
   */
  async resolvePlayable(track: UnifiedTrack, resolveVideo: (videoId: string) => Promise<string>): Promise<string> {
    const known = this.playable.get(track.id)
    const candidates = known ? [known] : (await this.rank(track)).slice(0, MAX_STREAM_ATTEMPTS)
    const failures: string[] = []
    for (const candidate of candidates) {
      try {
        const url = await resolveVideo(candidate.videoId)
        this.remember(this.playable, track.id, candidate)
        return url
      } catch (error) {
        failures.push(`${candidate.videoId}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    this.playable.delete(track.id)
    throw new Error(`No playable upload for "${track.title}" (${failures.join(' | ')})`)
  }

  /** Uploads acceptable for auto-play, best first. Rejects when nothing matches. */
  acceptable(track: UnifiedTrack): Promise<StreamCandidate[]> {
    return this.rank(track)
  }

  /** Records which upload actually ended up playing, for {@link peek}. */
  markPlayable(trackId: string, candidate: StreamCandidate): void {
    this.remember(this.playable, trackId, candidate)
  }

  private rank(track: UnifiedTrack): Promise<StreamCandidate[]> {
    const cached = this.ranked.get(track.id)
    if (cached) return Promise.resolve(cached)

    let pending = this.inflight.get(track.id)
    if (!pending) {
      pending = this.findAcceptable(track).finally(() => this.inflight.delete(track.id))
      this.inflight.set(track.id, pending)
    }
    return pending
  }

  private remember<T>(map: Map<string, T>, key: string, value: T): void {
    if (map.size >= CACHE_LIMIT && !map.has(key)) {
      const oldest = map.keys().next().value
      if (oldest !== undefined) map.delete(oldest)
    }
    map.set(key, value)
  }

  /**
   * Ranked alternatives for the manual source picker. A custom query lets the
   * user look for specific renditions ("slowed", "live at ...").
   */
  async candidates(track: UnifiedTrack, query?: string): Promise<StreamCandidate[]> {
    const q = query?.trim() || defaultQuery(track)
    const [songs, videos] = await Promise.all([this.search(q, 'song'), this.search(q, 'video')])
    const seen = new Set<string>()
    return [...songs, ...videos]
      .filter((c) => (seen.has(c.videoId) ? false : (seen.add(c.videoId), true)))
      .map((c) => ({ ...c, score: scoreCandidate(track, c) }))
      .sort((a, b) => b.score - a.score)
  }

  private async findAcceptable(track: UnifiedTrack): Promise<StreamCandidate[]> {
    // Videos cover tracks missing from the song catalog and act as fallbacks
    // when every song upload is region-locked or sign-in gated.
    const [songs, videos] = await Promise.all([
      this.search(defaultQuery(track), 'song'),
      this.search(defaultQuery(track), 'video')
    ])

    const seen = new Set<string>()
    const acceptable = [...songs, ...videos]
      .filter((c) => (seen.has(c.videoId) ? false : (seen.add(c.videoId), true)))
      .filter((c) => isAutoAcceptable(track, c))
      .map((c) => ({ ...c, score: scoreCandidate(track, c) }))
      .sort((a, b) => b.score - a.score)

    if (acceptable.length === 0) throw new Error(`No YouTube Music match for "${track.title}"`)
    this.remember(this.ranked, track.id, acceptable)
    return acceptable
  }

  private async search(query: string, type: 'song' | 'video'): Promise<Omit<StreamCandidate, 'score'>[]> {
    const yt = await this.youtube.getAnonymous()
    const results = await yt.music.search(query, { type })
    return collectListItems(results.contents).map(listItemToCandidate)
  }
}

function defaultQuery(track: UnifiedTrack): string {
  return `${artistLine(track)} ${track.title}`.trim()
}
