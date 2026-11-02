/**
 * Real-time pitch shifter running on the audio rendering thread.
 *
 * Classic dual-tap delay-line design: two read heads sweep through a short
 * delay buffer at a rate set by the pitch ratio, half a window apart, and are
 * crossfaded with complementary Hann windows so the jump of one head is
 * always hidden under the other. Cheap, latency ~ one window, and transparent
 * enough for ±12 semitones on music.
 */

// AudioWorkletGlobalScope members (not part of the DOM lib typings).
declare const sampleRate: number
declare function registerProcessor(name: string, ctor: new (options?: unknown) => AudioWorkletProcessorBase): void
declare class AudioWorkletProcessorBase {
  readonly port: MessagePort
}
declare const AudioWorkletProcessor: typeof AudioWorkletProcessorBase
interface AudioParamDescriptor {
  name: string
  defaultValue?: number
  minValue?: number
  maxValue?: number
  automationRate?: 'a-rate' | 'k-rate'
}

const BUFFER_SIZE = 1 << 15
const BUFFER_MASK = BUFFER_SIZE - 1
const WINDOW_SECONDS = 0.06
/** Keeps the read heads strictly behind the write head. */
const MIN_DELAY = 2
/** How close to 1.0 counts as "no shift" (bypass, zero latency). */
const UNITY_EPSILON = 1e-4

interface ChannelState {
  buffer: Float32Array
}

class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [{ name: 'pitchRatio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }

  private readonly window = Math.max(256, Math.round(WINDOW_SECONDS * sampleRate))
  private readonly channels: ChannelState[] = []
  private writeIndex = 0
  private phase = 0

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const input = inputs[0]
    const output = outputs[0]
    if (!output?.length) return true

    if (!input?.length) {
      for (const channel of output) channel.fill(0)
      return true
    }

    const ratio = parameters.pitchRatio[0]
    const frames = output[0].length
    const bypass = Math.abs(ratio - 1) < UNITY_EPSILON

    while (this.channels.length < input.length) {
      this.channels.push({ buffer: new Float32Array(BUFFER_SIZE) })
    }

    const step = (1 - ratio) / this.window
    const startPhase = this.phase
    const startWrite = this.writeIndex

    for (let c = 0; c < output.length; c++) {
      const source = input[Math.min(c, input.length - 1)]
      const target = output[c]
      const { buffer } = this.channels[Math.min(c, this.channels.length - 1)]
      let phase = startPhase
      let write = startWrite

      for (let i = 0; i < frames; i++) {
        const sample = source[i]
        // Only the first output channel per input channel writes, so mono input feeds stereo output once.
        if (c < input.length) buffer[write] = sample

        if (bypass) {
          target[i] = sample
        } else {
          const phase2 = phase + 0.5 >= 1 ? phase - 0.5 : phase + 0.5
          const tap1 = this.read(buffer, write - MIN_DELAY - phase * this.window)
          const tap2 = this.read(buffer, write - MIN_DELAY - phase2 * this.window)
          const w1 = Math.sin(Math.PI * phase)
          const w2 = Math.sin(Math.PI * phase2)
          // sin² + cos² = 1: complementary Hann gains keep the level constant.
          target[i] = tap1 * w1 * w1 + tap2 * w2 * w2

          phase += step
          if (phase >= 1) phase -= 1
          else if (phase < 0) phase += 1
        }
        write = (write + 1) & BUFFER_MASK
      }

      if (c === output.length - 1) {
        // Restart sweeps from a clean delay when returning to unity.
        this.phase = bypass ? 0 : phase
        this.writeIndex = write
      }
    }
    return true
  }

  /** Linear interpolation at a fractional (possibly negative) buffer index. */
  private read(buffer: Float32Array, position: number): number {
    const base = Math.floor(position)
    const frac = position - base
    const a = buffer[base & BUFFER_MASK]
    const b = buffer[(base + 1) & BUFFER_MASK]
    return a + (b - a) * frac
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor)

export {}
