import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownUp, ArrowLeft, Check, ChevronDown, Ellipsis, ListEnd, ListPlus, LoaderCircle, Pencil, Play, Search, Shuffle, Trash } from 'lucide-react'
import { Artwork } from '@/components/ui/Artwork'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { Button, IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem, MenuLabel } from '@/components/ui/Menu'
import { TrackList } from './TrackList'
import { AddToHybridMenu } from './AddToHybridMenu'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { cx, formatTotalDuration, formatTrackCount } from '@/lib/format'
import { filterAndSortTracks, readPlaylistSort, TRACK_SORT_LABELS, writePlaylistSort, type TrackSort } from '@/lib/trackFilter'

export function PlaylistView({ playlistId }: { playlistId: string }) {
  const playlist = useLibraryStore((s) => s.playlists.find((p) => p.id === playlistId))
  const state = useLibraryStore((s) => s.tracks[playlistId])
  const loadTracks = useLibraryStore((s) => s.loadTracks)
  const back = useLibraryStore((s) => s.back)
  const renameHybrid = useLibraryStore((s) => s.renameHybrid)
  const deleteHybrid = useLibraryStore((s) => s.deleteHybrid)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const shuffleOn = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const addToQueue = usePlayerStore((s) => s.addToQueue)

  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')

  // (Re)load whenever the cache entry is missing — e.g. after a hybrid edit invalidated it.
  useEffect(() => {
    if (!state) void loadTracks(playlistId)
  }, [state, playlistId, loadTracks])

  const allTracks = useMemo(() => state?.tracks ?? [], [state])
  const totalMs = useMemo(() => allTracks.reduce((sum, t) => sum + t.durationMs, 0), [allTracks])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<TrackSort>(() => readPlaylistSort(playlistId))
  // What you see is what plays: the filtered, sorted list drives play, shuffle and queueing.
  const tracks = useMemo(() => filterAndSortTracks(allTracks, query, sort), [allTracks, query, sort])

  if (!playlist) return null
  const isHybrid = playlist.source === 'hybrid'
  const context = { playlistId, label: playlist.name }

  const play = (shuffle: boolean): void => {
    if (!tracks.length) return
    if (shuffle !== shuffleOn) toggleShuffle()
    const start = shuffle ? Math.floor(Math.random() * tracks.length) : 0
    void playQueue(tracks, start, context)
  }

  const changeSort = (next: TrackSort): void => {
    setSort(next)
    writePlaylistSort(playlistId, next)
  }

  const submitRename = (event: FormEvent): void => {
    event.preventDefault()
    setRenaming(false)
    if (name.trim() && name.trim() !== playlist.name) void renameHybrid(playlistId, name)
  }

  const accent =
    playlist.source === 'spotify' ? 'from-spotify/25' : playlist.source === 'ytmusic' ? 'from-ytmusic/20' : 'from-spotify/15 via-ytmusic/10'

  return (
    <div className="pb-10">
      <header className={`relative bg-gradient-to-b ${accent} to-transparent px-8 pt-5 pb-6`}>
        <IconButton label="Back" size="sm" onClick={back} className="mb-4 bg-black/30">
          <ArrowLeft size={16} />
        </IconButton>
        <div className="flex items-end gap-6">
          <Artwork src={playlist.artworkUrl} alt={playlist.name} rounded="xl" className="size-48 shrink-0 shadow-2xl shadow-black/60" />
          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-2 text-[12px] font-semibold tracking-wider text-zinc-300 uppercase">
              Playlist <SourceBadge source={playlist.source} />
              {playlist.isDemo && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300 normal-case">Sample</span>}
            </div>
            {renaming ? (
              <form onSubmit={submitRename} className="mt-2">
                <input
                  autoFocus
                  value={name}
                  maxLength={100}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
                  aria-label="Playlist name"
                  className="w-full max-w-xl rounded-lg bg-black/40 px-3 py-1 text-4xl font-bold tracking-tight text-zinc-50 ring-1 ring-white/20 outline-none"
                />
              </form>
            ) : (
              <h1 className="mt-2 line-clamp-2 text-5xl font-extrabold tracking-tight text-zinc-50">{playlist.name}</h1>
            )}
            {playlist.description && <p className="mt-3 line-clamp-2 max-w-2xl text-[13px] text-zinc-400">{playlist.description}</p>}
            <p className="mt-2 text-[13px] text-zinc-400">
              {playlist.owner && <span className="font-semibold text-zinc-200">{playlist.owner}</span>}
              {playlist.owner && ' · '}
              {formatTrackCount(state && !state.loading ? allTracks.length : playlist.trackCount)}
              {totalMs > 0 && `, ${formatTotalDuration(totalMs)}`}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-8 py-4">
        <button
          type="button"
          aria-label="Play"
          disabled={!tracks.length}
          onClick={() => play(false)}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-spotify text-black shadow-lg shadow-spotify/20 transition hover:scale-105 hover:bg-[#1ed760] disabled:opacity-40"
        >
          <Play size={20} fill="currentColor" className="translate-x-px" />
        </button>
        <Button variant="secondary" disabled={!tracks.length} onClick={() => play(true)}>
          <Shuffle size={15} /> Shuffle
        </Button>
        <Button variant="ghost" disabled={!tracks.length} onClick={() => void addToQueue(tracks)}>
          <ListEnd size={15} /> Add to queue
        </Button>
        {!isHybrid && tracks.length > 0 && (
          <AddToHybridMenu
            tracks={tracks}
            trigger={({ ref, onClick }) => (
              <Button variant="ghost" ref={ref} onClick={onClick}>
                <ListPlus size={15} /> Add all to hybrid
              </Button>
            )}
          />
        )}
        {isHybrid && (
          <>
            <IconButton
              label="More options"
              ref={setMenuAnchor}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <Ellipsis size={18} />
            </IconButton>
            <Menu anchor={menuAnchor} open={menuOpen} onClose={() => setMenuOpen(false)} align="start">
              <MenuItem
                icon={<Pencil size={14} />}
                onSelect={() => {
                  setMenuOpen(false)
                  setName(playlist.name)
                  setRenaming(true)
                }}
              >
                Rename
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash size={14} />}
                onSelect={() => {
                  setMenuOpen(false)
                  void deleteHybrid(playlistId)
                }}
              >
                Delete playlist
              </MenuItem>
            </Menu>
          </>
        )}
        {allTracks.length > 1 && (
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
                placeholder="Find in playlist"
                aria-label="Find in playlist"
                data-playlist-filter
                className="h-8 w-52 rounded-full bg-white/[0.06] pr-3 pl-8 text-[12.5px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-500 focus:bg-white/10 focus:ring-white/25 [&::-webkit-search-cancel-button]:hidden"
              />
            </div>
            <SortMenu sort={sort} onChange={changeSort} />
          </div>
        )}
      </div>

      <div className="px-5">
        {state?.loading && !allTracks.length ? (
          <div className="flex justify-center py-16 text-zinc-500">
            <LoaderCircle className="animate-spin" size={22} aria-label="Loading tracks" />
          </div>
        ) : state?.error ? (
          <div className="mx-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/25">
            Could not load tracks: {state.error}
            <Button size="sm" variant="danger" className="ml-3" onClick={() => void loadTracks(playlistId, true)}>
              Retry
            </Button>
          </div>
        ) : tracks.length ? (
          <TrackList tracks={tracks} context={context} hybridPlaylistId={isHybrid ? playlistId : undefined} />
        ) : allTracks.length ? (
          <p className="px-3 py-12 text-center text-sm text-zinc-500">
            No tracks match “{query}”.{' '}
            <button type="button" onClick={() => setQuery('')} className="text-zinc-300 underline underline-offset-2">
              Clear search
            </button>
          </p>
        ) : (
          <p className="px-3 py-12 text-center text-sm text-zinc-500">
            {isHybrid ? 'This hybrid playlist is empty — add tracks from any Spotify or YT Music playlist or search.' : 'This playlist is empty.'}
          </p>
        )}
      </div>
    </div>
  )
}

/** The sort picker: a pill like the search field next to it, opening the app's own menu. */
function SortMenu({ sort, onChange }: { sort: TrackSort; onChange: (sort: TrackSort) => void }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label="Sort tracks"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[12.5px] ring-1 transition-colors',
          open || sort !== 'custom'
            ? 'bg-white/10 text-zinc-100 ring-white/20'
            : 'bg-white/[0.06] text-zinc-300 ring-white/10 hover:bg-white/10 hover:text-zinc-100'
        )}
      >
        <ArrowDownUp size={13} className={sort === 'custom' ? 'text-zinc-500' : 'text-spotify'} />
        {TRACK_SORT_LABELS[sort]}
        <ChevronDown size={13} className={cx('text-zinc-500 transition-transform', open && 'rotate-180')} />
      </button>
      <Menu anchor={anchor} open={open} onClose={() => setOpen(false)} className="w-48">
        <MenuLabel>Sort by</MenuLabel>
        {(Object.keys(TRACK_SORT_LABELS) as TrackSort[]).map((key) => (
          <MenuItem
            key={key}
            icon={key === sort ? <Check size={14} className="text-spotify" /> : <span />}
            onSelect={() => {
              setOpen(false)
              onChange(key)
            }}
          >
            {TRACK_SORT_LABELS[key]}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
