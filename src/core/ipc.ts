/**
 * Single source of truth for IPC channel names and the API surface the
 * preload script exposes on `window.electronAPI`.
 */

export const IpcChannels = {
  appGetInfo: 'app:get-info',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChanged: 'window:maximized-changed'
} as const

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export type DesktopPlatform = 'win32' | 'darwin' | 'linux'

export interface AppInfo {
  name: string
  version: string
  platform: DesktopPlatform
  isDev: boolean
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
}
