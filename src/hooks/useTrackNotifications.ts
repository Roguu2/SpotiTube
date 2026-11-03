import { useEffect } from 'react'
import { artistLine } from '@core/types'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { usePlayerStore } from '@/store/usePlayerStore'

/**
 * Announces each new song once, when it actually starts playing — not when the
 * same song resumes. Whether a notification appears (setting on, SpotiTube in
 * the background) is the main process's call.
 */
export function useTrackNotifications(): void {
  useEffect(() => {
    let announced: string | null = null
    return useAudioEngineStore.subscribe((state) => {
      if (!state.transport.isPlaying) return
      const track = usePlayerStore.getState().current
      if (!track || track.id === announced) return
      announced = track.id
      window.electronAPI.media.notifyTrack({
        title: track.title,
        artists: artistLine(track),
        album: track.album?.name,
        artworkUrl: track.artworkUrl
      })
    })
  }, [])
}
