import { app, BrowserWindow } from 'electron'
import Store from 'electron-store'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IpcChannels, type RadioCountry, type RadioNowPlaying, type RadioQuery, type RadioSaved, type RadioStation, type RadioTag } from '@core/ipc'
import { fetchJson } from './http'

/**
 * Live radio from Radio Browser (https://www.radio-browser.info): a free,
 * community-run directory of ~50,000 stations, no API key. It asks clients to
 * pick one of its mirrors and to send an identifying User-Agent.
 */
const SERVER_LIST = 'https://all.api.radio-browser.info/json/servers'
const FALLBACK_SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info']
/** Stations with a location, for the globe: about 11,000, ~13 MB as served, ~2 MB as kept. */
const MAP_FILE = 'radio-map.json'
const MAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const SEARCH_LIMIT = 80
const MAX_FAVORITES = 500
const MAX_RECENT = 30
/** Codecs Chromium can't play from a plain stream. */
const UNPLAYABLE_CODECS = new Set(['FLV', 'AAC,H.264', 'MP4'])

/** A directory entry as Radio Browser returns it (only the fields used here). */
interface ApiStation {
  stationuuid: string
  name: string
  url: string
  url_resolved: string
  homepage: string
  favicon: string
  tags: string
  country: string
  countrycode: string
  state: string
  votes: number
  codec: string
  bitrate: number
  hls: number
  geo_lat: number | null
  geo_long: number | null
}

interface MapFile {
  fetchedAt: number
  stations: RadioStation[]
}

const savedStore = new Store<RadioSaved>({
  name: 'radio',
  accessPropertiesByDotNotation: false,
  defaults: { favorites: [], recent: [] }
})

/** Stream address by station id, for every station handed to the renderer this run. */
const streamUrls = new Map<string, string>()
let servers: Promise<string[]> | null = null
let mapStations: Promise<RadioStation[]> | null = null

function userAgent(): string {
  return `SpotiTube/${app.getVersion()} (https://github.com/Roguu2/SpotiTube)`
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function mirrors(): Promise<string[]> {
  servers ??= fetchJson<{ name: string }[]>(SERVER_LIST, { headers: { 'User-Agent': userAgent() }, timeoutMs: 8_000, retries: 0 })
    .then((list) => {
      const names = [...new Set(list.map((s) => s.name).filter((n) => typeof n === 'string' && n.endsWith('.radio-browser.info')))]
      return names.length ? shuffle(names) : shuffle([...FALLBACK_SERVERS])
    })
    .catch(() => {
      servers = null
      return shuffle([...FALLBACK_SERVERS])
    })
  return servers
}

/** GETs `path` from the first mirror that answers. */
async function api<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, timeoutMs = 15_000): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
  let lastError: unknown = new Error('No Radio Browser server answered')
  for (const host of await mirrors()) {
    try {
      return await fetchJson<T>(`https://${host}${path}${query.size ? `?${query}` : ''}`, {
        headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
        timeoutMs,
        retries: 0
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

function httpsOnly(url: string): string | undefined {
  return /^https:\/\/\S+$/i.test(url) ? url : undefined
}

function toStation(raw: ApiStation): RadioStation | null {
  const url = raw.url_resolved || raw.url
  if (!raw.stationuuid || !raw.name?.trim() || !/^https?:\/\//i.test(url ?? '')) return null
  if (raw.hls === 1 || UNPLAYABLE_CODECS.has(raw.codec) || /\.m3u8(\?|$)/i.test(url)) return null
  streamUrls.set(raw.stationuuid, url)
  const station: RadioStation = {
    id: raw.stationuuid,
    name: raw.name.trim(),
    tags: raw.tags
      ? [...new Set(raw.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8)
      : [],
    votes: raw.votes || 0
  }
  const homepage = /^https?:\/\/\S+$/i.test(raw.homepage) ? raw.homepage : undefined
  const favicon = httpsOnly(raw.favicon)
  if (homepage) station.homepage = homepage
  if (favicon) station.favicon = favicon
  if (raw.country) station.country = raw.country
  if (/^[A-Z]{2}$/.test(raw.countrycode)) station.countryCode = raw.countrycode
  if (raw.state?.trim()) station.state = raw.state.trim()
  if (raw.codec && raw.codec !== 'UNKNOWN') station.codec = raw.codec
  if (raw.bitrate > 0) station.bitrate = raw.bitrate
  if (typeof raw.geo_lat === 'number' && typeof raw.geo_long === 'number' && Math.abs(raw.geo_lat) <= 90 && Math.abs(raw.geo_long) <= 180) {
    station.lat = Math.round(raw.geo_lat * 1e4) / 1e4
    station.lon = Math.round(raw.geo_long * 1e4) / 1e4
  }
  return station
}

function toStations(list: ApiStation[]): RadioStation[] {
  const seen = new Set<string>()
  const stations: RadioStation[] = []
  for (const raw of list) {
    const station = toStation(raw)
    if (!station || seen.has(station.id)) continue
    seen.add(station.id)
    stations.push(station)
  }
  return stations
}

const mapPath = (): string => join(app.getPath('userData'), MAP_FILE)

async function readMapFile(): Promise<MapFile | null> {
  try {
    const file = JSON.parse(await readFile(mapPath(), 'utf8')) as MapFile
    return Array.isArray(file.stations) && typeof file.fetchedAt === 'number' ? file : null
  } catch {
    return null
  }
}

async function downloadMap(): Promise<RadioStation[]> {
  const list = await api<ApiStation[]>(
    '/json/stations/search',
    { has_geo_info: true, hidebroken: true, order: 'votes', reverse: true, limit: 100_000 },
    90_000
  )
  const stations = toStations(list).filter((s) => s.lat !== undefined)
  if (!stations.length) throw new Error('Radio Browser returned no stations')
  const file: MapFile = { fetchedAt: Date.now(), stations }
  await mkdir(app.getPath('userData'), { recursive: true })
  // Written aside and renamed, so a crash never leaves half a file behind.
  await writeFile(`${mapPath()}.tmp`, JSON.stringify(file))
  await rename(`${mapPath()}.tmp`, mapPath())
  return stations
}

/** The globe's stations: from disk when fresh, otherwise downloaded (stale data still beats none). */
export function getMapStations(): Promise<RadioStation[]> {
  mapStations ??= (async () => {
    const cached = await readMapFile()
    if (cached && Date.now() - cached.fetchedAt < MAP_MAX_AGE_MS) return cached.stations
    try {
      return await downloadMap()
    } catch (error) {
      if (cached) return cached.stations
      mapStations = null
      throw error
    }
  })()
  return mapStations
}

export async function searchStations(query: RadioQuery): Promise<RadioStation[]> {
  const name = typeof query.name === 'string' ? query.name.trim().slice(0, 100) : ''
  const tag = typeof query.tag === 'string' ? query.tag.trim().toLowerCase().slice(0, 60) : ''
  const countryCode = typeof query.countryCode === 'string' && /^[A-Z]{2}$/.test(query.countryCode) ? query.countryCode : ''
  const offset = Number.isInteger(query.offset) && (query.offset as number) > 0 ? Math.min(query.offset as number, 10_000) : 0
  const list = await api<ApiStation[]>('/json/stations/search', {
    name,
    tag,
    tagExact: tag ? true : undefined,
    countrycode: countryCode,
    hidebroken: true,
    order: name ? 'votes' : 'clickcount',
    reverse: true,
    limit: SEARCH_LIMIT,
    offset
  })
  return toStations(list)
}

export async function getCountries(): Promise<RadioCountry[]> {
  const list = await api<{ name: string; iso_3166_1: string; stationcount: number }[]>('/json/countries', { hidebroken: true })
  const byCode = new Map<string, RadioCountry>()
  for (const c of list) {
    if (!/^[A-Z]{2}$/.test(c.iso_3166_1) || !(c.stationcount > 0)) continue
    const previous = byCode.get(c.iso_3166_1)
    // The directory lists some countries under several spellings.
    if (previous) previous.stations += c.stationcount
    else byCode.set(c.iso_3166_1, { code: c.iso_3166_1, name: c.name, stations: c.stationcount })
  }
  return [...byCode.values()].sort((a, b) => b.stations - a.stations)
}

export async function getTags(): Promise<RadioTag[]> {
  const list = await api<{ name: string; stationcount: number }[]>('/json/tags', {
    order: 'stationcount',
    reverse: true,
    hidebroken: true,
    limit: 80
  })
  return list.filter((t) => t.name && t.name.length <= 30).map((t) => ({ name: t.name, stations: t.stationcount }))
}

/**
 * Where a station streams from right now. Asking `/json/url` also counts the
 * play towards the station's popularity, as Radio Browser asks clients to do.
 */
export async function resolveStreamUrl(stationId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(stationId)) throw new Error('Unknown radio station')
  try {
    const result = await api<{ ok: boolean | string; url: string }>(`/json/url/${stationId}`, {}, 8_000)
    if (/^https?:\/\//i.test(result.url ?? '')) {
      streamUrls.set(stationId, result.url)
      return result.url
    }
  } catch (error) {
    const known = streamUrls.get(stationId)
    if (known) return known
    throw error
  }
  const known = streamUrls.get(stationId)
  if (known) return known
  throw new Error('This station is no longer in the directory')
}

function isStation(value: unknown): value is RadioStation {
  const station = value as RadioStation | null
  return (
    !!station &&
    typeof station.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(station.id) &&
    typeof station.name === 'string' &&
    Array.isArray(station.tags)
  )
}

/** Keeps only the known fields, so nothing else from the renderer ends up on disk. */
function clean(station: RadioStation): RadioStation {
  const { id, name, homepage, favicon, country, countryCode, state, tags, codec, bitrate, votes, lat, lon } = station
  return JSON.parse(
    JSON.stringify({
      id,
      name: name.slice(0, 200),
      homepage,
      favicon,
      country,
      countryCode,
      state,
      tags: tags.filter((t) => typeof t === 'string').slice(0, 8),
      codec,
      bitrate,
      votes: typeof votes === 'number' ? votes : 0,
      lat,
      lon
    })
  ) as RadioStation
}

export function getSaved(): RadioSaved {
  return { favorites: savedStore.get('favorites'), recent: savedStore.get('recent') }
}

export function setFavorite(station: unknown, favorite: boolean): RadioStation[] {
  if (!isStation(station)) throw new TypeError('Invalid station')
  const rest = savedStore.get('favorites').filter((s) => s.id !== station.id)
  const favorites = favorite ? [clean(station), ...rest].slice(0, MAX_FAVORITES) : rest
  savedStore.set('favorites', favorites)
  return favorites
}

export function addRecent(station: unknown): RadioStation[] {
  if (!isStation(station)) throw new TypeError('Invalid station')
  const recent = [clean(station), ...savedStore.get('recent').filter((s) => s.id !== station.id)].slice(0, MAX_RECENT)
  savedStore.set('recent', recent)
  return recent
}

/** Tells every window which song a station is playing now. */
export function broadcastRadioTitle(trackId: string, title: string): void {
  const info: RadioNowPlaying = { trackId, title }
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannels.radioNowPlaying, info)
}
