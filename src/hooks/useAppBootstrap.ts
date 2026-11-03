import { useEffect } from 'react'
import { artistLine } from '@core/types'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { toast } from '@/store/useToastStore'
import { useUpdateStore } from '@/store/useUpdateStore'

const SEEK_STEP_SECONDS = 10

/**
 * One-time wiring between the stores, the main process and the OS:
 * initial data, library change events, media keys / MediaSession, tray
 * now-playing info and auto-advance at the end of a track.
 */
export function useAppBootstrap(): void {
  useEffect(() => {
    void useSettingsStore.getState().load()
    let offUpdates: (() => void) | null = null
    void useUpdateStore
      .getState()
      .init()
      .then((off) => (offUpdates = off))
    void useLibraryStore.getState().loadLibrary()
    useAudioEngineStore
      .getState()
      .init()
      .catch((error: unknown) => toast.error(`Audio engine failed to start: ${error instanceof Error ? error.message : String(error)}`))

    const offLibrary = window.electronAPI.library.onChanged(() => {
      void useLibraryStore.getState().loadLibrary()
      void useSettingsStore.getState().refreshAuth()
    })

    const player = usePlayerStore.getState
    const offMedia = window.electronAPI.media.onCommand((command) => {
      if (command === 'play-pause') void player().togglePlay()
      else if (command === 'next') void player().next()
      else if (command === 'previous') void player().previous()
      else if (command === 'stop') player().pause()
    })

    if ('mediaSession' in navigator) {
      const session = navigator.mediaSession
      // Through the player, so a restored (not yet loaded) track starts too.
      session.setActionHandler('play', () => void player().play())
      session.setActionHandler('pause', () => player().pause())
      session.setActionHandler('previoustrack', () => void player().previous())
      session.setActionHandler('nexttrack', () => void player().next())
      session.setActionHandler('seekto', (details) => details.seekTime !== undefined && player().seek(details.seekTime))
      session.setActionHandler('seekbackward', (d) => player().seek(player().currentTime() - (d.seekOffset ?? SEEK_STEP_SECONDS)))
      session.setActionHandler('seekforward', (d) => player().seek(player().currentTime() + (d.seekOffset ?? SEEK_STEP_SECONDS)))
    }

    // Auto-advance, OS playback state and the tray tooltip follow the transport.
    let wasEnded = false
    let lastError: string | null = null
    let lastTraySignature = ''
    const offTransport = useAudioEngineStore.subscribe((state) => {
      const { ended, isPlaying, duration, currentTime, error } = state.transport
      if (ended && !wasEnded) void player().handleEnded()
      wasEnded = ended
      // A failure after playback started (stream cut off, upload refused) is recovered, not left silent.
      if (error && error !== lastError) void player().recoverPlayback()
      lastError = error

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
        if (duration > 0 && currentTime <= duration) {
          try {
            navigator.mediaSession.setPositionState({
              duration,
              position: currentTime,
              playbackRate: state.dsp.speed
            })
          } catch {
            // Position can briefly exceed duration while seeking; ignore that frame.
          }
        }
      }

      const track = player().current
      const signature = `${track?.id ?? ''}|${isPlaying}`
      if (signature !== lastTraySignature) {
        lastTraySignature = signature
        window.electronAPI.media.updateNowPlaying(track ? { title: track.title, artist: artistLine(track), isPlaying } : null)
      }
    })

    return () => {
      offLibrary()
      offMedia()
      offTransport()
      offUpdates?.()
    }
  }, [])
}
