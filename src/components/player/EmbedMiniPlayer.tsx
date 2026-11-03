import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { GripHorizontal, Info, Maximize2, Minimize2, PanelLeft, PictureInPicture2 } from 'lucide-react'
import { getEmbedPlayer } from '@/audio/YouTubeEmbedPlayer'
import { SourceIcon } from '@/components/ui/SourceBadge'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useEmbedLayoutStore, type EmbedCorner, type EmbedSize } from '@/store/useEmbedLayoutStore'
import { cx } from '@/lib/format'
import { QUEUE_PANEL_WIDTH } from '@/components/queue/QueuePanel'

/** Video viewport per size. YouTube requires at least 200×200 px for embedded players. */
const VIDEO: Record<EmbedSize, { width: number; height: number }> = {
  compact: { width: 200, height: 200 },
  normal: { width: 356, height: 200 },
  large: { width: 480, height: 270 }
}
const HEADER_HEIGHT = 30
const DOCKED_VIDEO_HEIGHT = 200
const GAP = 12
const TITLEBAR_HEIGHT = 44
const PLAYER_BAR_HEIGHT = 88
const SIDEBAR_WIDTH = 256

export function useEmbedActive(): boolean {
  return useAudioEngineStore((s) => s.backend === 'embed' && s.transport.src !== null)
}

/**
 * Hosts YouTube's official player. YouTube requires the player to stay visible
 * (at least 200×200 px), so it can be made small, moved to any corner or docked
 * into the sidebar — but not hidden. The host is fixed-position and stays
 * mounted for the app's lifetime because moving an iframe in the DOM reloads it.
 */
export function EmbedMiniPlayer() {
  const hostRef = useRef<HTMLDivElement>(null)
  const active = useEmbedActive()
  const queueOpen = useSettingsStore((s) => s.queueOpen)
  const { docked, corner, size, dockSlot, stageSlot, setLayout, cycleSize } = useEmbedLayoutStore()
  const [slotRect, setSlotRect] = useState<DOMRect | null>(null)
  // The Now playing view gives the player a big spot of its own; otherwise it may sit in the sidebar dock.
  const slot = stageSlot ?? (docked ? dockSlot : null)
  const staged = stageSlot !== null
  const [drag, setDrag] = useState<{ startX: number; startY: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (hostRef.current) getEmbedPlayer().attach(hostRef.current)
  }, [])

  // Follow the slot while docked or staged (window resizes, content changes around it).
  useEffect(() => {
    if (!slot) {
      setSlotRect(null)
      return
    }
    const measure = (): void => setSlotRect(slot.getBoundingClientRect())
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    observer.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [slot])

  const isStaged = staged && slotRect !== null
  const isDocked = !staged && docked && slotRect !== null
  // Staged, the 1 px frame sits inside the slot so the player covers it exactly.
  const video = isStaged
    ? { width: slotRect.width - 2, height: slotRect.height - 2 }
    : isDocked
      ? { width: slotRect.width, height: DOCKED_VIDEO_HEIGHT }
      : VIDEO[size]

  const position: CSSProperties =
    isStaged || isDocked
      ? { left: slotRect.left, top: slotRect.top }
      : {
          ...(corner.endsWith('right')
            ? { right: GAP + (queueOpen ? QUEUE_PANEL_WIDTH : 0) }
            : { left: SIDEBAR_WIDTH + GAP }),
          ...(corner.startsWith('bottom') ? { bottom: PLAYER_BAR_HEIGHT + GAP } : { top: TITLEBAR_HEIGHT + GAP })
        }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ startX: event.clientX, startY: event.clientY, dx: 0, dy: 0 })
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!drag) return
    setDrag({ ...drag, dx: event.clientX - drag.startX, dy: event.clientY - drag.startY })
  }
  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (!drag) return
      setDrag(null)
      // A click without movement is not a drag.
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return
      // Dropping on the sidebar docks the player; anywhere else snaps to the nearest corner.
      if (event.clientX < SIDEBAR_WIDTH) {
        setLayout({ docked: true })
        return
      }
      const contentMidX = (SIDEBAR_WIDTH + window.innerWidth - (queueOpen ? QUEUE_PANEL_WIDTH : 0)) / 2
      const vertical = event.clientY < window.innerHeight / 2 ? 'top' : 'bottom'
      const horizontal = event.clientX < contentMidX ? 'left' : 'right'
      setLayout({ docked: false, corner: `${vertical}-${horizontal}` as EmbedCorner })
    },
    [drag, setLayout, queueOpen]
  )

  return (
    <div
      aria-hidden={!active}
      style={{
        ...position,
        // The frame is exactly as wide as the video; the header truncates to fit (compact is 200 px).
        width: video.width + 2,
        ...(drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : {})
      }}
      className={cx(
        'fixed z-30 overflow-hidden border bg-black shadow-2xl',
        isStaged ? 'rounded-2xl border-white/8 shadow-black/60' : 'rounded-xl border-white/10 shadow-black/70',
        !drag && 'transition-[opacity,transform,top,left,right,bottom] duration-300',
        drag && 'cursor-grabbing shadow-black/90 ring-2 ring-white/20',
        active ? 'opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      {!isStaged && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title="Drag to move — drop on the sidebar to dock"
          style={{ height: HEADER_HEIGHT }}
          className={cx(
            'flex min-w-0 touch-none items-center gap-1.5 border-b border-white/8 bg-surface-raised px-2 text-[11px] text-zinc-400 select-none',
            drag ? 'cursor-grabbing' : 'cursor-grab'
          )}
        >
          <GripHorizontal size={13} className="shrink-0 text-zinc-600" />
          <SourceIcon source="ytmusic" size={12} className="shrink-0 text-[#ff4d4d]" />
          <span className="truncate font-medium text-zinc-300">YouTube player</span>
          <span
            className="flex shrink-0 cursor-help items-center"
            title="YouTube currently doesn't let apps stream full tracks directly, so this track plays through YouTube's official player. YouTube requires the player to stay visible; make it compact, move it, or dock it in the sidebar."
          >
            <Info size={12} />
          </span>
          <div className="ml-auto flex shrink-0 items-center">
            {!isDocked && (
              <HeaderButton label={size === 'large' ? 'Compact player' : 'Larger player'} onClick={cycleSize}>
                {size === 'large' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </HeaderButton>
            )}
            <HeaderButton
              label={isDocked ? 'Float over the window' : 'Dock in sidebar'}
              onClick={() => setLayout({ docked: !isDocked })}
            >
              {isDocked ? <PictureInPicture2 size={13} /> : <PanelLeft size={13} />}
            </HeaderButton>
          </div>
        </div>
      )}
      <div
        ref={hostRef}
        style={{ width: video.width, height: video.height }}
        className={cx(!drag && 'transition-[width,height] duration-300')}
      />
    </div>
  )
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded p-1 text-zinc-500 transition-colors hover:bg-white/8 hover:text-zinc-200"
    >
      {children}
    </button>
  )
}

/**
 * Space reserved at the bottom of the sidebar for the docked player, so it
 * covers nothing. Rendered only while the official player is in use and docked.
 */
export function EmbedDockSlot() {
  const active = useEmbedActive()
  const docked = useEmbedLayoutStore((s) => s.docked)
  const setDockSlot = useEmbedLayoutStore((s) => s.setDockSlot)

  if (!active || !docked) return null
  return (
    <div
      ref={setDockSlot}
      aria-hidden="true"
      style={{ height: HEADER_HEIGHT + DOCKED_VIDEO_HEIGHT }}
      className="mx-3 mb-2 shrink-0 rounded-xl"
    />
  )
}
