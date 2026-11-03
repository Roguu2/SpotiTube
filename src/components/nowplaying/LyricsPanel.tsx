import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LocateFixed, MicVocal, RotateCcw } from 'lucide-react'
import type { LyricLine, Lyrics } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { activeLineIndex, useLyricsStore } from '@/store/useLyricsStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { cx } from '@/lib/format'

/** After scrolling the lyrics by hand, follow the song again once the user has left them alone this long. */
const RESUME_FOLLOW_MS = 6_000
/** The sung line sits this far down the panel, leaving room for what comes next. */
const FOCUS_POINT = 0.36
/** LRCLIB is sometimes briefly overloaded: one quiet retry before showing the error's button. */
const AUTO_RETRY_MS = 4_000
/** A different-length recording than the one the lyrics were timed to will drift. */
const DRIFT_WARNING_S = 4
const OFFSET_STEP_S = 0.5

const FADE_MASK = '[mask-image:linear-gradient(to_bottom,transparent,black_9%,black_82%,transparent)]'

export function LyricsPanel({ track }: { track: UnifiedTrack }) {
  const entry = useLyricsStore((s) => s.entries[track.id])
  const load = useLyricsStore((s) => s.load)

  const autoRetried = useRef(false)

  useEffect(() => {
    load(track)
  }, [track, load])

  useEffect(() => {
    if (entry?.status !== 'error' || autoRetried.current) return
    autoRetried.current = true
    const timer = window.setTimeout(() => load(track, true), AUTO_RETRY_MS)
    return () => window.clearTimeout(timer)
  }, [entry, track, load])

  if (!entry || entry.status === 'loading') return <LyricsSkeleton />
  if (entry.status === 'error') {
    return (
      <LyricsMessage
        title="Couldn't load lyrics"
        detail="LRCLIB didn't answer. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => load(track, true) }}
      />
    )
  }

  const lyrics = entry.lyrics
  if (lyrics?.synced) return <SyncedLyrics track={track} lyrics={lyrics} lines={lyrics.synced} />
  if (lyrics?.plain) return <PlainLyrics text={lyrics.plain} />
  if (lyrics?.instrumental) return <LyricsMessage title="Instrumental" detail="No vocals on this one — just the music." />
  return (
    <LyricsMessage
      title="No lyrics for this track yet"
      detail="SpotiTube looks lyrics up on LRCLIB, a free community database. Nobody has added this song there so far."
    />
  )
}

function SyncedLyrics({ track, lyrics, lines }: { track: UnifiedTrack; lyrics: Lyrics; lines: LyricLine[] }) {
  const offset = useLyricsStore((s) => s.offsets[track.id] ?? 0)
  const setOffset = useLyricsStore((s) => s.setOffset)
  const shiftOffset = useLyricsStore((s) => s.shiftOffset)
  // Selecting the index (not the time) re-renders only when the sung line changes.
  const active = useAudioEngineStore((s) => activeLineIndex(lines, s.transport.currentTime, offset))
  const duration = useAudioEngineStore((s) => s.transport.duration)
  const seek = usePlayerStore((s) => s.seek)

  const scrollerRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const resumeTimer = useRef<number | null>(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    if (!follow) return
    const scroller = scrollerRef.current
    const line = lineRefs.current[Math.max(0, active)]
    if (!scroller || !line) return
    scroller.scrollTo({
      top: line.offsetTop + line.offsetHeight / 2 - scroller.clientHeight * FOCUS_POINT,
      behavior: 'smooth'
    })
  }, [active, follow])

  useEffect(
    () => () => {
      if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current)
    },
    []
  )

  // Wheel, touch and keyboard scrolling are the user's; programmatic smooth scrolls aren't.
  const pauseFollow = (): void => {
    setFollow(false)
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => setFollow(true), RESUME_FOLLOW_MS)
  }

  const resumeFollow = (): void => {
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current)
    setFollow(true)
  }

  const drift = duration > 0 && lyrics.durationSec ? Math.round(duration - lyrics.durationSec) : 0

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollerRef}
        onWheel={pauseFollow}
        onTouchMove={pauseFollow}
        onKeyDown={(e) => ['PageUp', 'PageDown', 'Home', 'End'].includes(e.key) && pauseFollow()}
        className={cx('relative min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]', FADE_MASK)}
      >
        <div className="pt-[16vh] pb-[42vh]">
          {lines.map((line, i) => (
            <button
              key={`${i}-${line.time}`}
              ref={(el) => {
                lineRefs.current[i] = el
              }}
              type="button"
              onClick={() => {
                seek(Math.max(0, line.time + offset))
                resumeFollow()
              }}
              title="Play from this line"
              aria-current={i === active ? 'true' : undefined}
              className={cx(
                'block w-full origin-left rounded-xl px-3 py-1.5 text-left leading-snug font-bold tracking-tight transition-[color,transform] duration-300 ease-out hover:bg-white/[0.04] hover:text-white/90',
                line.text ? 'text-[clamp(22px,2.1vw,32px)]' : 'text-[clamp(18px,1.6vw,24px)]',
                i === active ? 'scale-100 text-white' : 'scale-[0.97]',
                i < active && 'text-white/30',
                i > active && 'text-white/55'
              )}
            >
              {line.text || '♪'}
            </button>
          ))}
        </div>
      </div>

      {!follow && (
        <button
          type="button"
          onClick={resumeFollow}
          className="absolute bottom-14 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1.5 text-[12px] font-semibold text-zinc-900 shadow-lg shadow-black/40 transition hover:bg-white"
        >
          <LocateFixed size={13} /> Back to current line
        </button>
      )}

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-3 text-[11.5px] text-white/45">
        <Credit />
        {Math.abs(drift) > DRIFT_WARNING_S && (
          <span className="text-amber-200/80">
            This version is {Math.abs(drift)} s {drift > 0 ? 'longer' : 'shorter'} than the timed lyrics — adjust the
            sync if they drift.
          </span>
        )}
        <div className="ml-auto flex items-center gap-1" role="group" aria-label="Lyrics sync">
          <span className="mr-1">Sync</span>
          <SyncButton label="Show lyrics earlier" onClick={() => shiftOffset(track.id, -OFFSET_STEP_S)}>
            −0.5 s
          </SyncButton>
          <span className="w-12 text-center text-white/70 tabular-nums" aria-live="polite">
            {offset > 0 ? '+' : ''}
            {offset.toFixed(1)} s
          </span>
          <SyncButton label="Show lyrics later" onClick={() => shiftOffset(track.id, OFFSET_STEP_S)}>
            +0.5 s
          </SyncButton>
          {offset !== 0 && (
            <SyncButton label="Reset sync" onClick={() => setOffset(track.id, 0)}>
              <RotateCcw size={11} />
            </SyncButton>
          )}
        </div>
      </footer>
    </div>
  )
}

function PlainLyrics({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cx('min-h-0 flex-1 overflow-y-auto [scrollbar-width:none]', FADE_MASK)}>
        <p className="px-3 pt-[8vh] pb-[20vh] text-[clamp(18px,1.6vw,24px)] leading-relaxed font-semibold whitespace-pre-line text-white/80">
          {text}
        </p>
      </div>
      <footer className="flex items-center gap-4 pt-3 text-[11.5px] text-white/45">
        <Credit />
        <span>These lyrics aren&apos;t time-synced.</span>
      </footer>
    </div>
  )
}

function LyricsSkeleton() {
  const widths = ['72%', '58%', '84%', '46%', '66%', '78%']
  return (
    <div aria-label="Loading lyrics" className="flex h-full flex-col justify-center gap-5 px-3">
      {widths.map((width, i) => (
        <div
          key={width}
          className="h-7 animate-pulse rounded-lg bg-white/8"
          style={{ width, animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  )
}

function LyricsMessage({
  title,
  detail,
  action
}: {
  title: string
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-3 px-3">
      <MicVocal size={28} className="text-white/30" />
      <h3 className="text-[clamp(22px,2vw,30px)] font-bold tracking-tight text-white/85">{title}</h3>
      <p className="max-w-md text-[14px] leading-relaxed text-white/50">{detail}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-full bg-white/10 px-4 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

function Credit() {
  return (
    <span>
      Lyrics from{' '}
      <a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white/70 hover:underline">
        LRCLIB
      </a>
    </span>
  )
}

function SyncButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 items-center rounded-full px-2 text-white/60 tabular-nums ring-1 ring-white/12 transition hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  )
}
