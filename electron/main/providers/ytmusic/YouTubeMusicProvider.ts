import { YTNodes, type Helpers } from 'youtubei.js'
import { makePlaylistId, type IMusicProvider, type UnifiedPlaylist, type UnifiedTrack } from '@core/types'
import { bestThumbnail, type YouTubeClient } from '../../services/youtube'
import type { StreamResolver } from '../../services/streamResolver'
import { collectListItems, listItemToTrack } from './mapping'

const LIKED_MUSIC_ID = 'LM'
const MAX_TRACKS_PER_PLAYLIST = 5_000
const MAX_LIBRARY_PAGES = 10

function parseCount(text: string | null | undefined): number {
  const match = text?.replace(/[,.\s](?=\d{3}\b)/g, '').match(/(\d+)\s*(songs?|tracks?|utw|piosen|titres?|canciones|lieder|titel)?/i)
  return match ? Number(match[1]) : 0
}

export class YouTubeMusicProvider implements IMusicProvider {
  readonly id = 'ytmusic' as const
  readonly displayName = 'YouTube Music'

  constructor(
    private readonly youtube: YouTubeClient,
    private readonly resolver: StreamResolver
  ) {}

  isAuthenticated(): boolean {
    return this.youtube.hasCookie()
  }

  async getPlaylists(): Promise<UnifiedPlaylist[]> {
    const yt = await this.youtube.getAuthenticated()
    const library = await yt.music.getLibrary()

    const items: YTNodes.MusicTwoRowItem[] = []
    const collect = (nodes: Helpers.ObservedArray<Helpers.YTNode> | undefined): void => {
      if (!nodes) return
      for (const node of nodes) {
        if (node.is(YTNodes.Grid)) items.push(...node.items.filterType(YTNodes.MusicTwoRowItem))
        else if (node.is(YTNodes.MusicShelf)) collect(node.contents)
        else if (node.is(YTNodes.MusicTwoRowItem)) items.push(node)
      }
    }
    collect(library.contents)

    let continuation = library.has_continuation ? await library.getContinuation() : null
    for (let i = 0; continuation && i < MAX_LIBRARY_PAGES; i++) {
      collect(continuation.contents.contents ?? undefined)
      continuation = continuation.has_continuation ? await continuation.getContinuation() : null
    }

    const playlists = new Map<string, UnifiedPlaylist>()
    for (const item of items) {
      const browseId = item.endpoint?.payload?.browseId as string | undefined
      const rawId = item.id ?? browseId
      if (!rawId || item.item_type !== 'playlist') continue
      const id = rawId.replace(/^VL/, '')
      if (playlists.has(id)) continue
      playlists.set(id, {
        id: makePlaylistId('ytmusic', id),
        providerId: 'ytmusic',
        source: 'ytmusic',
        sourcePlaylistId: id,
        name: item.title.toString(),
        owner: item.author?.name ?? item.artists?.[0]?.name,
        description: item.subtitle.toString() || undefined,
        artworkUrl: bestThumbnail(item.thumbnail),
        trackCount: parseCount(item.item_count ?? item.subtitle.toString()),
        editable: id !== LIKED_MUSIC_ID
      })
    }

    if (!playlists.has(LIKED_MUSIC_ID)) {
      playlists.set(LIKED_MUSIC_ID, {
        id: makePlaylistId('ytmusic', LIKED_MUSIC_ID),
        providerId: 'ytmusic',
        source: 'ytmusic',
        sourcePlaylistId: LIKED_MUSIC_ID,
        name: 'Liked Music',
        description: 'Songs you liked on YouTube Music',
        trackCount: 0,
        editable: false
      })
    }

    // Liked Music first, then the library order YouTube returned.
    const liked = playlists.get(LIKED_MUSIC_ID) as UnifiedPlaylist
    playlists.delete(LIKED_MUSIC_ID)
    return [liked, ...playlists.values()]
  }

  async getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]> {
    // Public playlists work anonymously; private ones and Liked Music need the cookie.
    const yt = this.youtube.hasCookie() ? await this.youtube.getAuthenticated() : await this.youtube.getAnonymous()
    let playlist = await yt.music.getPlaylist(playlistId)
    const tracks = collectListItems(playlist.items).map((item) => listItemToTrack(item))

    while (playlist.has_continuation && tracks.length < MAX_TRACKS_PER_PLAYLIST) {
      playlist = await playlist.getContinuation()
      tracks.push(...collectListItems(playlist.items).map((item) => listItemToTrack(item)))
    }
    return tracks
  }

  async searchTracks(query: string): Promise<UnifiedTrack[]> {
    const yt = await this.youtube.getAnonymous()
    const results = await yt.music.search(query, { type: 'song' })
    return collectListItems(results.contents).map((item) => listItemToTrack(item))
  }

  resolveStreamUrl(track: UnifiedTrack): Promise<string> {
    return this.resolver.resolve(track.streamVideoId ?? track.sourceTrackId)
  }
}
