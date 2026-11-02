import { create } from 'zustand'
import type { PlayContext, PlayRecord } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { toast } from './useToastStore'

/** Kept in sync with the main-process cap so the in-memory list matches the file. */
const MAX_PLAYS = 500

interface HistoryState {
  /** Plays, newest first. */
  plays: PlayRecord[]
  loaded: boolean

  load(): Promise<void>
  record(track: UnifiedTrack, context: PlayContext | null): void
  clear(): Promise<void>
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  plays: [],
  loaded: false,

  async load() {
    try {
      set({ plays: await window.electronAPI.history.get(), loaded: true })
    } catch (error) {
      set({ loaded: true })
      toast.error(`Could not load listening history: ${errorText(error)}`)
    }
  },

  record(track, context) {
    const play: PlayRecord = context ? { track, playedAt: Date.now(), context } : { track, playedAt: Date.now() }
    set({ plays: [play, ...get().plays].slice(0, MAX_PLAYS) })
    void window.electronAPI.history.recordPlay(track, context).catch((error: unknown) => {
      console.error('Failed to record play:', error)
    })
  },

  async clear() {
    try {
      await window.electronAPI.history.clear()
      set({ plays: [] })
      toast.info('Listening history cleared')
    } catch (error) {
      toast.error(`Could not clear history: ${errorText(error)}`)
    }
  }
}))
