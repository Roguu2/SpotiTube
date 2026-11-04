import { useEffect } from 'react'
import { ArrowLeft, LoaderCircle, Play, Radio } from 'lucide-react'
import type { AlbumSummary, ArtistPage, ArtistRef } from '@core/ipc'
import { Artwork } from '@/components/ui/Artwork'
import { Button, IconButton } from '@/components/ui/IconButton'
import { TrackList } from './TrackList'
import { refKey, useCatalogStore } from '@/store/useCatalogStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'

/** An artist from YouTube Music: top songs, albums, singles and artists like them. */
export function ArtistView({ artistRef }: { artistRef: ArtistRef }) {
  const entry = useCatalogStore((s) => s.artists[refKey(artistRef)])
  const loadArtist = useCatalogStore((s) => s.loadArtist)
  const back = useLibraryStore((s) => s.back)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const startRadio = usePlayerStore((s) => s.startRadio)

  useEffect(() => {
    loadArtist(artistRef)
  }, [artistRef, loadArtist])

  const artist = entry?.status === 'ready' ? entry.page : null
  const top = artist?.topSongs ?? []
  const context = { label: artist ? `${artist.name} · Top songs` : artistRef.name }

  return (
    <div className="pb-10">
      <header className="relative isolate overflow-hidden px-8 pt-5 pb-8">
        {artist?.artworkUrl && (
          <>
            <img
              src={artist.artworkUrl}
              alt=""
              className="absolute inset-0 -z-20 size-full object-cover object-[50%_25%] opacity-60"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/40 to-base" />
          </>
        )}
        <IconButton label="Back" size="sm" onClick={back} className="mb-16 bg-black/40">
          <ArrowLeft size={16} />
        </IconButton>
        <div className="text-[12px] font-semibold tracking-wider text-zinc-300 uppercase">Artist</div>
        <h1 className="mt-1 line-clamp-2 text-6xl font-extrabold tracking-tight text-white drop-shadow-lg">
          {artist?.name ?? artistRef.name}
        </h1>
        {artist?.description && (
          <p className="mt-3 line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-zinc-300">{artist.description}</p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 px-8 py-4">
        <button
          type="button"
          aria-label={`Play ${artist?.name ?? artistRef.name}`}
          title="Top songs, then similar music"
          disabled={!top.length}
          onClick={() => void playQueue(top, 0, context)}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-spotify text-black shadow-lg shadow-spotify/20 transition hover:scale-105 hover:bg-[#1ed760] disabled:opacity-40"
        >
          <Play size={20} fill="currentColor" className="translate-x-px" />
        </button>
        <Button variant="secondary" disabled={!top.length} onClick={() => void startRadio(top[0])}>
          <Radio size={15} /> Radio
        </Button>
      </div>

      {!entry || entry.status === 'loading' ? (
        <div className="flex justify-center py-16 text-zinc-500">
          <LoaderCircle className="animate-spin" size={22} aria-label="Loading artist" />
        </div>
      ) : entry.status === 'error' ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-[14px] text-zinc-400">
          Couldn&apos;t open this artist: {entry.message}
          <Button size="sm" variant="secondary" onClick={() => loadArtist(artistRef, true)}>
            Try again
          </Button>
        </div>
      ) : (
        <ArtistSections artist={entry.page} context={context} />
      )}
    </div>
  )
}

function ArtistSections({ artist, context }: { artist: ArtistPage; context: { label: string } }) {
  const navigate = useLibraryStore((s) => s.navigate)

  return (
    <div className="space-y-9">
      {artist.topSongs.length > 0 && (
        <section className="px-5">
          <h2 className="mb-2 px-3 text-[20px] font-bold tracking-tight text-white">Top songs</h2>
          <TrackList tracks={artist.topSongs} context={context} hideHeader />
        </section>
      )}
      <AlbumShelf title="Albums" albums={artist.albums} artistName={artist.name} />
      <AlbumShelf title="Singles & EPs" albums={artist.singles} artistName={artist.name} />
      {artist.similar.length > 0 && (
        <section className="px-8">
          <h2 className="mb-3 text-[20px] font-bold tracking-tight text-white">Fans also like</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4">
            {artist.similar.map((similar) => (
              <button
                key={similar.id}
                type="button"
                onClick={() => navigate({ kind: 'artist', ref: { id: similar.id, name: similar.name } })}
                className="group rounded-xl p-2.5 text-center transition hover:bg-white/[0.06]"
              >
                <img
                  src={similar.artworkUrl}
                  alt=""
                  loading="lazy"
                  className="mx-auto aspect-square w-full rounded-full bg-zinc-900 object-cover shadow-lg shadow-black/40"
                />
                <div className="mt-2.5 truncate text-[13.5px] font-semibold text-zinc-100">{similar.name}</div>
                {similar.subtitle && <div className="truncate text-[11.5px] text-zinc-500">{similar.subtitle}</div>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AlbumShelf({ title, albums, artistName }: { title: string; albums: AlbumSummary[]; artistName: string }) {
  const navigate = useLibraryStore((s) => s.navigate)
  if (!albums.length) return null
  return (
    <section className="px-8">
      <h2 className="mb-3 text-[20px] font-bold tracking-tight text-white">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {albums.map((album) => (
          <button
            key={album.id}
            type="button"
            onClick={() => navigate({ kind: 'album', ref: { id: album.id, name: album.title, artist: artistName } })}
            className="rounded-xl p-2.5 text-left transition hover:bg-white/[0.06]"
          >
            <Artwork src={album.artworkUrl} alt="" rounded="lg" className="aspect-square w-full shadow-lg shadow-black/40" />
            <div className="mt-2.5 truncate text-[13.5px] font-semibold text-zinc-100">{album.title}</div>
            {album.subtitle && <div className="truncate text-[12px] text-zinc-500">{album.subtitle}</div>}
          </button>
        ))}
      </div>
    </section>
  )
}
