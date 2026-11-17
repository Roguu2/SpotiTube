import { Heart } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { useLikesStore } from '@/store/useLikesStore'
import { stationOf, useRadioStore } from '@/store/useRadioStore'
import { isRadio } from '@/lib/radio'
import { cx } from '@/lib/format'

/** The heart: adds the track to Liked songs (and the service's likes when connected), or a station to your stations. */
export function LikeButton({ track, size = 16, className }: { track: UnifiedTrack; size?: number; className?: string }) {
  const radio = isRadio(track)
  const likedSong = useLikesStore((s) => s.liked[track.id] === true)
  const toggleSong = useLikesStore((s) => s.toggle)
  const likedStation = useRadioStore((s) => radio && s.favorites.some((f) => `radio:${f.id}` === track.id))
  const toggleStation = useRadioStore((s) => s.toggleFavorite)
  const liked = radio ? likedStation : likedSong
  const label = radio
    ? liked
      ? 'Remove from your stations'
      : 'Save to your stations'
    : liked
      ? 'Remove from Liked songs'
      : 'Save to Liked songs'

  const toggle = (): void => {
    if (!radio) {
      void toggleSong(track)
      return
    }
    const station = stationOf(track.id, track)
    if (station) void toggleStation(station)
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={liked}
      onClick={toggle}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full transition duration-150 ease-out hover:scale-115 active:scale-90',
        liked ? 'text-spotify hover:text-spotify/80' : 'text-zinc-400 hover:text-zinc-100',
        className
      )}
    >
      <Heart size={size} fill={liked ? 'currentColor' : 'none'} strokeWidth={liked ? 0 : 2} />
    </button>
  )
}
