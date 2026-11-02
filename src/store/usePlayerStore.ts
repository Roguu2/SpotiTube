import { create } from 'zustand'
import type { PlayContext, PlaybackSession } from '@core/ipc'
import { artistLine, type PlaybackSource, type StreamCandidate, type UnifiedTrack } from '@core/types'
import { useAudioEngineStore } from './useAudioEngineStore'
import { EmbedPlaybackError } from '@/audio/YouTubeEmbedPlayer'
import { toast } from './useToastStore'

export type RepeatMode = 'off' | 'all' | 'one'
export type PlayerStatus = 'idle' | 'resolving' | 'ready' | 'error'

export type QueueContext = PlayContext

interface PlayerState {
  /** Every track known to this queue: the context's tracks plus anything queued by the user. */
  queue: UnifiedTrack[]
  /** Play order as indices into `queue`; entries after `position` are "up next". */
  order: number[]
  position: number
  /** Indices into `queue` of tracks the user queued themselves that have not played yet. */
  manual: number[]
  context: QueueContext | null
  current: UnifiedTrack | null
  source: PlaybackSource | null
  status: PlayerStatus
  error: string | null
  shuffle: boolean
  repeat: RepeatMode
  /** Where the restored track picks up when play is pressed (status `idle` after a restore). */
  resumeAt: number | null

  /** Puts back the queue from the previous run, paused, without loading any audio. */
  restoreSession(session: PlaybackSession): void
  /** Moves the restored track's start position before it has been loaded. */
  setResumeAt(seconds: number): void
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

  /** Queues tracks to play right after the current one. */
  playNext(tracks: UnifiedTrack[]): Promise<void>
  /** Queues tracks after anything already queued, ahead of the rest of the playlist. */
  addToQueue(tracks: UnifiedTrack[]): Promise<void>
  /** Removes an upcoming entry (by position in the play order). */
  removeFromQueue(orderPosition: number): void
  /** Moves an upcoming entry to another upcoming position. */
  moveInQueue(from: number, to: number): void
  /** Clears the tracks the user queued, or everything still to come. */
  clearQueue(scope: 'queued' | 'all'): void
  /** Jumps to an upcoming entry and plays it. */
  playFromQueue(orderPosition: number): Promise<void>
}

/** After this many unplayable tracks in a row, stop auto-advancing. */
const MAX_CONSECUTIVE_FAILURES = 3
const RESTART_THRESHOLD_SECONDS = 3
/** Lowest match score accepted when searching for more uploads after embeds were refused. */
const MIN_FALLBACK_SCORE = 0.7

let playToken = 0
let consecutiveFailures = 0
let recovering = false

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function shuffled(length: number, first: number): number[] {
  return [first, ...shuffleInPlace(Array.from({ length }, (_, i) => i).filter((i) => i !== first))]
}

/** Restores playlist order for unplayed tracks: those after `anchor` first, then the ones before it. */
function unshuffled(indices: number[], anchor: number): number[] {
  const sorted = [...indices].sort((a, b) => a - b)
  return [...sorted.filter((i) => i > anchor), ...sorted.filter((i) => i < anchor)]
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
    // A queued track that starts playing is no longer "queued".
    const manual = get().manual.filter((index) => index !== order[position])
    set({ position, manual, current: track, status: 'resolving', error: null, source: null, resumeAt: null })
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
    manual: [],
    context: null,
    current: null,
    source: null,
    status: 'idle',
    error: null,
    shuffle: false,
    repeat: 'off',
    resumeAt: null,

    restoreSession(session) {
      const current = session.queue[session.order[session.position]]
      if (!current) return
      set({
        queue: session.queue,
        order: session.order,
        position: session.position,
        manual: session.manual,
        context: session.context,
        shuffle: session.shuffle,
        repeat: session.repeat,
        current,
        source: null,
        status: 'idle',
        error: null,
        resumeAt: session.currentTime
      })
      updateMediaSession(current)
    },

    setResumeAt(seconds) {
      if (get().status === 'idle' && get().current) set({ resumeAt: Math.max(0, seconds) })
    },

    async playQueue(tracks, startIndex, context) {
      if (!tracks.length) return
      const index = Math.min(Math.max(0, startIndex), tracks.length - 1)
      const order = get().shuffle ? shuffled(tracks.length, index) : tracks.map((_, i) => i)
      consecutiveFailures = 0
      set({ queue: tracks, order, manual: [], context })
      await start(get().shuffle ? 0 : index)
    },

    async togglePlay() {
      const { current, status } = get()
      if (!current) return
      if (status === 'error' || status === 'idle') {
        // `idle` with a track means a restored session that has not been loaded yet.
        await start(get().position, get().resumeAt ?? undefined)
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
      const { shuffle, order, position, manual } = get()
      // History and tracks the user queued keep their place; only the rest of the playlist reorders.
      const head = order.slice(0, position + 1)
      const upcoming = order.slice(position + 1)
      const queued = upcoming.filter((i) => manual.includes(i))
      const rest = upcoming.filter((i) => !manual.includes(i))
      const reordered = shuffle ? unshuffled(rest, currentIndex()) : shuffleInPlace([...rest])
      set({ shuffle: !shuffle, order: [...head, ...queued, ...reordered] })
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
    },

    async playNext(tracks) {
      if (!tracks.length) return
      if (!get().current) {
        await get().playQueue(tracks, 0, { label: 'Queue' })
        return
      }
      insertIntoQueue(tracks, get().position + 1)
      toast.success(tracks.length === 1 ? `“${tracks[0].title}” plays next` : `${tracks.length} tracks play next`)
    },

    async addToQueue(tracks) {
      if (!tracks.length) return
      if (!get().current) {
        await get().playQueue(tracks, 0, { label: 'Queue' })
        return
      }
      // After the last track the user queued, ahead of the rest of the playlist.
      const { order, position, manual } = get()
      let at = position + 1
      for (let p = position + 1; p < order.length; p++) {
        if (manual.includes(order[p])) at = p + 1
      }
      insertIntoQueue(tracks, at)
      toast.success(tracks.length === 1 ? `Added “${tracks[0].title}” to the queue` : `Added ${tracks.length} tracks to the queue`)
    },

    removeFromQueue(orderPosition) {
      const { order, position, manual } = get()
      if (orderPosition <= position || orderPosition >= order.length) return
      const removed = order[orderPosition]
      set({
        order: order.filter((_, p) => p !== orderPosition),
        manual: manual.filter((i) => i !== removed)
      })
    },

    moveInQueue(from, to) {
      const { order, position } = get()
      // Only upcoming entries can move, and only among upcoming positions.
      if (from <= position || from >= order.length || from === to) return
      const target = Math.min(Math.max(to, position + 1), order.length - 1)
      const next = [...order]
      const [entry] = next.splice(from, 1)
      next.splice(target, 0, entry)
      set({ order: next })
    },

    clearQueue(scope) {
      const { order, position, manual } = get()
      if (scope === 'all') {
        set({ order: order.slice(0, position + 1), manual: [] })
        return
      }
      const head = order.slice(0, position + 1)
      const rest = order.slice(position + 1).filter((i) => !manual.includes(i))
      set({ order: [...head, ...rest], manual: [] })
    },

    async playFromQueue(orderPosition) {
      if (orderPosition <= get().position || orderPosition >= get().order.length) return
      consecutiveFailures = 0
      await start(orderPosition)
    }
  }

  function insertIntoQueue(tracks: UnifiedTrack[], at: number): void {
    const { queue, order, manual } = get()
    const indices = tracks.map((_, i) => queue.length + i)
    set({
      queue: [...queue, ...tracks],
      order: [...order.slice(0, at), ...indices, ...order.slice(at)],
      manual: [...manual, ...indices]
    })
    prefetchNext()
  }
})
