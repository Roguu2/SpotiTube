import { YTNodes, type Innertube } from 'youtubei.js'
import type { AlbumPage, AlbumRef, AlbumSummary, ArtistPage, ArtistRef, ArtistSummary } from '@core/ipc'
import type { UnifiedArtist, UnifiedTrack } from '@core/types'
import { bestThumbnail } from '../../services/youtube'
import { listItemToTrack } from './mapping'

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

async function artistId(yt: Innertube, ref: ArtistRef): Promise<string> {
  if (ref.id?.startsWith('UC')) return ref.id
  const items = (await searchListItems(yt, ref.name, 'artist')).filter((item) => item.id?.startsWith('UC'))
  const best = bestByName(items, ref.name, (item) => item.name ?? item.title ?? '')
  if (!best?.id) throw new Error(`${ref.name} isn't on YouTube Music`)
  return best.id
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
    albums: [],
    singles: [],
    similar: []
  }

  for (const section of artist.sections ?? []) {
    if (section.is(YTNodes.MusicShelf)) {
      if (page.topSongs.length) continue
      page.topSongs = [...section.contents.filterType(YTNodes.MusicResponsiveListItem)]
        .filter((item) => item.id && (item.item_type === 'song' || item.item_type === 'video'))
        .map((item) => listItemToTrack(item))
      continue
    }
    if (!section.is(YTNodes.MusicCarouselShelf)) continue
    const title = section.header?.as(YTNodes.MusicCarouselShelfBasicHeader).title?.toString() ?? ''
    const items = [...section.contents.filterType(YTNodes.MusicTwoRowItem)]

    const albums: AlbumSummary[] = items
      .filter((item) => item.item_type === 'album' && item.id)
      .map((item) => ({
        id: item.id as string,
        title: item.title.toString(),
        subtitle: item.subtitle?.toString() || undefined,
        artworkUrl: bestThumbnail(item.thumbnail)
      }))
    if (albums.length) {
      if (/single|\bep\b/i.test(title)) page.singles.push(...albums)
      else page.albums.push(...albums)
      continue
    }

    const similar: ArtistSummary[] = items
      .filter((item) => item.item_type === 'artist' && item.id?.startsWith('UC'))
      .map((item) => ({
        id: item.id as string,
        name: item.title.toString(),
        subtitle: item.subtitle?.toString() || undefined,
        artworkUrl: bestThumbnail(item.thumbnail)
      }))
    if (similar.length && !page.similar.length) page.similar = similar
  }
  return page
}
