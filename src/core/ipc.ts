/**
 * Single source of truth for IPC channel names and the API surface the
 * preload script exposes on `window.electronAPI`.
 */

import type { PlaybackSource, SourceId, StreamCandidate, UnifiedPlaylist, UnifiedTrack } from './types'
import type { DspPersistedState, DspSettings, EqPreset, LoopRegion, TrackDspProfile } from './dsp'

export const IpcChannels = {
  appGetInfo: 'app:get-info',

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

  remoteGetStatus: 'remote:get-status',
  remoteSetEnabled: 'remote:set-enabled',
  remoteResetPairing: 'remote:reset-pairing',
  remoteStatusChanged: 'remote:status-changed',
  remoteCommand: 'remote:command',
  remotePublishState: 'remote:publish-state',

  syncGetStatus: 'sync:get-status',
  syncChooseFolder: 'sync:choose-folder',
  syncStop: 'sync:stop',
  syncNow: 'sync:now',
  syncGetSession: 'sync:get-session',
  syncStatusChanged: 'sync:status-changed',
  syncApplied: 'sync:applied',

  presenceUpdate: 'presence:update',
  mediaNotifyTrack: 'media:notify-track',

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
  /** Serve the phone remote on the local network. */
  remoteEnabled: boolean
  /** Show what's playing as your Discord status. */
  discordPresence: boolean
  /** A system notification when a new song starts while SpotiTube is in the background. */
  trackNotifications: boolean
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

/** A track as the phone remote shows it. */
export interface RemoteTrack {
  id: string
  title: string
  artists: string
  album?: string
  artworkUrl?: string
  durationMs: number
  source: SourceId
}

export interface RemoteQueueItem {
  /** Position in the play order; jumping there plays it. */
  position: number
  kind: 'queued' | 'autoplay' | 'up-next'
  track: RemoteTrack
}

/** What the phone remote shows, published by the renderer a few times per second at most. */
export interface RemoteState {
  track: RemoteTrack | null
  isPlaying: boolean
  isBuffering: boolean
  /** Seconds into the track when the snapshot was taken. */
  position: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
  context: string | null
  /** The next few upcoming entries. */
  queue: RemoteQueueItem[]
  /** All upcoming entries, including those not listed. */
  queueTotal: number
}

/** A command from the phone, with search results already resolved to full tracks by the main process. */
export type RemoteCommand =
  | { type: 'toggle' | 'next' | 'previous' | 'mute' | 'shuffle' | 'repeat' }
  | { type: 'seek'; seconds: number }
  | { type: 'volume'; volume: number }
  | { type: 'jump'; position: number }
  | { type: 'play-now' | 'play-next' | 'add-to-queue' | 'radio'; track: UnifiedTrack }

export interface RemoteStatus {
  enabled: boolean
  running: boolean
  /** Address to open on the phone (without the pairing secret). */
  url: string | null
  /** Other addresses this computer has, if the main one isn't reachable. */
  otherUrls: string[]
  /** QR code (data URL) that opens the remote and pairs the phone in one scan. */
  qrDataUrl: string | null
  /** Phones connected right now. */
  clients: number
  error: string | null
}

/** A session another computer was in the middle of, offered as "Continue here". */
export interface RemoteSessionInfo {
  deviceId: string
  deviceName: string
  savedAt: number
  currentTime: number
  track: { title: string; artists: string; artworkUrl?: string }
}

export interface SyncStatus {
  enabled: boolean
  folder: string | null
  /** This computer's name as the others see it. */
  deviceName: string
  lastSyncAt: number | null
  error: string | null
  /** The other computers syncing through the folder. */
  devices: { id: string; name: string; platform: string; lastSeenAt: number }[]
  /** Their sessions newer than this computer's, newest first. */
  sessions: RemoteSessionInfo[]
}

/** What a sync changed on this computer, so the renderer knows what to reload. */
export interface SyncApplied {
  library: boolean
  history: boolean
  settings: boolean
}

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
  }
  sync: {
    getStatus(): Promise<SyncStatus>
    /** Asks for a folder (OneDrive, Dropbox, iCloud Drive…) and starts syncing through it. */
    chooseFolder(): Promise<SyncStatus>
    stop(): Promise<SyncStatus>
    syncNow(): Promise<SyncStatus>
    /** The full session of another computer, for "Continue here". */
    getSession(deviceId: string): Promise<PlaybackSession | null>
    onStatusChange(listener: (status: SyncStatus) => void): Unsubscribe
    onApplied(listener: (applied: SyncApplied) => void): Unsubscribe
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
  remote: {
    getStatus(): Promise<RemoteStatus>
    setEnabled(enabled: boolean): Promise<RemoteStatus>
    /** New pairing secret: every paired phone has to scan the QR code again. */
    resetPairing(): Promise<RemoteStatus>
    onStatusChange(listener: (status: RemoteStatus) => void): Unsubscribe
    onCommand(listener: (command: RemoteCommand) => void): Unsubscribe
    publishState(state: RemoteState): void
  }
}
