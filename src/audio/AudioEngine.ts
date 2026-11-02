import {
  DEFAULT_DSP,
  EMPTY_LOOP,
  EQ_FREQUENCIES,
  dbToGain,
  sanitizeDsp,
  sanitizeLoop,
  semitonesToRatio,
  type DspSettings,
  type LoopRegion,
  type ReverbSettings
} from '@core/dsp'
import { generateImpulse } from './impulse'
import pitchShifterUrl from './worklets/pitchShifter.worklet.ts?worker&url'

export interface TransportState {
  src: string | null
  isPlaying: boolean
  isBuffering: boolean
  currentTime: number
  duration: number
  /** Seconds of media buffered ahead of the playhead. */
  bufferedAhead: number
  ended: boolean
  error: string | null
}

type Listener = (state: TransportState) => void

/** Parameter smoothing time constant — fast enough to feel instant, slow enough to avoid zipper noise. */
const RAMP = 0.03
const LOOP_POLL_MS = 15
const IMPULSE_DEBOUNCE_MS = 120
const EQ_Q = 1.1

const INITIAL_TRANSPORT: TransportState = {
  src: null,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  bufferedAhead: 0,
  ended: false,
  error: null
}

/**
 * Real-time playback chain built on the Web Audio API:
 *
 *   <audio> → preamp → 10-band EQ → pitch shifter ─┬─ dry ──────────┬→ limiter → volume → analyser → out
 *                                                  └─ convolver → wet ┘
 *
 * Speed uses the media element's native time-stretching (pitch preserved)
 * when unlinked, or plain resampling (tape style) when linked. Independent
 * pitch runs in an AudioWorklet. A-B looping is enforced with a fine-grained
 * poll because `timeupdate` only fires every ~250 ms.
 */
export class AudioEngine {
  readonly context: AudioContext
  readonly analyser: AnalyserNode
  private readonly media: HTMLAudioElement
  private readonly preamp: GainNode
  private readonly bands: BiquadFilterNode[]
  private readonly pitchInput: GainNode
  private pitchNode: AudioWorkletNode | null = null
  private readonly dry: GainNode
  private readonly wet: GainNode
  private readonly convolver: ConvolverNode
  private readonly limiter: DynamicsCompressorNode
  private readonly volumeNode: GainNode

  private settings: DspSettings = sanitizeDsp(DEFAULT_DSP)
  private loop: LoopRegion = { ...EMPTY_LOOP }
  private volume = 1
  private muted = false
  private transport: TransportState = { ...INITIAL_TRANSPORT }
  private readonly listeners = new Set<Listener>()
  private loopTimer: number | null = null
  private impulseTimer: number | null = null
  private impulseKey = ''
  private readonly ready: Promise<void>
  private loadToken = 0

  constructor() {
    this.context = new AudioContext({ latencyHint: 'playback' })

    this.media = new Audio()
    this.media.crossOrigin = 'anonymous'
    this.media.preload = 'auto'

    const source = this.context.createMediaElementSource(this.media)
    this.preamp = this.context.createGain()

    this.bands = EQ_FREQUENCIES.map((frequency, index) => {
      const filter = this.context.createBiquadFilter()
      filter.type = index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking'
      filter.frequency.value = frequency
      filter.Q.value = EQ_Q
      filter.gain.value = 0
      return filter
    })

    this.pitchInput = this.context.createGain()
    this.dry = this.context.createGain()
    this.wet = this.context.createGain()
    this.wet.gain.value = 0
    this.convolver = this.context.createConvolver()
    this.convolver.normalize = false

    this.limiter = this.context.createDynamicsCompressor()
    this.limiter.threshold.value = -1
    this.limiter.knee.value = 0
    this.limiter.ratio.value = 20
    this.limiter.attack.value = 0.002
    this.limiter.release.value = 0.12

    this.volumeNode = this.context.createGain()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8

    source.connect(this.preamp)
    let node: AudioNode = this.preamp
    for (const band of this.bands) {
      node.connect(band)
      node = band
    }
    node.connect(this.pitchInput)
    // Until the worklet loads, bypass the pitch stage.
    this.pitchInput.connect(this.dry)
    this.pitchInput.connect(this.convolver)
    this.convolver.connect(this.wet)
    this.dry.connect(this.limiter)
    this.wet.connect(this.limiter)
    this.limiter.connect(this.volumeNode)
    this.volumeNode.connect(this.analyser)
    this.analyser.connect(this.context.destination)

    this.bindMediaEvents()
    this.ready = this.loadPitchShifter()
    this.applyAll()
  }

  // ── Transport ────────────────────────────────────────────────────────────

  /** Loads a new source. Resolves once metadata is available (or rejects on error). */
  async load(src: string, { autoplay = true, startAt = 0 } = {}): Promise<void> {
    const token = ++this.loadToken
    this.media.pause()
    this.update({ ...INITIAL_TRANSPORT, src, isBuffering: true })
    this.media.src = src
    this.media.load()

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        this.media.removeEventListener('loadedmetadata', onLoaded)
        this.media.removeEventListener('error', onError)
      }
      const onLoaded = (): void => {
        cleanup()
        resolve()
      }
      const onError = (): void => {
        cleanup()
        reject(new Error(this.describeMediaError()))
      }
      this.media.addEventListener('loadedmetadata', onLoaded)
      this.media.addEventListener('error', onError)
    })

    // A newer load() superseded this one while we waited.
    if (token !== this.loadToken) return
    this.applyPlaybackRate()
    if (startAt > 0) this.media.currentTime = Math.min(startAt, this.media.duration || startAt)
    if (autoplay) await this.play()
  }

  async play(): Promise<void> {
    if (!this.media.src) return
    await this.ready
    if (this.context.state !== 'running') await this.context.resume()
    if (this.transport.ended) this.media.currentTime = this.loopStartOr(0)
    await this.media.play()
  }

  pause(): void {
    this.media.pause()
  }

  async toggle(): Promise<void> {
    if (this.media.paused) await this.play()
    else this.pause()
  }

  stop(): void {
    this.media.pause()
    this.media.removeAttribute('src')
    this.media.load()
    this.update({ ...INITIAL_TRANSPORT })
  }

  seek(seconds: number): void {
    const duration = this.media.duration
    if (!Number.isFinite(duration)) return
    this.media.currentTime = Math.min(Math.max(0, seconds), Math.max(0, duration - 0.05))
    this.update({ currentTime: this.media.currentTime, ended: false })
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume))
    this.applyVolume()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.applyVolume()
  }

  getTransport(): TransportState {
    return this.transport
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.transport)
    return () => this.listeners.delete(listener)
  }

  // ── DSP ──────────────────────────────────────────────────────────────────

  getSettings(): DspSettings {
    return this.settings
  }

  /** Replaces all DSP settings at once (e.g. when switching tracks). */
  setSettings(settings: DspSettings): void {
    this.settings = sanitizeDsp(settings)
    this.applyAll()
  }

  setSpeed(speed: number): void {
    this.setSettings({ ...this.settings, speed })
  }

  setPitch(semitones: number): void {
    this.setSettings({ ...this.settings, pitch: semitones })
  }

  setLinked(linked: boolean): void {
    this.setSettings({ ...this.settings, linked })
  }

  setEqBand(index: number, gainDb: number): void {
    const eq = [...this.settings.eq]
    eq[index] = gainDb
    this.setSettings({ ...this.settings, eq, eqPreset: null })
  }

  setEq(gains: number[], presetName: string | null = null): void {
    this.setSettings({ ...this.settings, eq: gains, eqPreset: presetName })
  }

  setPreamp(gainDb: number): void {
    this.setSettings({ ...this.settings, preampDb: gainDb })
  }

  setReverb(reverb: Partial<ReverbSettings>): void {
    this.setSettings({ ...this.settings, reverb: { ...this.settings.reverb, ...reverb } })
  }

  /** True once the pitch-shift worklet is running; independent pitch is unavailable otherwise. */
  get pitchShiftAvailable(): boolean {
    return this.pitchNode !== null
  }

  /** Resolves once the processing graph is complete (worklet loaded or definitively unavailable). */
  whenReady(): Promise<void> {
    return this.ready
  }

  // ── A-B loop ─────────────────────────────────────────────────────────────

  getLoop(): LoopRegion {
    return this.loop
  }

  setLoop(loop: LoopRegion): void {
    this.loop = sanitizeLoop(loop)
    this.syncLoopTimer()
  }

  /** Sets A at the playhead; clears B if it would precede A. */
  markA(at = this.media.currentTime): LoopRegion {
    const b = this.loop.b !== null && this.loop.b > at ? this.loop.b : null
    this.setLoop({ a: at, b, enabled: b !== null })
    return this.loop
  }

  /** Sets B at the playhead and enables the loop when A precedes it. */
  markB(at = this.media.currentTime): LoopRegion {
    const a = this.loop.a !== null && this.loop.a < at ? this.loop.a : 0
    this.setLoop({ a, b: at, enabled: true })
    return this.loop
  }

  clearLoop(): void {
    this.setLoop({ ...EMPTY_LOOP })
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async loadPitchShifter(): Promise<void> {
    try {
      await this.context.audioWorklet.addModule(pitchShifterUrl)
      const node = new AudioWorkletNode(this.context, 'pitch-shifter', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      })
      this.pitchInput.disconnect()
      this.pitchInput.connect(node)
      node.connect(this.dry)
      node.connect(this.convolver)
      this.pitchNode = node
      this.applyPitch()
    } catch (error) {
      // The rest of the chain keeps working; independent pitch is simply unavailable.
      console.error('Pitch shifter unavailable:', error)
    }
  }

  private applyAll(): void {
    this.applyPlaybackRate()
    this.applyPitch()
    this.applyEq()
    this.applyReverb()
    this.applyVolume()
  }

  private ramp(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.context.currentTime, RAMP)
  }

  private applyPlaybackRate(): void {
    // Linked: resample like a turntable (pitch follows speed). Unlinked: time-stretch.
    this.media.preservesPitch = !this.settings.linked
    this.media.playbackRate = this.settings.speed
    this.media.defaultPlaybackRate = this.settings.speed
  }

  private applyPitch(): void {
    if (!this.pitchNode) return
    const semitones = this.settings.linked ? 0 : this.settings.pitch
    const param = this.pitchNode.parameters.get('pitchRatio')
    if (param) param.setValueAtTime(semitonesToRatio(semitones), this.context.currentTime)
  }

  private applyEq(): void {
    this.bands.forEach((band, i) => this.ramp(band.gain, this.settings.eq[i]))
    this.ramp(this.preamp.gain, dbToGain(this.settings.preampDb))
  }

  private applyReverb(): void {
    const { mix, decay, preDelayMs, damping } = this.settings.reverb
    // Equal-power crossfade between dry and wet.
    this.ramp(this.dry.gain, Math.cos((mix * Math.PI) / 2))
    this.ramp(this.wet.gain, Math.sin((mix * Math.PI) / 2))

    const key = `${decay.toFixed(2)}|${preDelayMs.toFixed(0)}|${damping.toFixed(2)}`
    if (key === this.impulseKey) return
    this.impulseKey = key

    // Impulse synthesis takes a few ms per second of tail; debounce slider drags.
    if (this.impulseTimer !== null) window.clearTimeout(this.impulseTimer)
    const regenerate = (): void => {
      this.impulseTimer = null
      this.convolver.buffer = generateImpulse(this.context, { decay, preDelayMs, damping })
    }
    if (this.convolver.buffer) this.impulseTimer = window.setTimeout(regenerate, IMPULSE_DEBOUNCE_MS)
    else regenerate()
  }

  private applyVolume(): void {
    // Perceptual (squared) curve so the slider feels linear in loudness.
    const gain = this.muted ? 0 : this.volume * this.volume
    this.ramp(this.volumeNode.gain, gain)
  }

  private loopStartOr(fallback: number): number {
    return this.loop.enabled && this.loop.a !== null ? this.loop.a : fallback
  }

  private syncLoopTimer(): void {
    const shouldRun = this.loop.enabled && !this.media.paused
    if (shouldRun && this.loopTimer === null) {
      this.loopTimer = window.setInterval(() => this.enforceLoop(), LOOP_POLL_MS)
    } else if (!shouldRun && this.loopTimer !== null) {
      window.clearInterval(this.loopTimer)
      this.loopTimer = null
    }
  }

  private enforceLoop(): void {
    const { a, b, enabled } = this.loop
    if (!enabled || a === null || b === null) return
    // Seeking before A is allowed (the loop resumes at B); passing B jumps back.
    if (this.media.currentTime >= b) {
      this.media.currentTime = a
      this.update({ currentTime: a })
    }
  }

  private bufferedAhead(): number {
    const t = this.media.currentTime
    const ranges = this.media.buffered
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= t && t <= ranges.end(i)) return ranges.end(i) - t
    }
    return 0
  }

  private describeMediaError(): string {
    const error = this.media.error
    if (!error) return 'Playback failed'
    switch (error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        return 'Playback was aborted'
      case MediaError.MEDIA_ERR_NETWORK:
        return 'Network error while streaming'
      case MediaError.MEDIA_ERR_DECODE:
        return 'The audio stream could not be decoded'
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        return error.message || 'Stream unavailable or format not supported'
      default:
        return error.message || 'Playback failed'
    }
  }

  private bindMediaEvents(): void {
    const media = this.media
    media.addEventListener('play', () => {
      this.update({ isPlaying: true, ended: false })
      this.syncLoopTimer()
    })
    media.addEventListener('pause', () => {
      this.update({ isPlaying: false })
      this.syncLoopTimer()
    })
    media.addEventListener('playing', () => this.update({ isBuffering: false }))
    media.addEventListener('waiting', () => this.update({ isBuffering: true }))
    media.addEventListener('canplay', () => this.update({ isBuffering: false }))
    media.addEventListener('durationchange', () =>
      this.update({ duration: Number.isFinite(media.duration) ? media.duration : 0 })
    )
    media.addEventListener('timeupdate', () =>
      this.update({ currentTime: media.currentTime, bufferedAhead: this.bufferedAhead() })
    )
    media.addEventListener('progress', () => this.update({ bufferedAhead: this.bufferedAhead() }))
    media.addEventListener('ratechange', () => {
      // Some browsers reset playbackRate on load; reassert ours.
      if (media.playbackRate !== this.settings.speed) this.applyPlaybackRate()
    })
    media.addEventListener('ended', () => {
      // B at the very end can be overrun between polls; keep looping instead of ending.
      if (this.loop.enabled && this.loop.a !== null) {
        media.currentTime = this.loop.a
        void media.play()
        return
      }
      this.update({ isPlaying: false, ended: true })
    })
    media.addEventListener('error', () => {
      if (!media.getAttribute('src')) return
      this.update({ isPlaying: false, isBuffering: false, error: this.describeMediaError() })
    })
  }

  private update(patch: Partial<TransportState>): void {
    this.transport = { ...this.transport, ...patch }
    for (const listener of this.listeners) listener(this.transport)
  }
}

let shared: AudioEngine | null = null

/** The app-wide engine. Created lazily so the AudioContext starts after the first user gesture. */
export function getAudioEngine(): AudioEngine {
  shared ??= new AudioEngine()
  return shared
}
