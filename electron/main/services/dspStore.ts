import Store from 'electron-store'
import {
  DEFAULT_DSP,
  isDefaultDsp,
  sanitizeDsp,
  sanitizeLoop,
  sanitizePresets,
  type DspPersistedState,
  type DspSettings,
  type EqPreset,
  type TrackDspProfile
} from '@core/dsp'

/** Oldest profiles are evicted beyond this many tracks. */
const MAX_PROFILES = 5_000

interface DspStoreSchema {
  global: DspSettings
  customPresets: EqPreset[]
  rememberPerTrack: boolean
  profiles: Record<string, TrackDspProfile>
}

// A dedicated file: profiles can number in the thousands and are written often,
// so they must not force rewrites of the main settings file.
const store = new Store<DspStoreSchema>({
  name: 'dsp-profiles',
  accessPropertiesByDotNotation: false,
  defaults: {
    global: { ...DEFAULT_DSP, eq: [...DEFAULT_DSP.eq], reverb: { ...DEFAULT_DSP.reverb } },
    customPresets: [],
    rememberPerTrack: true,
    profiles: {}
  }
})

export function getDspState(): DspPersistedState {
  return {
    global: sanitizeDsp(store.get('global')),
    customPresets: sanitizePresets(store.get('customPresets')),
    rememberPerTrack: store.get('rememberPerTrack')
  }
}

export function saveGlobalDsp(settings: unknown): void {
  store.set('global', sanitizeDsp(settings))
}

export function setRememberPerTrack(enabled: boolean): void {
  store.set('rememberPerTrack', enabled)
}

export function saveCustomPresets(presets: unknown): EqPreset[] {
  const clean = sanitizePresets(presets)
  store.set('customPresets', clean)
  return clean
}

export function getTrackProfile(trackId: string): TrackDspProfile | null {
  const profile = store.get('profiles')[trackId]
  if (!profile) return null
  return { dsp: sanitizeDsp(profile.dsp), loop: sanitizeLoop(profile.loop), updatedAt: profile.updatedAt }
}

/**
 * Saves (or with `null`, forgets) a track's settings. A profile that is
 * indistinguishable from defaults with no loop is removed instead of stored.
 */
export function saveTrackProfile(trackId: string, input: { dsp: unknown; loop: unknown } | null): void {
  const profiles = { ...store.get('profiles') }

  if (input === null) {
    delete profiles[trackId]
  } else {
    const dsp = sanitizeDsp(input.dsp)
    const loop = sanitizeLoop(input.loop)
    if (isDefaultDsp(dsp) && loop.a === null && loop.b === null) {
      delete profiles[trackId]
    } else {
      profiles[trackId] = { dsp, loop, updatedAt: Date.now() }
    }
  }

  const ids = Object.keys(profiles)
  if (ids.length > MAX_PROFILES) {
    ids
      .sort((x, y) => profiles[x].updatedAt - profiles[y].updatedAt)
      .slice(0, ids.length - MAX_PROFILES)
      .forEach((id) => delete profiles[id])
  }
  store.set('profiles', profiles)
}
