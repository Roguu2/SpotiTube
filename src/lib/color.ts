export type Rgb = [number, number, number]

const SAMPLE_SIZE = 32
const cache = new Map<string, Promise<Rgb | null>>()

function hashColor(seed: string): Rgb {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const hue = Math.abs(hash) % 360
  return hslToRgb(hue / 360, 0.65, 0.45)
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number): number => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((v) => Math.round(v * 255)) as Rgb
}

/**
 * Picks a vivid representative colour from an image by downsampling it and
 * weighting pixels by saturation, so muddy greys and near-blacks do not win.
 * Returns `null` when the image cannot be read (e.g. a CDN without CORS).
 */
function extract(url: string): Promise<Rgb | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) return resolve(null)
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

        let r = 0
        let g = 0
        let b = 0
        let total = 0
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2])
          const min = Math.min(data[i], data[i + 1], data[i + 2])
          const saturation = max === 0 ? 0 : (max - min) / max
          const brightness = max / 255
          const weight = saturation * saturation * (brightness > 0.15 ? brightness : 0) + 0.002
          r += data[i] * weight
          g += data[i + 1] * weight
          b += data[i + 2] * weight
          total += weight
        }
        resolve([Math.round(r / total), Math.round(g / total), Math.round(b / total)])
      } catch {
        // Canvas tainted by a cross-origin image.
        resolve(null)
      }
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}

export async function dominantColor(url: string | undefined, fallbackSeed: string): Promise<Rgb> {
  if (!url) return hashColor(fallbackSeed)
  let pending = cache.get(url)
  if (!pending) {
    pending = extract(url)
    cache.set(url, pending)
  }
  return (await pending) ?? hashColor(fallbackSeed)
}

export function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
