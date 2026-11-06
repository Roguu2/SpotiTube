import { useEffect, useState } from 'react'
import { ArrowLeft, LoaderCircle, Play, Plus, Radio } from 'lucide-react'
import type { AlbumSummary, ArtistPage, ArtistRef } from '@core/ipc'
import type { UnifiedPlaylist } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { Button, IconButton } from '@/components/ui/IconButton'
import { TrackList } from './TrackList'
import { refKey, useCatalogStore } from '@/store/useCatalogStore'
import { useDiscoverStore } from '@/store/useDiscoverStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { toast } from '@/store/useToastStore'
import { cx } from '@/lib/format'

/**
 * An artist or channel from YouTube Music: top songs, albums, singles, videos,
 * playlists and artists like them — whichever the page has.
 */
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
  // A plain channel (DJ mixes, covers) has no "Top songs": play its videos instead.
  const hasTop = (artist?.topSongs.length ?? 0) > 0
  const top = (hasTop ? artist?.topSongs : artist?.videos) ?? []
  const context = { label: artist ? `${artist.name} · ${hasTop ? 'Top songs' : 'Videos'}` : artistRef.name }

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
          title={hasTop ? 'Top songs, then similar music' : 'Videos, then similar music'}
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

/** Videos listed before "Show all": a channel can have hundreds. */
const VIDEOS_PREVIEW = 20

function ArtistSections({ artist, context }: { artist: ArtistPage; context: { label: string } }) {
  const navigate = useLibraryStore((s) => s.navigate)
  const [allVideos, setAllVideos] = useState(false)
  const videos = allVideos ? artist.videos : artist.videos.slice(0, VIDEOS_PREVIEW)
  const empty =
    !artist.topSongs.length &&
    !artist.videos.length &&
    !artist.albums.length &&
    !artist.singles.length &&
    !artist.playlists.length &&
    !artist.similar.length

  if (empty) {
    return <p className="px-8 py-12 text-center text-[14px] text-zinc-500">YouTube Music has nothing to play from {artist.name} yet.</p>
  }

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
      {videos.length > 0 && (
        <section className="px-5">
          <h2 className="mb-2 px-3 text-[20px] font-bold tracking-tight text-white">
            Videos
            <span className="ml-2 text-[13px] font-medium text-zinc-500">{artist.videos.length}</span>
          </h2>
          <TrackList tracks={videos} context={{ label: `${artist.name} · Videos` }} hideHeader />
          {artist.videos.length > VIDEOS_PREVIEW && (
            <div className="px-3 pt-2">
              <Button size="sm" variant="secondary" onClick={() => setAllVideos((v) => !v)}>
                {allVideos ? 'Show fewer' : `Show all ${artist.videos.length}`}
              </Button>
            </div>
          )}
        </section>
      )}
      <PlaylistShelf playlists={artist.playlists} />
      {artist.similar.length > 0 && (
        <section className="px-8">
          <h2 className="mb-3 text-[20px] font-bold tracking-tight text-white">Fans also like</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4">
            {artist.similar.map((similar) => (
              <button
                key={similar.id}
                type="button"
                onClick={() => navigate({ kind: 'artist', ref: { id: similar.id, name: similar.name } })}
                className="group rounded-xl p-2.5 text-center transition duration-200 ease-out hover:-translate-y-1 hover:bg-white/[0.06]"
              >
                <img
                  src={similar.artworkUrl}
                  alt=""
                  loading="lazy"
                  className="mx-auto aspect-square w-full rounded-full bg-zinc-900 object-cover shadow-lg shadow-black/40 transition duration-300 ease-out group-hover:scale-105 group-hover:shadow-xl"
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

/** The artist's or channel's own playlists: a click plays one in order, + saves it to your library. */
function PlaylistShelf({ playlists }: { playlists: UnifiedPlaylist[] }) {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const save = useDiscoverStore((s) => s.save)
  const [starting, setStarting] = useState<string | null>(null)
  if (!playlists.length) return null

  const play = async (playlist: UnifiedPlaylist): Promise<void> => {
    setStarting(playlist.id)
    try {
      const tracks = await window.electronAPI.library.getPlaylistTracks(playlist.id)
      if (!tracks.length) toast.error(`“${playlist.name}” is empty right now`)
      else await playQueue(tracks, 0, { label: playlist.name })
    } catch (error) {
      toast.error(`Couldn't play “${playlist.name}”: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setStarting(null)
    }
  }

  return (
    <section className="px-8">
      <h2 className="mb-3 text-[20px] font-bold tracking-tight text-white">Playlists</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
        {playlists.map((playlist) => (
          <div
            key={playlist.id}
            className="group relative rounded-xl p-2.5 transition duration-200 ease-out hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-black/40"
          >
            <button type="button" onClick={() => void play(playlist)} aria-label={`Play ${playlist.name}`} className="block w-full text-left">
              <div className="relative overflow-hidden rounded-lg shadow-lg shadow-black/40">
                <Artwork
                  src={playlist.artworkUrl}
                  alt=""
                  rounded="lg"
                  className="aspect-square w-full transition-transform duration-300 ease-out group-hover:scale-105"
                />
                <span
                  className={cx(
                    'absolute right-2 bottom-2 flex size-10 items-center justify-center rounded-full bg-spotify text-black shadow-lg shadow-black/50 transition',
                    starting === playlist.id ? 'opacity-100' : 'translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
                  )}
                >
                  {starting === playlist.id ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <Play size={18} fill="currentColor" className="translate-x-px" />
                  )}
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
        ))}
      </div>
    </section>
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
            className="group rounded-xl p-2.5 text-left transition duration-200 ease-out hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-black/40"
          >
            <div className="overflow-hidden rounded-lg shadow-lg shadow-black/40">
              <Artwork
                src={album.artworkUrl}
                alt=""
                rounded="lg"
                className="aspect-square w-full transition-transform duration-300 ease-out group-hover:scale-105"
              />
            </div>
            <div className="mt-2.5 truncate text-[13.5px] font-semibold text-zinc-100">{album.title}</div>
            {album.subtitle && <div className="truncate text-[12px] text-zinc-500">{album.subtitle}</div>}
          </button>
        ))}
      </div>
    </section>
  )
}
