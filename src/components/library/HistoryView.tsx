import { useMemo } from 'react'
import { History, LoaderCircle, Play, Trash } from 'lucide-react'
import type { PlayRecord } from '@core/ipc'
import type { UnifiedPlaylist, UnifiedTrack } from '@core/types'
import { Button } from '@/components/ui/IconButton'
import { PlaylistCard } from './PlaylistCard'
import { TrackList } from './TrackList'
import { useHistoryStore } from '@/store/useHistoryStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'

const CONTEXT = { label: 'Recently played' }
const MAX_JUMP_BACK = 6
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4'

interface DaySection {
  label: string
  tracks: UnifiedTrack[]
  offset: number
}

function dayLabel(timestamp: number, today: Date): string {
  const day = new Date(timestamp)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const daysAgo = Math.round((startOfToday - startOfDay) / 86_400_000)
  if (daysAgo === 0) return 'Today'
  if (daysAgo === 1) return 'Yesterday'
  if (daysAgo < 7) return day.toLocaleDateString(undefined, { weekday: 'long' })
  return day.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric'
  })
}

/** Groups plays by calendar day; a track heard several times in a day is listed once, at its latest play. */
function groupByDay(plays: PlayRecord[]): DaySection[] {
  const today = new Date()
  const sections: DaySection[] = []
  let seen = new Set<string>()
  let offset = 0
  for (const play of plays) {
    const label = dayLabel(play.playedAt, today)
    let section = sections[sections.length - 1]
    if (!section || section.label !== label) {
      section = { label, tracks: [], offset }
      sections.push(section)
      seen = new Set()
    }
    if (seen.has(play.track.id)) continue
    seen.add(play.track.id)
    section.tracks.push(play.track)
    offset++
  }
  return sections
}

/** Playlists the user listened from most recently, that are still in the library. */
function recentPlaylists(plays: PlayRecord[], playlists: UnifiedPlaylist[]): UnifiedPlaylist[] {
  const byId = new Map(playlists.map((p) => [p.id, p]))
  const result: UnifiedPlaylist[] = []
  for (const play of plays) {
    const playlist = play.context?.playlistId ? byId.get(play.context.playlistId) : undefined
    if (playlist && !result.includes(playlist)) result.push(playlist)
    if (result.length === MAX_JUMP_BACK) break
  }
  return result
}

export function HistoryView() {
  const plays = useHistoryStore((s) => s.plays)
  const loaded = useHistoryStore((s) => s.loaded)
  const clear = useHistoryStore((s) => s.clear)
  const playlists = useLibraryStore((s) => s.playlists)
  const playQueue = usePlayerStore((s) => s.playQueue)

  const sections = useMemo(() => groupByDay(plays), [plays])
  const allTracks = useMemo(() => sections.flatMap((s) => s.tracks), [sections])
  const jumpBack = useMemo(() => recentPlaylists(plays, playlists), [plays, playlists])

  return (
    <div className="px-8 pt-6 pb-10">
      <h1 className="text-3xl font-bold tracking-tight">Recently played</h1>
      <p className="mt-1 text-[14px] text-zinc-500">Everything you listened to, from both services.</p>

      {!loaded ? (
        <div className="flex justify-center py-16 text-zinc-500">
          <LoaderCircle className="animate-spin" size={22} aria-label="Loading history" />
        </div>
      ) : !plays.length ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center text-sm text-zinc-500">
          <History size={28} className="text-zinc-600" />
          Tracks you listen to for more than 30 seconds show up here.
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              aria-label="Play recently played"
              onClick={() => void playQueue(allTracks, 0, CONTEXT)}
              className="flex size-12 items-center justify-center rounded-full bg-spotify text-black shadow-lg shadow-spotify/20 transition hover:scale-105 hover:bg-[#1ed760]"
            >
              <Play size={20} fill="currentColor" className="translate-x-px" />
            </button>
            <Button variant="ghost" onClick={() => void clear()}>
              <Trash size={15} /> Clear history
            </Button>
          </div>

          {jumpBack.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-bold tracking-tight">Jump back in</h2>
              <div className={GRID}>
                {jumpBack.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} />
                ))}
              </div>
            </section>
          )}

          <div className="-mx-3 mt-8 space-y-6">
            {sections.map((section, i) => (
              <section key={`${section.label}:${section.offset}`} aria-label={section.label}>
                <h2 className="mb-2 px-3 text-[15px] font-semibold text-zinc-200">{section.label}</h2>
                <TrackList
                  tracks={section.tracks}
                  queueTracks={allTracks}
                  indexOffset={section.offset}
                  hideHeader={i > 0}
                  context={CONTEXT}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
