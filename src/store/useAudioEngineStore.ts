import { create } from 'zustand'
import {
  BUILT_IN_EQ_PRESETS,
  DEFAULT_DSP,
  DSP_PRESETS,
  EMPTY_LOOP,
  sanitizeDsp,
  type DspPresetId,
  type DspSettings,
  type EqPreset,
  type LoopRegion,
  type ReverbSettings
} from '@core/dsp'
import { getAudioEngine, type AudioEngine, type TransportState } from '@/audio/AudioEngine'

const SAVE_DEBOUNCE_MS = 400
const VOLUME_KEY = 'spotitube.volume'

interface StoredVolume {
  volume: number
  muted: boolean
}

function readVolume(): StoredVolume {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? 'null') as Partial<StoredVolume> | null
    if (parsed && typeof parsed.volume === 'number') {
      return { volume: Math.min(1, Math.max(0, parsed.volume)), muted: parsed.muted === true }
    }
  } catch {
    // Storage unavailable or corrupted: fall through to defaults.
  }
  return { volume: 0.8, muted: false }
}

function writeVolume(value: StoredVolume): void {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(value))
  } catch {
    // Volume is a convenience; losing it is harmless.
  }
}

interface AudioEngineState {
  hydrated: boolean
  transport: TransportState
  dsp: DspSettings
  loop: LoopRegion
  volume: number
  muted: boolean
  customPresets: EqPreset[]
  rememberPerTrack: boolean
  currentTrackId: string | null
  /** The current track has its own saved settings. */
  hasTrackProfile: boolean
  pitchShiftAvailable: boolean

  init(): Promise<void>
  loadTrack(trackId: string, src: string, options?: { autoplay?: boolean; startAt?: number }): Promise<void>
  play(): Promise<void>
  pause(): void
  toggle(): Promise<void>
  stop(): void
  seek(seconds: number): void
  setVolume(volume: number): void
  toggleMute(): void

  setSpeed(speed: number): void
  setPitch(semitones: number): void
  setLinked(linked: boolean): void
  setEqBand(index: number, gainDb: number): void
  applyEqPreset(name: string): void
  setPreamp(gainDb: number): void
  setReverb(patch: Partial<ReverbSettings>): void
  applyDspPreset(id: DspPresetId): void

  saveCustomPreset(name: string): Promise<void>
  deleteCustomPreset(name: string): Promise<void>

  markA(): void
  markB(): void
  setLoop(loop: LoopRegion): void
  toggleLoop(): void
  clearLoop(): void

  setRememberPerTrack(enabled: boolean): Promise<void>
  /** Saves the current settings as the default for tracks without their own profile. */
  saveAsDefault(): Promise<void>
  /** Forgets the current track's profile and reverts to the defaults. */
  resetTrackSettings(): Promise<void>
}

let engine: AudioEngine | null = null
let globalDsp: DspSettings = sanitizeDsp(DEFAULT_DSP)
let saveTimer: number | null = null
let pendingSave: (() => Promise<void>) | null = null

function requireEngine(): AudioEngine {
  if (!engine) throw new Error('Audio engine is not initialised')
  return engine
}

async function flushSave(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
  const save = pendingSave
  pendingSave = null
  if (save) await save().catch((error: unknown) => console.error('Failed to save DSP settings:', error))
}

export const useAudioEngineStore = create<AudioEngineState>((set, get) => {
  /** Persists the current DSP/loop state where it belongs, debounced across slider drags. */
  const schedulePersist = (): void => {
    const { rememberPerTrack, currentTrackId, dsp, loop } = get()
    if (rememberPerTrack && currentTrackId) {
      pendingSave = () => window.electronAPI.dsp.saveTrackProfile(currentTrackId, { dsp, loop })
      set({ hasTrackProfile: true })
    } else {
      globalDsp = dsp
      pendingSave = () => window.electronAPI.dsp.saveGlobal(dsp)
    }
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS)
  }

  const commitDsp = (next: DspSettings): void => {
    const e = requireEngine()
    e.setSettings(next)
    set({ dsp: e.getSettings() })
    schedulePersist()
  }

  const commitLoop = (next: LoopRegion): void => {
    const e = requireEngine()
    e.setLoop(next)
    set({ loop: e.getLoop() })
    schedulePersist()
  }

  return {
    hydrated: false,
    transport: {
      src: null,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      bufferedAhead: 0,
      ended: false,
      error: null
    },
    dsp: sanitizeDsp(DEFAULT_DSP),
    loop: { ...EMPTY_LOOP },
    ...readVolume(),
    customPresets: [],
    rememberPerTrack: true,
    currentTrackId: null,
    hasTrackProfile: false,
    pitchShiftAvailable: false,

    async init() {
      if (engine) return
      engine = getAudioEngine()
      const state = await window.electronAPI.dsp.getState()
      globalDsp = state.global
      engine.setSettings(state.global)
      const { volume, muted } = get()
      engine.setVolume(volume)
      engine.setMuted(muted)
      engine.subscribe((transport) => {
        set({ transport, pitchShiftAvailable: engine?.pitchShiftAvailable ?? false })
      })
      set({
        hydrated: true,
        dsp: engine.getSettings(),
        customPresets: state.customPresets,
        rememberPerTrack: state.rememberPerTrack
      })
    },

    async loadTrack(trackId, src, options) {
      const e = requireEngine()
      await flushSave()

      const profile = get().rememberPerTrack ? await window.electronAPI.dsp.getTrackProfile(trackId) : null
      e.setSettings(profile?.dsp ?? globalDsp)
      e.setLoop(profile?.loop ?? EMPTY_LOOP)
      set({
        currentTrackId: trackId,
        hasTrackProfile: profile !== null,
        dsp: e.getSettings(),
        loop: e.getLoop()
      })

      // Resume an A-B loop at A rather than at the start of the track.
      const loop = e.getLoop()
      const startAt = options?.startAt ?? (loop.enabled && loop.a !== null ? loop.a : 0)
      await e.load(src, { autoplay: options?.autoplay ?? true, startAt })
    },

    play: () => requireEngine().play(),
    pause: () => requireEngine().pause(),
    toggle: () => requireEngine().toggle(),
    stop: () => {
      requireEngine().stop()
      set({ currentTrackId: null, hasTrackProfile: false })
    },
    seek: (seconds) => requireEngine().seek(seconds),

    setVolume(volume) {
      const e = requireEngine()
      e.setVolume(volume)
      const muted = volume > 0 ? false : get().muted
      e.setMuted(muted)
      set({ volume, muted })
      writeVolume({ volume, muted })
    },

    toggleMute() {
      const muted = !get().muted
      requireEngine().setMuted(muted)
      set({ muted })
      writeVolume({ volume: get().volume, muted })
    },

    setSpeed: (speed) => commitDsp({ ...get().dsp, speed }),
    setPitch: (pitch) => commitDsp({ ...get().dsp, pitch }),
    setLinked: (linked) => commitDsp({ ...get().dsp, linked }),
    setEqBand(index, gainDb) {
      const eq = [...get().dsp.eq]
      eq[index] = gainDb
      commitDsp({ ...get().dsp, eq, eqPreset: null })
    },
    applyEqPreset(name) {
      const preset = [...BUILT_IN_EQ_PRESETS, ...get().customPresets].find((p) => p.name === name)
      if (!preset) return
      commitDsp({ ...get().dsp, eq: [...preset.gains], eqPreset: preset.name })
    },
    setPreamp: (preampDb) => commitDsp({ ...get().dsp, preampDb }),
    setReverb: (patch) => commitDsp({ ...get().dsp, reverb: { ...get().dsp.reverb, ...patch } }),
    applyDspPreset: (id) => commitDsp(DSP_PRESETS[id].apply(get().dsp)),

    async saveCustomPreset(name) {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Preset name cannot be empty')
      if (BUILT_IN_EQ_PRESETS.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error(`"${trimmed}" is a built-in preset name`)
      }
      const others = get().customPresets.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase())
      const presets = await window.electronAPI.dsp.saveCustomPresets([
        ...others,
        { name: trimmed, gains: [...get().dsp.eq], builtIn: false }
      ])
      set({ customPresets: presets })
      commitDsp({ ...get().dsp, eqPreset: trimmed })
    },

    async deleteCustomPreset(name) {
      const presets = await window.electronAPI.dsp.saveCustomPresets(
        get().customPresets.filter((p) => p.name !== name)
      )
      set({ customPresets: presets })
      if (get().dsp.eqPreset === name) commitDsp({ ...get().dsp, eqPreset: null })
    },

    markA: () => commitLoop(requireEngine().markA()),
    markB: () => commitLoop(requireEngine().markB()),
    setLoop: (loop) => commitLoop(loop),
    toggleLoop() {
      const loop = get().loop
      if (loop.a === null || loop.b === null) return
      commitLoop({ ...loop, enabled: !loop.enabled })
    },
    clearLoop: () => commitLoop({ ...EMPTY_LOOP }),

    async setRememberPerTrack(enabled) {
      await flushSave()
      await window.electronAPI.dsp.setRememberPerTrack(enabled)
      set({ rememberPerTrack: enabled, hasTrackProfile: enabled ? get().hasTrackProfile : false })
    },

    async saveAsDefault() {
      await flushSave()
      globalDsp = get().dsp
      await window.electronAPI.dsp.saveGlobal(globalDsp)
    },

    async resetTrackSettings() {
      const { currentTrackId } = get()
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveTimer = null
      pendingSave = null
      if (currentTrackId) await window.electronAPI.dsp.saveTrackProfile(currentTrackId, null)
      const e = requireEngine()
      e.setSettings(globalDsp)
      e.setLoop(EMPTY_LOOP)
      set({ dsp: e.getSettings(), loop: e.getLoop(), hasTrackProfile: false })
    }
  }
})
