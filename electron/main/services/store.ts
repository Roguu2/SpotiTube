import Store from 'electron-store'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import type { AppSettings, AppSettingsPatch } from '@core/ipc'
import type { StreamCandidate, UnifiedTrack } from '@core/types'
import { ytDlpPathProblem } from './ytdlp'

export const SPOTIFY_REDIRECT_PORT = 43821
export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_REDIRECT_PORT}/callback`

type PersistedSettings = Omit<AppSettings, 'spotifyRedirectUri'>

export interface HybridPlaylistRecord {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  tracks: UnifiedTrack[]
}

interface SecretEnvelope {
  /** base64 payload; encrypted with the OS keychain when `encrypted` is true. */
  value: string
  encrypted: boolean
}

interface PersistedState {
  settings: PersistedSettings
  secrets: Partial<Record<SecretKey, SecretEnvelope>>
  profiles: { spotify?: string; ytmusic?: string }
  hybridPlaylists: HybridPlaylistRecord[]
  streamOverrides: Record<string, StreamCandidate>
}

export type SecretKey = 'spotifyTokens' | 'ytmusicCookie'

const DEFAULT_SETTINGS: PersistedSettings = {
  spotifyClientId: '',
  ytDlpPath: '',
  showDemoContent: true,
  closeToTray: false,
  syntheticFallback: true,
  autoUpdate: true,
  restoreSession: true,
  autoplay: true,
  smoothFades: true,
  discordPresence: false,
  trackNotifications: false,
  ytmusicSync: false
}

const store = new Store<PersistedState>({
  name: 'spotitube',
  // Track ids contain characters that must not be interpreted as key paths.
  accessPropertiesByDotNotation: false,
  defaults: {
    settings: DEFAULT_SETTINGS,
    secrets: {},
    profiles: {},
    hybridPlaylists: [],
    streamOverrides: {}
  }
})

/**
 * Drops what removed features left behind: the phone remote's setting and
 * pairing secret, and the folder sync's state file. Safe to run every launch.
 */
export function cleanUpRemovedFeatures(): void {
  const settings = store.get('settings') as PersistedSettings & { remoteEnabled?: unknown }
  if ('remoteEnabled' in settings) {
    const { remoteEnabled: _remoteEnabled, ...rest } = settings
    store.set('settings', rest)
  }
  const secrets = store.get('secrets') as Record<string, unknown>
  if ('remoteToken' in secrets) {
    const { remoteToken: _remoteToken, ...rest } = secrets
    store.set('secrets', rest as PersistedState['secrets'])
  }
  rmSync(join(app.getPath('userData'), 'sync.json'), { force: true })
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings'), spotifyRedirectUri: SPOTIFY_REDIRECT_URI }
}

export function updateSettings(patch: AppSettingsPatch): AppSettings {
  const next: PersistedSettings = { ...DEFAULT_SETTINGS, ...store.get('settings') }
  if (patch.spotifyClientId !== undefined) next.spotifyClientId = patch.spotifyClientId.trim()
  if (patch.ytDlpPath !== undefined) {
    const path = String(patch.ytDlpPath).trim()
    // This path gets run as a program, so it must really be yt-dlp.
    const problem = ytDlpPathProblem(path)
    if (problem) throw new Error(problem)
    next.ytDlpPath = path
  }
  if (patch.showDemoContent !== undefined) next.showDemoContent = patch.showDemoContent
  if (patch.closeToTray !== undefined) next.closeToTray = patch.closeToTray
  if (patch.syntheticFallback !== undefined) next.syntheticFallback = patch.syntheticFallback
  if (patch.autoUpdate !== undefined) next.autoUpdate = patch.autoUpdate
  if (patch.restoreSession !== undefined) next.restoreSession = patch.restoreSession
  if (patch.autoplay !== undefined) next.autoplay = patch.autoplay
  if (patch.smoothFades !== undefined) next.smoothFades = patch.smoothFades
  if (patch.discordPresence !== undefined) next.discordPresence = patch.discordPresence
  if (patch.trackNotifications !== undefined) next.trackNotifications = patch.trackNotifications
  if (patch.ytmusicSync !== undefined) next.ytmusicSync = patch.ytmusicSync
  store.set('settings', next)
  return getSettings()
}

/** Stores a secret encrypted with the OS keychain (DPAPI / Keychain / libsecret) when available. */
export function setSecret(key: SecretKey, value: string | null): void {
  const secrets = { ...store.get('secrets') }
  if (value === null) {
    delete secrets[key]
  } else if (safeStorage.isEncryptionAvailable()) {
    secrets[key] = { value: safeStorage.encryptString(value).toString('base64'), encrypted: true }
  } else {
    secrets[key] = { value: Buffer.from(value, 'utf8').toString('base64'), encrypted: false }
  }
  store.set('secrets', secrets)
}

export function getSecret(key: SecretKey): string | null {
  const envelope = store.get('secrets')[key]
  if (!envelope) return null
  const raw = Buffer.from(envelope.value, 'base64')
  try {
    return envelope.encrypted ? safeStorage.decryptString(raw) : raw.toString('utf8')
  } catch {
    // Keychain changed (e.g. profile restored on another machine) — the secret is unrecoverable.
    setSecret(key, null)
    return null
  }
}

export function getProfileName(provider: 'spotify' | 'ytmusic'): string | undefined {
  return store.get('profiles')[provider]
}

export function setProfileName(provider: 'spotify' | 'ytmusic', name: string | undefined): void {
  const profiles = { ...store.get('profiles') }
  if (name) profiles[provider] = name
  else delete profiles[provider]
  store.set('profiles', profiles)
}

export function getHybridPlaylists(): HybridPlaylistRecord[] {
  return store.get('hybridPlaylists')
}

const hybridListeners = new Set<() => void>()

export function saveHybridPlaylists(playlists: HybridPlaylistRecord[]): void {
  store.set('hybridPlaylists', playlists)
  for (const listener of hybridListeners) listener()
}

/** Called after every change to SpotiTube's own playlists (for pushing them to YouTube Music). */
export function onHybridPlaylistsChanged(listener: () => void): () => void {
  hybridListeners.add(listener)
  return () => hybridListeners.delete(listener)
}

export function getStreamOverrides(): Record<string, StreamCandidate> {
  return store.get('streamOverrides')
}

export function getStreamOverride(trackId: string): StreamCandidate | undefined {
  return store.get('streamOverrides')[trackId]
}

export function setStreamOverride(trackId: string, candidate: StreamCandidate | null): void {
  const overrides = { ...store.get('streamOverrides') }
  if (candidate) overrides[trackId] = candidate
  else delete overrides[trackId]
  store.set('streamOverrides', overrides)
}
