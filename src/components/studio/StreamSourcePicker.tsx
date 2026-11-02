import { useEffect, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Pin, RotateCcw, Search } from 'lucide-react'
import type { StreamCandidate } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { Button } from '@/components/ui/IconButton'
import { usePlayerStore } from '@/store/usePlayerStore'
import { toast } from '@/store/useToastStore'
import { cx, formatDurationMs } from '@/lib/format'

const QUICK_QUERIES = ['live', 'remix', 'slowed', 'sped up', 'acoustic', 'instrumental']

/** Lets the user swap the YouTube upload that provides a track's audio. */
export function StreamSourcePicker() {
  const current = usePlayerStore((s) => s.current)
  const source = usePlayerStore((s) => s.source)
  const setStreamOverride = usePlayerStore((s) => s.setStreamOverride)

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<StreamCandidate[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  // New track → forget the previous track's candidate list.
  useEffect(() => {
    setCandidates(null)
    setQuery('')
  }, [current?.id])

  if (!current) {
    return <p className="text-[12.5px] text-zinc-500">Play a track to choose where its audio comes from.</p>
  }

  const find = async (q?: string): Promise<void> => {
    setLoading(true)
    try {
      setCandidates(await window.electronAPI.stream.getCandidates(current, q?.trim() ? `${current.artists[0]?.name ?? ''} ${current.title} ${q}` : undefined))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  const apply = async (candidate: StreamCandidate | null): Promise<void> => {
    setApplying(candidate?.videoId ?? 'auto')
    try {
      await setStreamOverride(candidate)
    } finally {
      setApplying(null)
    }
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    void find(query)
  }

  const activeId = source?.candidate?.videoId

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-black/25 p-2.5 ring-1 ring-white/6">
        {source?.isSynthetic ? (
          <p className="text-[12px] text-amber-300/90">No stream matched — a synthesized preview is playing. Search below to pick one.</p>
        ) : source?.candidate ? (
          <div className="flex items-center gap-2.5">
            <Artwork src={source.candidate.artworkUrl} alt="" className="size-9" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-zinc-200">
                {source.isOverride && <Pin size={11} className="shrink-0 text-amber-300" />}
                <span className="truncate">{source.candidate.title}</span>
              </div>
              <div className="truncate text-[11.5px] text-zinc-500">
                {source.candidate.artists.join(', ')} · {source.candidate.kind === 'song' ? 'Song' : 'Video'} ·{' '}
                {source.isOverride ? 'pinned' : 'auto-matched'}
              </div>
            </div>
            {source.isOverride && (
              <Button size="sm" variant="ghost" disabled={applying !== null} onClick={() => void apply(null)} title="Return to automatic matching">
                <RotateCcw size={12} /> Auto
              </Button>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-zinc-500">Resolving source…</p>
        )}
      </div>

      <form onSubmit={submit} className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a version (e.g. live, slowed)…"
          aria-label="Search alternative versions"
          className="h-8 w-full rounded-lg bg-black/30 pr-2 pl-8 text-[12.5px] ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-white/25"
        />
      </form>
      <div className="flex flex-wrap gap-1.5">
        <QuickChip onClick={() => void find()}>Best matches</QuickChip>
        {QUICK_QUERIES.map((q) => (
          <QuickChip
            key={q}
            onClick={() => {
              setQuery(q)
              void find(q)
            }}
          >
            {q}
          </QuickChip>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-4 text-zinc-500">
          <LoaderCircle size={18} className="animate-spin" />
        </div>
      )}
      {!loading && candidates && (
        <ul className="space-y-1">
          {candidates.length === 0 && <li className="py-3 text-center text-[12px] text-zinc-500">No versions found.</li>}
          {candidates.slice(0, 12).map((c) => (
            <li key={c.videoId}>
              <button
                type="button"
                disabled={applying !== null}
                onClick={() => void apply(c)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/6 disabled:opacity-60',
                  c.videoId === activeId && 'bg-white/8'
                )}
              >
                <Artwork src={c.artworkUrl} alt="" className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-zinc-200">{c.title}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {c.artists.join(', ')} · {formatDurationMs(c.durationMs)} · {c.kind}
                  </span>
                </span>
                <span
                  title="Match score"
                  className={cx(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                    c.score >= 0.85 ? 'bg-spotify/15 text-spotify' : c.score >= 0.6 ? 'bg-amber-400/15 text-amber-300' : 'bg-white/8 text-zinc-400'
                  )}
                >
                  {Math.round(c.score * 100)}%
                </span>
                {applying === c.videoId ? (
                  <LoaderCircle size={14} className="shrink-0 animate-spin text-zinc-400" />
                ) : (
                  c.videoId === activeId && <Check size={14} className="shrink-0 text-spotify" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function QuickChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-zinc-400 capitalize ring-1 ring-white/8 transition hover:bg-white/10 hover:text-zinc-200"
    >
      {children}
    </button>
  )
}
