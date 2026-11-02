import { create } from 'zustand'
import { artistLine, type PlaybackSource, type StreamCandidate, type UnifiedTrack } from '@core/types'
import { useAudioEngineStore } from './useAudioEngineStore'
import { toast } from './useToastStore'

export type RepeatMode = 'off' | 'all' | 'one'
export type PlayerStatus = 'idle' | 'resolving' | 'ready' | 'error'

export interface QueueContext {
  /** Playlist the queue came from, for "now playing" highlighting and navigation. */
  playlistId?: string
  label: string
}

interface PlayerState {
  queue: UnifiedTrack[]
  /** Play order as indices into `queue` (identity unless shuffled). */
  order: number[]
  position: number
  context: QueueContext | null
  current: UnifiedTrack | null
  source: PlaybackSource | null
  status: PlayerStatus
  error: string | null
  shuffle: boolean
  repeat: RepeatMode

  playQueue(tracks: UnifiedTrack[], startIndex: number, context: QueueContext): Promise<void>
  togglePlay(): Promise<void>
  next(auto?: boolean): Promise<void>
  previous(): Promise<void>
  toggleShuffle(): void
  cycleRepeat(): void
  /** Pins a different YouTube upload as the audio for the current track (`null` = automatic). */
  setStreamOverride(candidate: StreamCandidate | null): Promise<void>
  handleEnded(): Promise<void>
}

/** After this many unplayable tracks in a row, stop auto-advancing. */
const MAX_CONSECUTIVE_FAILURES = 3
const RESTART_THRESHOLD_SECONDS = 3

let playToken = 0
let consecutiveFailures = 0

function shuffled(length: number, first: number): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function updateMediaSession(track: UnifiedTrack | null): void {
  if (!('mediaSession' in navigator)) return
  if (!track) {
    navigator.mediaSession.metadata = null
    return
  }
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistLine(track),
    album: track.album?.name ?? '',
    artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '512x512' }] : []
  })
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  const currentIndex = (): number => get().order[get().position] ?? -1

  /** Warms the matcher, resolver and proxy for the upcoming track. */
  const prefetchNext = (): void => {
    const { order, position, queue, repeat } = get()
    const nextPosition = position + 1 < order.length ? position + 1 : repeat === 'all' ? 0 : -1
    const track = nextPosition >= 0 ? queue[order[nextPosition]] : undefined
    if (track) void window.electronAPI.stream.getPlaybackSource(track).catch(() => undefined)
  }

  const start = async (position: number, startAt?: number): Promise<void> => {
    const { queue, order } = get()
    const track = queue[order[position]]
    if (!track) return

    const token = ++playToken
    set({ position, current: track, status: 'resolving', error: null, source: null })
    updateMediaSession(track)

    try {
      const source = await window.electronAPI.stream.getPlaybackSource(track)
      if (token !== playToken) return
      set({ source })
      await useAudioEngineStore.getState().loadTrack(track.id, source.url, { startAt })
      if (token !== playToken) return
      set({ status: 'ready' })
      consecutiveFailures = 0
      if (source.isSynthetic) toast.info(`No stream found for “${track.title}” — playing a synthesized preview`)
      prefetchNext()
    } catch (error) {
      if (token !== playToken) return
      const message = errorText(error)
      set({ status: 'error', error: message })
      consecutiveFailures++
      toast.error(`Can't play “${track.title}”: ${message}`)
      if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES && position + 1 < get().order.length) {
        await get().next(true)
      }
    }
  }

  return {
    queue: [],
    order: [],
    position: 0,
    context: null,
    current: null,
    source: null,
    status: 'idle',
    error: null,
    shuffle: false,
    repeat: 'off',

    async playQueue(tracks, startIndex, context) {
      if (!tracks.length) return
      const index = Math.min(Math.max(0, startIndex), tracks.length - 1)
      const order = get().shuffle ? shuffled(tracks.length, index) : tracks.map((_, i) => i)
      consecutiveFailures = 0
      set({ queue: tracks, order, context })
      await start(get().shuffle ? 0 : index)
    },

    async togglePlay() {
      const { current, status } = get()
      if (!current) return
      if (status === 'error') {
        await start(get().position)
        return
      }
      await useAudioEngineStore.getState().toggle()
    },

    async next(auto = false) {
      const { order, position, repeat } = get()
      if (!order.length) return
      if (position + 1 < order.length) {
        await start(position + 1)
      } else if (repeat === 'all' || !auto) {
        // Manual "next" on the last track wraps; automatic advance only wraps with repeat-all.
        if (repeat === 'all' || order.length > 1) await start(0)
      } else {
        useAudioEngineStore.getState().pause()
      }
    },

    async previous() {
      const engine = useAudioEngineStore.getState()
      if (engine.transport.currentTime > RESTART_THRESHOLD_SECONDS || get().position === 0) {
        engine.seek(0)
        return
      }
      await start(get().position - 1)
    },

    toggleShuffle() {
      const { shuffle, queue } = get()
      const index = currentIndex()
      if (!shuffle) {
        set({ shuffle: true, order: shuffled(queue.length, Math.max(0, index)), position: 0 })
      } else {
        set({ shuffle: false, order: queue.map((_, i) => i), position: Math.max(0, index) })
      }
    },

    cycleRepeat() {
      const next: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' }
      set({ repeat: next[get().repeat] })
    },

    async setStreamOverride(candidate) {
      const track = get().current
      if (!track) return
      await window.electronAPI.stream.setOverride(track, candidate)
      // Keep the listening position when swapping to a different rendition.
      const at = useAudioEngineStore.getState().transport.currentTime
      await start(get().position, at)
    },

    async handleEnded() {
      if (get().repeat === 'one') {
        const engine = useAudioEngineStore.getState()
        engine.seek(0)
        await engine.play()
        return
      }
      await get().next(true)
    }
  }
})
