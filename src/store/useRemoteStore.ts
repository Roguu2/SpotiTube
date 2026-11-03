import { create } from 'zustand'
import type { RemoteStatus } from '@core/ipc'
import { toast } from './useToastStore'

interface RemoteStoreState {
  status: RemoteStatus | null
  busy: boolean
  load(): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  resetPairing(): Promise<void>
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useRemoteStore = create<RemoteStoreState>((set) => ({
  status: null,
  busy: false,

  async load() {
    set({ status: await window.electronAPI.remote.getStatus() })
  },

  async setEnabled(enabled) {
    set({ busy: true })
    try {
      set({ status: await window.electronAPI.remote.setEnabled(enabled) })
    } catch (error) {
      toast.error(`Phone remote: ${errorText(error)}`)
    } finally {
      set({ busy: false })
    }
  },

  async resetPairing() {
    set({ status: await window.electronAPI.remote.resetPairing() })
    toast.success('Pairing reset — phones have to scan the new QR code')
  }
}))

window.electronAPI.remote.onStatusChange((status) => useRemoteStore.setState({ status }))
