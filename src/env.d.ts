/// <reference types="vite/client" />

import type { ElectronAPI } from '@core/ipc'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
