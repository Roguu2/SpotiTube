import { artistLine, type IMusicProvider, type SourceId, type UnifiedPlaylist, type UnifiedTrack } from '@core/types'
import type { TrackMatcher } from '../../services/trackMatcher'
import type { StreamResolver } from '../../services/streamResolver'
import { DEMO_PLAYLISTS } from './demoData'

/**
 * Sample Spotify and YouTube Music playlists shown before accounts are
 * connected. Audio is matched against the public YouTube Music catalog, so
 * demo tracks play real recordings without any credentials.
 */
export class DemoProvider implements IMusicProvider {
  readonly id = 'demo' as const
  readonly displayName = 'Demo Library'

  constructor(
    private readonly matcher: TrackMatcher,
    private readonly resolver: StreamResolver
  ) {}

  isAuthenticated(): boolean {
    return true
  }

  async getPlaylists(source?: SourceId): Promise<UnifiedPlaylist[]> {
    return DEMO_PLAYLISTS.filter((d) => !source || d.playlist.source === source).map((d) => d.playlist)
  }

  async getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]> {
    const demo = DEMO_PLAYLISTS.find((d) => d.playlist.sourcePlaylistId === playlistId)
    if (!demo) throw new Error('Demo playlist not found')
    return demo.tracks
  }

  async searchTracks(query: string, source?: SourceId): Promise<UnifiedTrack[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const seen = new Set<string>()
    return DEMO_PLAYLISTS.flatMap((d) => d.tracks)
      .filter((t) => !source || t.source === source)
      .filter((t) => {
        const haystack = `${t.title} ${artistLine(t)} ${t.album?.name ?? ''}`.toLowerCase()
        return terms.every((term) => haystack.includes(term))
      })
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
  }

  resolveStreamUrl(track: UnifiedTrack): Promise<string> {
    return this.matcher.resolvePlayable(track, (videoId) => this.resolver.resolve(videoId))
  }
}
