import type {
  AlbumPage,
  AlbumRef,
  ArtistPage,
  ArtistRef,
  AuthStatus,
  DiscoverCategory,
  LibrarySnapshot,
  ProviderStatus,
  SearchResults
} from '@core/ipc'
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

/** Uploads handed to the renderer as embed fallbacks. */
const MAX_CANDIDATES = 6
/** Uploads tried for a direct stream before giving up on it. */
const MAX_STREAM_ATTEMPTS = 3

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
   * Decides how a track plays:
   * 1. Find the YouTube upload(s) for it (manual override → own video id → auto-match).
   * 2. If YouTube serves complete direct streams, proxy one into the DSP chain (`stream`).
   * 3. Otherwise use YouTube's official embedded player (`embed`) — complete playback,
   *    no DSP. Direct streams are only served for ~1 minute without a proof-of-origin
   *    token, which SpotiTube does not attempt to generate.
   * 4. With no match at all, fall back to a synthesized preview (`synthetic`) if enabled.
   */
  async getPlaybackSource(track: UnifiedTrack): Promise<PlaybackSource> {
    if (track.source === 'local') {
      const upstream = await this.provider(track.providerId).resolveStreamUrl(track)
      const url = this.proxy.register(track.id, () => this.provider(track.providerId).resolveStreamUrl(track), upstream)
      return { mode: 'stream', url, alternatives: [], isOverride: false }
    }

    const override = getStreamOverride(track.id)
    let candidates: StreamCandidate[]
    try {
      candidates = override ? [override] : await this.youtubeCandidates(track)
    } catch (error) {
      return this.synthetic(track, error)
    }

    const stream = await this.tryDirectStream(track, candidates)
    if (stream) {
      const alternatives = candidates.filter((c) => c.videoId !== stream.candidate.videoId)
      return { mode: 'stream', url: stream.url, candidate: stream.candidate, alternatives, isOverride: !!override }
    }

    const [candidate, ...alternatives] = candidates
    return { mode: 'embed', candidate, alternatives, isOverride: !!override }
  }

  private async youtubeCandidates(track: UnifiedTrack): Promise<StreamCandidate[]> {
    if (track.streamVideoId) {
      return [
        {
          videoId: track.streamVideoId,
          title: track.title,
          artists: track.artists.map((a) => a.name),
          durationMs: track.durationMs,
          artworkUrl: track.artworkUrl,
          kind: 'song',
          score: 1
        }
      ]
    }
    return (await this.matcher.acceptable(track)).slice(0, MAX_CANDIDATES)
  }

  /** Proxies a direct stream when YouTube hands out complete ones; `null` means "use the embed". */
  private async tryDirectStream(
    track: UnifiedTrack,
    candidates: StreamCandidate[]
  ): Promise<{ url: string; candidate: StreamCandidate } | null> {
    if (this.resolver.isKnownBlocked()) return null

    for (const candidate of candidates.slice(0, MAX_STREAM_ATTEMPTS)) {
      let upstream: string
      try {
        upstream = await this.resolver.resolve(candidate.videoId)
      } catch {
        continue
      }
      try {
        if (!(await this.resolver.hasFullAccess(upstream))) return null
      } catch {
        // The access probe itself failed (network); let the embed handle playback.
        return null
      }
      this.matcher.markPlayable(track.id, candidate)
      const url = this.proxy.register(
        track.id,
        (force) => this.resolver.resolve(candidate.videoId, force),
        upstream
      )
      return { url, candidate }
    }
    return null
  }

  private synthetic(track: UnifiedTrack, cause: unknown): PlaybackSource {
    if (!getSettings().syntheticFallback) throw cause
    const synthetic = `synth:${track.id}`
    const url = this.proxy.register(track.id, async () => synthetic, synthetic)
    return { mode: 'synthetic', url, alternatives: [], isOverride: false }
  }

  /**
   * Tracks similar to `track`, from YouTube Music's radio for it. Non-YouTube
   * tracks (Spotify, demo, hybrid) use the upload they are matched to.
   */
  /** Albums and artists come from YouTube Music for every source, since that's where everything plays. */
  getAlbum(ref: AlbumRef): Promise<AlbumPage> {
    return this.providers.ytmusic.getAlbum(ref)
  }

  getArtist(ref: ArtistRef): Promise<ArtistPage> {
    return this.providers.ytmusic.getArtist(ref)
  }

  getDiscoverCategories(): Promise<DiscoverCategory[]> {
    return this.providers.ytmusic.getDiscoverCategories()
  }

  getDiscoverPlaylists(categoryId: string): Promise<UnifiedPlaylist[]> {
    return this.providers.ytmusic.getDiscoverPlaylists(categoryId)
  }

  async getSimilar(track: UnifiedTrack): Promise<UnifiedTrack[]> {
    const override = getStreamOverride(track.id)
    const seed =
      override?.videoId ??
      track.streamVideoId ??
      this.matcher.peek(track.id)?.videoId ??
      (await this.matcher.acceptable(track))[0]?.videoId
    if (!seed) throw new Error(`No YouTube Music match to base a radio on for “${track.title}”`)
    return this.providers.ytmusic.getRadio(seed)
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

}
