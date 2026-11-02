import { create } from 'zustand'
import type { AppInfo, AppSettings, AppSettingsPatch, AuthStatus } from '@core/ipc'
import { toast } from './useToastStore'

const STUDIO_KEY = 'spotitube.studioOpen'

function readStudioOpen(): boolean {
  try {
    return localStorage.getItem(STUDIO_KEY) === '1'
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
  studioOpen: boolean
  settingsOpen: boolean

  load(): Promise<void>
  update(patch: AppSettingsPatch): Promise<void>
  refreshAuth(): Promise<void>
  connectSpotify(): Promise<void>
  disconnectSpotify(): Promise<void>
  connectYouTubeMusic(cookie: string): Promise<boolean>
  disconnectYouTubeMusic(): Promise<void>
  toggleStudio(open?: boolean): void
  setSettingsOpen(open: boolean): void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  appInfo: null,
  settings: null,
  auth: null,
  connecting: null,
  studioOpen: readStudioOpen(),
  settingsOpen: false,

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

  toggleStudio(open) {
    const studioOpen = open ?? !get().studioOpen
    set({ studioOpen })
    try {
      localStorage.setItem(STUDIO_KEY, studioOpen ? '1' : '0')
    } catch {
      // Drawer state is a convenience only.
    }
  },

  setSettingsOpen(settingsOpen) {
    set({ settingsOpen })
  }
}))
