import { randomUUID } from 'node:crypto'
import {
  artistLine,
  makePlaylistId,
  type IMusicProvider,
  type UnifiedPlaylist,
  type UnifiedTrack
} from '@core/types'
import { getHybridPlaylists, saveHybridPlaylists, type HybridPlaylistRecord } from '../../services/store'
import { gradientArtwork } from '../demo/artwork'

const MAX_NAME_LENGTH = 100

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH)
  if (!trimmed) throw new Error('Playlist name cannot be empty')
  return trimmed
}

/**
 * Local playlists that mix tracks from any source. Tracks are stored as full
 * snapshots so they keep working (and keep their source badge) offline.
 */
export class HybridProvider implements IMusicProvider {
  readonly id = 'hybrid' as const
  readonly displayName = 'SpotiTube Hybrid'

  /** Streams are resolved by the track's original provider. */
  constructor(private readonly resolveOriginal: (track: UnifiedTrack) => Promise<string>) {}

  isAuthenticated(): boolean {
    return true
  }

  async getPlaylists(): Promise<UnifiedPlaylist[]> {
    return getHybridPlaylists().map(toUnified)
  }

  async getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]> {
    return this.find(playlistId).tracks
  }

  async searchTracks(query: string): Promise<UnifiedTrack[]> {
    const q = query.toLowerCase()
    const seen = new Set<string>()
    return getHybridPlaylists()
      .flatMap((p) => p.tracks)
      .filter((t) => `${t.title} ${artistLine(t)}`.toLowerCase().includes(q))
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
  }

  resolveStreamUrl(track: UnifiedTrack): Promise<string> {
    return this.resolveOriginal(track)
  }

  create(name: string, description?: string): UnifiedPlaylist {
    const now = Date.now()
    const record: HybridPlaylistRecord = {
      id: randomUUID(),
      name: cleanName(name),
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      tracks: []
    }
    saveHybridPlaylists([...getHybridPlaylists(), record])
    return toUnified(record)
  }

  rename(sourcePlaylistId: string, name: string): UnifiedPlaylist {
    return this.mutate(sourcePlaylistId, (record) => ({ ...record, name: cleanName(name) }))
  }

  delete(sourcePlaylistId: string): void {
    this.find(sourcePlaylistId)
    saveHybridPlaylists(getHybridPlaylists().filter((p) => p.id !== sourcePlaylistId))
  }

  addTracks(sourcePlaylistId: string, tracks: UnifiedTrack[]): UnifiedPlaylist {
    return this.mutate(sourcePlaylistId, (record) => {
      const existing = new Set(record.tracks.map((t) => t.id))
      // Hybrid playlists only reference real catalog tracks, never other hybrids.
      const additions = tracks.filter((t) => t.providerId !== 'hybrid' && !existing.has(t.id))
      return { ...record, tracks: [...record.tracks, ...additions] }
    })
  }

  removeTracks(sourcePlaylistId: string, trackIds: string[]): UnifiedPlaylist {
    const remove = new Set(trackIds)
    return this.mutate(sourcePlaylistId, (record) => ({
      ...record,
      tracks: record.tracks.filter((t) => !remove.has(t.id))
    }))
  }

  private find(sourcePlaylistId: string): HybridPlaylistRecord {
    const record = getHybridPlaylists().find((p) => p.id === sourcePlaylistId)
    if (!record) throw new Error('Hybrid playlist not found')
    return record
  }

  private mutate(
    sourcePlaylistId: string,
    update: (record: HybridPlaylistRecord) => HybridPlaylistRecord
  ): UnifiedPlaylist {
    let updated: HybridPlaylistRecord | undefined
    const playlists = getHybridPlaylists().map((p) => {
      if (p.id !== sourcePlaylistId) return p
      updated = { ...update(p), updatedAt: Date.now() }
      return updated
    })
    if (!updated) throw new Error('Hybrid playlist not found')
    saveHybridPlaylists(playlists)
    return toUnified(updated)
  }
}

function toUnified(record: HybridPlaylistRecord): UnifiedPlaylist {
  return {
    id: makePlaylistId('hybrid', record.id),
    providerId: 'hybrid',
    source: 'hybrid',
    sourcePlaylistId: record.id,
    name: record.name,
    description: record.description,
    owner: 'You',
    artworkUrl: record.tracks.find((t) => t.artworkUrl)?.artworkUrl ?? gradientArtwork(record.id, record.name),
    trackCount: record.tracks.length,
    editable: true
  }
}
