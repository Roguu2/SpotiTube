import { app } from 'electron'
import { fetchJson } from './http'
import { cleanArtist } from './lyrics'

/**
 * An artist's genres from MusicBrainz (https://musicbrainz.org): an open music
 * database with community tags such as "house" or "polish hip hop", no API key.
 * Cozy mode uses them to pick its scene. MusicBrainz asks for at most one
 * request a second and an identifying User-Agent, so lookups queue up and every
 * artist is asked about once a session.
 */
const API = 'https://musicbrainz.org/ws/2'
const MIN_GAP_MS = 1_100
const CACHE_LIMIT = 500
/** Tags beyond these are rarely about the music any more ("seen live", "british"). */
const MAX_TAGS = 8
/** MusicBrainz's search score for a name that really is this artist. */
const MIN_SCORE = 90

interface MbArtist {
  name: string
  score: number
  tags?: { name: string; count: number }[]
}

const cache = new Map<string, Promise<string[]>>()
let queue: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0

function userAgent(): string {
  return `SpotiTube/${app.getVersion()} (https://github.com/Roguu2/SpotiTube)`
}

/** Letters and digits only: "S P O N T A N" ≈ "Spontan", "Beyoncé" ≈ "Beyonce". */
function squash(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Runs `task` after the ones before it, at least MIN_GAP_MS after the previous request. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    return task()
  })
  queue = run.catch(() => undefined)
  return run
}

async function lookup(artist: string): Promise<string[]> {
  const query = new URLSearchParams({ query: `artist:"${artist.replace(/"/g, '')}"`, limit: '3', fmt: 'json' })
  const result = await enqueue(() =>
    fetchJson<{ artists?: MbArtist[] }>(`${API}/artist/?${query}`, {
      timeoutMs: 8_000,
      retries: 2,
      headers: { 'User-Agent': userAgent(), Accept: 'application/json' }
    })
  )
  const wanted = squash(artist)
  const match = result.artists?.find((candidate) => candidate.score >= MIN_SCORE && squash(candidate.name) === wanted)
  return (match?.tags ?? [])
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TAGS)
    .map((tag) => tag.name.toLowerCase())
}

/** The artist's genre tags, most agreed-on first; empty when MusicBrainz doesn't know them. */
export function getArtistGenres(name: string): Promise<string[]> {
  const artist = cleanArtist(name)
  if (!artist) return Promise.resolve([])
  const key = squash(artist)
  const hit = cache.get(key)
  if (hit) return hit

  const value = lookup(artist)
  // A failed lookup (offline, rate limited) may be tried again later.
  value.catch(() => cache.delete(key))
  cache.set(key, value)
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  return value
}
