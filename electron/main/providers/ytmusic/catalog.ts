import { YTNodes, type Innertube } from 'youtubei.js'
import type { AlbumPage, AlbumRef, AlbumSummary, ArtistPage, ArtistRef, ArtistSummary } from '@core/ipc'
import { makePlaylistId, makeTrackId, type UnifiedArtist, type UnifiedPlaylist, type UnifiedTrack } from '@core/types'
import { bestThumbnail } from '../../services/youtube'
import { collectListItems, listItemToTrack } from './mapping'

/**
 * Album and artist pages from YouTube Music. Every track plays through
 * YouTube, so YouTube Music's catalogue serves albums and artists for every
 * source: YouTube Music tracks point at them by id, Spotify and sample tracks
 * by name, which is looked up.
 */

type Thumbs = { url: string; width: number }[]

/** Lower-case, accents and punctuation removed: "2039: ZŁOTE PIASKI" ≈ "2039 zlote piaski". */
function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/gi, 'l')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Exact name first, then one containing the other, then YouTube Music's own top result. */
function bestByName<T>(items: T[], name: string, nameOf: (item: T) => string): T | undefined {
  const wanted = normalize(name)
  return (
    items.find((item) => normalize(nameOf(item)) === wanted) ??
    items.find((item) => {
      const candidate = normalize(nameOf(item))
      return candidate.includes(wanted) || wanted.includes(candidate)
    }) ??
    items[0]
  )
}

function thumbsOf(node: unknown): Thumbs | undefined {
  const value = node as { contents?: Thumbs } | Thumbs | null | undefined
  if (Array.isArray(value)) return value
  return value?.contents
}

async function searchListItems(yt: Innertube, query: string, type: 'album' | 'artist'): Promise<YTNodes.MusicResponsiveListItem[]> {
  const results = await yt.music.search(query, { type })
  return (results.contents ?? []).flatMap((section) =>
    section.is(YTNodes.MusicShelf) ? [...section.contents.filterType(YTNodes.MusicResponsiveListItem)] : []
  )
}

async function albumId(yt: Innertube, ref: AlbumRef): Promise<string> {
  if (ref.id?.startsWith('MPREb')) return ref.id
  const items = (await searchListItems(yt, [ref.name, ref.artist].filter(Boolean).join(' '), 'album')).filter((item) =>
    item.id?.startsWith('MPREb')
  )
  const best = bestByName(items, ref.name, (item) => item.title ?? '')
  if (!best?.id) throw new Error(`“${ref.name}” isn't on YouTube Music`)
  return best.id
}

/** Letters and digits only, so "SpontanDJ" ≈ "S P O N T A N" and "Ł" ≈ "L". */
function squash(text: string): string {
  return normalize(text).replace(/ /g, '')
}

function sameCreator(a: string, b: string): boolean {
  const x = squash(a)
  const y = squash(b)
  return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))
}

/** Songs and videos for `query`; a failed search counts as no results. */
async function searchTracks(yt: Innertube, query: string): Promise<UnifiedTrack[]> {
  const search = (type: 'song' | 'video'): Promise<UnifiedTrack[]> =>
    yt.music
      .search(query, { type })
      .then((r) => collectListItems(r.contents).map((item) => listItemToTrack(item)))
      .catch(() => [])
  return (await Promise.all([search('song'), search('video')])).flat()
}

async function artistId(yt: Innertube, ref: ArtistRef): Promise<string> {
  if (ref.id?.startsWith('UC')) return ref.id
  const items = (await searchListItems(yt, ref.name, 'artist').catch(() => [])).filter((item) => item.id?.startsWith('UC'))
  const best = bestByName(items, ref.name, (item) => item.name ?? item.title ?? '')
  if (best?.id) return best.id
  // Plain channels (DJs, cover and mix channels) aren't "artists": find them through their uploads.
  for (const track of await searchTracks(yt, ref.name)) {
    const creator = track.artists.find((artist) => artist.id.startsWith('UC') && sameCreator(artist.name, ref.name))
    if (creator) return creator.id
  }
  throw new Error(`${ref.name} isn't on YouTube Music`)
}

/** A video or song tile from a carousel ("Videos", "Live performances"…). */
function tileToTrack(item: YTNodes.MusicTwoRowItem): UnifiedTrack {
  const videoId = item.id as string
  const artworkUrl = bestThumbnail(item.thumbnail)
  const artists = item.artists?.length ? item.artists : item.author ? [item.author] : []
  return {
    id: makeTrackId('ytmusic', videoId),
    providerId: 'ytmusic',
    source: 'ytmusic',
    sourceTrackId: videoId,
    title: item.title.toString() || 'Unknown title',
    artists: artists.map((a) => ({ id: a.channel_id ?? a.name, name: a.name })),
    durationMs: 0,
    artworkUrl,
    streamVideoId: videoId
  }
}

function tileToPlaylist(item: YTNodes.MusicTwoRowItem): UnifiedPlaylist {
  const id = (item.id as string).replace(/^VL/, '')
  return {
    id: makePlaylistId('ytmusic', id),
    providerId: 'ytmusic',
    source: 'ytmusic',
    sourcePlaylistId: id,
    name: item.title.toString(),
    description: item.subtitle?.toString() || undefined,
    artworkUrl: bestThumbnail(item.thumbnail),
    trackCount: 0,
    editable: false
  }
}

/** Most uploads a plain channel's page lists: its "Videos → More" grid holds them all. */
const MAX_CHANNEL_VIDEOS = 200

/**
 * Every video behind a carousel's "More" button, or nothing when there is none or it fails.
 * Its params are tied to the session that loaded the page, so `yt` must be that session.
 */
async function allVideos(yt: Innertube, shelf: YTNodes.MusicCarouselShelf): Promise<UnifiedTrack[]> {
  const more = shelf.header?.as(YTNodes.MusicCarouselShelfBasicHeader).more_content
  if (!more?.endpoint) return []
  try {
    const page = await more.endpoint.call(yt.actions, { client: 'YTMUSIC', parse: true })
    const tiles = page.contents_memo?.getType(YTNodes.MusicTwoRowItem) ?? []
    return [...tiles]
      .filter((item) => item.id && (item.item_type === 'video' || item.item_type === 'song'))
      .slice(0, MAX_CHANNEL_VIDEOS)
      .map(tileToTrack)
  } catch {
    return []
  }
}

/** Artists linked from a header line such as "Mata" or "Mata & White 2115". */
function linkedArtists(text: YTNodes.MusicResponsiveHeader['strapline_text_one'] | undefined): ArtistRef[] {
  const runs = (text?.runs ?? []) as { text: string; endpoint?: { payload?: { browseId?: string } } }[]
  const linked = runs.flatMap((run) => {
    const id = run.endpoint?.payload?.browseId
    return id?.startsWith('UC') ? [{ id, name: run.text }] : []
  })
  if (linked.length) return linked
  const name = text?.toString().trim()
  return name ? [{ name }] : []
}

export async function fetchAlbum(yt: Innertube, ref: AlbumRef): Promise<AlbumPage> {
  const id = await albumId(yt, ref)
  const album = await yt.music.getAlbum(id)
  const header = album.header?.as(YTNodes.MusicResponsiveHeader, YTNodes.MusicDetailHeader)
  const title = header?.title?.toString() || ref.name
  const responsive = header?.is(YTNodes.MusicResponsiveHeader) ? header : undefined
  const artists = responsive ? linkedArtists(responsive.strapline_text_one) : ref.artist ? [{ name: ref.artist }] : []
  const detail = header?.is(YTNodes.MusicDetailHeader) ? header : undefined
  const artworkUrl = bestThumbnail(responsive ? thumbsOf(responsive.thumbnail) : detail?.thumbnails)
  const fallbackArtists: UnifiedArtist[] = artists.map((a) => ({ id: a.id ?? a.name, name: a.name }))

  // Album rows carry neither the album nor a cover of their own: fill both in from the header.
  const tracks: UnifiedTrack[] = [...(album.contents ?? [])]
    .filter((item): item is YTNodes.MusicResponsiveListItem => item.is(YTNodes.MusicResponsiveListItem) && !!item.id)
    .map((item) => {
      const track = listItemToTrack(item)
      return {
        ...track,
        artists: track.artists.length ? track.artists : fallbackArtists,
        album: { id, name: title, artworkUrl },
        artworkUrl: track.artworkUrl ?? artworkUrl
      }
    })

  return {
    id,
    title,
    subtitle: header?.subtitle?.toString() || undefined,
    details: responsive?.second_subtitle?.toString() || undefined,
    artists,
    artworkUrl,
    tracks
  }
}

/**
 * `yt` should be a session YouTube issued (see YouTubeClient.getIssuedSession): with a locally
 * generated one, a plain channel's "Videos → More" list answers "no public content".
 */
export async function fetchArtist(yt: Innertube, ref: ArtistRef): Promise<ArtistPage> {
  const id = await artistId(yt, ref)
  const artist = await yt.music.getArtist(id)
  const header = artist.header as { title?: { toString(): string }; thumbnail?: unknown; description?: { toString(): string } } | undefined

  const page: ArtistPage = {
    id,
    name: header?.title?.toString() || ref.name,
    artworkUrl: bestThumbnail(thumbsOf(header?.thumbnail), 1200),
    description: header?.description?.toString() || undefined,
    topSongs: [],
    videos: [],
    albums: [],
    singles: [],
    playlists: [],
    similar: []
  }

  // Artists and plain channels lay their pages out differently ("Top songs" and albums,
  // or just "Videos" and "Playlists"), so every carousel is sorted by what its tiles are,
  // whatever it is called.
  const seenTracks = new Set<string>()
  const seenPlaylists = new Set<string>()
  let videoShelf: YTNodes.MusicCarouselShelf | undefined
  for (const section of artist.sections ?? []) {
    if (section.is(YTNodes.MusicShelf)) {
      if (page.topSongs.length) continue
      page.topSongs = [...section.contents.filterType(YTNodes.MusicResponsiveListItem)]
        .filter((item) => item.id && (item.item_type === 'song' || item.item_type === 'video'))
        .map((item) => listItemToTrack(item))
      for (const track of page.topSongs) seenTracks.add(track.id)
      continue
    }
    if (!section.is(YTNodes.MusicCarouselShelf)) continue
    const title = section.header?.as(YTNodes.MusicCarouselShelfBasicHeader).title?.toString() ?? ''
    const items = [...section.contents.filterType(YTNodes.MusicTwoRowItem)].filter((item) => item.id)

    const albums: AlbumSummary[] = items
      .filter((item) => item.item_type === 'album')
      .map((item) => ({
        id: item.id as string,
        title: item.title.toString(),
        subtitle: item.subtitle?.toString() || undefined,
        artworkUrl: bestThumbnail(item.thumbnail)
      }))
    if (albums.length) {
      if (/single|\bep\b/i.test(title)) page.singles.push(...albums)
      else page.albums.push(...albums)
    }

    const tracks = items.filter((item) => item.item_type === 'video' || item.item_type === 'song')
    if (tracks.length && !videoShelf) videoShelf = section
    for (const track of tracks.map(tileToTrack)) {
      if (seenTracks.has(track.id)) continue
      seenTracks.add(track.id)
      page.videos.push(track)
    }

    for (const playlist of items.filter((item) => item.item_type === 'playlist').map(tileToPlaylist)) {
      if (seenPlaylists.has(playlist.id)) continue
      seenPlaylists.add(playlist.id)
      page.playlists.push(playlist)
    }

    const similar: ArtistSummary[] = items
      .filter((item) => (item.item_type === 'artist' || item.item_type === 'channel') && item.id?.startsWith('UC') && item.id !== id)
      .map((item) => ({
        id: item.id as string,
        name: item.title.toString(),
        subtitle: item.subtitle?.toString() || undefined,
        artworkUrl: bestThumbnail(item.thumbnail)
      }))
    if (similar.length && !page.similar.length) page.similar = similar
  }

  // A channel without "Top songs" lives on its uploads: list all of them, not the first ten.
  if (!page.topSongs.length && videoShelf) {
    const all = (await allVideos(yt, videoShelf)).filter((track) => !page.videos.some((v) => v.id === track.id))
    page.videos.push(...all)
  }

  // Nothing playable on the page itself (a layout YouTube Music hasn't shown before):
  // fall back to this channel's songs and videos from search.
  if (!page.topSongs.length && !page.videos.length) {
    const found = await searchTracks(yt, page.name)
    const own = found.filter((track) => track.artists.some((artist) => artist.id === id))
    page.videos = [...new Map(own.map((track) => [track.id, track])).values()]
  }
  return page
}
