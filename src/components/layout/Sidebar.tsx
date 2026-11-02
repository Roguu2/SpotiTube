import { useState, type FormEvent } from 'react'
import { History, Library, Plus, Search, Settings, Volume2 } from 'lucide-react'
import type { UnifiedPlaylist } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { UpdateBanner } from './UpdateBanner'
import { EmbedDockSlot } from '@/components/player/EmbedMiniPlayer'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { useLibraryStore, type LibraryFilter } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { cx } from '@/lib/format'

const FILTERS: { id: Exclude<LibraryFilter, 'split'>; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'spotify', label: 'Spotify' },
  { id: 'ytmusic', label: 'YT Music' }
]

export function Sidebar() {
  const playlists = useLibraryStore((s) => s.playlists)
  const view = useLibraryStore((s) => s.view)
  const navigate = useLibraryStore((s) => s.navigate)
  const createHybrid = useLibraryStore((s) => s.createHybrid)
  const providers = useLibraryStore((s) => s.providers)
  const openSettings = useSettingsStore((s) => s.setSettingsOpen)
  const playingPlaylistId = usePlayerStore((s) => s.context?.playlistId)

  const [filter, setFilter] = useState<Exclude<LibraryFilter, 'split'>>('all')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  // Hybrid playlists stay visible under every filter: they mix both sources.
  const visible = playlists.filter((p) => filter === 'all' || p.source === filter || p.source === 'hybrid')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()
    setCreating(false)
    setName('')
    if (!trimmed) return
    const playlist = await createHybrid(trimmed)
    if (playlist) navigate({ kind: 'playlist', playlistId: playlist.id })
  }

  return (
    <aside aria-label="Sidebar" className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-black/20">
      <nav className="space-y-0.5 p-3">
        <NavButton icon={<Library size={18} />} active={view.kind === 'library'} onClick={() => navigate({ kind: 'library' })}>
          Library
        </NavButton>
        <NavButton icon={<Search size={18} />} active={view.kind === 'search'} onClick={() => navigate({ kind: 'search' })}>
          Search
        </NavButton>
        <NavButton icon={<History size={18} />} active={view.kind === 'history'} onClick={() => navigate({ kind: 'history' })}>
          Recently played
        </NavButton>
      </nav>

      <div className="flex items-center justify-between px-5 pt-2 pb-2">
        <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Playlists</span>
        <button
          type="button"
          aria-label="New hybrid playlist"
          title="New hybrid playlist"
          onClick={() => setCreating(true)}
          className="rounded-md p-1 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200"
        >
          <Plus size={16} />
        </button>
      </div>

      <div role="tablist" aria-label="Playlist source" className="flex gap-1 px-4 pb-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cx(
              'rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors',
              filter === f.id
                ? f.id === 'spotify'
                  ? 'bg-spotify/20 text-spotify'
                  : f.id === 'ytmusic'
                    ? 'bg-ytmusic/20 text-[#ff5c5c]'
                    : 'bg-white/12 text-zinc-100'
                : 'text-zinc-500 hover:bg-white/6 hover:text-zinc-300'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {creating && (
        <form onSubmit={submit} className="px-3 pb-2">
          <input
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !name.trim() && setCreating(false)}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
            placeholder="New hybrid playlist"
            aria-label="New hybrid playlist name"
            className="h-8 w-full rounded-md bg-black/40 px-2.5 text-[13px] ring-1 ring-white/15 outline-none placeholder:text-zinc-600 focus:ring-white/30"
          />
        </form>
      )}

      <ul className="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-3">
        {visible.map((p) => (
          <SidebarPlaylist
            key={p.id}
            playlist={p}
            active={view.kind === 'playlist' && view.playlistId === p.id}
            playing={playingPlaylistId === p.id}
            onClick={() => navigate({ kind: 'playlist', playlistId: p.id })}
          />
        ))}
      </ul>

      <EmbedDockSlot />
      <UpdateBanner />
      <footer className="flex items-center gap-2 border-t border-white/5 px-3 py-3">
        <button
          type="button"
          onClick={() => openSettings(true)}
          className="flex flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-zinc-400 transition hover:bg-white/6 hover:text-zinc-100"
        >
          <Settings size={17} /> Settings
        </button>
        {providers
          .filter((p) => p.providerId !== 'hybrid')
          .map((p) => (
            <span
              key={p.providerId}
              title={`${p.providerId === 'spotify' ? 'Spotify' : 'YouTube Music'}: ${p.authenticated ? 'connected' : 'sample library'}`}
              className={cx('rounded-full', !p.authenticated && 'opacity-40 grayscale')}
            >
              <SourceBadge source={p.providerId} variant="dot" />
            </span>
          ))}
      </footer>
    </aside>
  )
}

function NavButton({ icon, active, onClick, children }: { icon: React.ReactNode; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors',
        active ? 'bg-white/8 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function SidebarPlaylist({ playlist, active, playing, onClick }: { playlist: UnifiedPlaylist; active: boolean; playing: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
          active ? 'bg-white/10' : 'hover:bg-white/5'
        )}
      >
        <Artwork src={playlist.artworkUrl} alt="" className="size-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[13px] font-medium', playing ? 'text-spotify' : 'text-zinc-200')}>
            {playlist.name}
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
            <SourceBadge source={playlist.source} variant="tag" />
            <span className="truncate">{playlist.trackCount} tracks</span>
          </span>
        </span>
        {playing && <Volume2 size={14} className="shrink-0 text-spotify" />}
      </button>
    </li>
  )
}
