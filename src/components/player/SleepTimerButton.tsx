import { useEffect, useState } from 'react'
import { Moon } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu'
import { useSleepTimerStore } from '@/store/useSleepTimerStore'
import { usePlayerStore } from '@/store/usePlayerStore'

const MINUTES = [15, 30, 45, 60, 90]

function minutesLeft(endsAt: number): number {
  return Math.max(1, Math.ceil((endsAt - Date.now()) / 60_000))
}

/** Moon button in the player bar: stop playback after a while, or after the current track. */
export function SleepTimerButton() {
  const timer = useSleepTimerStore((s) => s.timer)
  const start = useSleepTimerStore((s) => s.start)
  const hasTrack = usePlayerStore((s) => s.current !== null)
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [, setTick] = useState(0)

  // Re-render every 15 s so the remaining time stays current.
  useEffect(() => {
    if (timer?.kind !== 'minutes') return
    const id = window.setInterval(() => setTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [timer])

  const badge = timer?.kind === 'minutes' ? `${minutesLeft(timer.endsAt)}m` : timer?.kind === 'end-of-track' ? '1♪' : null
  const status =
    timer?.kind === 'minutes'
      ? `Stops in ${minutesLeft(timer.endsAt)} min`
      : timer?.kind === 'end-of-track'
        ? 'Stops after this track'
        : 'Sleep timer'

  const choose = (choice: number | 'end-of-track' | null): void => {
    setOpen(false)
    start(choice)
  }

  return (
    <div className="relative">
      <IconButton ref={setAnchor} label={status} active={timer !== null} onClick={() => setOpen((o) => !o)}>
        <Moon size={16} />
      </IconButton>
      {badge && (
        <span className="pointer-events-none absolute -right-1 -bottom-0.5 rounded-full bg-spotify px-1 text-[8.5px] leading-3.5 font-bold text-black tabular-nums">
          {badge}
        </span>
      )}
      <Menu anchor={anchor} open={open} onClose={() => setOpen(false)} placement="above" className="w-52">
        <MenuLabel>{status}</MenuLabel>
        {MINUTES.map((minutes) => (
          <MenuItem key={minutes} onSelect={() => choose(minutes)}>
            {minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : `${minutes / 60} hours`}
          </MenuItem>
        ))}
        <MenuItem onSelect={() => choose('end-of-track')} disabled={!hasTrack}>
          End of this track
        </MenuItem>
        {timer && (
          <>
            <MenuSeparator />
            <MenuItem danger onSelect={() => choose(null)}>
              Turn off
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  )
}
