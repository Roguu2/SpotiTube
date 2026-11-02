import { create } from 'zustand'
import { artistLine, type PlaybackSource, type StreamCandidate, type UnifiedTrack } from '@core/types'
import { useAudioEngineStore } from './useAudioEngineStore'
import { EmbedPlaybackError } from '@/audio/YouTubeEmbedPlayer'
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
  /** Keeps the current track going after a mid-playback failure (stream cut off, upload refused). */
  recoverPlayback(): Promise<void>
}

/** After this many unplayable tracks in a row, stop auto-advancing. */
const MAX_CONSECUTIVE_FAILURES = 3
const RESTART_THRESHOLD_SECONDS = 3
/** Lowest match score accepted when searching for more uploads after embeds were refused. */
const MIN_FALLBACK_SCORE = 0.7

let playToken = 0
let consecutiveFailures = 0
let recovering = false

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

  /**
   * Plays a track through YouTube's official player, walking through alternative
   * uploads when one refuses to play in other apps (or has been removed).
   */
  const playEmbedded = async (track: UnifiedTrack, source: PlaybackSource, token: number, startAt?: number): Promise<void> => {
    const engine = useAudioEngineStore.getState()
    const tried = new Set<string>()
    let queue = [source.candidate, ...source.alternatives].filter((c): c is StreamCandidate => !!c)
    let lastError: unknown = new Error('No YouTube upload available for this track')
    let fetchedMore = false

    while (true) {
      for (const candidate of queue) {
        if (tried.has(candidate.videoId) || token !== playToken) continue
        tried.add(candidate.videoId)
        try {
          await engine.loadTrack(track.id, { kind: 'youtube', videoId: candidate.videoId }, { startAt })
          if (token === playToken) {
            set({
              source: {
                ...source,
                mode: 'embed',
                candidate,
                alternatives: queue.filter((c) => c.videoId !== candidate.videoId)
              }
            })
          }
          return
        } catch (error) {
          lastError = error
          if (!(error instanceof EmbedPlaybackError) || !error.tryAnotherUpload) throw error
        }
      }
      // Every known upload refused; look further once (strong matches only, never a manual pin).
      if (fetchedMore || source.isOverride || token !== playToken) throw lastError
      fetchedMore = true
      const more = await window.electronAPI.stream.getCandidates(track)
      queue = more.filter((c) => c.score >= MIN_FALLBACK_SCORE && !tried.has(c.videoId))
      if (!queue.length) throw lastError
    }
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
      if (source.mode === 'embed') {
        await playEmbedded(track, source, token, startAt)
      } else {
        try {
          await useAudioEngineStore.getState().loadTrack(track.id, { kind: 'url', url: source.url as string }, { startAt })
        } catch (error) {
          // A direct stream that fails to start can still play through the official player.
          if (source.mode !== 'stream' || !source.candidate || token !== playToken) throw error
          await playEmbedded(track, { ...source, mode: 'embed' }, token, startAt)
        }
      }
      if (token !== playToken) return
      set({ status: 'ready' })
      consecutiveFailures = 0
      if (source.mode === 'synthetic') toast.info(`No match found for “${track.title}” — playing a synthesized preview`)
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
    },

    async recoverPlayback() {
      const { current: track, source, status } = get()
      if (!track || !source || status !== 'ready' || recovering) return
      recovering = true
      const token = playToken
      const engine = useAudioEngineStore.getState()
      const at = engine.transport.currentTime
      try {
        if (engine.backend === 'dsp' && source.mode === 'stream' && source.candidate) {
          // The direct stream died mid-song: continue at the same spot in the official player.
          toast.info('Stream interrupted — continuing with the YouTube player')
          await playEmbedded(track, { ...source, mode: 'embed' }, token, at)
        } else if (engine.backend === 'embed') {
          // The current upload failed after starting: move on to the next one.
          await playEmbedded(track, { ...source, candidate: undefined }, token, at)
        } else {
          throw new Error(engine.transport.error ?? 'Playback failed')
        }
      } catch (error) {
        if (token !== playToken) return
        set({ status: 'error', error: errorText(error) })
        toast.error(`Can't continue “${track.title}”: ${errorText(error)}`)
        if (get().position + 1 < get().order.length) await get().next(true)
      } finally {
        recovering = false
      }
    }
  }
})
