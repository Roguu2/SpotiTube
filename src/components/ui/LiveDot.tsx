import { cx } from '@/lib/format'

/** The red "on air" dot. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cx('relative flex size-2 shrink-0', className)} aria-hidden="true">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500/60" />
      <span className="relative inline-flex size-full rounded-full bg-red-500" />
    </span>
  )
}
