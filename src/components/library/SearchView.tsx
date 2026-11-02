import { useEffect, useRef } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { TrackList } from './TrackList'
import { useLibraryStore } from '@/store/useLibraryStore'

export function SearchView() {
  const search = useLibraryStore((s) => s.search)
  const setQuery = useLibraryStore((s) => s.setSearchQuery)
  const providers = useLibraryStore((s) => s.providers)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => inputRef.current?.focus(), [])

  const spotifyDemo = providers.find((p) => p.providerId === 'spotify')?.showingDemo ?? false
  const { results } = search

  return (
    <div className="px-8 pt-6 pb-10">
      <h1 className="text-3xl font-bold tracking-tight">Search</h1>
      <div className="relative mt-5 max-w-2xl">
        <Search size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-zinc-500" />
        <input
          ref={inputRef}
          type="search"
          value={search.query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs and artists on Spotify and YouTube Music"
          aria-label="Search"
          className="h-12 w-full rounded-full bg-white/[0.07] pr-12 pl-11 text-[15px] text-zinc-100 ring-1 ring-white/10 outline-none transition placeholder:text-zinc-500 focus:bg-white/10 focus:ring-white/25 [&::-webkit-search-cancel-button]:hidden"
        />
        {search.loading ? (
          <LoaderCircle size={17} className="absolute top-1/2 right-4 -translate-y-1/2 animate-spin text-zinc-500" />
        ) : (
          search.query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:text-zinc-200"
            >
              <X size={16} />
            </button>
          )
        )}
      </div>

      {results ? (
        <div className="mt-8 grid grid-cols-2 gap-6">
          <ResultColumn
            source="spotify"
            tracks={results.spotify}
            error={results.errors.spotify}
            note={spotifyDemo ? 'Showing matches from the sample library — connect Spotify to search its full catalog.' : undefined}
            query={search.query}
          />
          <ResultColumn source="ytmusic" tracks={results.ytmusic} error={results.errors.ytmusic} query={search.query} />
        </div>
      ) : (
        <p className="mt-16 text-center text-sm text-zinc-500">
          Results from both catalogs appear side by side. Add anything to a hybrid playlist to mix them.
        </p>
      )}
    </div>
  )
}

interface ResultColumnProps {
  source: 'spotify' | 'ytmusic'
  tracks: UnifiedTrack[]
  error?: string
  note?: string
  query: string
}

function ResultColumn({ source, tracks, error, note, query }: ResultColumnProps) {
  return (
    <section aria-label={`${source === 'spotify' ? 'Spotify' : 'YouTube Music'} results`} className="min-w-0">
      <header className="mb-3 flex items-center gap-2.5">
        <SourceBadge source={source} />
        <span className="text-[13px] text-zinc-500 tabular-nums">{tracks.length} results</span>
      </header>
      {note && <p className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] text-zinc-400">{note}</p>}
      {error && <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}
      {tracks.length ? (
        <TrackList compact tracks={tracks} context={{ label: `“${query}” on ${source === 'spotify' ? 'Spotify' : 'YT Music'}` }} />
      ) : (
        !error && <p className="py-8 text-center text-[13px] text-zinc-500">No matches.</p>
      )}
    </section>
  )
}
