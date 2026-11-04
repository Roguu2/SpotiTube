import { BrowserWindow } from 'electron'
import { IpcChannels, type AppSettingsPatch } from '@core/ipc'
import { parsePlaylistId, type StreamCandidate, type UnifiedTrack } from '@core/types'
import type { ProviderRegistry } from '../services/ProviderRegistry'
import type { SpotifyAuth } from '../providers/spotify/SpotifyAuth'
import type { SpotifyProvider } from '../providers/spotify/SpotifyProvider'
import type { HybridProvider } from '../providers/hybrid/HybridProvider'
import type { YouTubeClient } from '../services/youtube'
import { getSettings, setProfileName, updateSettings } from '../services/store'
import { handle, requireString, requireTrack } from './handle'

interface LibraryIpcDeps {
  registry: ProviderRegistry
  spotifyAuth: SpotifyAuth
  spotify: SpotifyProvider
  hybrid: HybridProvider
  youtube: YouTubeClient
}

function notifyLibraryChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.libraryChanged)
  }
}

/** An album or artist reference: a name, plus optionally an id and an artist (all strings). */
function requireRef(value: unknown): { id?: string; name: string; artist?: string } {
  const ref = value as Record<string, unknown> | null
  if (!ref || typeof ref.name !== 'string' || !ref.name.trim()) throw new TypeError('Invalid album or artist')
  const optional = (key: string): string | undefined => (typeof ref[key] === 'string' ? (ref[key] as string).slice(0, 200) : undefined)
  return { id: optional('id'), name: ref.name.slice(0, 200), artist: optional('artist') }
}

function hybridSourceId(playlistId: unknown): string {
  const { providerId, sourcePlaylistId } = parsePlaylistId(requireString(playlistId, 'playlistId'))
  if (providerId !== 'hybrid') throw new Error('Only SpotiTube Hybrid playlists can be edited here')
  return sourcePlaylistId
}

export function registerLibraryIpc({ registry, spotifyAuth, spotify, hybrid, youtube }: LibraryIpcDeps): void {
  handle(IpcChannels.libraryGetPlaylists, () => registry.getLibrary())
  handle(IpcChannels.libraryGetPlaylistTracks, (playlistId: unknown) =>
    registry.getPlaylistTracks(requireString(playlistId, 'playlistId'))
  )
  handle(IpcChannels.librarySearch, (query: unknown) => registry.search(requireString(query, 'query')))
  handle(IpcChannels.libraryGetSimilar, (track: unknown) => registry.getSimilar(requireTrack<UnifiedTrack>(track)))
  handle(IpcChannels.libraryGetAlbum, (ref: unknown) => registry.getAlbum(requireRef(ref)))
  handle(IpcChannels.libraryGetArtist, (ref: unknown) => registry.getArtist(requireRef(ref)))
  handle(IpcChannels.discoverGetCategories, () => registry.getDiscoverCategories())
  handle(IpcChannels.discoverGetPlaylists, (categoryId: unknown) =>
    registry.getDiscoverPlaylists(requireString(categoryId, 'categoryId'))
  )

  handle(IpcChannels.hybridCreate, (name: unknown, description?: unknown) => {
    const playlist = hybrid.create(
      requireString(name, 'name'),
      description === undefined ? undefined : requireString(description, 'description')
    )
    notifyLibraryChanged()
    return playlist
  })
  handle(IpcChannels.hybridRename, (playlistId: unknown, name: unknown) => {
    const playlist = hybrid.rename(hybridSourceId(playlistId), requireString(name, 'name'))
    notifyLibraryChanged()
    return playlist
  })
  handle(IpcChannels.hybridDelete, (playlistId: unknown) => {
    hybrid.delete(hybridSourceId(playlistId))
    notifyLibraryChanged()
  })
  handle(IpcChannels.hybridAddTracks, (playlistId: unknown, tracks: unknown) => {
    if (!Array.isArray(tracks)) throw new TypeError('tracks must be an array')
    const playlist = hybrid.addTracks(hybridSourceId(playlistId), tracks.map((t) => requireTrack<UnifiedTrack>(t)))
    notifyLibraryChanged()
    return playlist
  })
  handle(IpcChannels.hybridRemoveTracks, (playlistId: unknown, trackIds: unknown) => {
    if (!Array.isArray(trackIds)) throw new TypeError('trackIds must be an array')
    const playlist = hybrid.removeTracks(
      hybridSourceId(playlistId),
      trackIds.map((id) => requireString(id, 'trackId'))
    )
    notifyLibraryChanged()
    return playlist
  })

  handle(IpcChannels.streamGetPlaybackSource, (track: unknown) =>
    registry.getPlaybackSource(requireTrack<UnifiedTrack>(track))
  )
  handle(IpcChannels.streamGetCandidates, (track: unknown, query?: unknown) =>
    registry.getCandidates(
      requireTrack<UnifiedTrack>(track),
      query === undefined ? undefined : requireString(query, 'query')
    )
  )
  handle(IpcChannels.streamSetOverride, (track: unknown, candidate: unknown) => {
    const value = candidate as StreamCandidate | null
    if (value !== null && typeof value?.videoId !== 'string') throw new TypeError('Invalid stream candidate')
    registry.setOverride(requireTrack<UnifiedTrack>(track), value)
  })

  handle(IpcChannels.authGetStatus, () => registry.getAuthStatus())
  handle(IpcChannels.authConnectSpotify, async () => {
    await spotifyAuth.login()
    spotify.resetSession()
    const profile = await spotify.getProfile()
    setProfileName('spotify', profile.display_name ?? profile.id)
    notifyLibraryChanged()
    return registry.getAuthStatus()
  })
  handle(IpcChannels.authDisconnectSpotify, () => {
    spotifyAuth.logout()
    spotify.resetSession()
    setProfileName('spotify', undefined)
    notifyLibraryChanged()
    return registry.getAuthStatus()
  })
  handle(IpcChannels.authConnectYouTubeMusic, async (cookie: unknown) => {
    const name = await youtube.connect(requireString(cookie, 'cookie'))
    setProfileName('ytmusic', name)
    notifyLibraryChanged()
    return registry.getAuthStatus()
  })
  handle(IpcChannels.authDisconnectYouTubeMusic, () => {
    youtube.disconnect()
    setProfileName('ytmusic', undefined)
    notifyLibraryChanged()
    return registry.getAuthStatus()
  })

  handle(IpcChannels.settingsGet, () => getSettings())
  handle(IpcChannels.settingsUpdate, (patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new TypeError('Invalid settings patch')
    const before = getSettings()
    const after = updateSettings(patch as AppSettingsPatch)
    // Tokens are bound to the client id; demo visibility changes the playlist list.
    if (before.spotifyClientId !== after.spotifyClientId || before.showDemoContent !== after.showDemoContent) {
      spotify.resetSession()
      notifyLibraryChanged()
    }
    return after
  })
}
