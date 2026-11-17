import { ExternalLink, Music2, Radio } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { LiveDot } from '@/components/ui/LiveDot'
import { stationOf, useRadioStore } from '@/store/useRadioStore'

const EMPTY: { title: string; at: number }[] = []

function clock(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Takes the lyrics' place for a live station: what's on air now and what it played while you listened. */
export function RadioNowPanel({ track }: { track: UnifiedTrack }) {
  const liveTitle = useRadioStore((s) => s.liveTitles[track.id])
  const log = useRadioStore((s) => s.titleLog[track.id] ?? EMPTY)
  const station = stationOf(track.id, track)
  const details = [station?.codec, station?.bitrate ? `${station.bitrate} kbps` : undefined].filter(Boolean).join(' · ')

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-8">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-red-300/90 uppercase">
          <LiveDot />
          On air
        </p>
        {liveTitle ? (
          <p className="mt-3 line-clamp-3 text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-bold tracking-tight text-white">
            {liveTitle}
          </p>
        ) : (
          <p className="mt-3 text-[clamp(18px,1.6vw,24px)] font-semibold text-white/55">
            This station doesn't say what it's playing.
          </p>
        )}
      </div>

      {log.length > 1 && (
        <section aria-label="Played on this station" className="min-h-0">
          <h3 className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-white/45 uppercase">Earlier on this station</h3>
          <ul className="space-y-1.5 overflow-y-auto pr-2">
            {log.slice(1).map((entry) => (
              <li key={entry.at} className="flex items-baseline gap-3 text-[14px] text-white/70">
                <span className="w-12 shrink-0 text-[12px] text-white/40 tabular-nums">{clock(entry.at)}</span>
                <Music2 size={13} className="shrink-0 translate-y-0.5 text-white/35" />
                <span className="truncate">{entry.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {station && (
        <div className="flex flex-wrap items-center gap-2">
          {station.tags.slice(0, 6).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-[12px] text-white/75">
              {tag}
            </span>
          ))}
          {details && (
            <span className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-white/45">
              <Radio size={13} />
              {details}
            </span>
          )}
          {station.homepage?.startsWith('https://') && (
            <a
              href={station.homepage}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-white/55 transition hover:text-white"
            >
              <ExternalLink size={13} />
              Station website
            </a>
          )}
        </div>
      )}
    </div>
  )
}
