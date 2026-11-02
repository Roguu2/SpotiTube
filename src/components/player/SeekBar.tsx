import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { cx, formatTime } from '@/lib/format'

/**
 * Seek bar with buffered range, A-B loop region and hover preview. Dragging
 * only seeks on release so the stream is not hammered with range requests.
 */
export function SeekBar({ disabled = false }: { disabled?: boolean }) {
  const transport = useAudioEngineStore((s) => s.transport)
  const loop = useAudioEngineStore((s) => s.loop)
  const seek = useAudioEngineStore((s) => s.seek)
  const trackRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const duration = transport.duration
  const time = drag ?? transport.currentTime
  const pct = (seconds: number): number => (duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0)

  const timeAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return 0
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration
  }

  // The ref is the source of truth: a quick click can deliver pointerup before
  // React has re-rendered with the drag state set by pointerdown.
  const draggingRef = useRef(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (disabled || duration <= 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    draggingRef.current = true
    setDrag(timeAt(event.clientX))
  }
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const t = timeAt(event.clientX)
    setHover(t)
    if (draggingRef.current) setDrag(t)
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    draggingRef.current = false
    seek(timeAt(event.clientX))
    setDrag(null)
  }

  const loopVisible = loop.a !== null && duration > 0

  return (
    <div className="flex w-full items-center gap-2.5 text-[11px] text-zinc-500 tabular-nums">
      <span className="w-10 text-right">{formatTime(time)}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') seek(transport.currentTime + 5)
          if (e.key === 'ArrowLeft') seek(transport.currentTime - 5)
        }}
        className={cx('group relative flex h-4 flex-1 cursor-pointer items-center', disabled && 'pointer-events-none opacity-50')}
      >
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/12 transition-[height] group-hover:h-1.5">
          <div
            className="absolute inset-y-0 left-0 bg-white/20"
            style={{ width: `${pct(transport.currentTime + transport.bufferedAhead)}%` }}
          />
          {loopVisible && (
            <div
              className={cx('absolute inset-y-0', loop.enabled ? 'bg-amber-400/45' : 'bg-amber-400/20')}
              style={{ left: `${pct(loop.a ?? 0)}%`, width: `${pct((loop.b ?? loop.a ?? 0) - (loop.a ?? 0))}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-zinc-100 group-hover:bg-spotify"
            style={{ width: `${pct(time)}%` }}
          />
        </div>
        {loopVisible && (
          <>
            <LoopMarker label="A" at={pct(loop.a ?? 0)} />
            {loop.b !== null && <LoopMarker label="B" at={pct(loop.b)} />}
          </>
        )}
        <div
          className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-md shadow-black/60 transition-opacity group-hover:opacity-100"
          style={{ left: `${pct(time)}%` }}
        />
        {hover !== null && duration > 0 && (
          <div
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-100 shadow-lg"
            style={{ left: `${pct(hover)}%` }}
          >
            {formatTime(hover)}
          </div>
        )}
      </div>
      <span className="w-10">{formatTime(duration)}</span>
    </div>
  )
}

function LoopMarker({ label, at }: { label: string; at: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute -top-2.5 -translate-x-1/2 text-[8.5px] leading-none font-bold text-amber-300"
      style={{ left: `${at}%` }}
    >
      {label}
    </span>
  )
}
