import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, Heart, LoaderCircle, Radio, RotateCw, Search, Shuffle, X } from 'lucide-react'
import type { RadioStation } from '@core/ipc'
import { Artwork } from '@/components/ui/Artwork'
import { EqualizerBars } from '@/components/ui/EqualizerBars'
import { IconButton } from '@/components/ui/IconButton'
import { RadioGlobe, type GlobeFocus, type GlobePlace } from './RadioGlobe'
import { useRadioStore } from '@/store/useRadioStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { stationPlace } from '@/lib/radio'
import { cx } from '@/lib/format'

const SEARCH_DEBOUNCE_MS = 400
/** Stations within the same half degree (~50 km) share a dot. */
const CELLS_PER_DEGREE = 2
const NEAR_YOU_LIMIT = 60

type Tab = 'here' | 'favorites' | 'recent' | 'browse'

interface Place extends GlobePlace {
  stations: RadioStation[]
}

type Browse = { kind: 'country'; code: string; name: string } | { kind: 'tag'; name: string }

function cellOf(station: RadioStation): string {
  return `${Math.round((station.lat ?? 0) * CELLS_PER_DEGREE)},${Math.round((station.lon ?? 0) * CELLS_PER_DEGREE)}`
}

/** Groups the map's stations into places: a dot per city-sized cell, named after its most common region. */
function groupPlaces(stations: RadioStation[]): Place[] {
  const cells = new Map<string, RadioStation[]>()
  for (const station of stations) {
    if (station.lat === undefined || station.lon === undefined) continue
    const key = cellOf(station)
    const cell = cells.get(key)
    if (cell) cell.push(station)
    else cells.set(key, [station])
  }
  return [...cells].map(([id, list]) => {
    const names = new Map<string, number>()
    for (const s of list) {
      const name = stationPlace(s)
      names.set(name, (names.get(name) ?? 0) + 1)
    }
    const name = [...names].sort((a, b) => b[1] - a[1])[0][0]
    return {
      id,
      name,
      lat: list.reduce((sum, s) => sum + (s.lat ?? 0), 0) / list.length,
      lon: list.reduce((sum, s) => sum + (s.lon ?? 0), 0) / list.length,
      count: list.length,
      stations: list
    }
  })
}

/** The country this computer is set up for, e.g. "PL" from "pl-PL" (or from "pl" alone). */
function homeCountry(): string | undefined {
  try {
    return new Intl.Locale(navigator.language).maximize().region
  } catch {
    return undefined
  }
}

function centerOf(stations: RadioStation[]): { lat: number; lon: number } | null {
  const located = stations.filter((s) => s.lat !== undefined && s.lon !== undefined)
  if (!located.length) return null
  // The median resists the odd station filed in the wrong hemisphere.
  const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
  return { lat: median(located.map((s) => s.lat as number)), lon: median(located.map((s) => s.lon as number)) }
}

/**
 * Live radio from all over the world: a globe of stations to spin and pick
 * from, Radio Garden style, beside lists to search, browse and keep favorites.
 */
export function RadioView() {
  const mapStations = useRadioStore((s) => s.mapStations)
  const mapStatus = useRadioStore((s) => s.mapStatus)
  const favorites = useRadioStore((s) => s.favorites)
  const recent = useRadioStore((s) => s.recent)
  const loadMap = useRadioStore((s) => s.loadMap)
  const loadDirectory = useRadioStore((s) => s.loadDirectory)
  const play = useRadioStore((s) => s.play)
  const playRandom = useRadioStore((s) => s.playRandom)
  const currentId = usePlayerStore((s) => (s.current?.source === 'radio' ? s.current.sourceTrackId : null))

  const [tab, setTab] = useState<Tab>('here')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RadioStation[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<Place | null>(null)
  const [focus, setFocus] = useState<GlobeFocus | null>(null)
  const [surprising, setSurprising] = useState(false)

  useEffect(() => {
    void loadMap()
    void loadDirectory()
  }, [loadMap, loadDirectory])

  const places = useMemo(() => groupPlaces(mapStations), [mapStations])
  const placeOfStation = useMemo(() => {
    const byCell = new Map(places.map((p) => [p.id, p]))
    const map = new Map<string, Place>()
    for (const station of mapStations) {
      const place = byCell.get(cellOf(station))
      if (place && station.lat !== undefined) map.set(station.id, place)
    }
    return map
  }, [places, mapStations])

  const home = useMemo(homeCountry, [])
  const nearYou = useMemo(
    () => (home ? mapStations.filter((s) => s.countryCode === home).slice(0, NEAR_YOU_LIMIT) : []),
    [home, mapStations]
  )

  // Start over the listener's own country.
  useEffect(() => {
    if (mapStatus !== 'ready') return
    const center = centerOf(nearYou)
    if (center) setFocus({ ...center, zoom: 1.2, key: Date.now() })
  }, [mapStatus, nearYou])

  // Search the whole directory, not just the stations on the map.
  useEffect(() => {
    const name = query.trim()
    if (!name) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    let cancelled = false
    const timer = window.setTimeout(() => {
      window.electronAPI.radio
        .search({ name })
        .then((stations) => !cancelled && setResults(stations))
        .catch(() => !cancelled && setResults([]))
        .finally(() => !cancelled && setSearching(false))
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const flyTo = (station: RadioStation): void => {
    const place = placeOfStation.get(station.id)
    if (place) setFocus({ lat: place.lat, lon: place.lon, zoom: 3.2, key: Date.now() })
  }

  const playFrom = (stations: RadioStation[], index: number, label: string): void => {
    flyTo(stations[index])
    void play(stations, index, label)
  }

  const selectPlace = (place: GlobePlace): void => {
    const full = places.find((p) => p.id === place.id) ?? null
    setSelected(full)
    setTab('here')
    setQuery('')
  }

  const surprise = async (): Promise<void> => {
    setSurprising(true)
    try {
      await playRandom()
      const station = usePlayerStore.getState().current
      const place = station ? placeOfStation.get(station.sourceTrackId) : undefined
      if (place) {
        setSelected(place)
        setTab('here')
        setFocus({ lat: place.lat, lon: place.lon, zoom: 3.2, key: Date.now() })
      }
    } finally {
      setSurprising(false)
    }
  }

  const playingPlace = currentId ? (placeOfStation.get(currentId)?.id ?? null) : null

  return (
    <div className="flex h-full min-h-[600px] flex-col px-8 pt-8 pb-6">
      <header className="mb-5 flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[32px] font-extrabold tracking-tight text-white">Radio</h1>
          <p className="mt-1 text-[14px] text-zinc-400">
            Live stations from all over the world. Spin the globe and pick a place, or search for a station.
          </p>
        </div>
        <label className="relative block w-64 shrink-0">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="Search stations"
            aria-label="Search radio stations"
            className="h-9 w-full rounded-full bg-white/8 pr-8 pl-9 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-500 focus:bg-white/10 focus:ring-white/25"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:text-zinc-200"
            >
              <X size={14} />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => void surprise()}
          disabled={surprising || mapStatus !== 'ready'}
          className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 text-[13px] font-semibold text-black shadow-lg shadow-orange-500/20 transition hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          {surprising ? <LoaderCircle size={15} className="animate-spin" /> : <Shuffle size={15} />}
          Surprise me
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 xl:flex-row">
        <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-2xl bg-black/30 ring-1 ring-white/6">
          <RadioGlobe
            places={places}
            selectedId={selected?.id ?? null}
            playingId={playingPlace}
            focus={focus}
            onSelect={selectPlace}
          />
          {mapStatus !== 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 text-[13px] text-zinc-300">
              {mapStatus === 'error' ? (
                <>
                  Couldn't load the stations for the map.
                  <button
                    type="button"
                    onClick={() => {
                      useRadioStore.setState({ mapStatus: 'idle' })
                      void loadMap()
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 hover:bg-white/15"
                  >
                    <RotateCw size={13} /> Try again
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle size={22} className="animate-spin text-spotify" />
                  Tuning in to stations around the world…
                </>
              )}
            </div>
          )}
          {mapStatus === 'ready' && (
            <p className="pointer-events-none absolute bottom-3 left-4 text-[11.5px] text-zinc-500">
              {mapStations.length.toLocaleString()} stations on the map · directory by radio-browser.info
            </p>
          )}
        </div>

        <aside
          aria-label="Stations"
          className="flex min-h-[320px] w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white/[0.035] ring-1 ring-white/6 xl:w-[380px]"
        >
          {results !== null || searching ? (
            <StationSection
              title={`Results for “${query.trim()}”`}
              stations={results ?? []}
              loading={searching}
              empty="No stations by that name."
              currentId={currentId}
              onPlay={(i) => results && playFrom(results, i, `Search · ${query.trim()}`)}
            />
          ) : (
            <>
              <div role="tablist" aria-label="Station lists" className="flex gap-1 border-b border-white/6 p-2">
                <TabButton active={tab === 'here'} onClick={() => setTab('here')}>
                  {selected ? 'This place' : 'Near you'}
                </TabButton>
                <TabButton active={tab === 'favorites'} onClick={() => setTab('favorites')}>
                  Your stations
                </TabButton>
                <TabButton active={tab === 'recent'} onClick={() => setTab('recent')}>
                  Recent
                </TabButton>
                <TabButton active={tab === 'browse'} onClick={() => setTab('browse')}>
                  Browse
                </TabButton>
              </div>
              {tab === 'here' &&
                (selected ? (
                  <StationSection
                    title={selected.name}
                    subtitle={`${selected.count} ${selected.count === 1 ? 'station' : 'stations'}`}
                    stations={selected.stations}
                    currentId={currentId}
                    onBack={() => setSelected(null)}
                    onPlay={(i) => playFrom(selected.stations, i, selected.name)}
                  />
                ) : (
                  <StationSection
                    title={nearYou.length ? `Popular in ${nearYou[0].country ?? 'your country'}` : 'Pick a place'}
                    subtitle={nearYou.length ? 'Or click any green dot on the globe' : undefined}
                    stations={nearYou}
                    loading={mapStatus === 'loading' || mapStatus === 'idle'}
                    empty="Click a green dot on the globe to see what's on air there."
                    currentId={currentId}
                    onPlay={(i) => playFrom(nearYou, i, `Popular in ${nearYou[i].country ?? 'your country'}`)}
                  />
                ))}
              {tab === 'favorites' && (
                <StationSection
                  title="Your stations"
                  stations={favorites}
                  empty="Tap the heart next to a station to keep it here."
                  currentId={currentId}
                  onPlay={(i) => playFrom(favorites, i, 'Your stations')}
                />
              )}
              {tab === 'recent' && (
                <StationSection
                  title="Recently played"
                  stations={recent}
                  empty="Stations you listen to show up here."
                  currentId={currentId}
                  onPlay={(i) => playFrom(recent, i, 'Recent stations')}
                />
              )}
              {tab === 'browse' && <BrowsePanel currentId={currentId} onPlay={playFrom} onFocusCountry={setFocus} />}
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'rounded-full px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors',
        active ? 'bg-white/12 text-zinc-100' : 'text-zinc-500 hover:bg-white/6 hover:text-zinc-300'
      )}
    >
      {children}
    </button>
  )
}

/** Countries and genres from the whole directory, including stations that aren't on the map. */
function BrowsePanel({
  currentId,
  onPlay,
  onFocusCountry
}: {
  currentId: string | null
  onPlay: (stations: RadioStation[], index: number, label: string) => void
  onFocusCountry: (focus: GlobeFocus) => void
}) {
  const countries = useRadioStore((s) => s.countries)
  const tags = useRadioStore((s) => s.tags)
  const mapStations = useRadioStore((s) => s.mapStations)
  const [browse, setBrowse] = useState<Browse | null>(null)
  const [stations, setStations] = useState<RadioStation[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!browse) return
    let cancelled = false
    setLoading(true)
    setStations([])
    window.electronAPI.radio
      .search(browse.kind === 'country' ? { countryCode: browse.code } : { tag: browse.name })
      .then((list) => !cancelled && setStations(list))
      .catch(() => !cancelled && setStations([]))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [browse])

  if (browse) {
    const label = browse.kind === 'country' ? browse.name : `#${browse.name}`
    return (
      <StationSection
        title={label}
        subtitle="Most played first"
        stations={stations}
        loading={loading}
        empty="No working stations here right now."
        currentId={currentId}
        onBack={() => setBrowse(null)}
        onPlay={(i) => onPlay(stations, i, label)}
      />
    )
  }

  const needle = filter.trim().toLowerCase()
  const shown = needle ? countries.filter((c) => c.name.toLowerCase().includes(needle)) : countries

  const openCountry = (code: string, name: string): void => {
    setBrowse({ kind: 'country', code, name })
    const center = centerOf(mapStations.filter((s) => s.countryCode === code))
    if (center) onFocusCountry({ ...center, zoom: 2.2, key: Date.now() })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <h2 className="mb-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Genres</h2>
      <div className="flex flex-wrap gap-1.5">
        {tags.slice(0, 40).map((tag) => (
          <button
            key={tag.name}
            type="button"
            onClick={() => setBrowse({ kind: 'tag', name: tag.name })}
            className="rounded-full bg-white/7 px-2.5 py-1 text-[12px] text-zinc-300 transition hover:bg-white/14 hover:text-white active:scale-95"
          >
            {tag.name}
          </button>
        ))}
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Countries</h2>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          aria-label="Filter countries"
          className="h-7 w-32 rounded-full bg-white/7 px-3 text-[12px] text-zinc-200 outline-none placeholder:text-zinc-600 focus:ring-1 focus:ring-white/20"
        />
      </div>
      <ul className="space-y-px">
        {shown.map((country) => (
          <li key={country.code}>
            <button
              type="button"
              onClick={() => openCountry(country.code, country.name)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] text-zinc-300 transition hover:bg-white/6 hover:text-white"
            >
              <span className="truncate">{country.name}</span>
              <span className="shrink-0 text-[11.5px] text-zinc-600 tabular-nums">{country.stations.toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StationSection({
  title,
  subtitle,
  stations,
  loading = false,
  empty,
  currentId,
  onBack,
  onPlay
}: {
  title: string
  subtitle?: string
  stations: RadioStation[]
  loading?: boolean
  empty?: string
  currentId: string | null
  onBack?: () => void
  onPlay: (index: number) => void
}) {
  return (
    <section aria-label={title} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        {onBack && (
          <IconButton label="Back" size="sm" onClick={onBack}>
            <ArrowLeft size={16} />
          </IconButton>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-zinc-100">{title}</h2>
          {subtitle && <p className="truncate text-[12px] text-zinc-500">{subtitle}</p>}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="flex justify-center py-10 text-zinc-500">
            <LoaderCircle size={20} className="animate-spin" aria-label="Loading stations" />
          </div>
        ) : stations.length ? (
          <ul className="space-y-px">
            {stations.map((station, i) => (
              <StationRow key={station.id} station={station} current={station.id === currentId} onPlay={() => onPlay(i)} />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-[13px] text-zinc-500">
            <Radio size={24} className="text-zinc-600" />
            {empty}
          </div>
        )}
      </div>
    </section>
  )
}

function StationRow({ station, current, onPlay }: { station: RadioStation; current: boolean; onPlay: () => void }) {
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)
  const favorite = useRadioStore((s) => s.favorites.some((f) => f.id === station.id))
  const toggleFavorite = useRadioStore((s) => s.toggleFavorite)
  const details = [stationPlace(station), ...station.tags.slice(0, 3)].join(' · ')
  const quality = [station.codec, station.bitrate ? `${station.bitrate}k` : undefined].filter(Boolean).join(' ')

  return (
    <li className={cx('group flex items-center gap-1 rounded-lg pr-1 transition-colors', current ? 'bg-white/8' : 'hover:bg-white/5')}>
      <button
        type="button"
        onClick={onPlay}
        title={`Play ${station.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left active:scale-[0.99]"
      >
        <Artwork src={station.favicon} alt="" className="size-10 shrink-0 bg-white/5 object-contain" />
        <span className="min-w-0 flex-1">
          <span className={cx('flex items-center gap-2 text-[13.5px] font-semibold', current ? 'text-spotify' : 'text-zinc-100')}>
            {current && <EqualizerBars playing={isPlaying} />}
            <span className="truncate">{station.name}</span>
          </span>
          <span className="block truncate text-[12px] text-zinc-500">{details}</span>
        </span>
        {quality && <span className="hidden shrink-0 text-[10.5px] text-zinc-600 uppercase group-hover:inline">{quality}</span>}
      </button>
      <button
        type="button"
        aria-label={favorite ? `Remove ${station.name} from your stations` : `Save ${station.name} to your stations`}
        aria-pressed={favorite}
        onClick={() => void toggleFavorite(station)}
        className={cx(
          'flex size-8 shrink-0 items-center justify-center rounded-full transition hover:scale-110 active:scale-90',
          favorite ? 'text-spotify' : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-200 focus-visible:opacity-100'
        )}
      >
        <Heart size={15} fill={favorite ? 'currentColor' : 'none'} strokeWidth={favorite ? 0 : 2} />
      </button>
    </li>
  )
}
