import { create } from 'zustand'
import type { DiscoverCategory } from '@core/ipc'
import type { UnifiedPlaylist, UnifiedTrack } from '@core/types'
import { usePlayerStore } from './usePlayerStore'
import { useLibraryStore } from './useLibraryStore'
import { toast } from './useToastStore'

type PlaylistsEntry = { status: 'loading' } | { status: 'ready'; playlists: UnifiedPlaylist[] } | { status: 'error'; message: string }

interface DiscoverState {
  categories: DiscoverCategory[]
  categoriesStatus: 'idle' | 'loading' | 'ready' | 'error'
  selected: string | null
  playlists: Record<string, PlaylistsEntry>
  /** The playlist being fetched for playback, so its card can show a spinner. */
  starting: string | null
  /** What "Surprise me" (or a card) put on last. */
  lastPick: { category: DiscoverCategory; playlist: UnifiedPlaylist } | null
  loadCategories(): Promise<void>
  select(categoryId: string | null): void
  loadPlaylists(categoryId: string): Promise<UnifiedPlaylist[]>
  /** Plays a playlist from a category, shuffled. */
  play(category: DiscoverCategory, playlist: UnifiedPlaylist): Promise<void>
  /** A random playlist from `category`, or from any mood or genre. */
  surprise(category?: DiscoverCategory): Promise<void>
  /** Copies a discovered playlist into your library as a SpotiTube playlist. */
  save(playlist: UnifiedPlaylist): Promise<void>
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const pickRandom = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Recently surprised-with playlists aren't picked again right away. */
const recentPicks: string[] = []
const RECENT_LIMIT = 10

export const useDiscoverStore = create<DiscoverState>((set, get) => ({
  categories: [],
  categoriesStatus: 'idle',
  selected: null,
  playlists: {},
  starting: null,
  lastPick: null,

  async loadCategories() {
    if (get().categoriesStatus === 'loading' || get().categoriesStatus === 'ready') return
    set({ categoriesStatus: 'loading' })
    try {
      set({ categories: await window.electronAPI.discover.getCategories(), categoriesStatus: 'ready' })
    } catch (error) {
      set({ categoriesStatus: 'error' })
      toast.error(`Couldn't load moods and genres: ${errorText(error)}`)
    }
  },

  select(categoryId) {
    set({ selected: categoryId })
    if (categoryId) void get().loadPlaylists(categoryId)
  },

  async loadPlaylists(categoryId) {
    const entry = get().playlists[categoryId]
    if (entry?.status === 'ready') return entry.playlists
    if (entry?.status !== 'loading') set((s) => ({ playlists: { ...s.playlists, [categoryId]: { status: 'loading' } } }))
    try {
      const playlists = await window.electronAPI.discover.getPlaylists(categoryId)
      set((s) => ({ playlists: { ...s.playlists, [categoryId]: { status: 'ready', playlists } } }))
      return playlists
    } catch (error) {
      set((s) => ({ playlists: { ...s.playlists, [categoryId]: { status: 'error', message: errorText(error) } } }))
      throw error
    }
  },

  async play(category, playlist) {
    set({ starting: playlist.id })
    try {
      const tracks: UnifiedTrack[] = await window.electronAPI.library.getPlaylistTracks(playlist.id)
      if (!tracks.length) {
        toast.error(`“${playlist.name}” is empty right now — try another one`)
        return
      }
      recentPicks.push(playlist.id)
      if (recentPicks.length > RECENT_LIMIT) recentPicks.shift()
      set({ lastPick: { category, playlist } })
      await usePlayerStore.getState().playQueue(shuffle(tracks), 0, { label: `${category.title} · ${playlist.name}` })
    } catch (error) {
      toast.error(`Couldn't play “${playlist.name}”: ${errorText(error)}`)
    } finally {
      set({ starting: null })
    }
  },

  async surprise(category) {
    const { categories } = get()
    const chosen = category ?? (categories.length ? pickRandom(categories) : null)
    if (!chosen) return
    set({ starting: `surprise:${chosen.id}` })
    try {
      const playlists = await get().loadPlaylists(chosen.id)
      const fresh = playlists.filter((p) => !recentPicks.includes(p.id))
      const pool = fresh.length ? fresh : playlists
      if (!pool.length) {
        toast.error(`No playlists for ${chosen.title} right now`)
        return
      }
      await get().play(chosen, pickRandom(pool))
    } catch (error) {
      toast.error(`Couldn't find something to play: ${errorText(error)}`)
    } finally {
      if (get().starting === `surprise:${chosen.id}`) set({ starting: null })
    }
  },

  async save(playlist) {
    try {
      const tracks = await window.electronAPI.library.getPlaylistTracks(playlist.id)
      await useLibraryStore.getState().createHybrid(playlist.name, tracks)
    } catch (error) {
      toast.error(`Couldn't save “${playlist.name}”: ${errorText(error)}`)
    }
  }
}))
