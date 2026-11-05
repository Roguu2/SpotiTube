import { Fragment, memo, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, GripVertical, Infinity as InfinityIcon, ListMusic, LoaderCircle, Play, X } from 'lucide-react'
import { artistLine, type UnifiedTrack } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { IconButton } from '@/components/ui/IconButton'
import { EqualizerBars } from '@/components/ui/EqualizerBars'
import { VersionPicker } from './VersionPicker'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { cx, formatDurationMs } from '@/lib/format'

export const QUEUE_PANEL_WIDTH = 360

/** Right-hand drawer: what's playing, and everything up next — reorderable and editable. */
export function QueuePanel() {
  const close = useSettingsStore((s) => s.toggleQueue)

  return (
    <motion.aside
      aria-label="Queue"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: QUEUE_PANEL_WIDTH, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      className="shrink-0 overflow-hidden border-l border-white/5 bg-surface/80 backdrop-blur-xl"
    >
      <div className="flex h-full flex-col" style={{ width: QUEUE_PANEL_WIDTH }}>
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">Queue</h2>
          <IconButton label="Close queue" size="sm" onClick={() => close(false)}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
          <NowPlayingSection />
          <UpNextSection />
        </div>
      </div>
    </motion.aside>
  )
}

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-2 mb-2 flex items-center justify-between px-2">
      <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">{children}</h3>
      {aside}
    </div>
  )
}

function NowPlayingSection() {
  const current = usePlayerStore((s) => s.current)
  const context = usePlayerStore((s) => s.context)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)
  const [versionsOpen, setVersionsOpen] = useState(false)

  if (!current) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center text-zinc-500">
        <ListMusic size={28} strokeWidth={1.5} />
        <p className="mt-3 text-[13px]">Nothing playing yet.</p>
        <p className="mt-1 text-[12px] text-zinc-600">Start a playlist, or use “Add to queue” on any track.</p>
      </div>
    )
  }

  return (
    <section aria-label="Now playing">
      <SectionTitle>Now playing</SectionTitle>
      <div className="rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/6">
        <div className="flex items-center gap-3">
          <Artwork src={current.artworkUrl} alt="" className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-spotify">
                <EqualizerBars playing={isPlaying} />
              </span>
              <span className="truncate text-[13.5px] font-semibold text-zinc-100">{current.title}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[12px] text-zinc-400">{artistLine(current)}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={versionsOpen}
          onClick={() => setVersionsOpen((o) => !o)}
          className="mt-2.5 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] text-zinc-400 transition hover:bg-white/6 hover:text-zinc-200"
        >
          Change version (live, remix, slowed…)
          {versionsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {versionsOpen && (
          <div className="mt-2 px-0.5">
            <VersionPicker />
          </div>
        )}
      </div>
      {context && <p className="mt-2 truncate px-2 text-[11.5px] text-zinc-500">Playing from {context.label}</p>}
    </section>
  )
}

function UpNextSection() {
  const queue = usePlayerStore((s) => s.queue)
  const order = usePlayerStore((s) => s.order)
  const position = usePlayerStore((s) => s.position)
  const manual = usePlayerStore((s) => s.manual)
  const autoplay = usePlayerStore((s) => s.autoplay)
  const autoplaySeed = usePlayerStore((s) => s.autoplaySeed)
  const current = usePlayerStore((s) => s.current)
  const moveInQueue = usePlayerStore((s) => s.moveInQueue)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const clearQueue = usePlayerStore((s) => s.clearQueue)
  const playFromQueue = usePlayerStore((s) => s.playFromQueue)

  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  if (!current) return null

  const upcoming = order.slice(position + 1).map((index, i) => ({
    orderPosition: position + 1 + i,
    track: queue[index],
    queued: manual.includes(index),
    suggested: autoplay.includes(index)
  }))
  const hasQueued = upcoming.some((u) => u.queued)

  const onDragOver = (event: DragEvent<HTMLLIElement>, orderPosition: number): void => {
    if (dragFrom === null) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    // Drop before or after the hovered row, depending on which half the pointer is over.
    setDropAt(event.clientY < rect.top + rect.height / 2 ? orderPosition : orderPosition + 1)
  }

  const onDrop = (): void => {
    if (dragFrom !== null && dropAt !== null) {
      // Removing the dragged row first shifts later positions up by one.
      moveInQueue(dragFrom, dropAt > dragFrom ? dropAt - 1 : dropAt)
    }
    setDragFrom(null)
    setDropAt(null)
  }

  return (
    <section aria-label="Up next" className="mt-4">
      <SectionTitle
        aside={
          upcoming.length > 0 && (
            <div className="flex gap-1">
              {hasQueued && (
                <button type="button" onClick={() => clearQueue('queued')} className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/6 hover:text-zinc-200">
                  Clear queued
                </button>
              )}
              <button type="button" onClick={() => clearQueue('all')} className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/6 hover:text-zinc-200">
                Clear all
              </button>
            </div>
          )
        }
      >
        Next up {upcoming.length > 0 && <span className="ml-1 text-zinc-600 tabular-nums">{upcoming.length}</span>}
      </SectionTitle>

      {upcoming.length === 0 ? (
        <p className="px-2 py-6 text-center text-[12.5px] text-zinc-500">
          Nothing up next. Use <span className="text-zinc-300">Add to queue</span> on any track.
        </p>
      ) : (
        <ol onDragLeave={(e) => e.currentTarget === e.target && setDropAt(null)}>
          {upcoming.map(({ orderPosition, track, queued, suggested }, i) => (
            <Fragment key={`${orderPosition}:${track.id}`}>
              {suggested && !upcoming[i - 1]?.suggested && (
                <li
                  aria-hidden="true"
                  className="mt-3 mb-1 flex items-center gap-2 px-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase"
                >
                  <InfinityIcon size={13} className="shrink-0" />
                  <span className="truncate">
                    Autoplay{autoplaySeed ? ` · similar to ${autoplaySeed.title}` : ''}
                  </span>
                </li>
              )}
              <QueueRow
                number={i + 1}
                track={track}
                queued={queued}
                suggested={suggested}
                dragging={dragFrom === orderPosition}
                dropBefore={dropAt === orderPosition && dragFrom !== null}
                dropAfter={dropAt === orderPosition + 1 && i === upcoming.length - 1 && dragFrom !== null}
                onDragStart={() => setDragFrom(orderPosition)}
                onDragEnd={() => {
                  setDragFrom(null)
                  setDropAt(null)
                }}
                onDragOver={(e) => onDragOver(e, orderPosition)}
                onDrop={onDrop}
                onPlay={() => void playFromQueue(orderPosition)}
                onRemove={() => removeFromQueue(orderPosition)}
                onKeyDown={(e) => {
                  // Keyboard reordering for accessibility.
                  if (e.altKey && e.key === 'ArrowUp') {
                    e.preventDefault()
                    moveInQueue(orderPosition, orderPosition - 1)
                  } else if (e.altKey && e.key === 'ArrowDown') {
                    e.preventDefault()
                    moveInQueue(orderPosition, orderPosition + 1)
                  } else if (e.key === 'Delete') {
                    removeFromQueue(orderPosition)
                  } else if (e.key === 'Enter') {
                    void playFromQueue(orderPosition)
                  }
                }}
              />
            </Fragment>
          ))}
        </ol>
      )}
      <AutoplaySwitch />
    </section>
  )
}

interface QueueRowProps {
  number: number
  track: UnifiedTrack
  queued: boolean
  suggested: boolean
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLLIElement>) => void
  onDrop: () => void
  onPlay: () => void
  onRemove: () => void
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void
}

const QueueRow = memo(function QueueRow({
  number,
  track,
  queued,
  suggested,
  dragging,
  dropBefore,
  dropAfter,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onPlay,
  onRemove,
  onKeyDown
}: QueueRowProps) {
  return (
    <li
      draggable
      tabIndex={0}
      aria-label={`${number}. ${track.title} — ${artistLine(track)}`}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      onDoubleClick={onPlay}
      onKeyDown={onKeyDown}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 52px' }}
      className={cx(
        'group relative flex cursor-pointer items-center gap-2 rounded-lg py-1.5 pr-1.5 pl-1 outline-none transition-colors duration-150 hover:bg-white/[0.06] focus-visible:bg-white/8',
        dragging && 'opacity-40'
      )}
    >
      {dropBefore && <span className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-spotify" />}
      {dropAfter && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-spotify" />}
      <GripVertical size={14} className="shrink-0 cursor-grab text-zinc-600 group-hover:text-zinc-400" aria-hidden="true" />
      <div className="relative shrink-0">
        <Artwork src={track.artworkUrl} alt="" className="size-9 transition duration-200 ease-out group-hover:scale-[1.06] group-hover:shadow-lg group-hover:shadow-black/50" />
        <button
          type="button"
          aria-label={`Play ${track.title}`}
          onClick={onPlay}
          className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/55 text-white group-hover:flex"
        >
          <Play size={13} fill="currentColor" />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-zinc-100">{track.title}</div>
        <div className="flex min-w-0 items-center gap-1.5">
          {queued && (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-px text-[9.5px] font-semibold text-zinc-300">Queued</span>
          )}
          {suggested && (
            <span className="shrink-0 rounded-full bg-sky-400/15 px-1.5 py-px text-[9.5px] font-semibold text-sky-300">Autoplay</span>
          )}
          <span className="truncate text-[11.5px] text-zinc-500">{artistLine(track)}</span>
        </div>
      </div>
      <span className="shrink-0 text-[11.5px] text-zinc-500 tabular-nums group-hover:hidden">{formatDurationMs(track.durationMs)}</span>
      <button
        type="button"
        aria-label={`Remove ${track.title} from queue`}
        title="Remove from queue"
        onClick={onRemove}
        className="hidden size-7 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100 group-hover:flex group-focus-within:flex"
      >
        <X size={14} />
      </button>
    </li>
  )
})

/** Autoplay on/off, with what it is doing right now. */
function AutoplaySwitch() {
  const enabled = useSettingsStore((s) => s.settings?.autoplay ?? true)
  const loading = usePlayerStore((s) => s.autoplayLoading)
  const repeat = usePlayerStore((s) => s.repeat)
  const setAutoplayEnabled = usePlayerStore((s) => s.setAutoplayEnabled)

  const hint = !enabled
    ? 'Playback stops when the queue runs out.'
    : repeat !== 'off'
      ? 'Paused while repeat is on.'
      : 'When the queue runs out, similar tracks keep playing.'

  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/6">
      {loading ? (
        <LoaderCircle size={16} className="shrink-0 animate-spin text-zinc-400" aria-label="Finding similar tracks" />
      ) : (
        <InfinityIcon size={16} className="shrink-0 text-zinc-400" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium text-zinc-200">Autoplay</div>
        <div className="text-[11px] text-zinc-500">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Autoplay similar tracks"
        onClick={() => void setAutoplayEnabled(!enabled)}
        className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', enabled ? 'bg-spotify' : 'bg-white/15')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', enabled ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </div>
  )
}
