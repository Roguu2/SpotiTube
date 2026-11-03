/**
 * Single source of truth for IPC channel names and the API surface the
 * preload script exposes on `window.electronAPI`.
 */

import type { PlaybackSource, StreamCandidate, UnifiedPlaylist, UnifiedTrack } from './types'
import type { DspPersistedState, DspSettings, EqPreset, LoopRegion, TrackDspProfile } from './dsp'

export const IpcChannels = {
  appGetInfo: 'app:get-info',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed',

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
  historySavePosition: 'history:save-position'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

/** Envelope for every `invoke` so errors cross the bridge with a clean message. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

export interface AppInfo {
  name: string
  version: string
  platform: DesktopPlatform
  isDev: boolean
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

export interface NowPlayingInfo {
  title: string
  artist: string
  isPlaying: boolean
}

export type Unsubscribe = () => void

export interface ElectronAPI {
  app: {
    getInfo(): Promise<AppInfo>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    onMaximizedChange(listener: (maximized: boolean) => void): Unsubscribe
  }
  library: {
    getPlaylists(): Promise<LibrarySnapshot>
    getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]>
    search(query: string): Promise<SearchResults>
    /** Tracks similar to the given one (YouTube Music radio), for autoplay and "Start radio". */
    getSimilar(track: UnifiedTrack): Promise<UnifiedTrack[]>
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
}
