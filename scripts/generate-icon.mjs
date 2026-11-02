/**
 * Renders the SpotiTube app icon (build/icon.png, 1024×1024) with no image
 * dependencies: a green→red gradient disc with a dark play glyph on a rounded
 * dark tile. electron-builder derives the Windows .ico and macOS .icns from it.
 *
 *   node scripts/generate-icon.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const SUPERSAMPLE = 3
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../build/icon.png')

const GREEN = [29, 185, 84]
const RED = [255, 0, 0]
const TILE = [9, 9, 11]
const TILE_EDGE = [24, 24, 29]

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

function roundedRectCoverage(x, y, inset, radius) {
  const min = inset
  const max = SIZE - inset
  const cx = Math.min(Math.max(x, min + radius), max - radius)
  const cy = Math.min(Math.max(y, min + radius), max - radius)
  return Math.hypot(x - cx, y - cy) <= radius && x >= min && x <= max && y >= min && y <= max
}

function insideTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry)
  const d1 = sign(x, y, ax, ay, bx, by)
  const d2 = sign(x, y, bx, by, cx, cy)
  const d3 = sign(x, y, cx, cy, ax, ay)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** Colour (RGBA, 0–255) of a single sub-pixel sample. */
function sample(x, y) {
  // macOS-style squircle-ish tile with a margin, so the icon sits well in docks and taskbars.
  if (!roundedRectCoverage(x, y, 64, 200)) return [0, 0, 0, 0]

  const center = SIZE / 2
  const tileShade = Math.min(1, Math.hypot(x - center, y - center * 0.6) / (SIZE * 0.75))
  let color = mix(TILE_EDGE, TILE, tileShade)

  const discRadius = 330
  const d = Math.hypot(x - center, y - center)
  if (d <= discRadius + 40) {
    // Soft outer glow.
    const glow = Math.max(0, 1 - (d - discRadius) / 40)
    const t = (x + y) / (2 * SIZE)
    const disc = mix(GREEN, RED, Math.min(1, Math.max(0, (t - 0.2) / 0.6)))
    color = d <= discRadius ? disc : mix(color, disc, glow * 0.35)
  }

  // Play glyph, optically centred (shifted right).
  const a = [center - 95, center - 165]
  const b = [center - 95, center + 165]
  const c = [center + 175, center]
  if (insideTriangle(x, y, a, b, c)) color = TILE

  return [...color, 255]
}

const pixels = Buffer.alloc(SIZE * SIZE * 4)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const acc = [0, 0, 0, 0]
    for (let sy = 0; sy < SUPERSAMPLE; sy++) {
      for (let sx = 0; sx < SUPERSAMPLE; sx++) {
        const s = sample(x + (sx + 0.5) / SUPERSAMPLE, y + (sy + 0.5) / SUPERSAMPLE)
        // Premultiply so transparent samples do not darken edges.
        acc[0] += s[0] * s[3]
        acc[1] += s[1] * s[3]
        acc[2] += s[2] * s[3]
        acc[3] += s[3]
      }
    }
    const o = (y * SIZE + x) * 4
    const alpha = acc[3] / (SUPERSAMPLE * SUPERSAMPLE)
    pixels[o] = acc[3] ? Math.round(acc[0] / acc[3]) : 0
    pixels[o + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0
    pixels[o + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0
    pixels[o + 3] = Math.round(alpha)
  }
}

// ── Minimal PNG encoder (RGBA, 8-bit, no interlace) ──────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buffer) => {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 6 // RGBA
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0 // filter: none
  pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, png)
console.log(`Wrote ${OUT} (${(png.length / 1024).toFixed(0)} KB)`)
