/** Deterministic 32-bit FNV-1a hash used to derive colours and synth parameters. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const PALETTES: [string, string, string][] = [
  ['#1DB954', '#0b3d2e', '#a7f3d0'],
  ['#FF0000', '#3b0a0a', '#fecaca'],
  ['#7c3aed', '#1e1b4b', '#ddd6fe'],
  ['#f59e0b', '#451a03', '#fde68a'],
  ['#06b6d4', '#083344', '#a5f3fc'],
  ['#ec4899', '#500724', '#fbcfe8'],
  ['#22d3ee', '#312e81', '#e0e7ff'],
  ['#f97316', '#1c1917', '#fed7aa']
]

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
}

/**
 * Square cover art rendered as an SVG data URI, so demo content and empty
 * hybrid playlists look finished without any network access.
 */
export function gradientArtwork(seed: string, label: string): string {
  const hash = hashSeed(seed)
  const [accent, deep, light] = PALETTES[hash % PALETTES.length]
  const angle = (hash >>> 8) % 360
  const cx = 20 + ((hash >>> 4) % 60)
  const cy = 20 + ((hash >>> 12) % 60)
  const words = label.trim().split(/\s+/).slice(0, 3)
  const lines = words
    .map(
      (word, i) =>
        `<text x="24" y="${404 - (words.length - 1 - i) * 52}" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-size="46" font-weight="800" fill="${light}" letter-spacing="-1">${escapeXml(word.slice(0, 14))}</text>`
    )
    .join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="448" height="448" viewBox="0 0 448 448">
<defs>
<linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="#09090b"/></linearGradient>
<radialGradient id="r" cx="${cx}%" cy="${cy}%" r="70%"><stop offset="0" stop-color="${accent}" stop-opacity=".95"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="448" height="448" fill="url(#g)"/><rect width="448" height="448" fill="url(#r)"/>
<circle cx="${(cx * 4.48).toFixed(0)}" cy="${(cy * 4.48).toFixed(0)}" r="${60 + (hash % 80)}" fill="none" stroke="${light}" stroke-opacity=".18" stroke-width="2"/>
${lines}
</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
