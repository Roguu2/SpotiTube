import { create } from 'zustand'
import type { LyricLine, Lyrics } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'

export type LyricsEntry =
  | { status: 'loading' }
  | { status: 'ready'; lyrics: Lyrics | null }
  | { status: 'error'; message: string }

interface LyricsState {
  /** By track id. */
  entries: Record<string, LyricsEntry>
  /** Seconds the lyrics are shifted by, per track id (positive = lyrics come later). */
  offsets: Record<string, number>
  load(track: UnifiedTrack, force?: boolean): void
  setOffset(trackId: string, offset: number): void
  /** Moves the lyrics by `delta` seconds from wherever they are now. */
  shiftOffset(trackId: string, delta: number): void
}

const OFFSETS_KEY = 'spotitube.lyricsOffsets'
const MAX_OFFSETS = 300

function readOffsets(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  } catch {
    return {}
  }
}

function writeOffsets(offsets: Record<string, number>): void {
  try {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(offsets))
  } catch {
    // A lost offset only means re-adjusting it once.
  }
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  entries: {},
  offsets: readOffsets(),

  load(track, force = false) {
    const existing = get().entries[track.id]
    if (existing && !force && existing.status !== 'error') return
    set((s) => ({ entries: { ...s.entries, [track.id]: { status: 'loading' } } }))
    window.electronAPI.lyrics
      .get(track)
      .then((lyrics) => set((s) => ({ entries: { ...s.entries, [track.id]: { status: 'ready', lyrics } } })))
      .catch((error: unknown) =>
        set((s) => ({
          entries: {
            ...s.entries,
            [track.id]: { status: 'error', message: error instanceof Error ? error.message : String(error) }
          }
        }))
      )
  },

  setOffset(trackId, offset) {
    const rounded = Math.round(offset * 10) / 10
    const { [trackId]: _previous, ...rest } = get().offsets
    // Newest last, so the oldest adjustments are the ones dropped.
    const entries = Object.entries(rounded === 0 ? rest : { ...rest, [trackId]: rounded })
    const offsets = Object.fromEntries(entries.slice(-MAX_OFFSETS))
    set({ offsets })
    writeOffsets(offsets)
  },

  shiftOffset(trackId, delta) {
    get().setOffset(trackId, (get().offsets[trackId] ?? 0) + delta)
  }
}))

/** Highlights a touch early: YouTube reports its position slightly behind what you hear. */
const LEAD_S = 0.2

/** Index of the line being sung at `time`, or -1 before the first one. */
export function activeLineIndex(lines: LyricLine[], time: number, offset: number): number {
  const at = time + LEAD_S - offset
  let low = 0
  let high = lines.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lines[mid].time <= at) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
}
