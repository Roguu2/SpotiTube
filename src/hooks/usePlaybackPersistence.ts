import { useEffect } from 'react'
import type { PlaybackSession } from '@core/ipc'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/** A play counts once this much of the track has been heard (or half of a shorter track). */
const PLAY_THRESHOLD_SECONDS = 30
/** Queue edits are batched; the playhead is saved at most this often while playing. */
const QUEUE_SAVE_DEBOUNCE_MS = 1_000
const POSITION_SAVE_INTERVAL_MS = 5_000

function snapshot(): PlaybackSession | null {
  const { queue, order, position, manual, context, shuffle, repeat, current, status, resumeAt } = usePlayerStore.getState()
  if (!current || !order.length) return null
  const currentTime = status === 'idle' ? (resumeAt ?? 0) : useAudioEngineStore.getState().transport.currentTime
  return { queue, order, position, manual, context, shuffle, repeat, currentTime, savedAt: Date.now() }
}

/**
 * Records plays into the listening history, restores the previous run's queue
 * (paused, at the same position) and keeps that saved queue up to date.
 */
export function usePlaybackPersistence(): void {
  useEffect(() => {
    let disposed = false
    let restored = false
    let queueTimer: number | null = null
    let lastPositionSave = 0
    let clearedForSetting = false

    const save = (): void => {
      if (!restored) return
      const settings = useSettingsStore.getState().settings
      if (!settings) return
      if (!settings.restoreSession) {
        if (!clearedForSetting) void window.electronAPI.history.saveSession(null).catch(() => undefined)
        clearedForSetting = true
        return
      }
      clearedForSetting = false
      const session = snapshot()
      if (!session) return
      lastPositionSave = Date.now()
      void window.electronAPI.history.saveSession(session).catch((error: unknown) => {
        console.error('Failed to save playback session:', error)
      })
    }

    const scheduleSave = (): void => {
      if (queueTimer !== null) window.clearTimeout(queueTimer)
      queueTimer = window.setTimeout(() => {
        queueTimer = null
        save()
      }, QUEUE_SAVE_DEBOUNCE_MS)
    }

    void Promise.all([window.electronAPI.settings.get(), window.electronAPI.history.getSession()])
      .then(([settings, session]) => {
        // Never replace a queue the user started while the session was loading.
        if (!disposed && settings.restoreSession && session && !usePlayerStore.getState().current) {
          usePlayerStore.getState().restoreSession(session)
        }
      })
      .catch((error: unknown) => console.error('Failed to restore playback session:', error))
      .finally(() => {
        restored = true
      })
    void useHistoryStore.getState().load()

    const offPlayer = usePlayerStore.subscribe((state, prev) => {
      if (
        state.queue !== prev.queue ||
        state.order !== prev.order ||
        state.position !== prev.position ||
        state.manual !== prev.manual ||
        state.shuffle !== prev.shuffle ||
        state.repeat !== prev.repeat ||
        state.resumeAt !== prev.resumeAt
      ) {
        scheduleSave()
      }
    })

    // One history entry per time a track is heard; repeat-one and replays count again.
    let recordedKey: string | null = null
    let playKey: string | null = null
    const offTransport = useAudioEngineStore.subscribe((state, prev) => {
      const { current, position, status, context } = usePlayerStore.getState()
      const { currentTime, duration, isPlaying } = state.transport
      const key = current ? `${position}:${current.id}` : null
      // A new entry, or the same one heard again from the start (repeat-one, replay).
      if (key !== playKey || (recordedKey === key && currentTime < 1)) {
        playKey = key
        recordedKey = null
      }

      if (current && key && status === 'ready' && recordedKey !== key) {
        const threshold = duration > 0 ? Math.min(PLAY_THRESHOLD_SECONDS, duration / 2) : PLAY_THRESHOLD_SECONDS
        if (currentTime >= threshold) {
          recordedKey = key
          useHistoryStore.getState().record(current, context)
        }
      }

      if (prev.transport.isPlaying && !isPlaying) save()
      else if (isPlaying && Date.now() - lastPositionSave >= POSITION_SAVE_INTERVAL_MS) save()
    })

    const onUnload = (): void => save()
    window.addEventListener('beforeunload', onUnload)

    return () => {
      disposed = true
      if (queueTimer !== null) window.clearTimeout(queueTimer)
      offPlayer()
      offTransport()
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])
}
