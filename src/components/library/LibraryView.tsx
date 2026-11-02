import { LayoutGrid, LoaderCircle, Plus, Columns2 } from 'lucide-react'
import type { SourceId, UnifiedPlaylist } from '@core/types'
import { PlaylistCard } from './PlaylistCard'
import { DemoBanner } from './DemoBanner'
import { SourceBadge, SourceIcon } from '@/components/ui/SourceBadge'
import { Button } from '@/components/ui/IconButton'
import { useLibraryStore, type LibraryFilter } from '@/store/useLibraryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { cx } from '@/lib/format'

const TABS: { id: LibraryFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All Playlists', icon: <LayoutGrid size={14} /> },
  { id: 'spotify', label: 'Spotify Only', icon: <SourceIcon source="spotify" size={14} /> },
  { id: 'ytmusic', label: 'YT Music Only', icon: <SourceIcon source="ytmusic" size={14} /> },
  { id: 'split', label: 'Split View', icon: <Columns2 size={14} /> }
]

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4'
const NARROW_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3'

export function LibraryView() {
  const playlists = useLibraryStore((s) => s.playlists)
  const filter = useLibraryStore((s) => s.filter)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const loading = useLibraryStore((s) => s.loading)
  const loaded = useLibraryStore((s) => s.loaded)
  const error = useLibraryStore((s) => s.error)
  const loadLibrary = useLibraryStore((s) => s.loadLibrary)

  const by = (source: SourceId): UnifiedPlaylist[] => playlists.filter((p) => p.source === source)
  const counts: Record<LibraryFilter, number> = {
    all: playlists.length,
    spotify: by('spotify').length,
    ytmusic: by('ytmusic').length,
    split: by('spotify').length + by('ytmusic').length
  }

  return (
    <div className="px-8 pt-6 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Library</h1>
          <p className="mt-1 text-sm text-zinc-500">Spotify and YouTube Music, side by side.</p>
        </div>
        {loading && <LoaderCircle className="animate-spin text-zinc-500" size={18} aria-label="Loading library" />}
      </header>

      <nav role="tablist" aria-label="Library filter" className="mt-5 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={cx(
              'inline-flex h-8 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors',
              filter === tab.id
                ? tab.id === 'spotify'
                  ? 'bg-spotify text-black'
                  : tab.id === 'ytmusic'
                    ? 'bg-ytmusic text-white'
                    : 'bg-zinc-100 text-zinc-950'
                : 'bg-white/6 text-zinc-300 hover:bg-white/10'
            )}
          >
            {tab.icon}
            {tab.label}
            <span className={cx('tabular-nums', filter === tab.id ? 'opacity-70' : 'text-zinc-500')}>{counts[tab.id]}</span>
          </button>
        ))}
      </nav>

      <DemoBanner />

      {error && (
        <div className="mt-6 flex items-center justify-between rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/25">
          <span>Could not load your library: {error}</span>
          <Button size="sm" variant="danger" onClick={() => void loadLibrary()}>
            Retry
          </Button>
        </div>
      )}

      <div className="mt-6">
        {filter === 'split' ? (
          <SplitView spotify={by('spotify')} ytmusic={by('ytmusic')} hybrid={by('hybrid')} />
        ) : filter === 'all' ? (
          <div className="space-y-8">
            <HybridSection playlists={by('hybrid')} />
            <Section title="Spotify" source="spotify" playlists={by('spotify')} />
            <Section title="YouTube Music" source="ytmusic" playlists={by('ytmusic')} />
          </div>
        ) : (
          <div className={GRID}>
            {by(filter).map((p) => (
              <PlaylistCard key={p.id} playlist={p} />
            ))}
          </div>
        )}
        {loaded && playlists.length === 0 && !error && (
          <p className="py-16 text-center text-sm text-zinc-500">No playlists yet. Connect an account in Settings.</p>
        )}
      </div>
    </div>
  )
}

function Section({ title, source, playlists }: { title: string; source: SourceId; playlists: UnifiedPlaylist[] }) {
  if (!playlists.length) return null
  return (
    <section aria-label={title}>
      <h2 className="mb-3 flex items-center gap-2.5 text-lg font-semibold">
        {title}
        <SourceBadge source={source} />
      </h2>
      <div className={GRID}>
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} />
        ))}
      </div>
    </section>
  )
}

function HybridSection({ playlists }: { playlists: UnifiedPlaylist[] }) {
  const createHybrid = useLibraryStore((s) => s.createHybrid)
  const navigate = useLibraryStore((s) => s.navigate)

  const create = async (): Promise<void> => {
    const count = playlists.length + 1
    const playlist = await createHybrid(`Hybrid Mix ${count}`)
    if (playlist) navigate({ kind: 'playlist', playlistId: playlist.id })
  }

  return (
    <section aria-label="SpotiTube Hybrid">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          SpotiTube Hybrid
          <SourceBadge source="hybrid" />
        </h2>
        <Button size="sm" variant="ghost" onClick={() => void create()}>
          <Plus size={14} /> New hybrid playlist
        </Button>
      </div>
      {playlists.length ? (
        <div className={GRID}>
          {playlists.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-[13px] text-zinc-500">
          Mix Spotify and YouTube Music tracks in one playlist: use the{' '}
          <span className="font-medium text-zinc-300">add to hybrid</span> button on any track.
        </p>
      )}
    </section>
  )
}

function SplitView({ spotify, ytmusic, hybrid }: { spotify: UnifiedPlaylist[]; ytmusic: UnifiedPlaylist[]; hybrid: UnifiedPlaylist[] }) {
  const providers = useLibraryStore((s) => s.providers)
  const openSettings = useSettingsStore((s) => s.setSettingsOpen)

  const column = (source: 'spotify' | 'ytmusic', label: string, items: UnifiedPlaylist[]) => {
    const status = providers.find((p) => p.providerId === source)
    return (
      <section
        aria-label={label}
        className={cx(
          'min-w-0 rounded-2xl p-4 ring-1',
          source === 'spotify' ? 'bg-spotify/[0.04] ring-spotify/15' : 'bg-ytmusic/[0.04] ring-ytmusic/15'
        )}
      >
        <header className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2.5 text-base font-semibold">
            <SourceBadge source={source} />
            <span className="text-zinc-500 tabular-nums">{items.length}</span>
          </h2>
          {status && !status.authenticated && (
            <button type="button" onClick={() => openSettings(true)} className="text-[12px] text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline">
              Connect {label}
            </button>
          )}
        </header>
        <div className={NARROW_GRID}>
          {items.map((p) => (
            <PlaylistCard key={p.id} playlist={p} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      {hybrid.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <SourceBadge source="hybrid" className="mr-1" />
          {hybrid.map((p) => (
            <HybridChip key={p.id} playlist={p} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {column('spotify', 'Spotify', spotify)}
        {column('ytmusic', 'YouTube Music', ytmusic)}
      </div>
    </div>
  )
}

function HybridChip({ playlist }: { playlist: UnifiedPlaylist }) {
  const navigate = useLibraryStore((s) => s.navigate)
  return (
    <button
      type="button"
      onClick={() => navigate({ kind: 'playlist', playlistId: playlist.id })}
      className="shrink-0 rounded-full bg-white/6 px-3 py-1 text-[12.5px] text-zinc-200 ring-1 ring-white/10 hover:bg-white/10"
    >
      {playlist.name}
    </button>
  )
}
