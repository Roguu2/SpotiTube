import type { ReactNode } from 'react'
import { AppWindow, LoaderCircle, Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { artistLine } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { LikeButton } from '@/components/ui/LikeButton'
import { Backdrop } from '@/components/nowplaying/Backdrop'
import { useEmbedActive } from './EmbedMiniPlayer'
import { SeekBar } from './SeekBar'
import { Transport, VolumeControl } from './PlayerBar'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useEmbedLayoutStore } from '@/store/useEmbedLayoutStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { cx } from '@/lib/format'

/**
 * The whole window as a small always-on-top player. YouTube's player stands in
 * for the cover (it must stay visible, at least 200×200 px), so the mini player
 * stays within YouTube's rules. Compact keeps it square with the essentials;
 * large shows it wider with every control.
 */
export function MiniPlayer() {
  const current = usePlayerStore((s) => s.current)
  const setMiniMode = useSettingsStore((s) => s.setMiniMode)
  const miniSize = useSettingsStore((s) => s.miniSize)
  const setMiniSize = useSettingsStore((s) => s.setMiniSize)
  const setStageSlot = useEmbedLayoutStore((s) => s.setStageSlot)
  const embedActive = useEmbedActive()
  const compact = miniSize === 'compact'

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-base select-none">
      <Backdrop artworkUrl={current?.artworkUrl} seed={current?.id ?? ''} />

      <header
        className={cx('app-drag flex shrink-0 items-center gap-2 pr-1', compact ? 'h-8 pl-3' : 'h-9 pl-3.5')}
        onDoubleClick={() => void setMiniMode(false)}
        title="Drag to move · double-click for the full window"
      >
        <span className="truncate text-[11px] font-semibold tracking-wide text-white/55">SpotiTube</span>
        <div className="app-no-drag ml-auto flex items-center" onDoubleClick={(e) => e.stopPropagation()}>
          <MiniWindowButton
            label={compact ? 'Larger mini player' : 'Smaller mini player'}
            onClick={() => void setMiniSize(compact ? 'large' : 'compact')}
          >
            {compact ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </MiniWindowButton>
          <MiniWindowButton label="Back to full window (Ctrl+Shift+M)" onClick={() => void setMiniMode(false)}>
            <AppWindow size={13} />
          </MiniWindowButton>
          <MiniWindowButton label="Close" danger onClick={() => window.electronAPI.window.close()}>
            <X size={15} />
          </MiniWindowButton>
        </div>
      </header>

      <div className={compact ? 'flex justify-center' : 'px-3'}>
        {embedActive ? (
          <div
            ref={setStageSlot}
            aria-hidden="true"
            className={cx('rounded-2xl bg-black/40', compact ? 'size-[202px]' : 'h-[202px] w-full')}
          />
        ) : (
          <div className="flex h-[202px] items-center justify-center">
            <Artwork src={current?.artworkUrl} alt="" rounded="xl" className="size-[202px] shadow-2xl shadow-black/60" />
          </div>
        )}
      </div>

      <div className={cx('min-w-0 text-center', compact ? 'mt-2 px-3' : 'mt-3 px-5')}>
        <div className="flex min-w-0 items-center justify-center gap-1">
          <div className={cx('truncate font-semibold text-white', compact ? 'text-[13px]' : 'text-[15px]')}>
            {current?.title ?? 'Nothing playing'}
          </div>
          {current && <LikeButton track={current} size={compact ? 13 : 15} className={compact ? 'size-5' : 'size-6'} />}
        </div>
        <div className={cx('truncate text-white/60', compact ? 'text-[11.5px]' : 'text-[12.5px]')}>
          {current ? artistLine(current) : 'Pick a track in the full window.'}
        </div>
      </div>

      {compact ? (
        <div className="mt-auto px-3 pb-2.5">
          <SeekBar disabled={!current} showTimes={false} />
          <CompactControls />
        </div>
      ) : (
        <>
          <div className="mt-2 px-3">
            <Transport />
          </div>
          <div className="mt-auto flex items-center justify-center px-4 pb-3">
            <VolumeControl sliderClassName="w-40" />
          </div>
        </>
      )}
    </div>
  )
}

/** Previous, play/pause and next: all the compact mini player has room for. */
function CompactControls() {
  const current = usePlayerStore((s) => s.current)
  const status = usePlayerStore((s) => s.status)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)
  const isBuffering = useAudioEngineStore((s) => s.transport.isBuffering)
  const busy = status === 'resolving' || (isBuffering && status !== 'error')
  const disabled = !current

  return (
    <div className="mt-1 flex items-center justify-center gap-5">
      <button
        type="button"
        aria-label="Previous"
        disabled={disabled}
        onClick={() => void previous()}
        className="text-white/70 transition duration-150 ease-out hover:scale-115 hover:text-white active:scale-90 disabled:opacity-40"
      >
        <SkipBack size={17} fill="currentColor" />
      </button>
      <button
        type="button"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        disabled={disabled}
        onClick={() => void togglePlay()}
        className="flex size-9 items-center justify-center rounded-full bg-white text-zinc-950 shadow-lg shadow-black/40 transition hover:scale-105 disabled:opacity-40"
      >
        {busy && !isPlaying ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" className="translate-x-px" />
        )}
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={disabled}
        onClick={() => void next()}
        className="text-white/70 transition duration-150 ease-out hover:scale-115 hover:text-white active:scale-90 disabled:opacity-40"
      >
        <SkipForward size={17} fill="currentColor" />
      </button>
    </div>
  )
}

function MiniWindowButton({
  label,
  danger = false,
  onClick,
  children
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex size-7 items-center justify-center rounded-md text-white/55 transition-colors',
        danger ? 'hover:bg-[#e81123] hover:text-white' : 'hover:bg-white/10 hover:text-white'
      )}
    >
      {children}
    </button>
  )
}
