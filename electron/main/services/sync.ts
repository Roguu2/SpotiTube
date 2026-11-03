import Store from 'electron-store'
import { BrowserWindow, dialog } from 'electron'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { join } from 'node:path'
import {
  IpcChannels,
  type AppSettings,
  type PlaybackSession,
  type PlayRecord,
  type SyncApplied,
  type SyncStatus
} from '@core/ipc'
import type { StreamCandidate } from '@core/types'
import {
  getHybridPlaylists,
  getSettings,
  getStreamOverrides,
  saveHybridPlaylists,
  setStreamOverride,
  updateSettings,
  type HybridPlaylistRecord
} from './store'
import { getPlays, getSession, isHistoryTrack, MAX_PLAYS, replacePlays } from './historyStore'

/**
 * Sync between computers through a folder the user already syncs (OneDrive,
 * Dropbox, iCloud Drive, Google Drive…). No server and no account: every
 * computer writes only its own file there, so cloud clients never see two
 * writers on one file, and merges everyone else's. The newest change wins per
 * playlist, per pinned version and for the settings block; deletions travel as
 * tombstones; listening history is a union. Secrets never leave this computer.
 */

const SYNC_DIR = 'SpotiTube Sync'
const DEVICES_DIR = 'devices'
const FILE_VERSION = 1
const INTERVAL_MS = 30_000
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60_000
/** A shared session carries the current track and this many after it. */
const SESSION_TRACKS = 300
/** Sessions older than this aren't offered for "Continue here". */
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60_000
/** Cloud clients add copies like "id (1).json" on conflicts; only our own names are read. */
const DEVICE_FILE = /^[a-f0-9-]{36}\.json$/

/** Settings that describe how you like to listen, not this machine. */
const SYNCED_SETTINGS = ['showDemoContent', 'syntheticFallback', 'autoUpdate', 'restoreSession', 'autoplay', 'smoothFades'] as const
type SyncedSettings = Pick<AppSettings, (typeof SYNCED_SETTINGS)[number]>

interface DeviceFile {
  version: number
  device: { id: string; name: string; platform: string }
  writtenAt: number
  hybridPlaylists: HybridPlaylistRecord[]
  deletedPlaylists: Record<string, number>
  overrides: Record<string, { candidate: StreamCandidate | null; updatedAt: number }>
  settings: { values: Partial<SyncedSettings>; updatedAt: number }
  plays: PlayRecord[]
  historyClearedAt: number
  session: PlaybackSession | null
}

/** What this computer last wrote, to tell its own changes apart from merged ones. */
interface ExportedSnapshot {
  playlists: Record<string, number>
  overrides: Record<string, string>
  settings: string
  playCount: number
}

interface SyncMeta {
  deviceId: string
  folder: string | null
  deletedPlaylists: Record<string, number>
  overrideStamps: Record<string, number>
  removedOverrides: Record<string, number>
  settingsUpdatedAt: number
  historyClearedAt: number
  exported: ExportedSnapshot | null
  lastSyncAt: number | null
}

const meta = new Store<SyncMeta>({
  name: 'sync',
  accessPropertiesByDotNotation: false,
  defaults: {
    deviceId: randomUUID(),
    folder: null,
    deletedPlaylists: {},
    overrideStamps: {},
    removedOverrides: {},
    settingsUpdatedAt: 0,
    historyClearedAt: 0,
    exported: null,
    lastSyncAt: null
  }
})

let timer: NodeJS.Timeout | null = null
let running: Promise<void> | null = null
let lastError: string | null = null
let remotes: DeviceFile[] = []

// ── Validation of other computers' files ─────────────────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
const isStamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

function stampMap(value: unknown): Record<string, number> {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => isStamp(entry[1])))
}

function isCandidate(value: unknown): value is StreamCandidate {
  return isObject(value) && typeof value.videoId === 'string' && typeof value.title === 'string' && Array.isArray(value.artists)
}

function isPlaylist(value: unknown): value is HybridPlaylistRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isStamp(value.createdAt) &&
    isStamp(value.updatedAt) &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isHistoryTrack)
  )
}

function parseDeviceFile(raw: string): DeviceFile | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(data) || data.version !== FILE_VERSION || !isObject(data.device) || typeof data.device.id !== 'string') {
    return null
  }
  const overrides: DeviceFile['overrides'] = {}
  if (isObject(data.overrides)) {
    for (const [trackId, entry] of Object.entries(data.overrides)) {
      if (!isObject(entry) || !isStamp(entry.updatedAt)) continue
      if (entry.candidate === null || isCandidate(entry.candidate)) {
        overrides[trackId] = { candidate: entry.candidate as StreamCandidate | null, updatedAt: entry.updatedAt }
      }
    }
  }
  const settings = isObject(data.settings) ? data.settings : {}
  const values: Partial<SyncedSettings> = {}
  if (isObject(settings.values)) {
    for (const key of SYNCED_SETTINGS) {
      if (typeof settings.values[key] === 'boolean') values[key] = settings.values[key]
    }
  }
  const session =
    isObject(data.session) &&
    Array.isArray(data.session.queue) &&
    Array.isArray(data.session.order) &&
    Number.isInteger(data.session.position) &&
    (data.session.position as number) >= 0 &&
    (data.session.position as number) < data.session.order.length &&
    isStamp(data.session.savedAt)
      ? (data.session as unknown as PlaybackSession)
      : null
  return {
    version: FILE_VERSION,
    device: {
      id: data.device.id,
      name: typeof data.device.name === 'string' ? data.device.name.slice(0, 80) : 'Another computer',
      platform: typeof data.device.platform === 'string' ? data.device.platform : ''
    },
    writtenAt: isStamp(data.writtenAt) ? data.writtenAt : 0,
    hybridPlaylists: Array.isArray(data.hybridPlaylists) ? data.hybridPlaylists.filter(isPlaylist) : [],
    deletedPlaylists: stampMap(data.deletedPlaylists),
    overrides,
    settings: { values, updatedAt: isStamp(settings.updatedAt) ? settings.updatedAt : 0 },
    plays: Array.isArray(data.plays)
      ? data.plays.filter((p): p is PlayRecord => isObject(p) && isStamp(p.playedAt) && isHistoryTrack(p.track))
      : [],
    historyClearedAt: isStamp(data.historyClearedAt) ? data.historyClearedAt : 0,
    session:
      session && session.queue.every(isHistoryTrack) && session.order.every((i) => Number.isInteger(i) && i >= 0 && i < session.queue.length)
        ? session
        : null
  }
}

// ── Local state ──────────────────────────────────────────────────────────────

function syncedSettings(): SyncedSettings {
  const settings = getSettings()
  return Object.fromEntries(SYNCED_SETTINGS.map((key) => [key, settings[key]])) as SyncedSettings
}

function snapshot(): ExportedSnapshot {
  return {
    playlists: Object.fromEntries(getHybridPlaylists().map((p) => [p.id, p.updatedAt])),
    overrides: Object.fromEntries(Object.entries(getStreamOverrides()).map(([id, c]) => [id, JSON.stringify(c)])),
    settings: JSON.stringify(syncedSettings()),
    playCount: getPlays().length
  }
}

/** Stamps whatever changed here since the last export, including deletions. */
function noteLocalChanges(now: number): void {
  const exported = meta.get('exported')
  const current = snapshot()
  const deleted = { ...meta.get('deletedPlaylists') }
  const stamps = { ...meta.get('overrideStamps') }
  const removed = { ...meta.get('removedOverrides') }

  if (!exported) {
    // Joining a sync: this computer's existing choices count as old, so what's already shared wins.
    for (const id of Object.keys(current.overrides)) stamps[id] ??= 1
  } else {
    for (const id of Object.keys(exported.playlists)) if (!(id in current.playlists)) deleted[id] = now
    for (const [id, json] of Object.entries(current.overrides)) {
      if (exported.overrides[id] !== json) {
        stamps[id] = now
        delete removed[id]
      }
    }
    for (const id of Object.keys(exported.overrides)) {
      if (!(id in current.overrides)) {
        removed[id] = now
        delete stamps[id]
      }
    }
    if (exported.settings !== current.settings) meta.set('settingsUpdatedAt', now)
    if (exported.playCount > 0 && current.playCount === 0) meta.set('historyClearedAt', now)
  }

  // Old tombstones have reached every computer by now.
  const fresh = (map: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(map).filter(([, at]) => now - at < TOMBSTONE_TTL_MS))
  meta.set('deletedPlaylists', fresh(deleted))
  meta.set('overrideStamps', stamps)
  meta.set('removedOverrides', fresh(removed))
}

/** Merges other computers' changes in. Returns what changed here, so the renderer can reload. */
function mergeRemotes(files: DeviceFile[]): SyncApplied {
  const applied: SyncApplied = { library: false, history: false, settings: false }

  // Playlists: newest version of each wins; a later deletion beats an earlier edit.
  const tombstones = { ...meta.get('deletedPlaylists') }
  for (const file of files) {
    for (const [id, at] of Object.entries(file.deletedPlaylists)) tombstones[id] = Math.max(tombstones[id] ?? 0, at)
  }
  const local = getHybridPlaylists()
  const best = new Map(local.map((p) => [p.id, p]))
  for (const file of files) {
    for (const playlist of file.hybridPlaylists) {
      const mine = best.get(playlist.id)
      if (!mine || playlist.updatedAt > mine.updatedAt) best.set(playlist.id, playlist)
    }
  }
  const merged = [...best.values()]
    .filter((p) => !(tombstones[p.id] !== undefined && tombstones[p.id] >= p.updatedAt))
    .sort((a, b) => a.createdAt - b.createdAt)
  const signature = (list: HybridPlaylistRecord[]): string => JSON.stringify(list.map((p) => [p.id, p.updatedAt]))
  if (signature(merged) !== signature([...local].sort((a, b) => a.createdAt - b.createdAt))) {
    saveHybridPlaylists(merged)
    applied.library = true
  }
  meta.set('deletedPlaylists', tombstones)

  // Pinned versions: newest choice (or removal) per track wins.
  const stamps = { ...meta.get('overrideStamps') }
  const removed = { ...meta.get('removedOverrides') }
  for (const file of files) {
    for (const [trackId, { candidate, updatedAt }] of Object.entries(file.overrides)) {
      if (updatedAt <= Math.max(stamps[trackId] ?? 0, removed[trackId] ?? 0)) continue
      setStreamOverride(trackId, candidate)
      if (candidate) {
        stamps[trackId] = updatedAt
        delete removed[trackId]
      } else {
        removed[trackId] = updatedAt
        delete stamps[trackId]
      }
      applied.library = true
    }
  }
  meta.set('overrideStamps', stamps)
  meta.set('removedOverrides', removed)

  // Settings: the most recently changed block wins.
  const newest = files.reduce<DeviceFile | null>(
    (top, file) => (file.settings.updatedAt > (top?.settings.updatedAt ?? meta.get('settingsUpdatedAt')) ? file : top),
    null
  )
  if (newest && Object.keys(newest.settings.values).length) {
    updateSettings(newest.settings.values)
    meta.set('settingsUpdatedAt', newest.settings.updatedAt)
    applied.settings = true
  }

  // History: everyone's plays together, minus anything from before the latest "clear".
  const clearedAt = Math.max(meta.get('historyClearedAt'), ...files.map((f) => f.historyClearedAt))
  const plays = getPlays()
  const seen = new Set<string>()
  const union = [...plays, ...files.flatMap((f) => f.plays)]
    .filter((p) => p.playedAt > clearedAt)
    .filter((p) => {
      const key = `${p.track.id}|${p.playedAt}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, MAX_PLAYS)
  if (union.length !== plays.length || union.some((p, i) => p.playedAt !== plays[i].playedAt || p.track.id !== plays[i].track.id)) {
    replacePlays(union)
    applied.history = true
  }
  meta.set('historyClearedAt', clearedAt)

  return applied
}

/** The current track and what follows it, small enough to share. */
function shareableSession(): PlaybackSession | null {
  const session = getSession()
  if (!session || !session.order.length) return null
  const indices = session.order.slice(session.position, session.position + SESSION_TRACKS)
  return {
    queue: indices.map((i) => session.queue[i]),
    order: indices.map((_, i) => i),
    position: 0,
    manual: [],
    context: session.context,
    shuffle: session.shuffle,
    repeat: session.repeat,
    currentTime: session.currentTime,
    savedAt: session.savedAt
  }
}

function deviceFile(now: number): DeviceFile {
  const overrides: DeviceFile['overrides'] = {}
  const stamps = meta.get('overrideStamps')
  for (const [trackId, candidate] of Object.entries(getStreamOverrides())) {
    overrides[trackId] = { candidate, updatedAt: stamps[trackId] ?? 1 }
  }
  for (const [trackId, at] of Object.entries(meta.get('removedOverrides'))) overrides[trackId] = { candidate: null, updatedAt: at }
  return {
    version: FILE_VERSION,
    device: { id: meta.get('deviceId'), name: hostname(), platform: process.platform },
    writtenAt: now,
    hybridPlaylists: getHybridPlaylists(),
    deletedPlaylists: meta.get('deletedPlaylists'),
    overrides,
    settings: { values: syncedSettings(), updatedAt: meta.get('settingsUpdatedAt') },
    plays: getPlays(),
    historyClearedAt: meta.get('historyClearedAt'),
    session: shareableSession()
  }
}

function devicesDir(folder: string): string {
  return join(folder, SYNC_DIR, DEVICES_DIR)
}

function ownFile(folder: string): string {
  return join(devicesDir(folder), `${meta.get('deviceId')}.json`)
}

async function readRemotes(folder: string): Promise<DeviceFile[]> {
  const dir = devicesDir(folder)
  const own = `${meta.get('deviceId')}.json`
  const names = (await readdir(dir)).filter((name) => DEVICE_FILE.test(name) && name !== own)
  const files = await Promise.all(
    names.map(async (name) => {
      try {
        const path = join(dir, name)
        if (!(await stat(path)).isFile()) return null
        return parseDeviceFile(await readFile(path, 'utf8'))
      } catch {
        return null
      }
    })
  )
  return files.filter((file): file is DeviceFile => file !== null && file.device.id !== meta.get('deviceId'))
}

// ── Running ──────────────────────────────────────────────────────────────────

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

async function syncOnce(): Promise<void> {
  const folder = meta.get('folder')
  if (!folder) return
  try {
    const now = Date.now()
    await mkdir(devicesDir(folder), { recursive: true })
    noteLocalChanges(now)
    remotes = await readRemotes(folder)
    const applied = mergeRemotes(remotes)
    // Write through a temporary name so a cloud client never uploads half a file.
    const target = ownFile(folder)
    await writeFile(`${target}.tmp`, JSON.stringify(deviceFile(now)))
    await rename(`${target}.tmp`, target)
    meta.set('exported', snapshot())
    meta.set('lastSyncAt', now)
    lastError = null
    if (applied.library || applied.history || applied.settings) broadcast(IpcChannels.syncApplied, applied)
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
  }
  broadcast(IpcChannels.syncStatusChanged, getSyncStatus())
}

export function runSync(): Promise<void> {
  running ??= syncOnce().finally(() => {
    running = null
  })
  return running
}

export function getSyncStatus(): SyncStatus {
  const folder = meta.get('folder')
  const localSavedAt = getSession()?.savedAt ?? 0
  const now = Date.now()
  return {
    enabled: folder !== null,
    folder,
    deviceName: hostname(),
    lastSyncAt: meta.get('lastSyncAt'),
    error: lastError,
    devices: remotes
      .map((file) => ({ id: file.device.id, name: file.device.name, platform: file.device.platform, lastSeenAt: file.writtenAt }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    sessions: remotes
      .filter((file) => file.session && file.session.savedAt > localSavedAt && now - file.session.savedAt < SESSION_MAX_AGE_MS)
      .map((file) => {
        const session = file.session as PlaybackSession
        const track = session.queue[session.order[session.position]]
        return {
          deviceId: file.device.id,
          deviceName: file.device.name,
          savedAt: session.savedAt,
          currentTime: session.currentTime,
          track: { title: track.title, artists: track.artists.map((a) => a.name).join(', '), artworkUrl: track.artworkUrl }
        }
      })
      .sort((a, b) => b.savedAt - a.savedAt)
  }
}

export function getRemoteSession(deviceId: string): PlaybackSession | null {
  return remotes.find((file) => file.device.id === deviceId)?.session ?? null
}

export function startSync(): void {
  if (timer) return
  timer = setInterval(() => void runSync(), INTERVAL_MS)
  void runSync()
}

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export async function chooseSyncFolder(): Promise<SyncStatus> {
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options = {
    title: 'Choose a folder to sync SpotiTube through',
    buttonLabel: 'Sync here',
    properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  if (result.canceled || !result.filePaths[0]) return getSyncStatus()
  if (result.filePaths[0] !== meta.get('folder')) {
    meta.set('folder', result.filePaths[0])
    // A new folder means joining whatever is there afresh.
    meta.set('exported', null)
    remotes = []
  }
  startSync()
  await runSync()
  return getSyncStatus()
}

export function stopSyncing(): SyncStatus {
  stopTimer()
  meta.set('folder', null)
  meta.set('exported', null)
  remotes = []
  lastError = null
  return getSyncStatus()
}

/** On quit: write this computer's file one last time, synchronously. */
export function flushSync(): void {
  const folder = meta.get('folder')
  stopTimer()
  if (!folder) return
  try {
    const now = Date.now()
    mkdirSync(devicesDir(folder), { recursive: true })
    noteLocalChanges(now)
    const target = ownFile(folder)
    writeFileSync(`${target}.tmp`, JSON.stringify(deviceFile(now)))
    renameSync(`${target}.tmp`, target)
    meta.set('exported', snapshot())
  } catch {
    // The next launch syncs again.
  }
}

export function initSync(): void {
  if (meta.get('folder')) startSync()
}
