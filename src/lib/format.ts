/** `m:ss` or `h:mm:ss`. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = s.toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatDurationMs(ms: number): string {
  return ms > 0 ? formatTime(ms / 1000) : '–:––'
}

export function formatTrackCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'track' : 'tracks'}`
}

/** Total runtime as "2 hr 14 min" / "37 min". */
export function formatTotalDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

export function formatSigned(value: number, digits = 1, unit = ''): string {
  const fixed = value.toFixed(digits)
  return `${value > 0 ? '+' : ''}${fixed}${unit}`
}

export function formatHz(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
