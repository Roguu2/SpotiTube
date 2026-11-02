import type { CSSProperties } from 'react'
import { cx } from '@/lib/format'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: string
  /** Fill from the centre (0) instead of from the minimum — for ±dB and ±semitones. */
  bipolar?: boolean
  vertical?: boolean
  disabled?: boolean
  /** CSS colour for the filled track. */
  accent?: string
  /** Value restored on double-click. */
  resetValue?: number
  className?: string
  valueText?: string
}

/** Styled native range input: keyboard, wheel-free and screen-reader friendly. */
export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  label,
  bipolar = false,
  vertical = false,
  disabled = false,
  accent,
  resetValue,
  className,
  valueText
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  const zero = bipolar ? ((0 - min) / (max - min)) * 100 : 0
  const from = Math.min(pct, zero)
  const to = Math.max(pct, zero)

  const style = {
    '--fill-from': `${from}%`,
    '--fill-to': `${to}%`,
    ...(accent ? { '--accent': accent } : {})
  } as CSSProperties

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      title={valueText ? `${label}: ${valueText}` : label}
      onChange={(e) => onChange(Number(e.currentTarget.value))}
      onDoubleClick={() => resetValue !== undefined && onChange(resetValue)}
      style={style}
      className={cx('st-range', vertical && 'st-range-vertical', className)}
    />
  )
}
