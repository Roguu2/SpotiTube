import { useEffect } from 'react'
import type { PresenceInfo } from '@core/ipc'
import { artistLine, type UnifiedTrack } from '@core/types'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

const POLL_MS = 1_000
/** A playhead this far from where Discord's timer is means a seek: resend. */
const POSITION_JUMP_S = 2

/** Where the track lives outside SpotiTube; sample tracks have no page of their own. */
function trackUrl(track: UnifiedTrack): string | undefined {
  if (track.providerId === 'demo') return undefined
  if (track.source === 'spotify') return `https://open.spotify.com/track/${encodeURIComponent(track.sourceTrackId)}`
  if (track.source === 'ytmusic') return `https://music.youtube.com/watch?v=${encodeURIComponent(track.sourceTrackId)}`
  return undefined
}

function presence(): PresenceInfo | null {
  const { current, currentTime } = usePlayerStore.getState()
  const { transport } = useAudioEngineStore.getState()
  if (!current) return null
  return {
    title: current.title,
    artists: artistLine(current),
    album: current.album?.name,
    artworkUrl: current.artworkUrl,
    source: current.source,
    url: trackUrl(current),
    isPlaying: transport.isPlaying,
    position: currentTime(),
    duration: transport.duration || current.durationMs / 1000
  }
}

/** Keeps the Discord status in step with the player while the setting is on. */
export function usePresenceBridge(): void {
  const enabled = useSettingsStore((s) => s.settings?.discordPresence ?? false)

  useEffect(() => {
    if (!enabled) {
      window.electronAPI.presence.update(false, null)
      return
    }
    let lastKey = ''
    let sentAt = 0
    let sent: PresenceInfo | null = null

    const publish = (): void => {
      const info = presence()
      const key = JSON.stringify(info && { ...info, position: 0 })
      const now = performance.now()
      const expected = sent ? sent.position + (sent.isPlaying ? (now - sentAt) / 1000 : 0) : 0
      const jumped = !!info && Math.abs(info.position - expected) > POSITION_JUMP_S
      if (key === lastKey && !jumped) return
      lastKey = key
      sentAt = now
      sent = info
      window.electronAPI.presence.update(true, info)
    }

    publish()
    const timer = window.setInterval(publish, POLL_MS)
    return () => window.clearInterval(timer)
  }, [enabled])
}
