import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { AppSettings, AppSettingsPatch } from '@core/ipc'
import type { StreamCandidate, UnifiedTrack } from '@core/types'

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
  autoplay: true
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

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.get('settings'), spotifyRedirectUri: SPOTIFY_REDIRECT_URI }
}

export function updateSettings(patch: AppSettingsPatch): AppSettings {
  const next: PersistedSettings = { ...DEFAULT_SETTINGS, ...store.get('settings') }
  if (patch.spotifyClientId !== undefined) next.spotifyClientId = patch.spotifyClientId.trim()
  if (patch.ytDlpPath !== undefined) next.ytDlpPath = patch.ytDlpPath.trim()
  if (patch.showDemoContent !== undefined) next.showDemoContent = patch.showDemoContent
  if (patch.closeToTray !== undefined) next.closeToTray = patch.closeToTray
  if (patch.syntheticFallback !== undefined) next.syntheticFallback = patch.syntheticFallback
  if (patch.autoUpdate !== undefined) next.autoUpdate = patch.autoUpdate
  if (patch.restoreSession !== undefined) next.restoreSession = patch.restoreSession
  if (patch.autoplay !== undefined) next.autoplay = patch.autoplay
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

export function saveHybridPlaylists(playlists: HybridPlaylistRecord[]): void {
  store.set('hybridPlaylists', playlists)
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
