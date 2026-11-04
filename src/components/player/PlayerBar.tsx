import {
  ListMusic,
  LoaderCircle,
  MicVocal,
  PictureInPicture2,
  Pause,
  Pin,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { Artwork } from '@/components/ui/Artwork'
import { IconButton } from '@/components/ui/IconButton'
import { Slider } from '@/components/ui/Slider'
import { AddToHybridMenu } from '@/components/library/AddToHybridMenu'
import { ArtistLinks } from '@/components/library/CatalogLinks'
import { LikeButton } from '@/components/ui/LikeButton'
import { SeekBar } from './SeekBar'
import { SleepTimerButton } from './SleepTimerButton'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'

export function PlayerBar() {
  return (
    <footer
      aria-label="Player"
      className="glass relative z-10 grid h-[88px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-t border-white/6 px-4"
    >
      <NowPlaying />
      <Transport />
      <RightControls />
    </footer>
  )
}

function NowPlaying() {
  const current = usePlayerStore((s) => s.current)
  const source = usePlayerStore((s) => s.source)
  const status = usePlayerStore((s) => s.status)
  const error = usePlayerStore((s) => s.error)
  const openQueue = useSettingsStore((s) => s.toggleQueue)
  const toggleNowPlaying = useSettingsStore((s) => s.toggleNowPlaying)

  if (!current) {
    return <div className="text-[13px] text-zinc-600">Pick a track to start listening.</div>
  }

  const showSource = source?.mode === 'embed' || (current.source !== 'ytmusic' && source?.mode === 'stream')
  const sourceLabel = source?.mode === 'embed' ? 'YouTube player' : 'via YT Music'

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        aria-label="Open Now playing"
        title="Now playing & lyrics"
        onClick={() => toggleNowPlaying()}
        className="group relative shrink-0"
      >
        <Artwork src={current.artworkUrl} alt="" className="size-14 shadow-lg shadow-black/50" />
        <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100">
          <MicVocal size={18} />
        </span>
      </button>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-zinc-100">{current.title}</span>
          <LikeButton track={current} className="size-6" />
          <AddToHybridMenu tracks={[current]} className="size-6" />
        </div>
        <ArtistLinks artists={current.artists} className="block text-[12.5px] text-zinc-400" />
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          {status === 'error' ? (
            <span className="truncate text-[11px] text-red-400" title={error ?? undefined}>
              Playback failed
            </span>
          ) : source?.mode === 'synthetic' ? (
            <span className="truncate text-[11px] text-amber-300/90">Synth preview</span>
          ) : showSource ? (
            <button
              type="button"
              onClick={() => openQueue(true)}
              title={`Audio from: ${source?.candidate?.title} — click to choose another version`}
              className="flex min-w-0 items-center gap-1 truncate text-[11px] text-zinc-500 hover:text-zinc-300"
            >
              {source?.isOverride && <Pin size={10} className="shrink-0 text-amber-300" />}
              <span className="truncate">{sourceLabel}</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Transport() {
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)
  const isBuffering = useAudioEngineStore((s) => s.transport.isBuffering)

  const busy = status === 'resolving' || (isBuffering && status !== 'error')
  const disabled = !current

  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <IconButton label={shuffle ? 'Shuffle on' : 'Shuffle off'} active={shuffle} size="sm" onClick={toggleShuffle} disabled={disabled}>
          <Shuffle size={16} />
        </IconButton>
        <IconButton label="Previous" onClick={() => void previous()} disabled={disabled}>
          <SkipBack size={18} fill="currentColor" />
        </IconButton>
        <button
          type="button"
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={disabled}
          onClick={() => void togglePlay()}
          className="flex size-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-950 shadow-lg shadow-black/40 transition hover:scale-105 hover:bg-white disabled:opacity-40 disabled:hover:scale-100"
        >
          {busy && !isPlaying ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" className="translate-x-px" />
          )}
        </button>
        <IconButton label="Next" onClick={() => void next()} disabled={disabled}>
          <SkipForward size={18} fill="currentColor" />
        </IconButton>
        <IconButton
          label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          active={repeat !== 'off'}
          size="sm"
          onClick={cycleRepeat}
          disabled={disabled}
        >
          {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </IconButton>
      </div>
      <SeekBar disabled={disabled} />
    </div>
  )
}

function RightControls() {
  const queueOpen = useSettingsStore((s) => s.queueOpen)
  const toggleQueue = useSettingsStore((s) => s.toggleQueue)
  const upcoming = usePlayerStore((s) => (s.current ? s.order.length - s.position - 1 : 0))
  const hasTrack = usePlayerStore((s) => s.current !== null)
  const nowPlayingOpen = useSettingsStore((s) => s.nowPlayingOpen)
  const toggleNowPlaying = useSettingsStore((s) => s.toggleNowPlaying)
  const setMiniMode = useSettingsStore((s) => s.setMiniMode)

  return (
    <div className="flex items-center justify-end gap-2">
      <IconButton
        label={nowPlayingOpen ? 'Close lyrics' : 'Lyrics & Now playing'}
        active={nowPlayingOpen}
        disabled={!hasTrack}
        onClick={() => toggleNowPlaying()}
      >
        <MicVocal size={17} />
      </IconButton>
      <SleepTimerButton />

      <div className="relative">
        <IconButton label="Queue" active={queueOpen} onClick={() => toggleQueue()}>
          <ListMusic size={17} />
        </IconButton>
        {upcoming > 0 && !queueOpen && (
          <span className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-zinc-200 px-1 text-center text-[9px] leading-4 font-bold text-zinc-900 tabular-nums">
            {upcoming > 99 ? '99+' : upcoming}
          </span>
        )}
      </div>

      <IconButton label="Mini player (Ctrl+Shift+M)" onClick={() => void setMiniMode(true)}>
        <PictureInPicture2 size={16} />
      </IconButton>

      <VolumeControl />
    </div>
  )
}

/** Mute button and volume slider; the slider stretches to `sliderClassName`. */
export function VolumeControl({ sliderClassName = 'w-24' }: { sliderClassName?: string }) {
  const volume = useAudioEngineStore((s) => s.volume)
  const muted = useAudioEngineStore((s) => s.muted)
  const hydrated = useAudioEngineStore((s) => s.hydrated)
  const setVolume = useAudioEngineStore((s) => s.setVolume)
  const toggleMute = useAudioEngineStore((s) => s.toggleMute)

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="flex items-center gap-2">
      <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} disabled={!hydrated}>
        <VolumeIcon size={17} />
      </IconButton>
      <div className={sliderClassName}>
        <Slider
          label="Volume"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={setVolume}
          disabled={!hydrated}
          valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
        />
      </div>
    </div>
  )
}
