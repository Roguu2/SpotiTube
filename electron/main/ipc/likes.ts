import { BrowserWindow } from 'electron'
import { IpcChannels, type LikeResult } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import type { HybridProvider } from '../providers/hybrid/HybridProvider'
import type { SpotifyProvider } from '../providers/spotify/SpotifyProvider'
import type { YouTubeClient } from '../services/youtube'
import { errorMessage } from '../services/http'
import { handle, requireTrack } from './handle'

interface LikesIpcDeps {
  hybrid: HybridProvider
  spotify: SpotifyProvider
  youtube: YouTubeClient
}

/**
 * Hearts live in SpotiTube's own Liked songs playlist (so they work without an
 * account and sync between computers), and are also saved to the track's
 * service when that account is connected.
 */
export function registerLikesIpc({ hybrid, spotify, youtube }: LikesIpcDeps): void {
  handle(IpcChannels.likesGetIds, () => hybrid.likedTrackIds())

  handle(IpcChannels.likesSet, async (value: unknown, liked: unknown): Promise<LikeResult> => {
    const track = requireTrack<UnifiedTrack>(value)
    const on = liked === true
    hybrid.setLiked(track, on)
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannels.libraryChanged)

    // Sample tracks only exist in SpotiTube.
    if (track.providerId === 'demo') return { liked: on, service: null }
    try {
      if (track.source === 'spotify' && spotify.isAuthenticated()) {
        await spotify.setSaved(track.sourceTrackId, on)
        return { liked: on, service: 'spotify' }
      }
      if (track.source === 'ytmusic' && youtube.hasCookie()) {
        const yt = await youtube.getAuthenticated()
        // As YouTube Music's own web client does it. youtubei.js's interact.like() sends these as the TV
        // client, which a browser-cookie session can't use (YouTube answers 400).
        await yt.actions.execute(on ? '/like/like' : '/like/removelike', {
          target: { videoId: track.streamVideoId ?? track.sourceTrackId },
          client: 'YTMUSIC'
        })
        return { liked: on, service: 'ytmusic' }
      }
    } catch (error) {
      // youtubei.js errors spell out the whole request URL; the status is what matters to a person.
      const status = /status code (\d{3})/.exec(errorMessage(error))?.[1]
      const message =
        status === '401' || status === '403'
          ? 'your sign-in has expired — reconnect YouTube Music in Settings'
          : status
            ? `it refused the like (HTTP ${status})`
            : errorMessage(error)
      return { liked: on, service: null, serviceError: message }
    }
    return { liked: on, service: null }
  })
}
