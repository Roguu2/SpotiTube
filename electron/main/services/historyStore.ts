import Store from 'electron-store'
import type { PlayContext, PlaybackSession, PlayRecord } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'

/** Oldest plays are dropped beyond this many. */
const MAX_PLAYS = 500
/** A saved queue is capped so a huge playlist cannot bloat the file. */
const MAX_SESSION_TRACKS = 5_000
const REPEAT_MODES = new Set<PlaybackSession['repeat']>(['off', 'all', 'one'])

interface HistoryStoreSchema {
  plays: PlayRecord[]
  session: PlaybackSession | null
}

// A dedicated file: the session is rewritten every few seconds while music plays.
const store = new Store<HistoryStoreSchema>({
  name: 'history',
  accessPropertiesByDotNotation: false,
  defaults: { plays: [], session: null }
})

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

export function getPlays(): PlayRecord[] {
  return store.get('plays')
}

export function recordPlay(track: unknown, context: unknown): void {
  if (!isTrack(track)) throw new TypeError('Invalid track payload')
  const clean = sanitizeContext(context)
  const play: PlayRecord = clean ? { track, playedAt: Date.now(), context: clean } : { track, playedAt: Date.now() }
  store.set('plays', [play, ...store.get('plays')].slice(0, MAX_PLAYS))
}

export function clearPlays(): void {
  store.set('plays', [])
}

export function getSession(): PlaybackSession | null {
  return store.get('session')
}

export function saveSession(input: unknown): void {
  if (input === null) {
    store.set('session', null)
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

  store.set('session', {
    queue,
    order,
    position: session.position,
    manual: session.manual.filter((i) => isIndex(i, queue.length)),
    context: sanitizeContext(session.context),
    shuffle: session.shuffle === true,
    repeat: REPEAT_MODES.has(session.repeat as PlaybackSession['repeat']) ? (session.repeat as PlaybackSession['repeat']) : 'off',
    currentTime: typeof session.currentTime === 'number' && session.currentTime > 0 ? session.currentTime : 0,
    savedAt: Date.now()
  })
}
