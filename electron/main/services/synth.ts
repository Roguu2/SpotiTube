import { hashSeed } from '../providers/demo/artwork'

const SAMPLE_RATE = 44_100
const BARS = 16
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 3, 4, 3],
  [0, 6, 5, 4]
]

type Wave = 'sine' | 'triangle' | 'saw'

/** Small, fast, seedable PRNG so the same track always renders the same preview. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const midiToHz = (note: number): number => 440 * 2 ** ((note - 69) / 12)

function oscillator(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase)
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p)
    case 'triangle':
      return 4 * Math.abs(p - 0.5) - 1
    case 'saw':
      // Band-limited-ish saw from the first five harmonics keeps the pad soft.
      return (
        (Math.sin(2 * Math.PI * p) +
          Math.sin(4 * Math.PI * p) / 2 +
          Math.sin(6 * Math.PI * p) / 3 +
          Math.sin(8 * Math.PI * p) / 4 +
          Math.sin(10 * Math.PI * p) / 5) *
        0.55
      )
  }
}

class Mixer {
  readonly left: Float32Array
  readonly right: Float32Array

  constructor(readonly frames: number) {
    this.left = new Float32Array(frames)
    this.right = new Float32Array(frames)
  }

  tone(start: number, duration: number, hz: number, gain: number, wave: Wave, pan: number, attack: number, release: number): void {
    const from = Math.floor(start * SAMPLE_RATE)
    const length = Math.floor((duration + release) * SAMPLE_RATE)
    const lGain = gain * Math.cos(((pan + 1) * Math.PI) / 4)
    const rGain = gain * Math.sin(((pan + 1) * Math.PI) / 4)
    const sustainEnd = duration * SAMPLE_RATE
    for (let i = 0; i < length && from + i < this.frames; i++) {
      const t = i / SAMPLE_RATE
      const env =
        i < attack * SAMPLE_RATE
          ? i / (attack * SAMPLE_RATE)
          : i < sustainEnd
            ? 1
            : Math.max(0, 1 - (i - sustainEnd) / (release * SAMPLE_RATE))
      const sample = oscillator(wave, hz * t) * env
      this.left[from + i] += sample * lGain
      this.right[from + i] += sample * rGain
    }
  }

  kick(start: number, gain: number): void {
    const from = Math.floor(start * SAMPLE_RATE)
    const length = Math.floor(0.35 * SAMPLE_RATE)
    let phase = 0
    for (let i = 0; i < length && from + i < this.frames; i++) {
      const t = i / SAMPLE_RATE
      phase += (45 + 95 * Math.exp(-t * 28)) / SAMPLE_RATE
      const sample = Math.sin(2 * Math.PI * phase) * Math.exp(-t * 9) * gain
      this.left[from + i] += sample
      this.right[from + i] += sample
    }
  }

  hat(start: number, gain: number, random: () => number): void {
    const from = Math.floor(start * SAMPLE_RATE)
    const length = Math.floor(0.06 * SAMPLE_RATE)
    let previous = 0
    for (let i = 0; i < length && from + i < this.frames; i++) {
      const noise = random() * 2 - 1
      // First-difference high-pass keeps only the sizzle.
      const sample = (noise - previous) * Math.exp(-(i / SAMPLE_RATE) * 70) * gain
      previous = noise
      this.left[from + i] += sample * 0.8
      this.right[from + i] += sample
    }
  }
}

function encodeWav(left: Float32Array, right: Float32Array): Buffer {
  const frames = left.length
  const dataBytes = frames * 4
  const buffer = Buffer.alloc(44 + dataBytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(2, 22) // stereo
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28)
  buffer.writeUInt16LE(4, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[i])) * 32767), 44 + i * 4)
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[i])) * 32767), 46 + i * 4)
  }
  return buffer
}

/**
 * Renders a short, seed-deterministic instrumental (pad, bass, arp, drums) as
 * a 16-bit stereo WAV. Used when no real stream can be resolved — e.g. offline
 * — so the player, DSP chain and UI remain fully usable.
 */
export function renderSynthPreview(seed: string): Buffer {
  const random = mulberry32(hashSeed(seed))
  const bpm = 88 + Math.floor(random() * 40)
  const beat = 60 / bpm
  const bar = beat * 4
  const scale = random() < 0.5 ? MAJOR : MINOR
  const root = 45 + Math.floor(random() * 10)
  const progression = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)]
  const mixer = new Mixer(Math.ceil((BARS * bar + 1.5) * SAMPLE_RATE))

  const degreeToNote = (degree: number): number =>
    root + scale[degree % scale.length] + 12 * Math.floor(degree / scale.length)

  for (let b = 0; b < BARS; b++) {
    const barStart = b * bar
    const degree = progression[b % progression.length]
    const chord = [degree, degree + 2, degree + 4].map(degreeToNote)

    chord.forEach((note, i) => {
      mixer.tone(barStart, bar, midiToHz(note + 12), 0.07, 'saw', -0.4 + i * 0.4, 0.4, 0.6)
    })

    for (let e = 0; e < 8; e++) {
      mixer.tone(barStart + e * (beat / 2), beat / 2.4, midiToHz(chord[0] - 12), 0.22, 'sine', 0, 0.005, 0.05)
    }

    // Arpeggio enters after the intro and leaves for the outro.
    if (b >= 2 && b < BARS - 2) {
      for (let s = 0; s < 16; s++) {
        const note = chord[(s + Math.floor(random() * 2)) % 3] + 24
        mixer.tone(barStart + s * (beat / 4), beat / 5, midiToHz(note), 0.045, 'triangle', Math.sin(s) * 0.6, 0.004, 0.08)
      }
    }

    if (b >= 1) {
      for (let k = 0; k < 4; k++) {
        mixer.kick(barStart + k * beat, 0.55)
        mixer.hat(barStart + k * beat + beat / 2, 0.12, random)
      }
    }
  }

  let peak = 0
  for (let i = 0; i < mixer.frames; i++) {
    peak = Math.max(peak, Math.abs(mixer.left[i]), Math.abs(mixer.right[i]))
  }
  const gain = peak > 0 ? 0.89 / peak : 1
  const fade = SAMPLE_RATE
  for (let i = 0; i < mixer.frames; i++) {
    const env = Math.min(1, i / fade, (mixer.frames - i) / fade)
    mixer.left[i] *= gain * env
    mixer.right[i] *= gain * env
  }

  return encodeWav(mixer.left, mixer.right)
}
