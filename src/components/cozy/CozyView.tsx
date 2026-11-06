import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Expand, Pause, Play, Shrink, SkipBack, SkipForward, X } from 'lucide-react'
import { artistLine } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { LikeButton } from '@/components/ui/LikeButton'
import { EqualizerBars } from '@/components/ui/EqualizerBars'
import { Backdrop } from '@/components/nowplaying/Backdrop'
import { useEmbedActive } from '@/components/player/EmbedMiniPlayer'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useEmbedLayoutStore } from '@/store/useEmbedLayoutStore'
import { activeLineIndex, useLyricsStore } from '@/store/useLyricsStore'
import { cx } from '@/lib/format'

/** Controls and the cursor fade out after this long without the mouse moving. */
const IDLE_MS = 3_000

/**
 * Cozy mode: the whole window as a calm, slow screen for a second monitor —
 * the cover (or YouTube's player, which must stay visible) over a drifting
 * backdrop, a big clock, the current lyric line and what plays next. Controls
 * appear only while the mouse moves. Lays itself out vertically on a portrait screen.
 */
export function CozyView() {
  const current = usePlayerStore((s) => s.current)
  const setCozyMode = useSettingsStore((s) => s.setCozyMode)
  const setStageSlot = useEmbedLayoutStore((s) => s.setStageSlot)
  const embedActive = useEmbedActive()
  const playing = useAudioEngineStore((s) => s.transport.isPlaying)
  const [awake, setAwake] = useState(true)
  const [fullscreen, setFullscreen] = useState(document.fullscreenElement !== null)
  const idleTimer = useRef<number | null>(null)

  const wake = (): void => {
    setAwake(true)
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setAwake(false), IDLE_MS)
  }

  useEffect(() => {
    idleTimer.current = window.setTimeout(() => setAwake(false), IDLE_MS)
    const onFullscreen = (): void => setFullscreen(document.fullscreenElement !== null)
    // Esc leaves fullscreen first, then cozy mode. (Electron doesn't leave fullscreen on Esc by itself.)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.fullscreenElement) void document.exitFullscreen()
      else void setCozyMode(false)
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    window.addEventListener('keydown', onKey)
    return () => {
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
      document.removeEventListener('fullscreenchange', onFullscreen)
      window.removeEventListener('keydown', onKey)
    }
  }, [setCozyMode])

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  return (
    <div
      onMouseMove={wake}
      onMouseDown={wake}
      className={cx('relative isolate flex h-full flex-col overflow-hidden bg-black text-white select-none', !awake && 'cursor-none')}
    >
      <Backdrop artworkUrl={current?.artworkUrl} seed={current?.id ?? ''} />
      {/* A slow, breathing light and a vignette: opacity-only animation, cheap to run all evening. */}
      <div aria-hidden="true" className="st-breathe pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(255,255,255,0.07),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
      {/* Warm grade, like a lamp-lit room. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(170deg,rgba(255,196,140,0.10),rgba(255,140,80,0.08)_55%,rgba(120,60,30,0.18))] mix-blend-soft-light" />
      <FairyLights />
      <div aria-hidden="true" className="st-grain pointer-events-none absolute inset-0 z-40 opacity-[0.07]" />

      <header className="flex shrink-0 items-start justify-between px-[5vmin] pt-[4vmin]">
        <Clock />
        <div
          className={cx(
            'flex items-center gap-1 transition-opacity duration-500',
            awake ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <CozyButton label={fullscreen ? 'Leave fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
            {fullscreen ? <Shrink size={18} /> : <Expand size={18} />}
          </CozyButton>
          <CozyButton label="Leave cozy mode (Esc)" onClick={() => void setCozyMode(false)}>
            <X size={20} />
          </CozyButton>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-[6vmin] portrait:flex-col portrait:justify-center landscape:gap-[6vmin] portrait:gap-[5vmin]">
        {current ? (
          <>
            <div className="relative shrink-0">
              {/* Lamplight pooling under the picture. */}
              <div aria-hidden="true" className="st-breathe pointer-events-none absolute -inset-[8%] -z-10 rounded-[40%] bg-[radial-gradient(closest-side,rgba(255,170,100,0.30),transparent)]" />
              {embedActive ? (
                <div
                  ref={setStageSlot}
                  aria-hidden="true"
                  className="aspect-video w-[min(46vw,900px)] min-w-[356px] rounded-[28px] bg-black/40 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] portrait:w-[min(86vw,900px)]"
                />
              ) : (
                <Artwork
                  src={current.artworkUrl}
                  alt=""
                  rounded="xl"
                  className="aspect-square w-[min(34vw,560px)] rounded-[28px] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] portrait:w-[min(70vw,560px)]"
                />
              )}
            </div>
            {/* A fixed width: a longer or shorter title must not shift the player beside it. */}
            <div className="w-[min(38vw,660px)] min-w-0 portrait:w-[min(86vw,900px)] portrait:text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                >
                  <p className="mb-[1.6vmin] flex items-center gap-2 text-[clamp(10px,0.8vw,13px)] font-medium tracking-[0.32em] text-amber-100/55 uppercase portrait:justify-center">
                    <span className="text-amber-200/70">
                      <EqualizerBars playing={playing} />
                    </span>
                    Now playing
                  </p>
                  <h1 className="st-soft line-clamp-2 font-cozy text-[clamp(32px,4.2vw,80px)] leading-[1.02] font-[420] tracking-[-0.01em] text-[#fff6ec]">
                    {current.title}
                  </h1>
                  <p className="mt-[1.6vmin] truncate text-[clamp(16px,1.6vw,26px)] font-light text-white/75">{artistLine(current)}</p>
                  {current.album?.name && (
                    <p className="st-soft mt-1 truncate font-cozy text-[clamp(14px,1.2vw,20px)] text-white/45 italic">{current.album.name}</p>
                  )}
                </motion.div>
              </AnimatePresence>
              <LyricLine />
            </div>
          </>
        ) : (
          <p className="st-soft font-cozy text-[clamp(20px,2.4vw,36px)] text-white/60 italic">Nothing playing — pick something cozy.</p>
        )}
      </main>

      <footer className="relative shrink-0 px-[5vmin] pb-[4vmin]">
        <div className="flex items-end justify-between gap-6">
          <UpNext />
          <div
            className={cx(
              'flex items-center gap-3 transition-opacity duration-500',
              awake ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <Controls />
          </div>
        </div>
      </footer>
      <Progress />
    </div>
  )
}

/** Big, quiet clock with the date, in the system's language. */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Tick on the minute, so the time never lags.
    let timer = window.setTimeout(function tick() {
      setNow(new Date())
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000))
    }, 60_000 - (Date.now() % 60_000))
    return () => window.clearTimeout(timer)
  }, [])

  const hour = now.getHours()
  const greeting =
    hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : hour < 22 ? 'Good evening' : 'Late night'

  return (
    <div className="drop-shadow-[0_2px_16px_rgba(0,0,0,0.45)]">
      <div className="st-soft mb-[0.6vmin] font-cozy text-[clamp(15px,1.4vw,24px)] text-amber-100/70 italic">{greeting}</div>
      <div className="st-soft font-cozy text-[clamp(44px,7vw,132px)] leading-[0.95] font-[300] tracking-[-0.02em] text-[#fff6ec] tabular-nums">
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
      </div>
      <div className="mt-[1.2vmin] text-[clamp(12px,1.05vw,18px)] font-light tracking-wide text-white/55 first-letter:uppercase">
        {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      </div>
    </div>
  )
}

/** The line being sung, softly replaced as the song moves on; nothing when there are no synced lyrics. */
function LyricLine() {
  const current = usePlayerStore((s) => s.current)
  const entry = useLyricsStore((s) => (current ? s.entries[current.id] : undefined))
  const offset = useLyricsStore((s) => (current ? (s.offsets[current.id] ?? 0) : 0))
  const load = useLyricsStore((s) => s.load)
  const lines = entry?.status === 'ready' ? (entry.lyrics?.synced ?? null) : null
  const index = useAudioEngineStore((s) => (lines ? activeLineIndex(lines, s.transport.currentTime, offset) : -1))

  useEffect(() => {
    if (current) load(current)
  }, [current, load])

  if (!lines || index < 0) return null
  const text = lines[index].text || '♪'
  return (
    <div className="st-soft mt-[4.5vmin] min-h-[3.2em] font-cozy text-[clamp(19px,2vw,34px)] leading-snug font-[350] text-amber-50/85 italic">
      <AnimatePresence mode="wait">
        <motion.p
          key={`${index}-${text}`}
          initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="line-clamp-2"
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function UpNext() {
  const next = usePlayerStore((s) => s.queue[s.order[s.position + 1]])
  if (!next) return <span />
  return (
    <div className="min-w-0 text-[clamp(12px,1vw,16px)] text-white/50">
      <span className="tracking-[0.2em] uppercase">Up next</span>
      <span className="mx-2">·</span>
      <span className="text-white/75">{next.title}</span>
      <span className="text-white/45"> — {artistLine(next)}</span>
    </div>
  )
}

function Controls() {
  const current = usePlayerStore((s) => s.current)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)

  return (
    <>
      {current && <LikeButton track={current} size={20} className="size-10 text-white/70" />}
      <CozyButton label="Previous" onClick={() => void previous()}>
        <SkipBack size={20} fill="currentColor" />
      </CozyButton>
      <button
        type="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        disabled={!current}
        onClick={() => void togglePlay()}
        className="flex size-14 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow-xl shadow-black/40 transition duration-150 ease-out hover:scale-105 hover:bg-white active:scale-95 disabled:opacity-40"
      >
        {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-px" />}
      </button>
      <CozyButton label="Next" onClick={() => void next()}>
        <SkipForward size={20} fill="currentColor" />
      </CozyButton>
    </>
  )
}

/** A hairline along the bottom edge; scaleX keeps it off the layout path. */
function Progress() {
  const ratio = useAudioEngineStore((s) => {
    const { currentTime, duration } = s.transport
    return duration > 0 ? Math.round((currentTime / duration) * 1000) / 1000 : 0
  })
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
      <div className="h-full origin-left bg-white/60 transition-transform duration-300 ease-linear" style={{ transform: `scaleX(${ratio})` }} />
    </div>
  )
}

function CozyButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-full text-white/70 transition duration-150 ease-out hover:scale-110 hover:bg-white/10 hover:text-white active:scale-90"
    >
      {children}
    </button>
  )
}

/** Positions, sizes and timings of the drifting lights: fixed, so the scene is the same every time. */
const LIGHTS = [
  { left: '8%', top: '78%', size: 220, t: 34, delay: 0, dx: '40px', dy: '-260px', glow: 0.45 },
  { left: '22%', top: '88%', size: 120, t: 26, delay: -9, dx: '-30px', dy: '-220px', glow: 0.55 },
  { left: '41%', top: '92%', size: 180, t: 40, delay: -20, dx: '20px', dy: '-300px', glow: 0.35 },
  { left: '58%', top: '84%', size: 90, t: 22, delay: -4, dx: '-20px', dy: '-200px', glow: 0.6 },
  { left: '71%', top: '90%', size: 260, t: 46, delay: -30, dx: '50px', dy: '-280px', glow: 0.3 },
  { left: '86%', top: '76%', size: 140, t: 30, delay: -15, dx: '-40px', dy: '-240px', glow: 0.5 },
  { left: '93%', top: '30%', size: 110, t: 38, delay: -25, dx: '-30px', dy: '-160px', glow: 0.35 },
  { left: '3%', top: '35%', size: 150, t: 42, delay: -12, dx: '30px', dy: '-180px', glow: 0.3 }
]

/** Soft, out-of-focus lights rising slowly, like fairy lights behind the music. */
function FairyLights() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {LIGHTS.map((light) => (
        <span
          key={light.left + light.top}
          className="st-bokeh absolute rounded-full bg-[radial-gradient(closest-side,rgba(255,206,150,0.55),rgba(255,170,100,0.18)_55%,transparent)]"
          style={
            {
              left: light.left,
              top: light.top,
              width: light.size,
              height: light.size,
              '--t': light.t + 's',
              '--delay': light.delay + 's',
              '--dx': light.dx,
              '--dy': light.dy,
              '--glow': light.glow
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
