import {
  makePlaylistId,
  makeTrackId,
  type IMusicProvider,
  type UnifiedPlaylist,
  type UnifiedTrack
} from '@core/types'
import { fetchJson, HttpError } from '../../services/http'
import type { TrackMatcher } from '../../services/trackMatcher'
import type { StreamResolver } from '../../services/streamResolver'
import type { SpotifyAuth } from './SpotifyAuth'

const API = 'https://api.spotify.com/v1'
const LIKED_SONGS_ID = 'liked'
const MAX_TRACKS_PER_PLAYLIST = 5_000

interface Paging<T> {
  items: T[]
  next: string | null
  total: number
}

interface SpotifyImage {
  url: string
  width: number | null
}

interface SpotifyTrack {
  id: string | null
  type: 'track' | 'episode'
  name: string
  duration_ms: number
  explicit: boolean
  is_local?: boolean
  artists: { id: string; name: string }[]
  album: { id: string; name: string; images: SpotifyImage[] }
  external_ids?: { isrc?: string }
}

interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  collaborative: boolean
  owner: { id: string; display_name: string | null }
  images: SpotifyImage[] | null
  tracks?: { total: number }
  items?: { total: number }
}

/** Playlist entries are `{ track }` on the classic endpoint and `{ item }` on the newer one. */
interface PlaylistEntry {
  track?: SpotifyTrack | null
  item?: SpotifyTrack | null
}

interface SpotifyUser {
  id: string
  display_name: string | null
}

function largestImage(images: SpotifyImage[] | null | undefined): string | undefined {
  if (!images?.length) return undefined
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url
}

function decodeDescription(html: string | null): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .trim()
  return text || undefined
}

export class SpotifyProvider implements IMusicProvider {
  readonly id = 'spotify' as const
  readonly displayName = 'Spotify'
  private user: SpotifyUser | null = null

  constructor(
    private readonly auth: SpotifyAuth,
    private readonly matcher: TrackMatcher,
    private readonly resolver: StreamResolver
  ) {}

  isAuthenticated(): boolean {
    return this.auth.isConnected()
  }

  async getProfile(): Promise<SpotifyUser> {
    this.user ??= await this.api<SpotifyUser>('/me')
    return this.user
  }

  resetSession(): void {
    this.user = null
  }

  async getPlaylists(): Promise<UnifiedPlaylist[]> {
    const [user, liked, playlists] = await Promise.all([
      this.getProfile(),
      this.api<Paging<unknown>>('/me/tracks?limit=1'),
      this.paginate<SpotifyPlaylist>('/me/playlists?limit=50', Infinity)
    ])

    const likedPlaylist: UnifiedPlaylist = {
      id: makePlaylistId('spotify', LIKED_SONGS_ID),
      providerId: 'spotify',
      source: 'spotify',
      sourcePlaylistId: LIKED_SONGS_ID,
      name: 'Liked Songs',
      description: 'Songs you liked on Spotify',
      owner: user.display_name ?? user.id,
      trackCount: liked.total,
      editable: false
    }

    return [
      likedPlaylist,
      ...playlists.filter(Boolean).map(
        (p): UnifiedPlaylist => ({
          id: makePlaylistId('spotify', p.id),
          providerId: 'spotify',
          source: 'spotify',
          sourcePlaylistId: p.id,
          name: p.name,
          description: decodeDescription(p.description),
          owner: p.owner.display_name ?? p.owner.id,
          artworkUrl: largestImage(p.images),
          trackCount: p.items?.total ?? p.tracks?.total ?? 0,
          editable: p.owner.id === user.id || p.collaborative
        })
      )
    ]
  }

  async getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]> {
    if (playlistId === LIKED_SONGS_ID) {
      const saved = await this.paginate<{ track: SpotifyTrack }>('/me/tracks?limit=50', MAX_TRACKS_PER_PLAYLIST)
      return this.mapTracks(saved.map((s) => s.track))
    }

    const id = encodeURIComponent(playlistId)
    let entries: PlaylistEntry[]
    try {
      entries = await this.paginate<PlaylistEntry>(`/playlists/${id}/tracks?limit=100`, MAX_TRACKS_PER_PLAYLIST)
    } catch (error) {
      // Spotify is migrating playlist contents to the `/items` endpoint.
      if (!(error instanceof HttpError) || ![403, 404, 410].includes(error.status)) throw error
      entries = await this.paginate<PlaylistEntry>(`/playlists/${id}/items?limit=100`, MAX_TRACKS_PER_PLAYLIST)
    }
    return this.mapTracks(entries.map((e) => e.track ?? e.item ?? null))
  }

  async searchTracks(query: string): Promise<UnifiedTrack[]> {
    const q = encodeURIComponent(query)
    let result: { tracks: Paging<SpotifyTrack> }
    try {
      result = await this.api(`/search?type=track&limit=20&q=${q}`)
    } catch (error) {
      // Apps in development mode are capped at a smaller page size.
      if (!(error instanceof HttpError) || error.status !== 400) throw error
      result = await this.api(`/search?type=track&limit=10&q=${q}`)
    }
    return this.mapTracks(result.tracks.items)
  }

  resolveStreamUrl(track: UnifiedTrack): Promise<string> {
    return this.matcher.resolvePlayable(track, (videoId) => this.resolver.resolve(videoId))
  }

  private mapTracks(tracks: (SpotifyTrack | null | undefined)[]): UnifiedTrack[] {
    return tracks
      .filter((t): t is SpotifyTrack & { id: string } => !!t && t.type === 'track' && !!t.id && !t.is_local)
      .map((t) => {
        const artworkUrl = largestImage(t.album.images)
        return {
          id: makeTrackId('spotify', t.id),
          providerId: 'spotify',
          source: 'spotify',
          sourceTrackId: t.id,
          title: t.name,
          artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
          album: { id: t.album.id, name: t.album.name, artworkUrl },
          durationMs: t.duration_ms,
          artworkUrl,
          isrc: t.external_ids?.isrc,
          explicit: t.explicit
        }
      })
  }

  private async paginate<T>(path: string, limit: number): Promise<T[]> {
    const items: T[] = []
    let next: string | null = path
    while (next && items.length < limit) {
      const page: Paging<T> = await this.api<Paging<T>>(next)
      items.push(...page.items)
      next = page.next
    }
    return items
  }

  private async api<T>(pathOrUrl: string, allowRefresh = true): Promise<T> {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${API}${pathOrUrl}`
    const token = await this.auth.getAccessToken()
    try {
      return await fetchJson<T>(url, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      if (allowRefresh && error instanceof HttpError && error.status === 401) {
        await this.auth.refresh()
        return this.api<T>(pathOrUrl, false)
      }
      throw error
    }
  }
}
