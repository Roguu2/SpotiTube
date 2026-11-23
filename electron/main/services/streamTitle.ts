/**
 * Turns a station's raw ICY StreamTitle into "Artist - Song", or '' when what
 * it sends isn't a song (station IDs, ads, talk) or is empty. Stations differ a
 * lot: iHeart-style ones send `Artist - text="Song" song_spot="M" MediaBaseId=…`,
 * others HTML entities, trailing URLs or `key="value"` junk.
 */

const MAX_LENGTH = 200

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === '#') {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match
    }
    return ENTITIES[name.toLowerCase()] ?? match
  })
}

/** `key="value"` pairs, as iHeart-style stations append them. */
function attributes(text: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of text.matchAll(/(\w+)="([^"]*)"/g)) found.set(match[1].toLowerCase(), match[2])
  return found
}

/** Leading/trailing separators and quotes, doubled spaces. */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—|:'"]+|[\s\-–—|:'"]+$/g, '')
    .trim()
}

function joinArtistTitle(artist: string, title: string): string {
  const a = tidy(artist)
  const t = tidy(title)
  if (a && t && a.toLowerCase() !== t.toLowerCase()) return `${a} - ${t}`
  return t || a
}

export function cleanStreamTitle(raw: string): string {
  let text = decodeEntities(raw).replace(/[\u0000-\u001f]/g, ' ').trim()
  if (!text) return ''

  const attrs = attributes(text)
  if (attrs.has('text') || attrs.has('song_spot')) {
    // "M" is music; anything else (T = station ID / talk, F, C…) isn't a song to show.
    const spot = attrs.get('song_spot')?.toUpperCase()
    if (spot && spot !== 'M') return ''
    const artist = text.slice(0, text.search(/\s*-?\s*\w+="/)).trim()
    return joinArtistTitle(artist, attrs.get('text') ?? '').slice(0, MAX_LENGTH)
  }

  // Other stations' leftovers: key="value" pairs, URLs, and placeholder titles.
  text = text
    .replace(/\s*\w+="[^"]*"/g, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
  text = tidy(text)
  if (/^(unknown|untitled|n\/a|none|-|\?)$/i.test(text) || /^(unknown\s*-\s*)+unknown$/i.test(text)) return ''
  const parts = text.split(/\s+-\s+/)
  if (parts.length >= 2 && parts.every((part) => /^(unknown|untitled)?$/i.test(part.trim()))) return ''
  return text.slice(0, MAX_LENGTH)
}
