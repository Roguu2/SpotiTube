import { useState } from 'react'
import {
  Gauge,
  LoaderCircle,
  Pause,
  Pin,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX
} from 'lucide-react'
import { activeDspPreset, DSP_PRESETS, PREAMP_LIMIT_DB, type DspPresetId } from '@core/dsp'
import { artistLine } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { IconButton } from '@/components/ui/IconButton'
import { Slider } from '@/components/ui/Slider'
import { Menu } from '@/components/ui/Menu'
import { AddToHybridMenu } from '@/components/library/AddToHybridMenu'
import { SeekBar } from './SeekBar'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { cx, formatSigned } from '@/lib/format'

const QUICK_PRESETS: DspPresetId[] = ['normal', 'nightcore', 'slowed-reverb']

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
  const context = usePlayerStore((s) => s.context)
  const navigate = useLibraryStore((s) => s.navigate)
  const openStudio = useSettingsStore((s) => s.toggleStudio)

  if (!current) {
    return <div className="text-[13px] text-zinc-600">Pick a track to start listening.</div>
  }

  const showSource = source?.mode === 'embed' || (current.source !== 'ytmusic' && source?.mode === 'stream')
  const sourceLabel = source?.mode === 'embed' ? 'YouTube player' : 'via YT Music'

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        aria-label={context?.playlistId ? `Open ${context.label}` : current.title}
        onClick={() => context?.playlistId && navigate({ kind: 'playlist', playlistId: context.playlistId })}
        className="shrink-0"
      >
        <Artwork src={current.artworkUrl} alt="" className="size-14 shadow-lg shadow-black/50" />
      </button>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-zinc-100">{current.title}</span>
          <AddToHybridMenu tracks={[current]} className="size-6" />
        </div>
        <div className="truncate text-[12.5px] text-zinc-400">{artistLine(current)}</div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <SourceBadge source={current.source} variant="tag" />
          {status === 'error' ? (
            <span className="truncate text-[11px] text-red-400" title={error ?? undefined}>
              Playback failed
            </span>
          ) : source?.mode === 'synthetic' ? (
            <span className="truncate text-[11px] text-amber-300/90">Synth preview</span>
          ) : showSource ? (
            <button
              type="button"
              onClick={() => openStudio(true)}
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

function Transport() {
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
  const dsp = useAudioEngineStore((s) => s.dsp)
  const volume = useAudioEngineStore((s) => s.volume)
  const muted = useAudioEngineStore((s) => s.muted)
  const hydrated = useAudioEngineStore((s) => s.hydrated)
  const embedMode = useAudioEngineStore((s) => s.backend === 'embed')
  const setVolume = useAudioEngineStore((s) => s.setVolume)
  const toggleMute = useAudioEngineStore((s) => s.toggleMute)
  const setPreamp = useAudioEngineStore((s) => s.setPreamp)
  const applyDspPreset = useAudioEngineStore((s) => s.applyDspPreset)
  const studioOpen = useSettingsStore((s) => s.studioOpen)
  const toggleStudio = useSettingsStore((s) => s.toggleStudio)

  const [preampAnchor, setPreampAnchor] = useState<HTMLButtonElement | null>(null)
  const [preampOpen, setPreampOpen] = useState(false)

  const activePreset = activeDspPreset(dsp)
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="flex items-center justify-end gap-2">
      <div role="radiogroup" aria-label="Quick DSP preset" className="flex rounded-full bg-white/6 p-0.5 ring-1 ring-white/8">
        {QUICK_PRESETS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activePreset === id}
            disabled={!hydrated || (embedMode && id !== 'normal')}
            title={embedMode && id !== 'normal' ? 'Needs a direct stream — not available in the YouTube player' : DSP_PRESETS[id].label}
            onClick={() => applyDspPreset(id)}
            className={cx(
              'rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors',
              activePreset === id
                ? id === 'nightcore'
                  ? 'bg-fuchsia-500/25 text-fuchsia-200'
                  : id === 'slowed-reverb'
                    ? 'bg-indigo-500/25 text-indigo-200'
                    : 'bg-white/12 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-200'
            )}
          >
            {id === 'slowed-reverb' ? 'Slowed' : DSP_PRESETS[id].label}
          </button>
        ))}
      </div>

      <IconButton label="Audio Studio" active={studioOpen} onClick={() => toggleStudio()}>
        <SlidersHorizontal size={17} />
      </IconButton>

      <IconButton
        ref={setPreampAnchor}
        label={`Pre-amp ${formatSigned(dsp.preampDb, 1, ' dB')}`}
        active={dsp.preampDb !== 0}
        onClick={() => setPreampOpen((o) => !o)}
        disabled={!hydrated || embedMode}
      >
        <Gauge size={17} />
      </IconButton>
      <Menu anchor={preampAnchor} open={preampOpen} onClose={() => setPreampOpen(false)} placement="above" className="w-56 p-3">
        <div className="mb-2 flex items-center justify-between text-[12px]">
          <span className="font-medium text-zinc-300">Pre-amp gain</span>
          <span className="text-zinc-400 tabular-nums">{formatSigned(dsp.preampDb, 1, ' dB')}</span>
        </div>
        <Slider
          label="Pre-amp gain"
          min={-PREAMP_LIMIT_DB}
          max={PREAMP_LIMIT_DB}
          step={0.5}
          value={dsp.preampDb}
          bipolar
          resetValue={0}
          onChange={setPreamp}
          valueText={formatSigned(dsp.preampDb, 1, ' dB')}
        />
        <p className="mt-2 text-[11px] text-zinc-500">A limiter after the EQ prevents clipping. Double-click to reset.</p>
      </Menu>

      <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} disabled={!hydrated}>
        <VolumeIcon size={17} />
      </IconButton>
      <div className="w-24">
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
