import type { ReactNode } from 'react'
import { Maximize2, X } from 'lucide-react'
import { artistLine } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { LikeButton } from '@/components/ui/LikeButton'
import { Backdrop } from '@/components/nowplaying/Backdrop'
import { useEmbedActive } from './EmbedMiniPlayer'
import { Transport, VolumeControl } from './PlayerBar'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useEmbedLayoutStore } from '@/store/useEmbedLayoutStore'
import { cx } from '@/lib/format'

/**
 * The whole window as a small always-on-top player. YouTube's player stands in
 * for the cover (it must stay visible, at least 200 px tall), so the mini player
 * stays within YouTube's rules.
 */
export function MiniPlayer() {
  const current = usePlayerStore((s) => s.current)
  const setMiniMode = useSettingsStore((s) => s.setMiniMode)
  const setStageSlot = useEmbedLayoutStore((s) => s.setStageSlot)
  const embedActive = useEmbedActive()

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden bg-base select-none">
      <Backdrop artworkUrl={current?.artworkUrl} seed={current?.id ?? ''} />

      <header
        className="app-drag flex h-9 shrink-0 items-center gap-2 pr-1 pl-3.5"
        onDoubleClick={() => void setMiniMode(false)}
        title="Drag to move · double-click for the full window"
      >
        <span className="truncate text-[11px] font-semibold tracking-wide text-white/55">SpotiTube</span>
        <div className="app-no-drag ml-auto flex items-center" onDoubleClick={(e) => e.stopPropagation()}>
          <MiniWindowButton label="Back to full window (Ctrl+Shift+M)" onClick={() => void setMiniMode(false)}>
            <Maximize2 size={13} />
          </MiniWindowButton>
          <MiniWindowButton label="Close" danger onClick={() => window.electronAPI.window.close()}>
            <X size={15} />
          </MiniWindowButton>
        </div>
      </header>

      <div className="px-3">
        {embedActive ? (
          <div ref={setStageSlot} aria-hidden="true" className="h-[202px] w-full rounded-2xl bg-black/40" />
        ) : (
          <div className="flex h-[202px] items-center justify-center">
            <Artwork
              src={current?.artworkUrl}
              alt=""
              rounded="xl"
              className="size-[202px] shadow-2xl shadow-black/60"
            />
          </div>
        )}
      </div>

      <div className="mt-3 min-w-0 px-5 text-center">
        <div className="flex min-w-0 items-center justify-center gap-1.5">
          <div className="truncate text-[15px] font-semibold text-white">{current?.title ?? 'Nothing playing'}</div>
          {current && <LikeButton track={current} size={15} className="size-6" />}
        </div>
        <div className="truncate text-[12.5px] text-white/60">
          {current ? artistLine(current) : 'Pick a track in the full window.'}
        </div>
      </div>

      <div className="mt-2 px-3">
        <Transport />
      </div>

      <div className="mt-auto flex items-center justify-center px-4 pb-3">
        <VolumeControl sliderClassName="w-40" />
      </div>
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
