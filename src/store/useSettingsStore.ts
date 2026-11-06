import { create } from 'zustand'
import type { AppInfo, AppSettings, AppSettingsPatch, AuthStatus, MiniSize } from '@core/ipc'
import { toast } from './useToastStore'
import { isCompanionId, isCompanionLook, type CompanionId, type CompanionLook } from '@/components/cozy/Companion'
import { isSceneChoice, type SceneChoice } from '@/components/cozy/scenes'

const QUEUE_KEY = 'spotitube.queueOpen'
const MINI_SIZE_KEY = 'spotitube.miniSize'
const COZY_COMPANION_KEY = 'spotitube.cozyCompanion'
const COZY_SCENE_KEY = 'spotitube.cozyScene'
const COZY_LOOK_KEY = 'spotitube.cozyCompanionLook'

/** A remembered choice, or `fallback` when there is none, it's unknown, or storage is blocked. */
function readStored<T extends string>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return valid(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // A convenience only: the choice still holds for this session.
  }
}

function readMiniSize(): MiniSize {
  try {
    return localStorage.getItem(MINI_SIZE_KEY) === 'large' ? 'large' : 'compact'
  } catch {
    return 'compact'
  }
}

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
  miniSize: MiniSize
  /** The whole window as cozy mode (a calm screen for a second monitor). */
  cozyMode: boolean
  /** Who keeps you company in cozy mode's corner. */
  cozyCompanion: CompanionId
  /** Smooth and stylised, or pixel art. */
  cozyCompanionLook: CompanionLook
  /** Cozy mode's scene, or 'auto' to follow the genre of what's playing. */
  cozyScene: SceneChoice

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
  setMiniSize(size: MiniSize): Promise<void>
  setCozyMode(enabled: boolean): Promise<void>
  setCozyCompanion(companion: CompanionId): void
  setCozyCompanionLook(look: CompanionLook): void
  setCozyScene(scene: SceneChoice): void
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
  miniSize: readMiniSize(),
  cozyMode: false,
  cozyCompanion: readStored(COZY_COMPANION_KEY, isCompanionId, 'girl'),
  cozyCompanionLook: readStored(COZY_LOOK_KEY, isCompanionLook, 'stylized'),
  cozyScene: readStored(COZY_SCENE_KEY, isSceneChoice, 'auto'),

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
    if (enabled) {
      if (document.fullscreenElement) await document.exitFullscreen()
      set({ miniMode: true, nowPlayingOpen: false, cozyMode: false })
    }
    set({ miniMode: await window.electronAPI.window.setMini(enabled, get().miniSize) })
  },

  async setCozyMode(enabled) {
    if (enabled && get().miniMode) await get().setMiniMode(false)
    if (!enabled && document.fullscreenElement) await document.exitFullscreen()
    set({ cozyMode: enabled, nowPlayingOpen: false })
  },

  setCozyCompanion(companion) {
    set({ cozyCompanion: companion })
    writeStored(COZY_COMPANION_KEY, companion)
  },

  setCozyCompanionLook(look) {
    set({ cozyCompanionLook: look })
    writeStored(COZY_LOOK_KEY, look)
  },

  setCozyScene(scene) {
    set({ cozyScene: scene })
    writeStored(COZY_SCENE_KEY, scene)
  },

  async setMiniSize(size) {
    set({ miniSize: size })
    try {
      localStorage.setItem(MINI_SIZE_KEY, size)
    } catch {
      // The size is a convenience; the default is fine.
    }
    if (get().miniMode) await window.electronAPI.window.setMini(true, size)
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
