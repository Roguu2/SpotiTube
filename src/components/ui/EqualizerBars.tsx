import { cx } from '@/lib/format'

/** Animated "now playing" bars; freezes when paused. */
export function EqualizerBars({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cx('inline-flex h-3 items-end gap-[2px]', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="st-eq-bar w-[3px] rounded-full bg-current"
          style={{ animationDelay: `${i * -0.35}s`, animationPlayState: playing ? 'running' : 'paused' }}
        />
      ))}
    </span>
  )
}
