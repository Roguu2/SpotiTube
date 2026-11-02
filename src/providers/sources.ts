import type { SourceId } from '@core/types'

export interface SourceMeta {
  id: SourceId
  label: string
  /** Compact sidebar tag, e.g. `SP`. */
  short: string
  /** Solid brand colour, or the first stop of a gradient. */
  color: string
  /** Tailwind classes for the badge pill. */
  pillClass: string
  /** Tailwind text colour for accents tied to this source. */
  textClass: string
}

/** Renderer-side metadata for every music source the provider layer can return. */
export const SOURCES: Record<SourceId, SourceMeta> = {
  spotify: {
    id: 'spotify',
    label: 'Spotify',
    short: 'SP',
    color: '#1DB954',
    pillClass: 'bg-spotify/15 text-spotify ring-1 ring-inset ring-spotify/40',
    textClass: 'text-spotify'
  },
  ytmusic: {
    id: 'ytmusic',
    label: 'YT Music',
    short: 'YT',
    color: '#FF0000',
    pillClass: 'bg-ytmusic/15 text-[#ff4d4d] ring-1 ring-inset ring-ytmusic/45',
    textClass: 'text-[#ff4d4d]'
  },
  hybrid: {
    id: 'hybrid',
    label: 'Hybrid',
    short: 'HY',
    color: '#1DB954',
    pillClass: 'bg-gradient-to-r from-spotify to-ytmusic text-white shadow-sm shadow-black/40',
    textClass: 'text-zinc-100'
  },
  local: {
    id: 'local',
    label: 'Local',
    short: 'LO',
    color: '#a1a1aa',
    pillClass: 'bg-zinc-500/15 text-zinc-300 ring-1 ring-inset ring-zinc-500/40',
    textClass: 'text-zinc-300'
  }
}
