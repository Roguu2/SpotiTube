import { useEffect } from 'react'
import { ArrowLeft, ListEnd, ListPlus, LoaderCircle, Play, Shuffle } from 'lucide-react'
import type { AlbumRef } from '@core/ipc'
import { Artwork } from '@/components/ui/Artwork'
import { Button, IconButton } from '@/components/ui/IconButton'
import { TrackList } from './TrackList'
import { ArtistLinks } from './CatalogLinks'
import { refKey, useCatalogStore } from '@/store/useCatalogStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { formatTotalDuration } from '@/lib/format'

/** An album from YouTube Music: its cover, artists and every track, ready to play or keep. */
export function AlbumView({ albumRef }: { albumRef: AlbumRef }) {
  const entry = useCatalogStore((s) => s.albums[refKey(albumRef)])
  const loadAlbum = useCatalogStore((s) => s.loadAlbum)
  const back = useLibraryStore((s) => s.back)
  const createHybrid = useLibraryStore((s) => s.createHybrid)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const addToQueue = usePlayerStore((s) => s.addToQueue)

  useEffect(() => {
    loadAlbum(albumRef)
  }, [albumRef, loadAlbum])

  const album = entry?.status === 'ready' ? entry.page : null
  const tracks = album?.tracks ?? []
  const context = { label: album ? `Album · ${album.title}` : albumRef.name }
  const totalMs = tracks.reduce((sum, t) => sum + t.durationMs, 0)

  const play = (shuffle: boolean): void => {
    if (!tracks.length) return
    const order = [...tracks]
    if (shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[order[i], order[j]] = [order[j], order[i]]
      }
    }
    void playQueue(order, 0, context)
  }

  return (
    <div className="pb-10">
      <header className="relative bg-gradient-to-b from-white/[0.07] to-transparent px-8 pt-5 pb-6">
        <IconButton label="Back" size="sm" onClick={back} className="mb-4 bg-black/30">
          <ArrowLeft size={16} />
        </IconButton>
        <div className="flex items-end gap-6">
          <Artwork
            src={album?.artworkUrl}
            alt={album?.title ?? albumRef.name}
            rounded="xl"
            className="size-48 shrink-0 shadow-2xl shadow-black/60"
          />
          <div className="min-w-0 pb-1">
            <div className="text-[12px] font-semibold tracking-wider text-zinc-300 uppercase">
              {album?.subtitle ?? 'Album'}
            </div>
            <h1 className="mt-2 line-clamp-2 text-5xl font-extrabold tracking-tight text-zinc-50">
              {album?.title ?? albumRef.name}
            </h1>
            <p className="mt-3 flex min-w-0 items-center gap-1.5 text-[13px] text-zinc-400">
              {album ? (
                <ArtistLinks artists={album.artists} className="font-semibold text-zinc-200" />
              ) : (
                albumRef.artist && <span className="font-semibold text-zinc-200">{albumRef.artist}</span>
              )}
              {album && (album.details || totalMs > 0) && (
                <span className="shrink-0">· {album.details ?? formatTotalDuration(totalMs)}</span>
              )}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
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
        <Button variant="ghost" disabled={!album} onClick={() => album && void createHybrid(album.title, tracks)}>
          <ListPlus size={15} /> Save as playlist
        </Button>
      </div>

      <div className="px-5">
        {!entry || entry.status === 'loading' ? (
          <div className="flex justify-center py-16 text-zinc-500">
            <LoaderCircle className="animate-spin" size={22} aria-label="Loading album" />
          </div>
        ) : entry.status === 'error' ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-[14px] text-zinc-400">
            Couldn&apos;t open this album: {entry.message}
            <Button size="sm" variant="secondary" onClick={() => loadAlbum(albumRef, true)}>
              Try again
            </Button>
          </div>
        ) : (
          <TrackList tracks={tracks} context={context} />
        )}
      </div>
    </div>
  )
}
