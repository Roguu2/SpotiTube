import type { SourceId } from '@core/types'
import { SOURCES } from '@/providers/sources'
import { cx } from '@/lib/format'

export function SourceIcon({ source, size = 12, className }: { source: SourceId; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, className }
  switch (source) {
    case 'spotify':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
          <path d="M5.5 9.2c4.4-1.4 9.2-1 13 1.1" />
          <path d="M6.6 12.9c3.5-1 7.3-.6 10.3 1" />
          <path d="M7.7 16.4c2.7-.7 5.4-.4 7.6.8" />
        </svg>
      )
    case 'ytmusic':
      return (
        <svg {...common} fill="currentColor">
          <rect x="2" y="5" width="20" height="14" rx="4.5" opacity="0.28" />
          <path d="M10 8.8v6.4l5.6-3.2z" />
        </svg>
      )
    case 'hybrid':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M4 8h9.5a3.5 3.5 0 0 1 0 7H8" />
          <path d="M20 16h-2" />
          <path d="m7 5-3 3 3 3" />
        </svg>
      )
    case 'local':
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2.2}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      )
  }
}

interface SourceBadgeProps {
  source: SourceId
  /** `pill` = icon + label, `tag` = compact `[SP]` style, `dot` = icon only. */
  variant?: 'pill' | 'tag' | 'dot'
  className?: string
}

/** Colour-coded provenance marker used on every playlist card, sidebar item and track row. */
export function SourceBadge({ source, variant = 'pill', className }: SourceBadgeProps) {
  const meta = SOURCES[source]
  if (variant === 'dot') {
    return (
      <span
        title={meta.label}
        className={cx('inline-flex size-5 shrink-0 items-center justify-center rounded-full', meta.pillClass, className)}
      >
        <SourceIcon source={source} size={11} />
      </span>
    )
  }
  return (
    <span
      title={meta.label}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-full font-semibold tracking-wide whitespace-nowrap',
        variant === 'tag' ? 'px-1.5 py-px text-[9.5px]' : 'px-2 py-0.5 text-[10.5px]',
        meta.pillClass,
        className
      )}
    >
      <SourceIcon source={source} size={variant === 'tag' ? 9 : 11} />
      {variant === 'tag' ? meta.short : meta.label}
    </span>
  )
}
