import { create } from 'zustand'
import { registerEndOfTrackGuard, usePlayerStore } from './usePlayerStore'
import { toast } from './useToastStore'

export type SleepTimer = { kind: 'minutes'; endsAt: number } | { kind: 'end-of-track' }

interface SleepTimerState {
  timer: SleepTimer | null
  /** Pause after `minutes`, at the end of the current track, or `null` to cancel. */
  start(choice: number | 'end-of-track' | null): void
  /** Called when a track ends; returns true when the timer stopped playback there. */
  consumeEndOfTrack(): boolean
}

const TICK_MS = 1_000
let ticker: number | null = null

function stopTicker(): void {
  if (ticker !== null) window.clearInterval(ticker)
  ticker = null
}

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  timer: null,

  start(choice) {
    stopTicker()
    if (choice === null) {
      set({ timer: null })
      return
    }
    if (choice === 'end-of-track') {
      set({ timer: { kind: 'end-of-track' } })
      toast.info('Playback will stop after this track')
      return
    }
    set({ timer: { kind: 'minutes', endsAt: Date.now() + choice * 60_000 } })
    toast.info(`Playback will stop in ${choice} minutes`)
    ticker = window.setInterval(() => {
      const timer = get().timer
      if (timer?.kind !== 'minutes' || Date.now() < timer.endsAt) return
      stopTicker()
      set({ timer: null })
      usePlayerStore.getState().pause()
      toast.info('Sleep timer: playback paused')
    }, TICK_MS)
  },

  consumeEndOfTrack() {
    if (get().timer?.kind !== 'end-of-track') return false
    set({ timer: null })
    toast.info('Sleep timer: playback stopped')
    return true
  }
}))

registerEndOfTrackGuard(() => useSleepTimerStore.getState().consumeEndOfTrack())
