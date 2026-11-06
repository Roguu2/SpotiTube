/**
 * Single source of truth for IPC channel names and the API surface the
 * preload script exposes on `window.electronAPI`.
 */

import type { PlaybackSource, SourceId, StreamCandidate, UnifiedPlaylist, UnifiedTrack } from './types'
import type { DspPersistedState, DspSettings, EqPreset, LoopRegion, TrackDspProfile } from './dsp'

export const IpcChannels = {
  appGetInfo: 'app:get-info',
  appGetAutostart: 'app:get-autostart',
  appSetAutostart: 'app:set-autostart',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',
  windowSetMini: 'window:set-mini',
  windowMiniChanged: 'window:mini-changed',

  libraryGetPlaylists: 'library:get-playlists',
  libraryGetPlaylistTracks: 'library:get-playlist-tracks',
  librarySearch: 'library:search',
  libraryGetSimilar: 'library:get-similar',
  libraryChanged: 'library:changed',

  hybridCreate: 'hybrid:create',
  hybridRename: 'hybrid:rename',
  hybridDelete: 'hybrid:delete',
  hybridAddTracks: 'hybrid:add-tracks',
  hybridRemoveTracks: 'hybrid:remove-tracks',

  streamGetPlaybackSource: 'stream:get-playback-source',
  streamGetCandidates: 'stream:get-candidates',
  streamSetOverride: 'stream:set-override',

  authGetStatus: 'auth:get-status',
  authConnectSpotify: 'auth:connect-spotify',
  authDisconnectSpotify: 'auth:disconnect-spotify',
  authConnectYouTubeMusic: 'auth:connect-ytmusic',
  authDisconnectYouTubeMusic: 'auth:disconnect-ytmusic',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  mediaCommand: 'media:command',
  mediaNowPlaying: 'media:now-playing',

  dspGetState: 'dsp:get-state',
  dspSaveGlobal: 'dsp:save-global',
  dspSetRememberPerTrack: 'dsp:set-remember-per-track',
  dspSaveCustomPresets: 'dsp:save-custom-presets',
  dspGetTrackProfile: 'dsp:get-track-profile',
  dspSaveTrackProfile: 'dsp:save-track-profile',

  updatesGetState: 'updates:get-state',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  updatesStateChanged: 'updates:state-changed',

  historyGet: 'history:get',
  historyRecordPlay: 'history:record-play',
  historyClear: 'history:clear',
  historyGetSession: 'history:get-session',
  historySaveSession: 'history:save-session',
  historySavePosition: 'history:save-position',

  lyricsGet: 'lyrics:get',
  genresGet: 'genres:get',

  presenceUpdate: 'presence:update',
  mediaNotifyTrack: 'media:notify-track',

  libraryGetAlbum: 'library:get-album',
  libraryGetArtist: 'library:get-artist',

  ytsyncGetStatus: 'ytsync:get-status',
  ytsyncSetEnabled: 'ytsync:set-enabled',
  ytsyncNow: 'ytsync:now',
  ytsyncStatusChanged: 'ytsync:status-changed',

  storageGetUsage: 'storage:get-usage',
  storageClearCache: 'storage:clear-cache',
  cozyGetCompanionImage: 'cozy:get-companion-image',
  cozyPickCompanionImage: 'cozy:pick-companion-image',
  cozyClearCompanionImage: 'cozy:clear-companion-image',

  discoverGetCategories: 'discover:get-categories',
  discoverGetPlaylists: 'discover:get-playlists',

  likesGetIds: 'likes:get-ids',
  likesSet: 'likes:set'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** Envelope for every `invoke` so errors cross the bridge with a clean message. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

/** The mini player: square video with the essentials, or the wider one with every control. */
export type MiniSize = 'compact' | 'large'

export interface AppInfo {
  name: string
  version: string
  platform: DesktopPlatform
  isDev: boolean
  /** This build has a Discord application to show the status under. */
  discordAvailable: boolean
}

export interface ProviderStatus {
  providerId: 'spotify' | 'ytmusic' | 'hybrid'
  authenticated: boolean
  /** Showing sample playlists because no account is connected. */
  showingDemo: boolean
  /** Last error while loading this provider's library, if any. */
  error?: string
}

export interface LibrarySnapshot {
  playlists: UnifiedPlaylist[]
  providers: ProviderStatus[]
}

export interface SearchResults {
  spotify: UnifiedTrack[]
  ytmusic: UnifiedTrack[]
  errors: Partial<Record<'spotify' | 'ytmusic', string>>
}

export interface AuthStatus {
  spotify: { connected: boolean; displayName?: string; clientIdConfigured: boolean }
  ytmusic: { connected: boolean; displayName?: string }
}

export interface AppSettings {
  spotifyClientId: string
  /** Fixed loopback redirect URI that must be whitelisted in the Spotify app dashboard. */
  spotifyRedirectUri: string
  ytDlpPath: string
  showDemoContent: boolean
  closeToTray: boolean
  /** Fall back to a synthesized preview when no stream can be resolved. */
  syntheticFallback: boolean
  /** Check for, and download, updates in the background. */
  autoUpdate: boolean
  /** Restore the queue and playback position from the previous run on launch. */
  restoreSession: boolean
  /** When the queue runs out, keep playing tracks similar to the last one. */
  autoplay: boolean
  /** Short volume fades when skipping, pausing and resuming. */
  smoothFades: boolean
  /** Show what's playing as your Discord status. */
  discordPresence: boolean
  /** A system notification when a new song starts while SpotiTube is in the background. */
  trackNotifications: boolean
  /** Keep SpotiTube playlists in the connected YouTube Music account, so every device has them. */
  ytmusicSync: boolean
}

/** Where a play started from, as shown in the queue and in Recently played. */
export interface PlayContext {
  /** Playlist the queue came from, for "now playing" highlighting and navigation. */
  playlistId?: string
  label: string
}

export interface PlayRecord {
  track: UnifiedTrack
  playedAt: number
  context?: PlayContext
}

/** Everything needed to pick up the queue where the previous run left off. */
export interface PlaybackSession {
  queue: UnifiedTrack[]
  order: number[]
  position: number
  manual: number[]
  context: PlayContext | null
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  /** Seconds into the current track. */
  currentTime: number
  savedAt: number
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  /** Development builds cannot update themselves. */
  | 'unsupported'

export interface UpdateState {
  status: UpdateStatus
  currentVersion: string
  /** Version offered by the update server. */
  version?: string
  releaseNotes?: string
  progress?: { percent: number; bytesPerSecond: number; transferred: number; total: number }
  error?: string
  checkedAt?: number
  /** Where updates can be downloaded manually. */
  releasesUrl: string
}

export type AppSettingsPatch = Partial<Omit<AppSettings, 'spotifyRedirectUri'>>

export type MediaCommand = 'play-pause' | 'next' | 'previous' | 'stop'

/**
 * Points at an album: its YouTube Music id when known (YouTube Music tracks
 * carry one), otherwise its name and artist, which are looked up there.
 */
export interface AlbumRef {
  id?: string
  name: string
  artist?: string
}

/** Points at an artist the same way: YouTube Music channel id, or a name to look up. */
export interface ArtistRef {
  id?: string
  name: string
}

export interface AlbumSummary {
  id: string
  title: string
  /** e.g. "2025" or "Single • 2026". */
  subtitle?: string
  artworkUrl?: string
}

export interface ArtistSummary {
  id: string
  name: string
  subtitle?: string
  artworkUrl?: string
}

export interface AlbumPage {
  id: string
  title: string
  /** e.g. "Album • 2025". */
  subtitle?: string
  /** e.g. "13 songs • 31 minutes". */
  details?: string
  artists: ArtistRef[]
  artworkUrl?: string
  tracks: UnifiedTrack[]
}

export interface ArtistPage {
  id: string
  name: string
  artworkUrl?: string
  description?: string
  topSongs: UnifiedTrack[]
  /**
   * Videos and songs from the page's carousels. For a plain channel (DJ mixes,
   * covers, live sets) this is everything it has, since it has no "Top songs".
   */
  videos: UnifiedTrack[]
  albums: AlbumSummary[]
  singles: AlbumSummary[]
  /** Playlists the artist or channel made or appears on. */
  playlists: UnifiedPlaylist[]
  similar: ArtistSummary[]
}

/** Sync through the YouTube Music account, for Settings. */
export interface YtSyncStatus {
  enabled: boolean
  /** A YouTube Music account is connected (sync needs one). */
  connected: boolean
  running: boolean
  lastSyncAt: number | null
  /** SpotiTube playlists with a twin in the account. */
  playlists: number
  error: string | null
}

/** How much SpotiTube keeps on disk, for Settings. */
export interface StorageUsage {
  /** Chromium's cache of player files and covers. */
  cacheBytes: number
  cacheLimitBytes: number
  maxPlays: number
  maxPlayAgeDays: number
}

/** A mood or genre on YouTube Music's "Moods & genres" page. */
export interface DiscoverCategory {
  /** Opaque id for fetching its playlists. */
  id: string
  title: string
  group: 'mood' | 'genre'
}

export interface LikeResult {
  liked: boolean
  /** The service the like was also saved to, if any. */
  service: 'spotify' | 'ytmusic' | null
  /** Why saving it to the service failed; the like is kept in SpotiTube either way. */
  serviceError?: string
}

/** A new song, for the system notification. */
export interface TrackNotice {
  title: string
  artists: string
  album?: string
  artworkUrl?: string
}

/** What Discord shows while a track plays. */
export interface PresenceInfo {
  title: string
  artists: string
  album?: string
  artworkUrl?: string
  source: SourceId
  /** Link for the "Open on …" button, when the track exists outside SpotiTube. */
  url?: string
  isPlaying: boolean
  position: number
  duration: number
}

export interface NowPlayingInfo {
  title: string
  artist: string
  isPlaying: boolean
}

export type Unsubscribe = () => void

export interface LyricLine {
  /** Seconds from the start of the recording. */
  time: number
  /** Empty for instrumental breaks. */
  text: string
}

export interface Lyrics {
  /** Time-synced lines, when the database has them. */
  synced: LyricLine[] | null
  plain: string | null
  instrumental: boolean
  /** Length of the recording the lyrics were timed against. */
  durationSec: number | null
}

export interface ElectronAPI {
  app: {
    getInfo(): Promise<AppInfo>
    /** Whether SpotiTube starts when you sign in (Windows and macOS). */
    getAutostart(): Promise<boolean>
    setAutostart(enabled: boolean): Promise<boolean>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(listener: (maximized: boolean) => void): Unsubscribe
    /** Shrinks the window into the always-on-top mini player, or restores it. Resolves to the new mode. */
    setMini(enabled: boolean, size?: MiniSize): Promise<boolean>
    onMiniChange(listener: (mini: boolean) => void): Unsubscribe
  }
  library: {
    getPlaylists(): Promise<LibrarySnapshot>
    getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]>
    search(query: string): Promise<SearchResults>
    /** Tracks similar to the given one (YouTube Music radio), for autoplay and "Start radio". */
    getSimilar(track: UnifiedTrack): Promise<UnifiedTrack[]>
    /** An album's page from YouTube Music, found by id or by name. */
    getAlbum(ref: AlbumRef): Promise<AlbumPage>
    /** An artist's page from YouTube Music, found by id or by name. */
    getArtist(ref: ArtistRef): Promise<ArtistPage>
    onChanged(listener: () => void): Unsubscribe
  }
  hybrid: {
    create(name: string, description?: string): Promise<UnifiedPlaylist>
    rename(playlistId: string, name: string): Promise<UnifiedPlaylist>
    delete(playlistId: string): Promise<void>
    addTracks(playlistId: string, tracks: UnifiedTrack[]): Promise<UnifiedPlaylist>
    removeTracks(playlistId: string, trackIds: string[]): Promise<UnifiedPlaylist>
  }
  stream: {
    getPlaybackSource(track: UnifiedTrack): Promise<PlaybackSource>
    getCandidates(track: UnifiedTrack, query?: string): Promise<StreamCandidate[]>
    /** Pin a specific YouTube upload as the audio for a track, or `null` to return to auto-matching. */
    setOverride(track: UnifiedTrack, candidate: StreamCandidate | null): Promise<void>
  }
  auth: {
    getStatus(): Promise<AuthStatus>
    connectSpotify(): Promise<AuthStatus>
    disconnectSpotify(): Promise<AuthStatus>
    connectYouTubeMusic(cookie: string): Promise<AuthStatus>
    disconnectYouTubeMusic(): Promise<AuthStatus>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: AppSettingsPatch): Promise<AppSettings>
  }
  media: {
    onCommand(listener: (command: MediaCommand) => void): Unsubscribe
    updateNowPlaying(info: NowPlayingInfo | null): void
    /** Announces a new song with a system notification (if enabled and SpotiTube is in the background). */
    notifyTrack(notice: TrackNotice): void
  }
  dsp: {
    getState(): Promise<DspPersistedState>
    saveGlobal(settings: DspSettings): Promise<void>
    setRememberPerTrack(enabled: boolean): Promise<void>
    saveCustomPresets(presets: EqPreset[]): Promise<EqPreset[]>
    getTrackProfile(trackId: string): Promise<TrackDspProfile | null>
    /** `null` forgets the track's profile. */
    saveTrackProfile(trackId: string, profile: { dsp: DspSettings; loop: LoopRegion } | null): Promise<void>
  }
  updates: {
    getState(): Promise<UpdateState>
    check(): Promise<UpdateState>
    download(): Promise<UpdateState>
    /** Quits, installs the downloaded update and relaunches. */
    install(): Promise<void>
    onStateChange(listener: (state: UpdateState) => void): Unsubscribe
  }
  history: {
    /** Plays, newest first. */
    get(): Promise<PlayRecord[]>
    recordPlay(track: UnifiedTrack, context: PlayContext | null): Promise<void>
    clear(): Promise<void>
    getSession(): Promise<PlaybackSession | null>
    /** `null` forgets the saved session. */
    saveSession(session: PlaybackSession | null): Promise<void>
    /** Saves only which track and second the session is at — cheap enough to call often. */
    savePosition(position: number, currentTime: number): Promise<void>
  }
  lyrics: {
    /** `null` when no lyrics are known for the track. */
    get(track: UnifiedTrack): Promise<Lyrics | null>
    /** An artist's genre tags from MusicBrainz, most agreed-on first; empty when unknown. */
    genres(artist: string): Promise<string[]>
  }
  ytsync: {
    getStatus(): Promise<YtSyncStatus>
    setEnabled(enabled: boolean): Promise<YtSyncStatus>
    syncNow(): Promise<YtSyncStatus>
    onStatusChange(listener: (status: YtSyncStatus) => void): Unsubscribe
  }
  storage: {
    getUsage(): Promise<StorageUsage>
    /** Empties the cache of player files and covers; it fills up again as you listen. */
    clearCache(): Promise<StorageUsage>
  }
  cozy: {
    /** Where your own companion picture loads from, or null when there is none. */
    getCompanionImage(): Promise<string | null>
    /** Opens a file dialog; the new picture's URL, or null if cancelled. Rejects files that aren't images. */
    pickCompanionImage(): Promise<string | null>
    clearCompanionImage(): Promise<void>
  }
  discover: {
    getCategories(): Promise<DiscoverCategory[]>
    /** Playlists for a mood or genre; their tracks load like any playlist's. */
    getPlaylists(categoryId: string): Promise<UnifiedPlaylist[]>
  }
  likes: {
    /** Ids of the tracks in Liked songs. */
    getIds(): Promise<string[]>
    set(track: UnifiedTrack, liked: boolean): Promise<LikeResult>
  }
  presence: {
    /** Turns the Discord status on or off and sets what it shows. */
    update(enabled: boolean, info: PresenceInfo | null): void
  }
}
