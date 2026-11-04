import { create } from 'zustand'
import type { AlbumPage, AlbumRef, ArtistPage, ArtistRef } from '@core/ipc'
import type { UnifiedArtist, UnifiedTrack } from '@core/types'

type Entry<T> = { status: 'loading' } | { status: 'ready'; page: T } | { status: 'error'; message: string }

interface CatalogState {
  albums: Record<string, Entry<AlbumPage>>
  artists: Record<string, Entry<ArtistPage>>
  loadAlbum(ref: AlbumRef, force?: boolean): void
  loadArtist(ref: ArtistRef, force?: boolean): void
}

export const refKey = (ref: AlbumRef | ArtistRef): string => JSON.stringify(ref)

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Album and artist pages from YouTube Music, kept for the session. */
export const useCatalogStore = create<CatalogState>((set, get) => ({
  albums: {},
  artists: {},

  loadAlbum(ref, force = false) {
    const key = refKey(ref)
    const entry = get().albums[key]
    if (entry && !force && entry.status !== 'error') return
    set((s) => ({ albums: { ...s.albums, [key]: { status: 'loading' } } }))
    window.electronAPI.library
      .getAlbum(ref)
      .then((page) => set((s) => ({ albums: { ...s.albums, [key]: { status: 'ready', page } } })))
      .catch((error: unknown) =>
        set((s) => ({ albums: { ...s.albums, [key]: { status: 'error', message: errorText(error) } } }))
      )
  },

  loadArtist(ref, force = false) {
    const key = refKey(ref)
    const entry = get().artists[key]
    if (entry && !force && entry.status !== 'error') return
    set((s) => ({ artists: { ...s.artists, [key]: { status: 'loading' } } }))
    window.electronAPI.library
      .getArtist(ref)
      .then((page) => set((s) => ({ artists: { ...s.artists, [key]: { status: 'ready', page } } })))
      .catch((error: unknown) =>
        set((s) => ({ artists: { ...s.artists, [key]: { status: 'error', message: errorText(error) } } }))
      )
  }
}))

/** Where a track's album lives; YouTube Music ids are used as they are, other sources are looked up by name. */
export function albumRefOf(track: UnifiedTrack): AlbumRef | null {
  if (!track.album?.name) return null
  return { id: track.album.id, name: track.album.name, artist: track.artists[0]?.name }
}

export function artistRefOf(artist: UnifiedArtist | ArtistRef): ArtistRef {
  return { id: artist.id, name: artist.name }
}
