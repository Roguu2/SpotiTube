import type { RadioStation } from '@core/ipc'
import { artistLine, type UnifiedTrack } from '@core/types'

/** Radio tracks carry the station's place as their "artist", under this id prefix (never a link). */
export const RADIO_ARTIST_PREFIX = 'radio:'

export function isRadio(track: Pick<UnifiedTrack, 'source'> | null | undefined): boolean {
  return track?.source === 'radio'
}

/** "Kraków, Poland", or what the station says about itself when it has no place. */
export function stationPlace(station: RadioStation): string {
  const parts = [station.state, station.country].filter((p): p is string => !!p)
  // Stations often repeat the country as their state.
  return [...new Set(parts)].join(', ') || 'Internet radio'
}

/** A station as a track, so the player, queue, media keys and mini player handle it like any song. */
export function stationTrack(station: RadioStation): UnifiedTrack {
  return {
    id: `radio:${station.id}`,
    providerId: 'radio',
    source: 'radio',
    sourceTrackId: station.id,
    title: station.name,
    artists: [{ id: `${RADIO_ARTIST_PREFIX}${station.countryCode ?? ''}`, name: stationPlace(station) }],
    durationMs: 0,
    ...(station.favicon ? { artworkUrl: station.favicon } : {})
  }
}

/** Enough of a station to favorite it again, for tracks restored from a previous run. */
export function trackStation(track: UnifiedTrack): RadioStation {
  const code = track.artists[0]?.id?.slice(RADIO_ARTIST_PREFIX.length)
  return {
    id: track.sourceTrackId,
    name: track.title,
    tags: [],
    votes: 0,
    ...(track.artworkUrl ? { favicon: track.artworkUrl } : {}),
    ...(code ? { countryCode: code } : {}),
    ...(track.artists[0] ? { country: track.artists[0].name } : {})
  }
}

/** Title and artist for the OS media controls and Discord: a station's current song when it sends one. */
export function nowPlayingText(track: UnifiedTrack, liveTitle: string | undefined): { title: string; artist: string } {
  if (isRadio(track) && liveTitle) return { title: liveTitle, artist: track.title }
  return { title: track.title, artist: artistLine(track) }
}
