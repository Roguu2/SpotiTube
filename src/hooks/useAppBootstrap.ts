import { useEffect } from 'react'
import { artistLine } from '@core/types'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { toast } from '@/store/useToastStore'

const SEEK_STEP_SECONDS = 10

/**
 * One-time wiring between the stores, the main process and the OS:
 * initial data, library change events, media keys / MediaSession, tray
 * now-playing info and auto-advance at the end of a track.
 */
export function useAppBootstrap(): void {
  useEffect(() => {
    void useSettingsStore.getState().load()
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
    const engine = useAudioEngineStore.getState
    const offMedia = window.electronAPI.media.onCommand((command) => {
      if (command === 'play-pause') void player().togglePlay()
      else if (command === 'next') void player().next()
      else if (command === 'previous') void player().previous()
      else if (command === 'stop') engine().pause()
    })

    if ('mediaSession' in navigator) {
      const session = navigator.mediaSession
      session.setActionHandler('play', () => void engine().play())
      session.setActionHandler('pause', () => engine().pause())
      session.setActionHandler('previoustrack', () => void player().previous())
      session.setActionHandler('nexttrack', () => void player().next())
      session.setActionHandler('seekto', (details) => details.seekTime !== undefined && engine().seek(details.seekTime))
      session.setActionHandler('seekbackward', (d) => engine().seek(engine().transport.currentTime - (d.seekOffset ?? SEEK_STEP_SECONDS)))
      session.setActionHandler('seekforward', (d) => engine().seek(engine().transport.currentTime + (d.seekOffset ?? SEEK_STEP_SECONDS)))
    }

    // Auto-advance, OS playback state and the tray tooltip follow the transport.
    let wasEnded = false
    let lastTraySignature = ''
    const offTransport = useAudioEngineStore.subscribe((state) => {
      const { ended, isPlaying, duration, currentTime } = state.transport
      if (ended && !wasEnded) void player().handleEnded()
      wasEnded = ended

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
    }
  }, [])
}
