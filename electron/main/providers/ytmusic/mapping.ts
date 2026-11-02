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
