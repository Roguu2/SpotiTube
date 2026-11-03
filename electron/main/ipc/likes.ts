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
        await (on ? yt.interact.like(track.sourceTrackId) : yt.interact.removeRating(track.sourceTrackId))
        return { liked: on, service: 'ytmusic' }
      }
    } catch (error) {
      return { liked: on, service: null, serviceError: errorMessage(error) }
    }
    return { liked: on, service: null }
  })
}
