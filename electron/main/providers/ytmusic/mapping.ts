import { YTNodes, type Helpers } from 'youtubei.js'
import { makeTrackId, type ProviderId, type StreamCandidate, type UnifiedTrack } from '@core/types'
import { bestThumbnail } from '../../services/youtube'

type ListItem = YTNodes.MusicResponsiveListItem

/** Collects playable song/video rows from any mix of shelves and sections. */
export function collectListItems(nodes: Helpers.ObservedArray<Helpers.YTNode> | undefined): ListItem[] {
  if (!nodes) return []
  const rows: ListItem[] = []
  for (const node of nodes) {
    if (node.is(YTNodes.MusicResponsiveListItem)) {
      rows.push(node)
    } else if (node.is(YTNodes.MusicShelf)) {
      rows.push(...node.contents.filterType(YTNodes.MusicResponsiveListItem))
    } else if (node.is(YTNodes.ItemSection)) {
      rows.push(...collectListItems(node.contents))
    }
  }
  return rows.filter((row) => row.id && (row.item_type === 'song' || row.item_type === 'video'))
}

function artistsOf(item: ListItem): { name: string; channel_id?: string }[] {
  return item.artists ?? item.authors ?? (item.author ? [item.author] : [])
}

export function listItemToTrack(item: ListItem, providerId: ProviderId = 'ytmusic'): UnifiedTrack {
  const videoId = item.id as string
  const artworkUrl = bestThumbnail(item.thumbnail?.contents)
  return {
    id: makeTrackId('ytmusic', videoId),
    providerId,
    source: 'ytmusic',
    sourceTrackId: videoId,
    title: item.title ?? 'Unknown title',
    artists: artistsOf(item).map((a) => ({ id: a.channel_id ?? a.name, name: a.name })),
    album: item.album ? { id: item.album.id ?? item.album.name, name: item.album.name, artworkUrl } : undefined,
    durationMs: (item.duration?.seconds ?? 0) * 1000,
    artworkUrl,
    explicit: item.badges?.some((b) => b.is(YTNodes.MusicInlineBadge) && b.label === 'Explicit') ?? false,
    streamVideoId: videoId
  }
}

export function listItemToCandidate(item: ListItem): Omit<StreamCandidate, 'score'> {
  return {
    videoId: item.id as string,
    title: item.title ?? 'Unknown title',
    artists: artistsOf(item).map((a) => a.name),
    durationMs: (item.duration?.seconds ?? 0) * 1000,
    artworkUrl: bestThumbnail(item.thumbnail?.contents, 226),
    kind: item.item_type === 'song' ? 'song' : 'video'
  }
}

/** Tracks from a YouTube Music "Up next" / radio panel, in panel order. */
export function panelToTracks(nodes: Helpers.ObservedArray<Helpers.YTNode> | undefined): UnifiedTrack[] {
  if (!nodes) return []
  const videos: YTNodes.PlaylistPanelVideo[] = []
  for (const node of nodes) {
    if (node.is(YTNodes.PlaylistPanelVideo)) videos.push(node)
    else if (node.is(YTNodes.PlaylistPanelVideoWrapper) && node.primary) videos.push(node.primary)
  }
  return videos
    .filter((video) => video.video_id)
    .map((video) => {
      const artworkUrl = bestThumbnail(video.thumbnail)
      const artists = video.artists?.length ? video.artists : video.author ? [{ name: video.author }] : []
      return {
        id: makeTrackId('ytmusic', video.video_id),
        providerId: 'ytmusic',
        source: 'ytmusic',
        sourceTrackId: video.video_id,
        title: video.title.toString() || 'Unknown title',
        artists: artists.map((a) => ({ id: ('channel_id' in a && a.channel_id) || a.name, name: a.name })),
        album: video.album ? { id: video.album.id ?? video.album.name, name: video.album.name, artworkUrl } : undefined,
        durationMs: (video.duration?.seconds ?? 0) * 1000,
        artworkUrl,
        streamVideoId: video.video_id
      } satisfies UnifiedTrack
    })
}
