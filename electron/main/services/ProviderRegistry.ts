import type { AuthStatus, LibrarySnapshot, ProviderStatus, SearchResults } from '@core/ipc'
import {
  parsePlaylistId,
  type IMusicProvider,
  type PlaybackSource,
  type ProviderId,
  type StreamCandidate,
  type UnifiedPlaylist,
  type UnifiedTrack
} from '@core/types'
import type { SpotifyProvider } from '../providers/spotify/SpotifyProvider'
import type { YouTubeMusicProvider } from '../providers/ytmusic/YouTubeMusicProvider'
import type { DemoProvider } from '../providers/demo/DemoProvider'
import type { HybridProvider } from '../providers/hybrid/HybridProvider'
import type { TrackMatcher } from './trackMatcher'
import type { StreamResolver } from './streamResolver'
import type { StreamProxy } from './streamProxy'
import { errorMessage } from './http'
import { getProfileName, getSettings, getStreamOverride, setStreamOverride } from './store'

interface Providers {
  spotify: SpotifyProvider
  ytmusic: YouTubeMusicProvider
  hybrid: HybridProvider
  demo: DemoProvider
}

/** Routes library, search and playback requests to the provider that owns each item. */
export class ProviderRegistry {
  constructor(
    private readonly providers: Providers,
    private readonly matcher: TrackMatcher,
    private readonly resolver: StreamResolver,
    private readonly proxy: StreamProxy
  ) {}

  provider(id: ProviderId): IMusicProvider {
    return this.providers[id]
  }

  async getLibrary(): Promise<LibrarySnapshot> {
    const { showDemoContent } = getSettings()
    const load = async (
      providerId: 'spotify' | 'ytmusic',
      provider: SpotifyProvider | YouTubeMusicProvider
    ): Promise<{ playlists: UnifiedPlaylist[]; status: ProviderStatus }> => {
      if (!provider.isAuthenticated()) {
        const playlists = showDemoContent ? await this.providers.demo.getPlaylists(providerId) : []
        return { playlists, status: { providerId, authenticated: false, showingDemo: showDemoContent } }
      }
      try {
        return {
          playlists: await provider.getPlaylists(),
          status: { providerId, authenticated: true, showingDemo: false }
        }
      } catch (error) {
        return {
          playlists: [],
          status: { providerId, authenticated: true, showingDemo: false, error: errorMessage(error) }
        }
      }
    }

    const [hybrid, spotify, ytmusic] = await Promise.all([
      this.providers.hybrid.getPlaylists(),
      load('spotify', this.providers.spotify),
      load('ytmusic', this.providers.ytmusic)
    ])

    return {
      playlists: [...hybrid, ...spotify.playlists, ...ytmusic.playlists],
      providers: [
        { providerId: 'hybrid', authenticated: true, showingDemo: false },
        spotify.status,
        ytmusic.status
      ]
    }
  }

  getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]> {
    const { providerId, sourcePlaylistId } = parsePlaylistId(playlistId)
    return this.provider(providerId).getPlaylistTracks(sourcePlaylistId)
  }

  async search(query: string): Promise<SearchResults> {
    const q = query.trim()
    if (!q) return { spotify: [], ytmusic: [], errors: {} }

    const errors: SearchResults['errors'] = {}
    const { spotify, ytmusic, demo } = this.providers

    // YouTube Music search is public; Spotify search needs a connected account.
    const spotifySearch = spotify.isAuthenticated()
      ? spotify.searchTracks(q)
      : demo.searchTracks(q, 'spotify')

    const [spotifyResults, ytResults] = await Promise.all([
      spotifySearch.catch((error: unknown) => {
        errors.spotify = errorMessage(error)
        return []
      }),
      ytmusic.searchTracks(q).catch(async (error: unknown) => {
        errors.ytmusic = errorMessage(error)
        return demo.searchTracks(q, 'ytmusic')
      })
    ])

    return { spotify: spotifyResults, ytmusic: ytResults, errors }
  }

  /**
   * Resolves audio for a track and registers it with the local proxy.
   * Order: manual override → provider (auto-match) → synthesized fallback.
   */
  async getPlaybackSource(track: UnifiedTrack): Promise<PlaybackSource> {
    const override = getStreamOverride(track.id)

    const resolveUpstream = async (force: boolean): Promise<string> => {
      if (override) return this.resolver.resolve(override.videoId, force)
      if (force) {
        const videoId = track.streamVideoId ?? this.matcher.peek(track.id)?.videoId
        if (videoId) return this.resolver.resolve(videoId, true)
      }
      return this.provider(track.providerId).resolveStreamUrl(track)
    }

    try {
      const upstream = await resolveUpstream(false)
      const url = this.proxy.register(track.id, resolveUpstream, upstream)
      return {
        url,
        candidate: override ?? this.candidateFor(track),
        isOverride: !!override,
        isSynthetic: false
      }
    } catch (error) {
      if (!getSettings().syntheticFallback) throw error
      const synthetic = `synth:${track.id}`
      const url = this.proxy.register(track.id, async () => synthetic, synthetic)
      return { url, isOverride: false, isSynthetic: true }
    }
  }

  async getCandidates(track: UnifiedTrack, query?: string): Promise<StreamCandidate[]> {
    return this.matcher.candidates(track, query)
  }

  setOverride(track: UnifiedTrack, candidate: StreamCandidate | null): void {
    setStreamOverride(track.id, candidate)
  }

  async getAuthStatus(): Promise<AuthStatus> {
    return {
      spotify: {
        connected: this.providers.spotify.isAuthenticated(),
        displayName: getProfileName('spotify'),
        clientIdConfigured: getSettings().spotifyClientId.length > 0
      },
      ytmusic: {
        connected: this.providers.ytmusic.isAuthenticated(),
        displayName: getProfileName('ytmusic')
      }
    }
  }

  /** The YouTube upload currently backing a track, for display in the source picker. */
  private candidateFor(track: UnifiedTrack): StreamCandidate | undefined {
    if (track.streamVideoId) {
      return {
        videoId: track.streamVideoId,
        title: track.title,
        artists: track.artists.map((a) => a.name),
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl,
        kind: 'song',
        score: 1
      }
    }
    return this.matcher.peek(track.id)
  }
}
