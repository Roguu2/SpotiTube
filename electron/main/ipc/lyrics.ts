import { IpcChannels } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { getLyrics } from '../services/lyrics'
import { getArtistGenres } from '../services/genres'
import { handle, requireString, requireTrack } from './handle'

/** Facts about a track from open music databases: lyrics (LRCLIB) and genres (MusicBrainz). */
export function registerLyricsIpc(): void {
  handle(IpcChannels.lyricsGet, (track: unknown) => getLyrics(requireTrack<UnifiedTrack>(track)))
  handle(IpcChannels.genresGet, (artist: unknown) => getArtistGenres(requireString(artist, 'artist')))
}
