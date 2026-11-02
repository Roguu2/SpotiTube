import { create } from 'zustand'
import type { UpdateState } from '@core/ipc'
import { toast } from './useToastStore'

interface UpdateStoreState {
  update: UpdateState | null
  /** The last check was started by the user (so "you're up to date" is worth saying). */
  manualCheck: boolean
  init(): Promise<() => void>
  check(): Promise<void>
  download(): Promise<void>
  install(): Promise<void>
}

export const useUpdateStore = create<UpdateStoreState>((set, get) => ({
  update: null,
  manualCheck: false,

  async init() {
    const off = window.electronAPI.updates.onStateChange((update) => {
      const previous = get().update
      set({ update })
      if (update.status === 'downloaded' && previous?.status !== 'downloaded') {
        toast.success(`SpotiTube ${update.version} is ready — restart to update`)
      }
      if (get().manualCheck && update.status === 'not-available') {
        toast.info(`You're on the latest version (${update.currentVersion})`)
        set({ manualCheck: false })
      }
      if (get().manualCheck && update.status === 'error') set({ manualCheck: false })
    })
    set({ update: await window.electronAPI.updates.getState() })
    return off
  },

  async check() {
    set({ manualCheck: true })
    set({ update: await window.electronAPI.updates.check() })
  },

  async download() {
    set({ update: await window.electronAPI.updates.download() })
  },

  async install() {
    await window.electronAPI.updates.install()
  }
}))
