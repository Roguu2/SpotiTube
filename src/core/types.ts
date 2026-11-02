/**
 * Domain model shared by the main process (providers, stream resolver)
 * and the renderer (stores, UI). Must stay free of Node and DOM APIs.
 */

/** Where content originally comes from — drives the colour-coded source badge. */
export type SourceId = 'spotify' | 'ytmusic' | 'hybrid' | 'local'

/** Which provider implementation owns an item — drives IPC routing. */
export type ProviderId = 'spotify' | 'ytmusic' | 'hybrid' | 'demo'

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
  /** Globally unique and stable across providers: `${source}:${sourceTrackId}` */
  id: string
  providerId: ProviderId
  source: SourceId
  sourceTrackId: string
  title: string
  artists: UnifiedArtist[]
  album?: UnifiedAlbum
  durationMs: number
  artworkUrl?: string
  isrc?: string
  explicit?: boolean
  /** YouTube video id the audio is streamed from, when already known. */
  streamVideoId?: string
}

export interface UnifiedPlaylist {
  /** Globally unique: `${providerId}:${sourcePlaylistId}` */
  id: string
  providerId: ProviderId
  source: SourceId
  sourcePlaylistId: string
  name: string
  description?: string
  owner?: string
  artworkUrl?: string
  trackCount: number
  editable: boolean
  /** Sample content shown until the matching account is connected. */
  isDemo?: boolean
}

export interface IMusicProvider {
  readonly id: ProviderId
  readonly displayName: string
  isAuthenticated(): boolean
  getPlaylists(): Promise<UnifiedPlaylist[]>
  getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]>
  searchTracks(query: string): Promise<UnifiedTrack[]>
  /**
   * Upstream audio location for a track. `https:` URLs are proxied through the
   * local stream server; `synth:<seed>` is rendered by the built-in synthesizer.
   */
  resolveStreamUrl(track: UnifiedTrack): Promise<string>
}

/** A YouTube Music upload that can serve as the audio for a track. */
export interface StreamCandidate {
  videoId: string
  title: string
  artists: string[]
  durationMs: number
  artworkUrl?: string
  kind: 'song' | 'video'
  /** 0..1 — how well this candidate matches the track's metadata. */
  score: number
}

export interface PlaybackSource {
  /** Local proxy URL safe to assign to an <audio> element with crossOrigin="anonymous". */
  url: string
  /** The YouTube video currently backing playback, if any. */
  candidate?: StreamCandidate
  /** True when the user pinned this source manually. */
  isOverride: boolean
  /** True when audio is synthesized because no stream could be resolved. */
  isSynthetic: boolean
}

export function makeTrackId(source: SourceId, sourceTrackId: string): string {
  return `${source}:${sourceTrackId}`
}

export function makePlaylistId(providerId: ProviderId, sourcePlaylistId: string): string {
  return `${providerId}:${sourcePlaylistId}`
}

export function parsePlaylistId(id: string): { providerId: ProviderId; sourcePlaylistId: string } {
  const sep = id.indexOf(':')
  if (sep <= 0) throw new Error(`Malformed playlist id "${id}"`)
  return {
    providerId: id.slice(0, sep) as ProviderId,
    sourcePlaylistId: id.slice(sep + 1)
  }
}

export function artistLine(track: Pick<UnifiedTrack, 'artists'>): string {
  return track.artists.map((a) => a.name).join(', ')
}
