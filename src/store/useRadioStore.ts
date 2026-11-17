import { create } from 'zustand'
import type { RadioCountry, RadioStation, RadioTag } from '@core/ipc'
import { isRadio, stationPlace, stationTrack, trackStation } from '@/lib/radio'
import { usePlayerStore } from './usePlayerStore'
import { toast } from './useToastStore'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface RadioState {
  /** Every station with a location, for the globe. */
  mapStations: RadioStation[]
  mapStatus: LoadStatus
  favorites: RadioStation[]
  recent: RadioStation[]
  countries: RadioCountry[]
  tags: RadioTag[]
  /** What each station is playing now, by track id (from the stream's metadata). */
  liveTitles: Record<string, string>
  /** Songs each station played while you listened, newest first, by track id. */
  titleLog: Record<string, { title: string; at: number }[]>

  loadMap(): Promise<void>
  /** Favorites, recent stations, countries and genres: everything the side panel lists. */
  loadDirectory(): Promise<void>
  isFavorite(stationId: string): boolean
  toggleFavorite(station: RadioStation): Promise<void>
  /** Plays `stations[index]`; next and previous move through the rest of the list. */
  play(stations: RadioStation[], index: number, label: string): Promise<void>
  /** Any station from the globe, for "Surprise me". */
  playRandom(): Promise<void>
}

const MAX_TITLE_LOG = 12

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Stations seen this run, so a playing track can be turned back into its full station. */
const known = new Map<string, RadioStation>()

function remember(stations: RadioStation[]): RadioStation[] {
  for (const station of stations) known.set(station.id, station)
  return stations
}

/** The station behind a radio track: the full entry when this run has seen it. */
export function stationOf(trackId: string, fallback?: Parameters<typeof trackStation>[0]): RadioStation | undefined {
  const id = trackId.startsWith('radio:') ? trackId.slice('radio:'.length) : trackId
  return known.get(id) ?? (fallback ? trackStation(fallback) : undefined)
}

export const useRadioStore = create<RadioState>((set, get) => ({
  mapStations: [],
  mapStatus: 'idle',
  favorites: [],
  recent: [],
  countries: [],
  tags: [],
  liveTitles: {},
  titleLog: {},

  async loadMap() {
    if (get().mapStatus === 'loading' || get().mapStatus === 'ready') return
    set({ mapStatus: 'loading' })
    try {
      set({ mapStations: remember(await window.electronAPI.radio.getMapStations()), mapStatus: 'ready' })
    } catch (error) {
      set({ mapStatus: 'error' })
      toast.error(`Couldn't load the radio map: ${errorText(error)}`)
    }
  },

  async loadDirectory() {
    const radio = window.electronAPI.radio
    const [saved, countries, tags] = await Promise.allSettled([radio.getSaved(), radio.getCountries(), radio.getTags()])
    if (saved.status === 'fulfilled') {
      remember(saved.value.favorites)
      remember(saved.value.recent)
      set({ favorites: saved.value.favorites, recent: saved.value.recent })
    }
    if (countries.status === 'fulfilled') set({ countries: countries.value })
    if (tags.status === 'fulfilled') set({ tags: tags.value })
  },

  isFavorite(stationId) {
    return get().favorites.some((s) => s.id === stationId)
  },

  async toggleFavorite(station) {
    const favorite = !get().isFavorite(station.id)
    // Show it at once; the save happens behind it.
    set((s) => ({ favorites: favorite ? [station, ...s.favorites] : s.favorites.filter((f) => f.id !== station.id) }))
    try {
      set({ favorites: await window.electronAPI.radio.setFavorite(station, favorite) })
      toast.success(favorite ? `Added “${station.name}” to your stations` : `Removed “${station.name}” from your stations`)
    } catch (error) {
      toast.error(`Couldn't save the station: ${errorText(error)}`)
      await get().loadDirectory()
    }
  },

  async play(stations, index, label) {
    remember(stations)
    await usePlayerStore.getState().playQueue(stations.map(stationTrack), index, { label: `Live radio · ${label}` })
  },

  async playRandom() {
    await get().loadMap()
    const stations = get().mapStations
    if (!stations.length) return
    // Popular stations are likelier to be up; draw from the top half of the directory.
    const pool = stations.slice(0, Math.max(50, Math.floor(stations.length / 2)))
    const picks = Array.from({ length: 20 }, () => pool[Math.floor(Math.random() * pool.length)])
    const unique = [...new Map(picks.map((s) => [s.id, s])).values()]
    await get().play(unique, 0, `Surprise · ${stationPlace(unique[0])}`)
  }
}))

// Favorites are needed before the Radio tab is opened: the heart on a restored station shows them.
void window.electronAPI.radio
  .getSaved()
  .then(({ favorites, recent }) => {
    remember(favorites)
    remember(recent)
    useRadioStore.setState({ favorites, recent })
  })
  .catch(() => undefined)

window.electronAPI.radio.onNowPlaying(({ trackId, title }) => {
  useRadioStore.setState((s) => {
    const log = s.titleLog[trackId] ?? []
    const logged = title && log[0]?.title !== title ? [{ title, at: Date.now() }, ...log].slice(0, MAX_TITLE_LOG) : log
    return { liveTitles: { ...s.liveTitles, [trackId]: title }, titleLog: { ...s.titleLog, [trackId]: logged } }
  })
  const current = usePlayerStore.getState().current
  if (current?.id !== trackId || !('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: title || current.title,
    artist: title ? current.title : (current.artists[0]?.name ?? ''),
    artwork: current.artworkUrl ? [{ src: current.artworkUrl, sizes: '512x512' }] : []
  })
})

// A station that actually started playing goes to the top of Recent.
usePlayerStore.subscribe((state, prev) => {
  if (state.status !== 'ready' || (prev.status === 'ready' && prev.current?.id === state.current?.id)) return
  const track = state.current
  if (!track || !isRadio(track)) return
  const station = stationOf(track.id, track)
  if (!station) return
  useRadioStore.setState((s) => ({ recent: [station, ...s.recent.filter((r) => r.id !== station.id)] }))
  void window.electronAPI.radio
    .addRecent(station)
    .then((recent) => useRadioStore.setState({ recent }))
    .catch(() => undefined)
})
