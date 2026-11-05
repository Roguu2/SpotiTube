import Store from 'electron-store'
import { BrowserWindow } from 'electron'
import type { Innertube } from 'youtubei.js'
import { IpcChannels, type YtSyncStatus } from '@core/ipc'
import type { UnifiedPlaylist, UnifiedTrack } from '@core/types'
import type { YouTubeClient } from './youtube'
import type { TrackMatcher } from './trackMatcher'
import { errorMessage } from './http'
import {
  getHybridPlaylists,
  getSettings,
  getStreamOverride,
  onHybridPlaylistsChanged,
  saveHybridPlaylists,
  updateSettings,
  type HybridPlaylistRecord
} from './store'
import { collectListItems, listItemToTrack } from '../providers/ytmusic/mapping'

/**
 * Sync through your YouTube Music account. Every SpotiTube playlist has a
 * private twin in the account, tagged in its description, so every computer
 * signed in to the same account (and the YouTube Music apps) sees the same
 * playlists. Each pass merges three ways per playlist — what was last synced,
 * what this computer has now, what the account has now — so additions and
 * removals on either side both survive. Spotify tracks travel as the YouTube
 * upload SpotiTube plays for them.
 */

const MARKER = /\[spotitube:([\w-]{1,64})\]/
const description = (hybridId: string): string =>
  `Synced by SpotiTube — keep this tag so your computers can find this playlist: [spotitube:${hybridId}]`
const INTERVAL_MS = 5 * 60_000
/** Local edits are pushed shortly after they happen, once a burst of them settles. */
const CHANGE_DEBOUNCE_MS = 5_000
const MAX_TRACKS = 5_000
const EDIT_BATCH = 100

interface Link {
  playlistId: string
  /** Video ids as they were after the last successful pass, the merge's common ancestor. */
  base: string[]
  /** The name as of the last pass, to tell which side renamed it. */
  name: string
}

interface SyncState {
  links: Record<string, Link>
  /** Account playlists already checked and found not to be SpotiTube's. */
  foreign: string[]
  /** YouTube video id chosen for each non-YouTube track. */
  videoIds: Record<string, string>
  lastSyncAt: number | null
}

const state = new Store<SyncState>({
  name: 'ytmusic-sync',
  accessPropertiesByDotNotation: false,
  defaults: { links: {}, foreign: [], videoIds: {}, lastSyncAt: null }
})

interface Remote {
  title: string
  hybridId: string | null
  tracks: UnifiedTrack[]
}

export interface YtMusicSyncDeps {
  youtube: YouTubeClient
  matcher: TrackMatcher
  /** The account's playlists, as the library lists them. */
  listAccountPlaylists(): Promise<UnifiedPlaylist[]>
}

function broadcast(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

/** Base ∪ both sides' additions, minus either side's removals; this computer's order first. */
export function mergeThreeWay(base: string[], local: string[], remote: string[]): string[] {
  const inLocal = new Set(local)
  const inRemote = new Set(remote)
  const removed = new Set(base.filter((id) => !inLocal.has(id) || !inRemote.has(id)))
  const merged: string[] = []
  const seen = new Set<string>()
  for (const id of [...local, ...remote]) {
    if (removed.has(id) || seen.has(id)) continue
    seen.add(id)
    merged.push(id)
  }
  return merged
}

export class YtMusicSync {
  private timer: NodeJS.Timeout | null = null
  private changeTimer: NodeJS.Timeout | null = null
  private running: Promise<void> | null = null
  private again = false
  private error: string | null = null
  /** Set while this pass writes playlists, so its own writes don't schedule another pass. */
  private writing = false

  constructor(private readonly deps: YtMusicSyncDeps) {
    onHybridPlaylistsChanged(() => {
      if (this.writing || !this.active) return
      if (this.changeTimer) clearTimeout(this.changeTimer)
      this.changeTimer = setTimeout(() => void this.run(), CHANGE_DEBOUNCE_MS)
    })
  }

  private get active(): boolean {
    return getSettings().ytmusicSync && this.deps.youtube.hasCookie()
  }

  /** Account playlist ids that mirror SpotiTube playlists; the library hides them to avoid doubles. */
  mirroredPlaylistIds(): Set<string> {
    return new Set(Object.values(state.get('links')).map((link) => link.playlistId))
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.run(), INTERVAL_MS)
    if (this.active) void this.run()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.changeTimer) clearTimeout(this.changeTimer)
    this.timer = null
    this.changeTimer = null
  }

  async setEnabled(enabled: boolean): Promise<YtSyncStatus> {
    updateSettings({ ytmusicSync: enabled })
    if (enabled) await this.run()
    else this.broadcastStatus()
    return this.status()
  }

  status(): YtSyncStatus {
    return {
      enabled: getSettings().ytmusicSync,
      connected: this.deps.youtube.hasCookie(),
      running: this.running !== null,
      lastSyncAt: state.get('lastSyncAt'),
      playlists: Object.keys(state.get('links')).length,
      error: this.error
    }
  }

  /** One pass; a request during a pass runs another right after it. */
  run(): Promise<void> {
    if (!this.active) return Promise.resolve()
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = this.pass()
      .then(() => {
        this.error = null
        state.set('lastSyncAt', Date.now())
      })
      .catch((error: unknown) => {
        this.error = errorMessage(error)
      })
      .finally(() => {
        this.running = null
        this.broadcastStatus()
        if (this.again) {
          this.again = false
          void this.run()
        }
      })
    this.broadcastStatus()
    return this.running
  }

  private broadcastStatus(): void {
    broadcast(IpcChannels.ytsyncStatusChanged, this.status())
  }

  private async pass(): Promise<void> {
    const yt = await this.deps.youtube.getAuthenticated()
    const account = await this.deps.listAccountPlaylists()
    const titles = new Map(account.map((p) => [p.sourcePlaylistId, p.name]))
    const linksBefore = JSON.stringify(state.get('links'))
    const links = { ...state.get('links') }
    const foreign = new Set(state.get('foreign'))
    const local = new Map(getHybridPlaylists().map((p) => [p.id, p]))
    let localChanged = false

    // Find SpotiTube playlists another computer put in the account.
    const linked = new Set(Object.values(links).map((l) => l.playlistId))
    const remotes = new Map<string, Remote>()
    /** Twins first seen in this pass: imported below, never mistaken for "deleted here". */
    const discovered = new Set<string>()
    for (const playlist of account) {
      const id = playlist.sourcePlaylistId
      if (linked.has(id) || foreign.has(id)) continue
      const remote = await this.fetchRemote(yt, id, playlist.name)
      if (!remote?.hybridId) {
        foreign.add(id)
        continue
      }
      remotes.set(id, remote)
      if (!links[remote.hybridId]) {
        links[remote.hybridId] = { playlistId: id, base: [], name: remote.title }
        discovered.add(remote.hybridId)
      }
    }
    state.set('foreign', [...foreign])

    for (const [hybridId, link] of Object.entries(links)) {
      const record = local.get(hybridId)
      const inAccount = titles.has(link.playlistId)

      if (!record) {
        if (discovered.has(hybridId)) continue
        // Deleted here since the last pass: remove its twin from the account too.
        if (inAccount) await this.edit(yt, '/playlist/delete', { playlistId: link.playlistId })
        delete links[hybridId]
        continue
      }

      // Looked up by id even when the listing missed it: a long library may be cut off, which must not delete anything.
      const remote =
        remotes.get(link.playlistId) ?? (await this.fetchRemote(yt, link.playlistId, titles.get(link.playlistId) ?? link.name))
      if (!remote) {
        // Listed but unreadable right now (a network hiccup): leave it for the next pass.
        if (inAccount) continue
        // The twin is gone: deleted in YouTube Music or on another computer, so delete it here too.
        local.delete(hybridId)
        delete links[hybridId]
        localChanged = true
        continue
      }
      const updated = await this.reconcile(yt, record, link, remote)
      if (updated) {
        local.set(hybridId, updated)
        localChanged = true
      }
    }

    // Playlists that exist only here (new, or from before sync was on) get a twin.
    for (const record of local.values()) {
      if (links[record.id]) continue
      const ids = await this.videoIdsOf(record.tracks)
      const created = await this.edit(yt, '/playlist/create', {
        title: record.name,
        description: description(record.id),
        privacyStatus: 'PRIVATE',
        videoIds: ids
      })
      const playlistId = (created as { playlistId?: string }).playlistId
      if (playlistId) links[record.id] = { playlistId, base: ids, name: record.name }
    }

    // Twins found in the account that have no playlist here yet come in as new playlists.
    for (const [hybridId, link] of Object.entries(links)) {
      if (local.has(hybridId)) continue
      const remote = remotes.get(link.playlistId)
      if (!remote) continue
      const now = Date.now()
      local.set(hybridId, {
        id: hybridId,
        name: remote.title,
        createdAt: hybridId === 'liked' ? 0 : now,
        updatedAt: now,
        tracks: remote.tracks
      })
      link.base = remote.tracks.map((t) => t.sourceTrackId)
      localChanged = true
    }

    state.set('links', links)
    if (localChanged) {
      this.writing = true
      try {
        saveHybridPlaylists([...local.values()].sort((a, b) => a.createdAt - b.createdAt))
      } finally {
        this.writing = false
      }
    }
    // New or dropped twins change which account playlists the library hides.
    if (localChanged || JSON.stringify(links) !== linksBefore) broadcast(IpcChannels.libraryChanged)
  }

  /** Merges one playlist both ways. Returns the new local record when this computer's copy changed. */
  private async reconcile(
    yt: Innertube,
    record: HybridPlaylistRecord,
    link: Link,
    remote: Remote
  ): Promise<HybridPlaylistRecord | null> {
    const localIds = await this.videoIdsOf(record.tracks)
    const remoteIds = remote.tracks.map((t) => t.sourceTrackId)
    const merged = mergeThreeWay(link.base, localIds, remoteIds)
    const mergedSet = new Set(merged)
    const inRemote = new Set(remoteIds)

    const additions = merged.filter((id) => !inRemote.has(id))
    const removals = remoteIds.filter((id) => !mergedSet.has(id))
    for (let i = 0; i < additions.length; i += EDIT_BATCH) {
      await this.edit(yt, '/browse/edit_playlist', {
        playlistId: link.playlistId,
        actions: additions.slice(i, i + EDIT_BATCH).map((id) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id }))
      })
    }
    for (let i = 0; i < removals.length; i += EDIT_BATCH) {
      await this.edit(yt, '/browse/edit_playlist', {
        playlistId: link.playlistId,
        actions: removals.slice(i, i + EDIT_BATCH).map((id) => ({ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: id }))
      })
    }

    // A rename on one side wins; renamed on both, this computer's name wins.
    let name = record.name
    if (record.name !== link.name) {
      if (remote.title !== record.name) {
        await this.edit(yt, '/browse/edit_playlist', {
          playlistId: link.playlistId,
          actions: [{ action: 'ACTION_SET_PLAYLIST_NAME', playlistName: record.name }]
        })
      }
    } else if (remote.title && remote.title !== link.name) {
      name = remote.title
    }

    // This computer keeps its own copies of tracks it had (and tracks with no YouTube id), plus the account's additions.
    const localById = new Map<string, UnifiedTrack>()
    record.tracks.forEach((track, i) => localById.set(localIds[i] ?? `local:${track.id}`, track))
    const remoteById = new Map(remote.tracks.map((t) => [t.sourceTrackId, t]))
    const kept = record.tracks.filter((_, i) => !localIds[i] || mergedSet.has(localIds[i]))
    const added = merged.filter((id) => !localById.has(id)).flatMap((id) => remoteById.get(id) ?? [])
    const tracks = [...kept, ...added]

    link.base = merged
    link.name = name
    const changed = name !== record.name || tracks.length !== record.tracks.length || added.length > 0
    return changed ? { ...record, name, tracks, updatedAt: Date.now() } : null
  }

  /** The YouTube video each track plays as; '' for a track with no match (kept here, not synced). */
  private async videoIdsOf(tracks: UnifiedTrack[]): Promise<string[]> {
    const cache = { ...state.get('videoIds') }
    const ids: string[] = []
    for (const track of tracks) {
      let id: string | undefined =
        getStreamOverride(track.id)?.videoId ??
        (track.source === 'ytmusic' && track.providerId !== 'demo' ? track.sourceTrackId : undefined) ??
        track.streamVideoId ??
        cache[track.id] ??
        this.deps.matcher.peek(track.id)?.videoId
      if (!id) {
        try {
          id = (await this.deps.matcher.acceptable(track))[0]?.videoId
        } catch {
          id = undefined
        }
      }
      if (id && track.source !== 'ytmusic') cache[track.id] = id
      ids.push(id ?? '')
    }
    state.set('videoIds', cache)
    return ids
  }

  /** A playlist in the account: its tracks, and which SpotiTube playlist it mirrors (if any). */
  private async fetchRemote(yt: Innertube, playlistId: string, title: string): Promise<Remote | null> {
    let playlist
    try {
      playlist = await yt.music.getPlaylist(playlistId)
    } catch {
      return null
    }
    let header = ''
    try {
      header = JSON.stringify(playlist.header ?? {})
    } catch {
      header = ''
    }
    const tracks = new Map<string, UnifiedTrack>()
    const add = (page: typeof playlist): number => {
      const before = tracks.size
      for (const item of collectListItems(page.items)) {
        const track = listItemToTrack(item)
        if (!tracks.has(track.sourceTrackId)) tracks.set(track.sourceTrackId, track)
      }
      return tracks.size - before
    }
    add(playlist)
    while (playlist.has_continuation && tracks.size < MAX_TRACKS) {
      playlist = await playlist.getContinuation()
      if (add(playlist) === 0) break
    }
    return { title, hybridId: MARKER.exec(header)?.[1] ?? null, tracks: [...tracks.values()] }
  }

  /** Account edits go out as YouTube Music's web client does them (cookie sessions can't use the TV client). */
  private async edit(yt: Innertube, endpoint: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await yt.actions.execute(endpoint, { ...body, client: 'YTMUSIC' })
    return response.data
  }
}
