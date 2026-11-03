import { create } from 'zustand'
import type { UnifiedTrack } from '@core/types'
import { toast } from './useToastStore'

interface LikesState {
  /** Track id → true, for the tracks in Liked songs. */
  liked: Record<string, true>
  load(): Promise<void>
  toggle(track: UnifiedTrack): Promise<void>
}

const SERVICE_NAMES = { spotify: 'Spotify', ytmusic: 'YouTube Music' } as const

export const useLikesStore = create<LikesState>((set, get) => ({
  liked: {},

  async load() {
    const ids = await window.electronAPI.likes.getIds()
    set({ liked: Object.fromEntries(ids.map((id) => [id, true as const])) })
  },

  async toggle(track) {
    const on = !get().liked[track.id]
    // Show the heart change at once; the save happens behind it.
    set((s) => {
      const liked = { ...s.liked }
      if (on) liked[track.id] = true
      else delete liked[track.id]
      return { liked }
    })
    try {
      const result = await window.electronAPI.likes.set(track, on)
      const where = result.service ? ` and ${SERVICE_NAMES[result.service]}` : ''
      if (result.serviceError) {
        const service = track.source === 'spotify' ? 'Spotify' : 'YouTube Music'
        toast.error(`${on ? 'Liked' : 'Unliked'} in SpotiTube, but ${service} said: ${result.serviceError}`)
      } else {
        toast.success(on ? `Added to Liked songs${where}` : `Removed from Liked songs${where}`)
      }
    } catch (error) {
      void get().load()
      toast.error(`Couldn't update Liked songs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}))

// Likes also change through sync and through editing the Liked songs playlist.
window.electronAPI.library.onChanged(() => void useLikesStore.getState().load())
void useLikesStore.getState().load()
