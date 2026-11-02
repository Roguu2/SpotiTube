/**
 * DSP settings model shared by the renderer's audio engine and the main
 * process, which persists per-track profiles. Pure data and math only.
 */

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const
export const EQ_BAND_COUNT = EQ_FREQUENCIES.length
export const EQ_GAIN_LIMIT_DB = 12
export const PREAMP_LIMIT_DB = 12
export const SPEED_MIN = 0.5
export const SPEED_MAX = 2
export const PITCH_LIMIT_SEMITONES = 12
export const REVERB_DECAY_MIN = 0.3
export const REVERB_DECAY_MAX = 8

export interface ReverbSettings {
  /** 0 = dry, 1 = fully wet. */
  mix: number
  /** RT60-style tail length in seconds. */
  decay: number
  /** Gap before the tail starts, in milliseconds. */
  preDelayMs: number
  /** 0..1 — how quickly high frequencies die out in the tail. */
  damping: number
}

export interface DspSettings {
  /** Playback rate, 0.5–2.0. */
  speed: number
  /** Pitch shift in semitones when not linked to speed. */
  pitch: number
  /** Linked = tape/vinyl behaviour: speed changes pitch together. */
  linked: boolean
  /** One gain (dB) per {@link EQ_FREQUENCIES} band. */
  eq: number[]
  /** Name of the EQ preset the gains came from, or `null` once edited by hand. */
  eqPreset: string | null
  preampDb: number
  reverb: ReverbSettings
}

export interface LoopRegion {
  /** Seconds, or `null` when unset. */
  a: number | null
  b: number | null
  enabled: boolean
}

/** Everything remembered for a single track. */
export interface TrackDspProfile {
  dsp: DspSettings
  loop: LoopRegion
  updatedAt: number
}

export interface EqPreset {
  name: string
  gains: number[]
  builtIn: boolean
}

export interface DspPersistedState {
  global: DspSettings
  customPresets: EqPreset[]
  rememberPerTrack: boolean
}

export const FLAT_EQ: readonly number[] = Object.freeze(new Array<number>(EQ_BAND_COUNT).fill(0))

export const BUILT_IN_EQ_PRESETS: readonly EqPreset[] = Object.freeze([
  { name: 'Flat', gains: [...FLAT_EQ], builtIn: true },
  { name: 'Bass Boost', gains: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0], builtIn: true },
  { name: 'Vocal', gains: [-3, -2, -1, 1, 3, 4, 4, 3, 1, 0], builtIn: true },
  { name: 'Electronic', gains: [5, 4, 1, 0, -2, 1, 1, 2, 4, 5], builtIn: true },
  { name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7], builtIn: true },
  { name: 'Loudness', gains: [6, 4, 0, 0, -2, 0, -1, 0, 4, 5], builtIn: true },
  { name: 'Acoustic', gains: [4, 3, 2, 1, 1, 1, 2, 3, 3, 2], builtIn: true }
])

export const DEFAULT_REVERB: ReverbSettings = Object.freeze({ mix: 0, decay: 2.4, preDelayMs: 20, damping: 0.5 })

export const DEFAULT_DSP: DspSettings = Object.freeze({
  speed: 1,
  pitch: 0,
  linked: false,
  eq: [...FLAT_EQ],
  eqPreset: 'Flat',
  preampDb: 0,
  reverb: { ...DEFAULT_REVERB }
}) as DspSettings

export const EMPTY_LOOP: LoopRegion = Object.freeze({ a: null, b: null, enabled: false })

export type DspPresetId = 'normal' | 'nightcore' | 'slowed-reverb'

/** One-click "vibe" presets. They only touch speed, pitch and reverb — the EQ is left alone. */
export const DSP_PRESETS: Record<DspPresetId, { label: string; apply: (current: DspSettings) => DspSettings }> = {
  normal: {
    label: 'Normal',
    apply: (current) => ({ ...current, speed: 1, pitch: 0, linked: false, reverb: { ...current.reverb, mix: 0 } })
  },
  nightcore: {
    label: 'Nightcore',
    apply: (current) => ({ ...current, speed: 1.25, pitch: 0, linked: true, reverb: { ...current.reverb, mix: 0 } })
  },
  'slowed-reverb': {
    label: 'Slowed + Reverb',
    apply: (current) => ({
      ...current,
      speed: 0.85,
      pitch: 0,
      linked: true,
      reverb: { mix: 0.38, decay: 4.2, preDelayMs: 35, damping: 0.62 }
    })
  }
}

/** Which vibe preset the settings currently match, if any. */
export function activeDspPreset(settings: DspSettings): DspPresetId | null {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3
  if (near(settings.speed, 1) && near(settings.pitch, 0) && settings.reverb.mix === 0) return 'normal'
  if (settings.linked && near(settings.speed, 1.25) && settings.reverb.mix === 0) return 'nightcore'
  if (settings.linked && near(settings.speed, 0.85) && settings.reverb.mix > 0) return 'slowed-reverb'
  return null
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))

export const dbToGain = (db: number): number => 10 ** (db / 20)

export const semitonesToRatio = (semitones: number): number => 2 ** (semitones / 12)

/** Pitch heard at the output, in semitones — including the shift caused by linked speed. */
export function effectivePitch(settings: Pick<DspSettings, 'speed' | 'pitch' | 'linked'>): number {
  return settings.linked ? 12 * Math.log2(settings.speed) : settings.pitch
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Coerces untrusted/legacy data into valid settings (used on load and across IPC). */
export function sanitizeDsp(input: unknown): DspSettings {
  const raw = (input ?? {}) as Partial<DspSettings>
  const reverb = (raw.reverb ?? {}) as Partial<ReverbSettings>
  const eq = Array.isArray(raw.eq) ? raw.eq : FLAT_EQ
  return {
    speed: clamp(asNumber(raw.speed, 1), SPEED_MIN, SPEED_MAX),
    pitch: clamp(asNumber(raw.pitch, 0), -PITCH_LIMIT_SEMITONES, PITCH_LIMIT_SEMITONES),
    linked: raw.linked === true,
    eq: Array.from({ length: EQ_BAND_COUNT }, (_, i) =>
      clamp(asNumber(eq[i], 0), -EQ_GAIN_LIMIT_DB, EQ_GAIN_LIMIT_DB)
    ),
    eqPreset: typeof raw.eqPreset === 'string' ? raw.eqPreset : null,
    preampDb: clamp(asNumber(raw.preampDb, 0), -PREAMP_LIMIT_DB, PREAMP_LIMIT_DB),
    reverb: {
      mix: clamp(asNumber(reverb.mix, 0), 0, 1),
      decay: clamp(asNumber(reverb.decay, DEFAULT_REVERB.decay), REVERB_DECAY_MIN, REVERB_DECAY_MAX),
      preDelayMs: clamp(asNumber(reverb.preDelayMs, DEFAULT_REVERB.preDelayMs), 0, 200),
      damping: clamp(asNumber(reverb.damping, DEFAULT_REVERB.damping), 0, 1)
    }
  }
}

export function sanitizeLoop(input: unknown): LoopRegion {
  const raw = (input ?? {}) as Partial<LoopRegion>
  const a = typeof raw.a === 'number' && Number.isFinite(raw.a) && raw.a >= 0 ? raw.a : null
  const b = typeof raw.b === 'number' && Number.isFinite(raw.b) && raw.b >= 0 ? raw.b : null
  const valid = a !== null && b !== null && b > a
  return { a, b, enabled: valid && raw.enabled === true }
}

export function sanitizePresets(input: unknown): EqPreset[] {
  if (!Array.isArray(input)) return []
  const seen = new Set(BUILT_IN_EQ_PRESETS.map((p) => p.name.toLowerCase()))
  const presets: EqPreset[] = []
  for (const item of input as Partial<EqPreset>[]) {
    const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 40) : ''
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    presets.push({ name, gains: sanitizeDsp({ eq: item.gains }).eq, builtIn: false })
  }
  return presets
}

export function isDefaultDsp(settings: DspSettings): boolean {
  return (
    settings.speed === 1 &&
    settings.pitch === 0 &&
    !settings.linked &&
    settings.preampDb === 0 &&
    settings.reverb.mix === 0 &&
    settings.eq.every((g) => g === 0)
  )
}
