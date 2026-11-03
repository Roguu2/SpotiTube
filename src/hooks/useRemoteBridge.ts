import { useEffect } from 'react'
import type { RemoteCommand, RemoteQueueItem, RemoteState, RemoteTrack } from '@core/ipc'
import { artistLine, type UnifiedTrack } from '@core/types'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useRemoteStore } from '@/store/useRemoteStore'
import { toast } from '@/store/useToastStore'

const POLL_MS = 400
/** Phones interpolate the playhead themselves; resend it this often anyway to correct drift. */
const HEARTBEAT_MS = 5_000
/** A playhead this far from where the phone expects it (a seek) is sent right away. */
const POSITION_JUMP_S = 1.5
const QUEUE_PREVIEW = 30
const PHONE_CONTEXT = { label: 'From your phone' }

function toRemoteTrack(track: UnifiedTrack): RemoteTrack {
  return {
    id: track.id,
    title: track.title,
    artists: artistLine(track),
    album: track.album?.name,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    source: track.source
  }
}

function snapshot(): RemoteState {
  const player = usePlayerStore.getState()
  const audio = useAudioEngineStore.getState()
  const { queue, order, position, manual, autoplay, current } = player

  const upcoming: RemoteQueueItem[] = []
  for (let at = position + 1; at < order.length && upcoming.length < QUEUE_PREVIEW; at++) {
    const index = order[at]
    const track = queue[index]
    if (!track) continue
    const kind = manual.includes(index) ? 'queued' : autoplay.includes(index) ? 'autoplay' : 'up-next'
    upcoming.push({ position: at, kind, track: toRemoteTrack(track) })
  }

  return {
    track: current ? toRemoteTrack(current) : null,
    isPlaying: audio.transport.isPlaying,
    isBuffering: audio.transport.isBuffering,
    position: player.currentTime(),
    duration: audio.transport.duration || (current ? current.durationMs / 1000 : 0),
    volume: audio.volume,
    muted: audio.muted,
    shuffle: player.shuffle,
    repeat: player.repeat,
    context: player.context?.label ?? null,
    queue: upcoming,
    queueTotal: current ? Math.max(0, order.length - position - 1) : 0
  }
}

function runCommand(command: RemoteCommand): void {
  const player = usePlayerStore.getState()
  const audio = useAudioEngineStore.getState()
  switch (command.type) {
    case 'toggle':
      void player.togglePlay()
      break
    case 'next':
      void player.next()
      break
    case 'previous':
      void player.previous()
      break
    case 'mute':
      audio.toggleMute()
      break
    case 'shuffle':
      player.toggleShuffle()
      break
    case 'repeat':
      player.cycleRepeat()
      break
    case 'seek':
      player.seek(command.seconds)
      break
    case 'volume':
      audio.setVolume(command.volume)
      break
    case 'jump':
      if (command.position > player.position && command.position < player.order.length) {
        void player.playFromQueue(command.position)
      }
      break
    case 'play-now':
      void player.playQueue([command.track], 0, PHONE_CONTEXT)
      break
    case 'play-next':
      void player.playNext([command.track])
      toast.info(`“${command.track.title}” plays next — queued from your phone`)
      break
    case 'add-to-queue':
      void player.addToQueue([command.track])
      toast.info(`“${command.track.title}” added to the queue from your phone`)
      break
    case 'radio':
      void player.startRadio(command.track)
      break
  }
}

/**
 * Connects the player to the phone remote: runs the phone's commands and, while
 * the remote is on, publishes a compact state snapshot whenever it changes.
 */
export function useRemoteBridge(): void {
  // Published even with no phone connected, so a phone that connects gets the current state at once.
  const listening = useRemoteStore((s) => s.status?.running ?? false)

  useEffect(() => {
    void useRemoteStore.getState().load()
    return window.electronAPI.remote.onCommand(runCommand)
  }, [])

  useEffect(() => {
    if (!listening) return
    let lastKey = ''
    let sentAt = 0
    let sent: RemoteState | null = null

    const publish = (): void => {
      const state = snapshot()
      const { position, ...rest } = state
      const key = JSON.stringify(rest)
      const now = performance.now()
      const expected = sent ? sent.position + (sent.isPlaying ? (now - sentAt) / 1000 : 0) : 0
      const fresh = key !== lastKey || now - sentAt > HEARTBEAT_MS || Math.abs(position - expected) > POSITION_JUMP_S
      if (!fresh) return
      lastKey = key
      sentAt = now
      sent = state
      window.electronAPI.remote.publishState(state)
    }

    publish()
    const timer = window.setInterval(publish, POLL_MS)
    return () => window.clearInterval(timer)
  }, [listening])
}
