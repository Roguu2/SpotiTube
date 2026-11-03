import Store from 'electron-store'
import type { PlayContext, PlaybackSession, PlayRecord } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'

/** Oldest plays are dropped beyond this many. */
const MAX_PLAYS = 500
/** A saved queue is capped so a huge playlist cannot bloat the file. */
const MAX_SESSION_TRACKS = 5_000
const REPEAT_MODES = new Set<PlaybackSession['repeat']>(['off', 'all', 'one'])

/** The queue part of a session: large, but only changes when the queue does. */
type SavedQueue = Omit<PlaybackSession, 'position' | 'currentTime'>

/** The playhead part: tiny, rewritten every few seconds while music plays. */
interface SavedPosition {
  position: number
  currentTime: number
  savedAt: number
}

// Three files so that frequent writes stay small: electron-store rewrites a whole
// file on every change, and the playhead is saved every few seconds.
const historyStore = new Store<{ plays: PlayRecord[]; session?: PlaybackSession | null }>({
  name: 'history',
  accessPropertiesByDotNotation: false,
  defaults: { plays: [] }
})
const queueStore = new Store<{ queue: SavedQueue | null }>({
  name: 'session',
  accessPropertiesByDotNotation: false,
  defaults: { queue: null }
})
const positionStore = new Store<{ position: SavedPosition | null }>({
  name: 'session-position',
  accessPropertiesByDotNotation: false,
  defaults: { position: null }
})

/** Length of the saved play order, kept in memory so position saves never read the big file. */
let savedOrderLength: number | null = null

function isTrack(value: unknown): value is UnifiedTrack {
  const track = value as UnifiedTrack | null
  return (
    !!track &&
    typeof track.id === 'string' &&
    typeof track.providerId === 'string' &&
    typeof track.title === 'string' &&
    Array.isArray(track.artists)
  )
}

function sanitizeContext(value: unknown): PlayContext | null {
  const context = value as PlayContext | null
  if (!context || typeof context.label !== 'string') return null
  return {
    label: context.label.slice(0, 200),
    ...(typeof context.playlistId === 'string' ? { playlistId: context.playlistId } : {})
  }
}

function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length
}

function cleanTime(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function getPlays(): PlayRecord[] {
  return historyStore.get('plays')
}

export function recordPlay(track: unknown, context: unknown): void {
  if (!isTrack(track)) throw new TypeError('Invalid track payload')
  const clean = sanitizeContext(context)
  const play: PlayRecord = clean ? { track, playedAt: Date.now(), context: clean } : { track, playedAt: Date.now() }
  historyStore.set('plays', [play, ...historyStore.get('plays')].slice(0, MAX_PLAYS))
}

export function clearPlays(): void {
  historyStore.set('plays', [])
}

/** Moves a session saved by 0.2.0 (inside history.json) into the split files, once. */
function migrateLegacySession(): void {
  const legacy = historyStore.get('session')
  if (legacy === undefined) return
  historyStore.delete('session')
  if (legacy && !queueStore.get('queue')) {
    try {
      saveSession(legacy)
    } catch {
      // An unreadable old session is simply dropped.
    }
  }
}

export function getSession(): PlaybackSession | null {
  migrateLegacySession()
  const queue = queueStore.get('queue')
  if (!queue) {
    savedOrderLength = null
    return null
  }
  savedOrderLength = queue.order.length
  const saved = positionStore.get('position')
  const position = saved && isIndex(saved.position, queue.order.length) ? saved.position : 0
  return {
    ...queue,
    position,
    currentTime: saved && isIndex(saved.position, queue.order.length) ? saved.currentTime : 0,
    savedAt: Math.max(queue.savedAt, saved?.savedAt ?? 0)
  }
}

/** Saves the whole session (queue and playhead). `null` forgets it. */
export function saveSession(input: unknown): void {
  if (input === null) {
    queueStore.set('queue', null)
    positionStore.set('position', null)
    savedOrderLength = null
    return
  }
  const session = input as Partial<PlaybackSession> | null
  if (!session || !Array.isArray(session.queue) || !Array.isArray(session.order) || !Array.isArray(session.manual)) {
    throw new TypeError('Invalid playback session')
  }
  const queue = session.queue.slice(0, MAX_SESSION_TRACKS)
  if (!queue.every(isTrack)) throw new TypeError('Invalid track in playback session')
  const order = session.order.filter((i) => isIndex(i, queue.length))
  if (!order.length || !isIndex(session.position, order.length)) throw new TypeError('Invalid playback position')

  const now = Date.now()
  queueStore.set('queue', {
    queue,
    order,
    manual: session.manual.filter((i) => isIndex(i, queue.length)),
    context: sanitizeContext(session.context),
    shuffle: session.shuffle === true,
    repeat: REPEAT_MODES.has(session.repeat as PlaybackSession['repeat']) ? (session.repeat as PlaybackSession['repeat']) : 'off',
    savedAt: now
  })
  positionStore.set('position', { position: session.position, currentTime: cleanTime(session.currentTime), savedAt: now })
  savedOrderLength = order.length
}

/** Saves only the playhead — the frequent, cheap write while music plays. */
export function savePosition(position: unknown, currentTime: unknown): void {
  // Without a saved queue there is nothing to position; the next full save covers it.
  if (savedOrderLength === null || !isIndex(position, savedOrderLength)) return
  positionStore.set('position', { position, currentTime: cleanTime(currentTime), savedAt: Date.now() })
}

/** Replaces the play history (used when merging other computers' plays in). */
export function replacePlays(plays: PlayRecord[]): void {
  historyStore.set('plays', plays.slice(0, MAX_PLAYS))
}

export { isTrack as isHistoryTrack, MAX_PLAYS }
