import { create } from 'zustand'
import type { RemoteSessionInfo, SyncStatus } from '@core/ipc'
import { toast } from './useToastStore'
import { usePlayerStore } from './usePlayerStore'
import { useLibraryStore } from './useLibraryStore'
import { useHistoryStore } from './useHistoryStore'
import { useSettingsStore } from './useSettingsStore'

interface SyncStoreState {
  status: SyncStatus | null
  busy: boolean
  /** "Continue here" offers the user waved away, by device and save time. */
  dismissed: string[]
  load(): Promise<void>
  chooseFolder(): Promise<void>
  stop(): Promise<void>
  syncNow(): Promise<void>
  continueFrom(session: RemoteSessionInfo): Promise<void>
  dismiss(session: RemoteSessionInfo): void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const sessionKey = (session: RemoteSessionInfo): string => `${session.deviceId}@${session.savedAt}`

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  status: null,
  busy: false,
  dismissed: [],

  async load() {
    set({ status: await window.electronAPI.sync.getStatus() })
  },

  async chooseFolder() {
    set({ busy: true })
    try {
      const status = await window.electronAPI.sync.chooseFolder()
      set({ status })
      if (status.enabled && !status.error) toast.success('Syncing through the folder — do the same on your other computers')
    } catch (error) {
      toast.error(`Sync: ${errorText(error)}`)
    } finally {
      set({ busy: false })
    }
  },

  async stop() {
    set({ status: await window.electronAPI.sync.stop() })
  },

  async syncNow() {
    set({ busy: true })
    try {
      set({ status: await window.electronAPI.sync.syncNow() })
    } finally {
      set({ busy: false })
    }
  },

  async continueFrom(info) {
    const session = await window.electronAPI.sync.getSession(info.deviceId)
    if (!session) {
      toast.error(`${info.deviceName} isn't sharing what it played anymore`)
      return
    }
    get().dismiss(info)
    const player = usePlayerStore.getState()
    player.restoreSession({ ...session, savedAt: Date.now() })
    await player.play()
    toast.info(`Continuing from ${info.deviceName}`)
  },

  dismiss(info) {
    set({ dismissed: [...get().dismissed, sessionKey(info)] })
  }
}))

window.electronAPI.sync.onStatusChange((status) => useSyncStore.setState({ status }))
window.electronAPI.sync.onApplied((applied) => {
  if (applied.library) void useLibraryStore.getState().loadLibrary()
  if (applied.history) void useHistoryStore.getState().load()
  if (applied.settings) void useSettingsStore.getState().load()
})
