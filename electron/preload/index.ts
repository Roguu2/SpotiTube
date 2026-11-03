import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IpcChannels,
  type ElectronAPI,
  type IpcChannel,
  type IpcResult,
  type MediaCommand,
  type RemoteCommand,
  type RemoteStatus,
  type SyncApplied,
  type SyncStatus,
  type UpdateState
} from '@core/ipc'

/** Invokes a main-process handler and unwraps its {@link IpcResult} envelope. */
async function invoke<T>(channel: IpcChannel, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (result.ok) return result.data
  const error = new Error(result.error.message)
  error.name = result.error.code
  throw error
}

function subscribe<T extends unknown[]>(channel: IpcChannel, listener: (...args: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]): void => listener(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const electronAPI: ElectronAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo)
  },
  window: {
    minimize: () => ipcRenderer.send(IpcChannels.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IpcChannels.windowToggleMaximize),
    close: () => ipcRenderer.send(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    onMaximizedChange: (listener) => subscribe<[boolean]>(IpcChannels.windowMaximizedChanged, listener),
    setMini: (enabled) => ipcRenderer.invoke(IpcChannels.windowSetMini, enabled),
    onMiniChange: (listener) => subscribe<[boolean]>(IpcChannels.windowMiniChanged, listener)
  },
  library: {
    getPlaylists: () => invoke(IpcChannels.libraryGetPlaylists),
    getPlaylistTracks: (playlistId) => invoke(IpcChannels.libraryGetPlaylistTracks, playlistId),
    search: (query) => invoke(IpcChannels.librarySearch, query),
    getSimilar: (track) => invoke(IpcChannels.libraryGetSimilar, track),
    onChanged: (listener) => subscribe<[]>(IpcChannels.libraryChanged, listener)
  },
  hybrid: {
    create: (name, description) => invoke(IpcChannels.hybridCreate, name, description),
    rename: (playlistId, name) => invoke(IpcChannels.hybridRename, playlistId, name),
    delete: (playlistId) => invoke(IpcChannels.hybridDelete, playlistId),
    addTracks: (playlistId, tracks) => invoke(IpcChannels.hybridAddTracks, playlistId, tracks),
    removeTracks: (playlistId, trackIds) => invoke(IpcChannels.hybridRemoveTracks, playlistId, trackIds)
  },
  stream: {
    getPlaybackSource: (track) => invoke(IpcChannels.streamGetPlaybackSource, track),
    getCandidates: (track, query) => invoke(IpcChannels.streamGetCandidates, track, query),
    setOverride: (track, candidate) => invoke(IpcChannels.streamSetOverride, track, candidate)
  },
  auth: {
    getStatus: () => invoke(IpcChannels.authGetStatus),
    connectSpotify: () => invoke(IpcChannels.authConnectSpotify),
    disconnectSpotify: () => invoke(IpcChannels.authDisconnectSpotify),
    connectYouTubeMusic: (cookie) => invoke(IpcChannels.authConnectYouTubeMusic, cookie),
    disconnectYouTubeMusic: () => invoke(IpcChannels.authDisconnectYouTubeMusic)
  },
  settings: {
    get: () => invoke(IpcChannels.settingsGet),
    update: (patch) => invoke(IpcChannels.settingsUpdate, patch)
  },
  media: {
    onCommand: (listener) => subscribe<[MediaCommand]>(IpcChannels.mediaCommand, listener),
    updateNowPlaying: (info) => ipcRenderer.send(IpcChannels.mediaNowPlaying, info)
  },
  dsp: {
    getState: () => invoke(IpcChannels.dspGetState),
    saveGlobal: (settings) => invoke(IpcChannels.dspSaveGlobal, settings),
    setRememberPerTrack: (enabled) => invoke(IpcChannels.dspSetRememberPerTrack, enabled),
    saveCustomPresets: (presets) => invoke(IpcChannels.dspSaveCustomPresets, presets),
    getTrackProfile: (trackId) => invoke(IpcChannels.dspGetTrackProfile, trackId),
    saveTrackProfile: (trackId, profile) => invoke(IpcChannels.dspSaveTrackProfile, trackId, profile)
  },
  updates: {
    getState: () => invoke(IpcChannels.updatesGetState),
    check: () => invoke(IpcChannels.updatesCheck),
    download: () => invoke(IpcChannels.updatesDownload),
    install: () => invoke(IpcChannels.updatesInstall),
    onStateChange: (listener) => subscribe<[UpdateState]>(IpcChannels.updatesStateChanged, listener)
  },
  history: {
    get: () => invoke(IpcChannels.historyGet),
    recordPlay: (track, context) => invoke(IpcChannels.historyRecordPlay, track, context),
    clear: () => invoke(IpcChannels.historyClear),
    getSession: () => invoke(IpcChannels.historyGetSession),
    saveSession: (session) => invoke(IpcChannels.historySaveSession, session),
    savePosition: (position, currentTime) => invoke(IpcChannels.historySavePosition, position, currentTime)
  },
  lyrics: {
    get: (track) => invoke(IpcChannels.lyricsGet, track)
  },
  sync: {
    getStatus: () => invoke(IpcChannels.syncGetStatus),
    chooseFolder: () => invoke(IpcChannels.syncChooseFolder),
    stop: () => invoke(IpcChannels.syncStop),
    syncNow: () => invoke(IpcChannels.syncNow),
    getSession: (deviceId) => invoke(IpcChannels.syncGetSession, deviceId),
    onStatusChange: (listener) => subscribe<[SyncStatus]>(IpcChannels.syncStatusChanged, listener),
    onApplied: (listener) => subscribe<[SyncApplied]>(IpcChannels.syncApplied, listener)
  },
  remote: {
    getStatus: () => invoke(IpcChannels.remoteGetStatus),
    setEnabled: (enabled) => invoke(IpcChannels.remoteSetEnabled, enabled),
    resetPairing: () => invoke(IpcChannels.remoteResetPairing),
    onStatusChange: (listener) => subscribe<[RemoteStatus]>(IpcChannels.remoteStatusChanged, listener),
    onCommand: (listener) => subscribe<[RemoteCommand]>(IpcChannels.remoteCommand, listener),
    publishState: (state) => ipcRenderer.send(IpcChannels.remotePublishState, state)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
