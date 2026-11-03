import { useState, type ReactNode } from 'react'
import { Ellipsis, ListEnd, ListStart, Play, Radio } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { usePlayerStore } from '@/store/usePlayerStore'
import { cx } from '@/lib/format'

interface TrackQueueMenuProps {
  track: UnifiedTrack
  onPlayNow: () => void
  /** Controlled so the row can also open it on right-click. */
  open: boolean
  onOpenChange: (open: boolean) => void
  className?: string
}

/** "⋯" menu on a track row: play now, play next, add to queue, start a radio from it. */
export function TrackQueueMenu({ track, onPlayNow, open, onOpenChange, className }: TrackQueueMenuProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const playNext = usePlayerStore((s) => s.playNext)
  const addToQueue = usePlayerStore((s) => s.addToQueue)
  const startRadio = usePlayerStore((s) => s.startRadio)

  const item = (icon: ReactNode, label: string, action: () => void) => (
    <MenuItem
      icon={icon}
      onSelect={() => {
        onOpenChange(false)
        action()
      }}
    >
      {label}
    </MenuItem>
  )

  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        aria-label={`More options for ${track.title}`}
        title="More options"
        onClick={(e) => {
          e.stopPropagation()
          onOpenChange(!open)
        }}
        className={cx(
          'inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100',
          open && 'bg-white/10 text-zinc-100',
          className
        )}
      >
        <Ellipsis size={16} />
      </button>
      <Menu anchor={anchor} open={open} onClose={() => onOpenChange(false)} className="w-48">
        {item(<Play size={14} />, 'Play now', onPlayNow)}
        {item(<ListStart size={14} />, 'Play next', () => void playNext([track]))}
        {item(<ListEnd size={14} />, 'Add to queue', () => void addToQueue([track]))}
        {item(<Radio size={14} />, 'Start radio', () => void startRadio(track))}
      </Menu>
    </>
  )
}
