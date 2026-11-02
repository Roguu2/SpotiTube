import { create } from 'zustand'
import type { ProviderStatus, SearchResults } from '@core/ipc'
import type { UnifiedPlaylist, UnifiedTrack } from '@core/types'
import { toast } from './useToastStore'

export type LibraryFilter = 'all' | 'spotify' | 'ytmusic' | 'split'

export type View = { kind: 'library' } | { kind: 'playlist'; playlistId: string } | { kind: 'search' } | { kind: 'history' }

export interface TrackListState {
  tracks: UnifiedTrack[]
  loading: boolean
  error: string | null
}

interface SearchState {
  query: string
  loading: boolean
  results: SearchResults | null
}

interface LibraryState {
  playlists: UnifiedPlaylist[]
  providers: ProviderStatus[]
  loading: boolean
  loaded: boolean
  error: string | null
  filter: LibraryFilter
  view: View
  history: View[]
  tracks: Record<string, TrackListState>
  search: SearchState

  loadLibrary(): Promise<void>
  setFilter(filter: LibraryFilter): void
  navigate(view: View): void
  back(): void
  loadTracks(playlistId: string, force?: boolean): Promise<UnifiedTrack[]>
  setSearchQuery(query: string): void

  createHybrid(name: string, tracks?: UnifiedTrack[]): Promise<UnifiedPlaylist | null>
  renameHybrid(playlistId: string, name: string): Promise<void>
  deleteHybrid(playlistId: string): Promise<void>
  addToHybrid(playlistId: string, tracks: UnifiedTrack[]): Promise<void>
  removeFromHybrid(playlistId: string, trackIds: string[]): Promise<void>
}

const SEARCH_DEBOUNCE_MS = 350
const MAX_HISTORY = 30
let searchTimer: number | null = null
let searchToken = 0

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sameView(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false
  return a.kind !== 'playlist' || a.playlistId === (b as Extract<View, { kind: 'playlist' }>).playlistId
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  const runSearch = async (query: string): Promise<void> => {
    const token = ++searchToken
    set({ search: { ...get().search, loading: true } })
    try {
      const results = await window.electronAPI.library.search(query)
      if (token !== searchToken) return
      set({ search: { query, loading: false, results } })
    } catch (error) {
      if (token !== searchToken) return
      set({ search: { query, loading: false, results: null } })
      toast.error(`Search failed: ${errorText(error)}`)
    }
  }

  const invalidateHybrid = (playlistId: string, tracks?: UnifiedTrack[]): void => {
    const next = { ...get().tracks }
    if (tracks) next[playlistId] = { tracks, loading: false, error: null }
    else delete next[playlistId]
    set({ tracks: next })
  }

  return {
    playlists: [],
    providers: [],
    loading: false,
    loaded: false,
    error: null,
    filter: 'all',
    view: { kind: 'library' },
    history: [],
    tracks: {},
    search: { query: '', loading: false, results: null },

    async loadLibrary() {
      set({ loading: true, error: null })
      try {
        const snapshot = await window.electronAPI.library.getPlaylists()
        const ids = new Set(snapshot.playlists.map((p) => p.id))
        // Drop cached tracks of playlists that disappeared (e.g. demo → real account).
        const tracks = Object.fromEntries(Object.entries(get().tracks).filter(([id]) => ids.has(id)))
        const view = get().view
        set({
          playlists: snapshot.playlists,
          providers: snapshot.providers,
          tracks,
          loading: false,
          loaded: true,
          view: view.kind === 'playlist' && !ids.has(view.playlistId) ? { kind: 'library' } : view
        })
        for (const status of snapshot.providers) {
          if (status.error) toast.error(`${status.providerId === 'spotify' ? 'Spotify' : 'YouTube Music'}: ${status.error}`)
        }
      } catch (error) {
        set({ loading: false, loaded: true, error: errorText(error) })
      }
    },

    setFilter(filter) {
      set({ filter })
      if (get().view.kind !== 'library') get().navigate({ kind: 'library' })
    },

    navigate(view) {
      const current = get().view
      if (sameView(current, view)) return
      set({ view, history: [...get().history, current].slice(-MAX_HISTORY) })
      if (view.kind === 'playlist') void get().loadTracks(view.playlistId)
    },

    back() {
      const history = [...get().history]
      const previous = history.pop()
      if (previous) set({ view: previous, history })
    },

    async loadTracks(playlistId, force = false) {
      const cached = get().tracks[playlistId]
      if (cached && !force && (cached.loading || !cached.error)) return cached.tracks

      set({ tracks: { ...get().tracks, [playlistId]: { tracks: cached?.tracks ?? [], loading: true, error: null } } })
      try {
        const tracks = await window.electronAPI.library.getPlaylistTracks(playlistId)
        set({ tracks: { ...get().tracks, [playlistId]: { tracks, loading: false, error: null } } })
        return tracks
      } catch (error) {
        set({
          tracks: { ...get().tracks, [playlistId]: { tracks: [], loading: false, error: errorText(error) } }
        })
        return []
      }
    },

    setSearchQuery(query) {
      set({ search: { ...get().search, query } })
      if (searchTimer !== null) window.clearTimeout(searchTimer)
      if (!query.trim()) {
        searchToken++
        set({ search: { query, loading: false, results: null } })
        return
      }
      searchTimer = window.setTimeout(() => void runSearch(query.trim()), SEARCH_DEBOUNCE_MS)
    },

    async createHybrid(name, tracks) {
      try {
        let playlist = await window.electronAPI.hybrid.create(name)
        if (tracks?.length) playlist = await window.electronAPI.hybrid.addTracks(playlist.id, tracks)
        invalidateHybrid(playlist.id, tracks ?? [])
        toast.success(`Created “${playlist.name}”`)
        return playlist
      } catch (error) {
        toast.error(errorText(error))
        return null
      }
    },

    async renameHybrid(playlistId, name) {
      try {
        await window.electronAPI.hybrid.rename(playlistId, name)
      } catch (error) {
        toast.error(errorText(error))
      }
    },

    async deleteHybrid(playlistId) {
      try {
        await window.electronAPI.hybrid.delete(playlistId)
        invalidateHybrid(playlistId)
        if (get().view.kind === 'playlist') set({ view: { kind: 'library' } })
        toast.info('Playlist deleted')
      } catch (error) {
        toast.error(errorText(error))
      }
    },

    async addToHybrid(playlistId, tracks) {
      try {
        const before = get().playlists.find((p) => p.id === playlistId)?.trackCount ?? 0
        const playlist = await window.electronAPI.hybrid.addTracks(playlistId, tracks)
        invalidateHybrid(playlistId)
        const added = playlist.trackCount - before
        toast.success(
          added > 0
            ? `Added ${added === 1 ? `“${tracks[0].title}”` : `${added} tracks`} to ${playlist.name}`
            : `Already in ${playlist.name}`
        )
      } catch (error) {
        toast.error(errorText(error))
      }
    },

    async removeFromHybrid(playlistId, trackIds) {
      try {
        await window.electronAPI.hybrid.removeTracks(playlistId, trackIds)
        const cached = get().tracks[playlistId]
        if (cached) {
          const remove = new Set(trackIds)
          invalidateHybrid(
            playlistId,
            cached.tracks.filter((t) => !remove.has(t.id))
          )
        }
      } catch (error) {
        toast.error(errorText(error))
      }
    }
  }
})
