import { YTNodes, type Helpers } from 'youtubei.js'
import { makePlaylistId, type IMusicProvider, type UnifiedPlaylist, type UnifiedTrack } from '@core/types'
import type { DiscoverCategory } from '@core/ipc'
import { bestThumbnail, type YouTubeClient } from '../../services/youtube'
import type { StreamResolver } from '../../services/streamResolver'
import { collectListItems, listItemToTrack, panelToTracks } from './mapping'

const LIKED_MUSIC_ID = 'LM'
const MOODS_AND_GENRES = 'FEmusic_moods_and_genres'
const MOODS_AND_GENRES_CATEGORY = 'FEmusic_moods_and_genres_category'
/** The category list barely changes; a category's playlists rotate more often. */
const CATEGORIES_TTL_MS = 12 * 60 * 60_000
const CATEGORY_PLAYLISTS_TTL_MS = 60 * 60_000
const MAX_TRACKS_PER_PLAYLIST = 5_000
const MAX_LIBRARY_PAGES = 10

function parseCount(text: string | null | undefined): number {
  const match = text?.replace(/[,.\s](?=\d{3}\b)/g, '').match(/(\d+)\s*(songs?|tracks?|utw|piosen|titres?|canciones|lieder|titel)?/i)
  return match ? Number(match[1]) : 0
}

export class YouTubeMusicProvider implements IMusicProvider {
  readonly id = 'ytmusic' as const
  readonly displayName = 'YouTube Music'

  private categories: { at: number; value: Promise<DiscoverCategory[]> } | null = null
  private readonly categoryPlaylists = new Map<string, { at: number; value: Promise<UnifiedPlaylist[]> }>()

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
    const tracks = new Map<string, UnifiedTrack>()
    const add = (page: typeof playlist): number => {
      const before = tracks.size
      for (const item of collectListItems(page.items)) {
        const track = listItemToTrack(item)
        if (!tracks.has(track.id)) tracks.set(track.id, track)
      }
      return tracks.size - before
    }
    add(playlist)

    // Some curated playlists keep offering a "continuation" that repeats the same songs;
    // stop as soon as a page brings nothing new.
    while (playlist.has_continuation && tracks.size < MAX_TRACKS_PER_PLAYLIST) {
      playlist = await playlist.getContinuation()
      if (add(playlist) === 0) break
    }
    return [...tracks.values()].slice(0, MAX_TRACKS_PER_PLAYLIST)
  }

  async searchTracks(query: string): Promise<UnifiedTrack[]> {
    const yt = await this.youtube.getAnonymous()
    const results = await yt.music.search(query, { type: 'song' })
    return collectListItems(results.contents).map((item) => listItemToTrack(item))
  }

  /** Tracks YouTube Music would play after `videoId` (its radio / automix), excluding the seed itself. */
  async getRadio(videoId: string): Promise<UnifiedTrack[]> {
    const yt = await this.youtube.getAnonymous()
    const panel = await yt.music.getUpNext(videoId, true)
    return panelToTracks(panel.contents).filter((t) => t.streamVideoId !== videoId)
  }

  resolveStreamUrl(track: UnifiedTrack): Promise<string> {
    return this.resolver.resolve(track.streamVideoId ?? track.sourceTrackId)
  }

  /** YouTube Music's "Moods & genres": the first grid holds moods and moments, the second genres. */
  getDiscoverCategories(): Promise<DiscoverCategory[]> {
    if (this.categories && Date.now() - this.categories.at < CATEGORIES_TTL_MS) return this.categories.value
    const value = (async () => {
      const yt = await this.youtube.getAnonymous()
      const page = await yt.actions.execute('/browse', { browseId: MOODS_AND_GENRES, client: 'YTMUSIC', parse: true })
      const grids = page.contents_memo?.getType(YTNodes.Grid) ?? []
      return grids.slice(0, 2).flatMap((grid, index) =>
        grid.items.filterType(YTNodes.MusicNavigationButton).flatMap((button): DiscoverCategory[] => {
          const params = button.endpoint?.payload?.params as string | undefined
          return params ? [{ id: params, title: button.button_text, group: index === 0 ? 'mood' : 'genre' }] : []
        })
      )
    })()
    value.catch(() => (this.categories = null))
    this.categories = { at: Date.now(), value }
    return value
  }

  /** Curated playlists for a mood or genre; community playlists only when there are none. */
  getDiscoverPlaylists(categoryId: string): Promise<UnifiedPlaylist[]> {
    const cached = this.categoryPlaylists.get(categoryId)
    if (cached && Date.now() - cached.at < CATEGORY_PLAYLISTS_TTL_MS) return cached.value
    const value = (async () => {
      const yt = await this.youtube.getAnonymous()
      const page = await yt.actions.execute('/browse', {
        browseId: MOODS_AND_GENRES_CATEGORY,
        params: categoryId,
        client: 'YTMUSIC',
        parse: true
      })
      const shelves = page.contents_memo?.getType(YTNodes.MusicCarouselShelf) ?? []
      const toPlaylists = (shelf: YTNodes.MusicCarouselShelf): UnifiedPlaylist[] =>
        shelf.contents.filterType(YTNodes.MusicTwoRowItem).flatMap((item): UnifiedPlaylist[] => {
          if (item.item_type !== 'playlist' || !item.id) return []
          const id = item.id.replace(/^VL/, '')
          return [
            {
              id: makePlaylistId('ytmusic', id),
              providerId: 'ytmusic',
              source: 'ytmusic',
              sourcePlaylistId: id,
              name: item.title.toString(),
              description: item.subtitle.toString() || undefined,
              artworkUrl: bestThumbnail(item.thumbnail),
              trackCount: 0,
              editable: false
            }
          ]
        })
      // YouTube Music's own selections are reliably good; strangers' playlists are the fallback.
      const curated = shelves.filter((shelf) => !/community/i.test(shelf.header?.title?.toString() ?? ''))
      const playlists = curated.flatMap(toPlaylists)
      const result = playlists.length ? playlists : shelves.flatMap(toPlaylists)
      const seen = new Set<string>()
      return result.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    })()
    value.catch(() => this.categoryPlaylists.delete(categoryId))
    this.categoryPlaylists.set(categoryId, { at: Date.now(), value })
    return value
  }
}
