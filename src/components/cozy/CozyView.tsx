import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode, type WheelEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Expand, Palette, Pause, Play, Shrink, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react'
import { artistLine, type UnifiedTrack } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { LikeButton } from '@/components/ui/LikeButton'
import { EqualizerBars } from '@/components/ui/EqualizerBars'
import { Slider } from '@/components/ui/Slider'
import { Backdrop } from '@/components/nowplaying/Backdrop'
import { useEmbedActive } from '@/components/player/EmbedMiniPlayer'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useEmbedLayoutStore } from '@/store/useEmbedLayoutStore'
import { activeLineIndex, useLyricsStore } from '@/store/useLyricsStore'
import { cx } from '@/lib/format'
import { Atmosphere } from './Atmosphere'
import { COMPANIONS, Companion } from './Companion'
import { SCENE_LIST, SCENES, guessScene, type Scene, type SceneGuess } from './scenes'

/** Controls and the cursor fade out after this long without the mouse moving. */
const IDLE_MS = 3_000
/** How much one notch of the mouse wheel changes the volume. */
const WHEEL_STEP = 0.05

/**
 * Cozy mode: the whole window as a calm, slow screen for a second monitor —
 * the cover (or YouTube's player, which must stay visible) over a drifting
 * backdrop, a big clock, the current lyric line and what plays next, with a
 * little companion in the corner. The scene (light, colours, what drifts by)
 * follows the genre of what's playing, or one you pick. Controls appear only
 * while the mouse moves; the mouse wheel changes the volume. Lays itself out
 * vertically on a portrait screen.
 */
export function CozyView() {
  const current = usePlayerStore((s) => s.current)
  const setCozyMode = useSettingsStore((s) => s.setCozyMode)
  const companion = useSettingsStore((s) => s.cozyCompanion)
  const companionLook = useSettingsStore((s) => s.cozyCompanionLook)
  const setStageSlot = useEmbedLayoutStore((s) => s.setStageSlot)
  const embedActive = useEmbedActive()
  const playing = useAudioEngineStore((s) => s.transport.isPlaying)
  const { scene, guess } = useCozyScene(current)
  const [awake, setAwake] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(document.fullscreenElement !== null)
  const [volumeShownAt, setVolumeShownAt] = useState<number | null>(null)
  const idleTimer = useRef<number | null>(null)
  const pickerOpenRef = useRef(false)

  useEffect(() => {
    pickerOpenRef.current = pickerOpen
  }, [pickerOpen])

  const wake = (): void => {
    setAwake(true)
    if (idleTimer.current !== null) window.clearTimeout(idleTimer.current)
    // Stay awake while the picker is open: it would vanish under the pointer.
    idleTimer.current = window.setTimeout(() => setAwake(pickerOpenRef.current), IDLE_MS)
  }

  useEffect(() => {
    idleTimer.current = window.setTimeout(() => setAwake(pickerOpenRef.current), IDLE_MS)
    const onFullscreen = (): void => setFullscreen(document.fullscreenElement !== null)
    // Esc closes the picker, then leaves fullscreen, then cozy mode. (Electron doesn't leave fullscreen on Esc by itself.)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (pickerOpenRef.current) setPickerOpen(false)
      else if (document.fullscreenElement) void document.exitFullscreen()
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

  // The volume readout fades away a moment after the last wheel notch.
  useEffect(() => {
    if (volumeShownAt === null) return
    const timer = window.setTimeout(() => setVolumeShownAt(null), 1_200)
    return () => window.clearTimeout(timer)
  }, [volumeShownAt])

  const toggleFullscreen = (): void => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen()
  }

  const onWheel = (event: WheelEvent): void => {
    // The picker scrolls on its own.
    if ((event.target as HTMLElement).closest('[data-cozy-picker]')) return
    const engine = useAudioEngineStore.getState()
    if (!engine.hydrated || event.deltaY === 0) return
    const from = engine.muted ? 0 : engine.volume
    engine.setVolume(Math.min(1, Math.max(0, Math.round((from + (event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP)) * 100) / 100)))
    setVolumeShownAt(Date.now())
    wake()
  }

  return (
    <div
      onMouseMove={wake}
      onMouseDown={wake}
      onWheel={onWheel}
      style={{ '--cozy-accent': scene.accent, '--cozy-glow': scene.glow } as CSSProperties}
      className={cx('relative isolate flex h-full flex-col overflow-hidden bg-black text-white select-none', !awake && 'cursor-none')}
    >
      <Backdrop artworkUrl={current?.artworkUrl} seed={current?.id ?? ''} />
      {/* A slow, breathing light and a vignette: opacity-only animation, cheap to run all evening. */}
      <div aria-hidden="true" className="st-breathe pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(255,255,255,0.07),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_45%,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
      {/* The scene's colour grade and what drifts through it, cross-fading when the scene changes. */}
      <AnimatePresence>
        <motion.div
          key={scene.id}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 mix-blend-soft-light" style={{ background: scene.tint }} />
          <Atmosphere scene={scene} />
        </motion.div>
      </AnimatePresence>
      <div aria-hidden="true" className="st-grain pointer-events-none absolute inset-0 z-40 opacity-[0.07]" />

      <header className="flex shrink-0 items-start justify-between px-[5vmin] pt-[4vmin]">
        <Clock />
        <div
          className={cx(
            'relative flex items-center gap-1 transition-opacity duration-500',
            awake ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <CozyButton label="Scene & companion" onClick={() => setPickerOpen((open) => !open)} active={pickerOpen}>
            <Palette size={18} />
          </CozyButton>
          <CozyButton label={fullscreen ? 'Leave fullscreen' : 'Fullscreen'} onClick={toggleFullscreen}>
            {fullscreen ? <Shrink size={18} /> : <Expand size={18} />}
          </CozyButton>
          <CozyButton label="Leave cozy mode (Esc)" onClick={() => void setCozyMode(false)}>
            <X size={20} />
          </CozyButton>
          <AnimatePresence>
            {pickerOpen && <ScenePicker scene={scene} guess={guess} onClose={() => setPickerOpen(false)} />}
          </AnimatePresence>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-center justify-center px-[6vmin] portrait:flex-col portrait:justify-center landscape:gap-[6vmin] portrait:gap-[5vmin]">
        {current ? (
          <>
            <div className="relative shrink-0">
              {/* The scene's light pooling under the picture. */}
              <div
                aria-hidden="true"
                className="st-breathe pointer-events-none absolute -inset-[8%] -z-10 rounded-[40%] transition-[background] duration-[1.6s]"
                style={{ background: `radial-gradient(closest-side, rgb(${scene.glow} / 0.30), transparent)` }}
              />
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
                  <p className="mb-[1.6vmin] flex items-center gap-2 text-[clamp(10px,0.8vw,13px)] font-medium tracking-[0.32em] text-[rgb(var(--cozy-accent)/0.6)] uppercase portrait:justify-center">
                    <span className="text-[rgb(var(--cozy-accent)/0.85)]">
                      <EqualizerBars playing={playing} />
                    </span>
                    Now playing
                    {guess?.because && <span className="truncate opacity-75">· {guess.because}</span>}
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
          <div className="flex min-w-0 items-end gap-[2.5vmin]">
            {companion !== 'none' && (
              <Companion
                id={companion}
                look={companionLook}
                playing={playing}
                accent={scene.glow}
                className="-mb-[2vmin] w-[clamp(80px,8.5vw,150px)] shrink-0 drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
              />
            )}
            <UpNext />
          </div>
          <div
            className={cx(
              'flex shrink-0 items-center gap-3 transition-opacity duration-500',
              awake ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <Controls />
          </div>
        </div>
      </footer>
      <Progress />
      <VolumeReadout shownAt={volumeShownAt} />
    </div>
  )
}

/** Genres already looked up this session, by artist name. */
const genreCache = new Map<string, string[]>()

/**
 * The scene for `track`: the one chosen in the picker, or one guessed from its
 * artist's genres (looked up once per artist) and its title. While a new
 * artist's genres are on their way the previous scene stays, so it doesn't flicker.
 */
function useCozyScene(track: UnifiedTrack | null): { scene: Scene; guess: SceneGuess | null } {
  const choice = useSettingsStore((s) => s.cozyScene)
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  const last = useRef<{ scene: Scene; guess: SceneGuess | null }>({ scene: SCENES.lamplight, guess: null })
  const artist = track?.artists[0]?.name ?? ''

  useEffect(() => {
    if (choice !== 'auto' || !artist || genreCache.has(artist)) return
    let live = true
    window.electronAPI.lyrics
      .genres(artist)
      .catch(() => [] as string[])
      .then((tags) => {
        genreCache.set(artist, tags)
        if (live) refresh()
      })
    return () => {
      live = false
    }
  }, [artist, choice])

  if (choice !== 'auto') return { scene: SCENES[choice], guess: null }
  if (!track) return last.current
  const tags = genreCache.get(artist)
  if (!tags && artist) return last.current
  const guess = guessScene(tags ?? [], track.title)
  last.current = { scene: SCENES[guess.scene], guess }
  return last.current
}

/** Picks the companion and the scene; "Auto" shows what it chose and why. */
function ScenePicker({ scene, guess, onClose }: { scene: Scene; guess: SceneGuess | null; onClose: () => void }) {
  const companion = useSettingsStore((s) => s.cozyCompanion)
  const setCompanion = useSettingsStore((s) => s.setCozyCompanion)
  const look = useSettingsStore((s) => s.cozyCompanionLook)
  const setLook = useSettingsStore((s) => s.setCozyCompanionLook)
  const choice = useSettingsStore((s) => s.cozyScene)
  const setScene = useSettingsStore((s) => s.setCozyScene)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement
      if (!panel.current?.contains(target) && !target.closest('[aria-label="Scene & companion"]')) onClose()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])

  const autoHint =
    choice === 'auto' && guess
      ? `By genre — now ${SCENES[guess.scene].label}${guess.because ? ` · ${guess.because}` : ''}`
      : 'Follows the genre of what plays'

  return (
    <motion.div
      ref={panel}
      data-cozy-picker
      role="dialog"
      aria-label="Scene and companion"
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="absolute top-12 right-0 z-50 max-h-[calc(100vh-120px)] w-[320px] origin-top-right overflow-y-auto rounded-2xl border border-white/10 bg-black/55 p-4 text-left shadow-2xl shadow-black/60 backdrop-blur-xl"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] text-white/50 uppercase">Companion</h2>
        <div role="radiogroup" aria-label="Companion style" className="flex rounded-full bg-white/[0.07] p-0.5 text-[11px]">
          {(['stylized', 'pixel'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={look === option}
              onClick={() => setLook(option)}
              className={cx(
                'rounded-full px-2.5 py-1 font-medium text-white/60 transition duration-150 hover:text-white',
                look === option && 'bg-white/20 text-white shadow-sm'
              )}
            >
              {option === 'stylized' ? 'Stylized' : 'Pixel'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {COMPANIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={companion === option.id}
            onClick={() => setCompanion(option.id)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-xl px-1 pt-1.5 pb-1 text-[10.5px] text-white/70 transition duration-150 hover:bg-white/10 hover:text-white',
              companion === option.id && 'bg-white/15 text-white ring-1 ring-white/25'
            )}
          >
            <span className="flex size-10 items-center justify-center">
              {option.id === 'none' ? (
                <X size={16} className="text-white/45" />
              ) : (
                <Companion id={option.id} look={look} playing accent={scene.glow} className="size-10" />
              )}
            </span>
            {option.label}
          </button>
        ))}
      </div>

      <h2 className="mt-4 mb-2.5 text-[11px] font-semibold tracking-[0.2em] text-white/50 uppercase">Scene</h2>
      <div className="space-y-1">
        <SceneOption selected={choice === 'auto'} onClick={() => setScene('auto')} swatch={scene} label="Auto" hint={autoHint} />
        {SCENE_LIST.map((option) => (
          <SceneOption
            key={option.id}
            selected={choice === option.id}
            onClick={() => setScene(option.id)}
            swatch={option}
            label={option.label}
            hint={option.hint}
          />
        ))}
      </div>
    </motion.div>
  )
}

function SceneOption({
  selected,
  onClick,
  swatch,
  label,
  hint
}: {
  selected: boolean
  onClick: () => void
  swatch: Scene
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition duration-150 hover:bg-white/10',
        selected && 'bg-white/15 ring-1 ring-white/25'
      )}
    >
      <span
        aria-hidden="true"
        className="size-7 shrink-0 rounded-full ring-1 ring-white/20"
        style={{
          background: `radial-gradient(circle at 35% 35%, rgb(${swatch.accent}), rgb(${swatch.glow}) 55%, rgb(${swatch.glow2 ?? swatch.glow} / 0.6))`
        }}
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-white">{label}</span>
        <span className="block truncate text-[11.5px] text-white/50">{hint}</span>
      </span>
    </button>
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
      <div className="st-soft mb-[0.6vmin] font-cozy text-[clamp(15px,1.4vw,24px)] text-[rgb(var(--cozy-accent)/0.75)] italic">{greeting}</div>
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
    <div className="st-soft mt-[4.5vmin] min-h-[3.2em] font-cozy text-[clamp(19px,2vw,34px)] leading-snug font-[350] text-[rgb(var(--cozy-accent)/0.9)] italic">
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
    <div className="min-w-0 truncate text-[clamp(12px,1vw,16px)] text-white/50">
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
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-white/15" />
      <CozyVolume />
    </>
  )
}

function volumeIcon(volume: number, muted: boolean, size: number): ReactNode {
  if (muted || volume === 0) return <VolumeX size={size} />
  return volume < 0.5 ? <Volume1 size={size} /> : <Volume2 size={size} />
}

/** Mute and a volume slider, in the scene's colour. The mouse wheel anywhere does the same. */
function CozyVolume() {
  const volume = useAudioEngineStore((s) => s.volume)
  const muted = useAudioEngineStore((s) => s.muted)
  const hydrated = useAudioEngineStore((s) => s.hydrated)
  const setVolume = useAudioEngineStore((s) => s.setVolume)
  const toggleMute = useAudioEngineStore((s) => s.toggleMute)
  const shown = muted ? 0 : volume

  return (
    <div className="flex items-center gap-1.5">
      <CozyButton label={muted ? 'Unmute (M)' : 'Mute (M)'} onClick={toggleMute}>
        {volumeIcon(volume, muted, 19)}
      </CozyButton>
      <div className="w-[clamp(84px,7vw,130px)]">
        <Slider
          label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={shown}
          onChange={setVolume}
          disabled={!hydrated}
          accent="rgb(var(--cozy-accent))"
          valueText={`${Math.round(shown * 100)}%`}
        />
      </div>
    </div>
  )
}

/** A small "volume 45%" pill at the top while the mouse wheel changes the volume. */
function VolumeReadout({ shownAt }: { shownAt: number | null }) {
  const volume = useAudioEngineStore((s) => (s.muted ? 0 : s.volume))
  return (
    <AnimatePresence>
      {shownAt !== null && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="pointer-events-none absolute top-[4vmin] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-black/45 px-4 py-2 text-[13px] text-white/90 shadow-xl shadow-black/40 backdrop-blur-md"
        >
          {volumeIcon(volume, false, 16)}
          <span className="h-1 w-28 overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full origin-left rounded-full bg-[rgb(var(--cozy-accent))] transition-transform duration-150"
              style={{ transform: `scaleX(${volume})` }}
            />
          </span>
          <span className="w-9 text-right tabular-nums">{Math.round(volume * 100)}%</span>
        </motion.div>
      )}
    </AnimatePresence>
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

function CozyButton({ label, onClick, active = false, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex size-10 items-center justify-center rounded-full text-white/70 transition duration-150 ease-out hover:scale-110 hover:bg-white/10 hover:text-white active:scale-90',
        active && 'bg-white/15 text-white'
      )}
    >
      {children}
    </button>
  )
}
