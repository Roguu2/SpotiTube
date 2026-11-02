import { useEffect, useRef } from 'react'
import { getAudioEngine } from '@/audio/AudioEngine'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'

const BARS = 48
const MIN_HZ = 30
const MAX_HZ = 16_000

/** Log-frequency spectrum of the processed output (post-EQ, post-reverb). */
export function Spectrum() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hydrated = useAudioEngineStore((s) => s.hydrated)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !hydrated) return
    const context = canvas.getContext('2d')
    if (!context) return

    const { analyser, context: audio } = getAudioEngine()
    const bins = new Uint8Array(analyser.frequencyBinCount)
    const binHz = audio.sampleRate / analyser.fftSize
    const levels = new Float32Array(BARS)
    // Precompute the bin range each bar covers on a log scale.
    const ranges = Array.from({ length: BARS }, (_, i) => {
      const lo = MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BARS)
      const hi = MIN_HZ * (MAX_HZ / MIN_HZ) ** ((i + 1) / BARS)
      return [Math.max(1, Math.floor(lo / binHz)), Math.max(1, Math.ceil(hi / binHz))] as const
    })

    let frame = 0
    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width * dpr) {
        canvas.width = width * dpr
        canvas.height = height * dpr
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, width, height)

      analyser.getByteFrequencyData(bins)
      const gap = 2
      const barWidth = (width - gap * (BARS - 1)) / BARS
      const gradient = context.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, '#1DB954')
      gradient.addColorStop(1, '#FF3B3B')
      context.fillStyle = gradient

      for (let i = 0; i < BARS; i++) {
        const [lo, hi] = ranges[i]
        let peak = 0
        for (let b = lo; b <= hi && b < bins.length; b++) peak = Math.max(peak, bins[b])
        const target = peak / 255
        // Fast attack, slow release reads better than raw FFT jitter.
        levels[i] = target > levels[i] ? target : levels[i] * 0.9 + target * 0.1
        const h = Math.max(1.5, levels[i] * height)
        context.globalAlpha = 0.35 + levels[i] * 0.65
        context.beginPath()
        context.roundRect(i * (barWidth + gap), height - h, barWidth, h, 1.5)
        context.fill()
      }
      context.globalAlpha = 1
      frame = requestAnimationFrame(draw)
    }

    if (isPlaying) frame = requestAnimationFrame(draw)
    else {
      levels.fill(0)
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
    return () => cancelAnimationFrame(frame)
  }, [hydrated, isPlaying])

  return <canvas ref={canvasRef} aria-hidden="true" className="h-16 w-full" />
}
