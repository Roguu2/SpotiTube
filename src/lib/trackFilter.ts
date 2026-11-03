import { artistLine, type UnifiedTrack } from '@core/types'

export type TrackSort = 'custom' | 'title' | 'artist' | 'album' | 'shortest' | 'longest'

export const TRACK_SORT_LABELS: Record<TrackSort, string> = {
  custom: 'Custom order',
  title: 'Title (A–Z)',
  artist: 'Artist (A–Z)',
  album: 'Album (A–Z)',
  shortest: 'Shortest first',
  longest: 'Longest first'
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
}

/** Tracks matching every word of `query` (title, artists, album), in the chosen order. */
export function filterAndSortTracks(tracks: UnifiedTrack[], query: string, sort: TrackSort): UnifiedTrack[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  const filtered = terms.length
    ? tracks.filter((t) => {
        const haystack = normalize(`${t.title} ${artistLine(t)} ${t.album?.name ?? ''}`)
        return terms.every((term) => haystack.includes(term))
      })
    : tracks

  if (sort === 'custom') return filtered
  const sorted = [...filtered]
  switch (sort) {
    case 'title':
      return sorted.sort((a, b) => collator.compare(a.title, b.title))
    case 'artist':
      return sorted.sort((a, b) => collator.compare(artistLine(a), artistLine(b)) || collator.compare(a.title, b.title))
    case 'album':
      return sorted.sort((a, b) => collator.compare(a.album?.name ?? '', b.album?.name ?? '') || collator.compare(a.title, b.title))
    case 'shortest':
      return sorted.sort((a, b) => a.durationMs - b.durationMs)
    case 'longest':
      return sorted.sort((a, b) => b.durationMs - a.durationMs)
  }
}

const SORT_KEY = 'spotitube.playlistSort'

/** Sort choice per playlist, remembered on this device. */
export function readPlaylistSort(playlistId: string): TrackSort {
  try {
    const saved = (JSON.parse(localStorage.getItem(SORT_KEY) ?? '{}') as Record<string, TrackSort>)[playlistId]
    return saved && saved in TRACK_SORT_LABELS ? saved : 'custom'
  } catch {
    return 'custom'
  }
}

export function writePlaylistSort(playlistId: string, sort: TrackSort): void {
  try {
    const all = JSON.parse(localStorage.getItem(SORT_KEY) ?? '{}') as Record<string, TrackSort>
    if (sort === 'custom') delete all[playlistId]
    else all[playlistId] = sort
    localStorage.setItem(SORT_KEY, JSON.stringify(all))
  } catch {
    // A forgotten sort order is harmless.
  }
}
