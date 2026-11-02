/**
 * Domain model shared by the main process (providers, stream resolver)
 * and the renderer (stores, UI). Must stay free of Node and DOM APIs.
 */

export type SourceId = 'spotify' | 'ytmusic' | 'hybrid' | 'local'

export interface UnifiedArtist {
  id: string
  name: string
}

export interface UnifiedAlbum {
  id: string
  name: string
  artworkUrl?: string
}

export interface UnifiedTrack {
  /** Globally unique: `${source}:${sourceTrackId}` */
  id: string
  source: SourceId
  sourceTrackId: string
  title: string
  artists: UnifiedArtist[]
  album?: UnifiedAlbum
  durationMs: number
  artworkUrl?: string
  isrc?: string
  explicit?: boolean
  /** YouTube video id the audio is (or will be) streamed from. */
  streamVideoId?: string
}

export interface UnifiedPlaylist {
  /** Globally unique: `${source}:${sourcePlaylistId}` */
  id: string
  source: SourceId
  sourcePlaylistId: string
  name: string
  description?: string
  owner?: string
  artworkUrl?: string
  trackCount: number
  editable: boolean
}

export interface IMusicProvider {
  readonly id: SourceId
  readonly displayName: string
  isAuthenticated(): boolean
  getPlaylists(): Promise<UnifiedPlaylist[]>
  getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]>
  searchTracks(query: string): Promise<UnifiedTrack[]>
  resolveStreamUrl(track: UnifiedTrack): Promise<string>
}
