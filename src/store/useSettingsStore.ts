import { create } from 'zustand'
import type { AppInfo, AppSettings, AppSettingsPatch, AuthStatus } from '@core/ipc'
import { toast } from './useToastStore'

const QUEUE_KEY = 'spotitube.queueOpen'

function readQueueOpen(): boolean {
  try {
    return localStorage.getItem(QUEUE_KEY) === '1'
  } catch {
    return false
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

interface SettingsState {
  appInfo: AppInfo | null
  settings: AppSettings | null
  auth: AuthStatus | null
  connecting: 'spotify' | 'ytmusic' | null
  queueOpen: boolean
  settingsOpen: boolean
  /** Full-screen Now playing view with lyrics. */
  nowPlayingOpen: boolean
  /** The window is the small always-on-top player. */
  miniMode: boolean

  load(): Promise<void>
  update(patch: AppSettingsPatch): Promise<void>
  refreshAuth(): Promise<void>
  connectSpotify(): Promise<void>
  disconnectSpotify(): Promise<void>
  connectYouTubeMusic(cookie: string): Promise<boolean>
  disconnectYouTubeMusic(): Promise<void>
  toggleQueue(open?: boolean): void
  setSettingsOpen(open: boolean): void
  toggleNowPlaying(open?: boolean): void
  setMiniMode(enabled: boolean): Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appInfo: null,
  settings: null,
  auth: null,
  connecting: null,
  queueOpen: readQueueOpen(),
  settingsOpen: false,
  nowPlayingOpen: false,
  miniMode: false,

  async load() {
    const [appInfo, settings, auth] = await Promise.all([
      window.electronAPI.app.getInfo(),
      window.electronAPI.settings.get(),
      window.electronAPI.auth.getStatus()
    ])
    set({ appInfo, settings, auth })
  },

  async update(patch) {
    try {
      const settings = await window.electronAPI.settings.update(patch)
      set({ settings })
      if (patch.spotifyClientId !== undefined) await get().refreshAuth()
    } catch (error) {
      toast.error(`Could not save settings: ${errorText(error)}`)
    }
  },

  async refreshAuth() {
    set({ auth: await window.electronAPI.auth.getStatus() })
  },

  async connectSpotify() {
    set({ connecting: 'spotify' })
    try {
      const auth = await window.electronAPI.auth.connectSpotify()
      set({ auth })
      toast.success(`Spotify connected${auth.spotify.displayName ? ` as ${auth.spotify.displayName}` : ''}`)
    } catch (error) {
      toast.error(errorText(error))
    } finally {
      set({ connecting: null })
    }
  },

  async disconnectSpotify() {
    set({ auth: await window.electronAPI.auth.disconnectSpotify() })
    toast.info('Spotify disconnected')
  },

  async connectYouTubeMusic(cookie) {
    set({ connecting: 'ytmusic' })
    try {
      const auth = await window.electronAPI.auth.connectYouTubeMusic(cookie)
      set({ auth })
      toast.success(`YouTube Music connected${auth.ytmusic.displayName ? ` as ${auth.ytmusic.displayName}` : ''}`)
      return true
    } catch (error) {
      toast.error(errorText(error))
      return false
    } finally {
      set({ connecting: null })
    }
  },

  async disconnectYouTubeMusic() {
    set({ auth: await window.electronAPI.auth.disconnectYouTubeMusic() })
    toast.info('YouTube Music disconnected')
  },

  async setMiniMode(enabled) {
    // Switch the layout before the window shrinks, so the full layout is never squeezed into it.
    if (enabled) set({ miniMode: true, nowPlayingOpen: false })
    set({ miniMode: await window.electronAPI.window.setMini(enabled) })
  },

  toggleNowPlaying(open) {
    set({ nowPlayingOpen: open ?? !get().nowPlayingOpen })
  },

  toggleQueue(open) {
    const queueOpen = open ?? !get().queueOpen
    set({ queueOpen })
    try {
      localStorage.setItem(QUEUE_KEY, queueOpen ? '1' : '0')
    } catch {
      // Drawer state is a convenience only.
    }
  },

  setSettingsOpen(settingsOpen) {
    set({ settingsOpen })
  }
}))
