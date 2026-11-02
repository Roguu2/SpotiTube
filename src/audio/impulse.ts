import type { ReverbSettings } from '@core/dsp'

/** Deterministic noise so regenerating an impulse with the same settings is click-free and repeatable. */
function noise(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) / 4294967296) * 2 - 1
  }
}

/**
 * Synthesizes a stereo room impulse response: an exponentially decaying noise
 * tail (−60 dB at `decay` seconds) after a pre-delay, with a time-varying
 * one-pole low-pass that darkens the tail as it fades — like air and wall
 * absorption in a real space. Left/right use independent noise for width.
 */
export function generateImpulse(
  context: BaseAudioContext,
  { decay, preDelayMs, damping }: Pick<ReverbSettings, 'decay' | 'preDelayMs' | 'damping'>
): AudioBuffer {
  const rate = context.sampleRate
  const preDelay = Math.round((preDelayMs / 1000) * rate)
  const tail = Math.max(1, Math.round(decay * rate))
  const impulse = context.createBuffer(2, preDelay + tail, rate)

  // ln(1000) ≈ 6.908 → amplitude reaches −60 dB at the end of the tail.
  const decayRate = 6.908 / tail
  // Short fade-in avoids a hard transient at the start of the tail.
  const attack = Math.min(tail, Math.round(0.004 * rate))

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    const random = noise(0x9e3779b9 + channel * 7919)
    let lowpassed = 0
    for (let i = 0; i < tail; i++) {
      const progress = i / tail
      // Cutoff coefficient falls over time: bright early reflections, dark late tail.
      const coefficient = 1 - Math.min(0.98, damping * (0.15 + 0.85 * progress))
      lowpassed += coefficient * (random() - lowpassed)
      const envelope = Math.exp(-decayRate * i) * (i < attack ? i / attack : 1)
      data[preDelay + i] = lowpassed * envelope
    }
  }

  // Normalize energy so changing decay/damping does not change perceived loudness much.
  let energy = 0
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < data.length; i++) energy += data[i] * data[i]
  }
  const scale = energy > 0 ? 1 / Math.sqrt(energy / 2) : 1
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < data.length; i++) data[i] *= scale
  }
  return impulse
}
