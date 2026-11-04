import { useEffect, useRef } from 'react'
import { Compass, LoaderCircle, Play, Plus, RotateCw, Shuffle, Sparkles } from 'lucide-react'
import type { DiscoverCategory } from '@core/ipc'
import type { UnifiedPlaylist } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { useDiscoverStore } from '@/store/useDiscoverStore'
import { cx } from '@/lib/format'

/** A steady colour per category, so a tile looks the same every visit. */
function hue(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

/**
 * For when you don't know what to play: YouTube Music's moods and genres, a
 * random pick from any of them, or a playlist you choose from one.
 */
export function DiscoverView() {
  const categories = useDiscoverStore((s) => s.categories)
  const status = useDiscoverStore((s) => s.categoriesStatus)
  const selected = useDiscoverStore((s) => s.selected)
  const starting = useDiscoverStore((s) => s.starting)
  const lastPick = useDiscoverStore((s) => s.lastPick)
  const loadCategories = useDiscoverStore((s) => s.loadCategories)
  const select = useDiscoverStore((s) => s.select)
  const surprise = useDiscoverStore((s) => s.surprise)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selected])

  const moods = categories.filter((c) => c.group === 'mood')
  const genres = categories.filter((c) => c.group === 'genre')
  const category = categories.find((c) => c.id === selected) ?? null
  const surprising = starting?.startsWith('surprise:') ?? false

  return (
    <div className="px-8 pt-8 pb-12">
      <header className="mb-6">
        <h1 className="text-[32px] font-extrabold tracking-tight text-white">Discover</h1>
        <p className="mt-1 text-[14px] text-zinc-400">Not sure what to play? Pick a mood or a genre — or let SpotiTube choose.</p>
      </header>

      <button
        type="button"
        disabled={status !== 'ready' || surprising}
        onClick={() => void surprise()}
        className="group relative flex w-full items-center gap-5 overflow-hidden rounded-2xl bg-gradient-to-r from-spotify/90 via-emerald-500/70 to-ytmusic/80 p-6 text-left shadow-xl shadow-black/30 transition hover:brightness-110 disabled:opacity-60"
      >
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-black/25 text-white">
          {surprising ? <LoaderCircle size={26} className="animate-spin" /> : <Sparkles size={26} />}
        </span>
        <span className="min-w-0">
          <span className="block text-[22px] font-extrabold tracking-tight text-white">Surprise me</span>
          <span className="block truncate text-[13.5px] text-white/85">
            {lastPick
              ? `Playing ${lastPick.playlist.name} · ${lastPick.category.title} — press again for something else`
              : 'A random playlist from any mood or genre, shuffled'}
          </span>
        </span>
        <Shuffle size={22} className="ml-auto shrink-0 text-white/80 transition group-hover:rotate-12" />
      </button>

      {status === 'loading' || status === 'idle' ? (
        <TileSkeleton />
      ) : status === 'error' ? (
        <div className="mt-10 flex flex-col items-start gap-3 text-[14px] text-zinc-400">
          Couldn't reach YouTube Music for moods and genres.
          <button
            type="button"
            onClick={() => {
              useDiscoverStore.setState({ categoriesStatus: 'idle' })
              void loadCategories()
            }}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-white/15"
          >
            <RotateCw size={13} /> Try again
          </button>
        </div>
      ) : (
        <>
          <TileSection title="Moods & moments" categories={moods} selected={selected} onSelect={select} />
          <TileSection title="Genres" categories={genres} selected={selected} onSelect={select} />
        </>
      )}

      {category && (
        <section ref={panelRef} className="mt-10 scroll-mt-4">
          <CategoryPanel category={category} />
        </section>
      )}
    </div>
  )
}

function TileSection({
  title,
  categories,
  selected,
  onSelect
}: {
  title: string
  categories: DiscoverCategory[]
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  if (!categories.length) return null
  return (
    <section className="mt-9">
      <h2 className="mb-3 text-[18px] font-bold tracking-tight text-white">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
        {categories.map((category) => {
          const h = hue(category.title)
          const active = category.id === selected
          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : category.id)}
              style={{
                background: `linear-gradient(135deg, hsl(${h} 70% 42% / ${active ? 0.95 : 0.55}), hsl(${(h + 40) % 360} 70% 28% / ${active ? 0.9 : 0.45}))`
              }}
              className={cx(
                'relative h-[60px] overflow-hidden rounded-xl px-3.5 text-left text-[14px] font-bold text-white shadow-md shadow-black/20 transition hover:brightness-125',
                active && 'ring-2 ring-white/80'
              )}
            >
              <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: `hsl(${h} 80% 60%)` }} />
              <span className="line-clamp-2">{category.title}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CategoryPanel({ category }: { category: DiscoverCategory }) {
  const entry = useDiscoverStore((s) => s.playlists[category.id])
  const starting = useDiscoverStore((s) => s.starting)
  const surprise = useDiscoverStore((s) => s.surprise)
  const loadPlaylists = useDiscoverStore((s) => s.loadPlaylists)

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <Compass size={20} className="text-zinc-400" />
        <h2 className="text-[22px] font-extrabold tracking-tight text-white">{category.title}</h2>
        <button
          type="button"
          disabled={entry?.status !== 'ready' || starting !== null}
          onClick={() => void surprise(category)}
          className="ml-auto flex items-center gap-2 rounded-full bg-spotify px-4 py-2 text-[13px] font-bold text-black transition hover:scale-[1.03] hover:bg-[#1ed760] disabled:opacity-50 disabled:hover:scale-100"
        >
          {starting === `surprise:${category.id}` ? <LoaderCircle size={15} className="animate-spin" /> : <Shuffle size={15} />}
          Play something {category.group === 'mood' ? 'for this mood' : 'from this genre'}
        </button>
      </div>

      {!entry || entry.status === 'loading' ? (
        <CardSkeleton />
      ) : entry.status === 'error' ? (
        <div className="flex items-center gap-3 text-[14px] text-zinc-400">
          Couldn't load playlists for {category.title}.
          <button
            type="button"
            onClick={() => {
              useDiscoverStore.setState((s) => {
                const playlists = { ...s.playlists }
                delete playlists[category.id]
                return { playlists }
              })
              void loadPlaylists(category.id).catch(() => undefined)
            }}
            className="rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-white/15"
          >
            Try again
          </button>
        </div>
      ) : entry.playlists.length === 0 ? (
        <p className="text-[14px] text-zinc-500">YouTube Music has no playlists here right now.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {entry.playlists.map((playlist) => (
            <DiscoverCard key={playlist.id} category={category} playlist={playlist} />
          ))}
        </div>
      )}
    </>
  )
}

function DiscoverCard({ category, playlist }: { category: DiscoverCategory; playlist: UnifiedPlaylist }) {
  const starting = useDiscoverStore((s) => s.starting === playlist.id)
  const play = useDiscoverStore((s) => s.play)
  const save = useDiscoverStore((s) => s.save)

  return (
    <div className="group relative rounded-xl bg-white/[0.03] p-3 transition hover:bg-white/[0.07]">
      <button
        type="button"
        onClick={() => void play(category, playlist)}
        aria-label={`Play ${playlist.name}`}
        className="block w-full text-left"
      >
        <div className="relative">
          <Artwork src={playlist.artworkUrl} alt="" rounded="lg" className="aspect-square w-full shadow-lg shadow-black/40" />
          <span
            className={cx(
              'absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full bg-spotify text-black shadow-lg shadow-black/50 transition',
              starting ? 'opacity-100' : 'translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
            )}
          >
            {starting ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" className="translate-x-px" />}
          </span>
        </div>
        <div className="mt-2.5 truncate text-[13.5px] font-semibold text-zinc-100">{playlist.name}</div>
        {playlist.description && <div className="line-clamp-2 text-[12px] leading-snug text-zinc-500">{playlist.description}</div>}
      </button>
      <button
        type="button"
        aria-label={`Save ${playlist.name} to your library`}
        title="Save to your library"
        onClick={() => void save(playlist)}
        className="absolute top-4 right-4 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-black/80"
      >
        <Plus size={15} />
      </button>
    </div>
  )
}

function TileSkeleton() {
  return (
    <div className="mt-9 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5" aria-label="Loading moods and genres">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="h-[60px] animate-pulse rounded-xl bg-white/[0.06]" />
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4" aria-label="Loading playlists">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-xl bg-white/[0.03] p-3">
          <div className="aspect-square animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="mt-3 h-3.5 w-3/4 animate-pulse rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}
