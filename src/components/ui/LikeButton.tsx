import { Heart } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { useLikesStore } from '@/store/useLikesStore'
import { cx } from '@/lib/format'

/** The heart: adds the track to Liked songs (and the service's likes when connected). */
export function LikeButton({ track, size = 16, className }: { track: UnifiedTrack; size?: number; className?: string }) {
  const liked = useLikesStore((s) => s.liked[track.id] === true)
  const toggle = useLikesStore((s) => s.toggle)

  return (
    <button
      type="button"
      aria-label={liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
      title={liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
      aria-pressed={liked}
      onClick={() => void toggle(track)}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition active:scale-90',
        liked ? 'text-spotify hover:text-spotify/80' : 'text-zinc-400 hover:text-zinc-100',
        className
      )}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 2} />
    </button>
  )
}
