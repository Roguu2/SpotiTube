import { Fragment, type MouseEvent } from 'react'
import type { ArtistRef } from '@core/ipc'
import type { UnifiedArtist, UnifiedTrack } from '@core/types'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { albumRefOf, artistRefOf } from '@/store/useCatalogStore'
import { cx } from '@/lib/format'

/** Opening a page from the Now playing view also closes it, so the page is actually seen. */
function useOpen(): (view: Parameters<ReturnType<typeof useLibraryStore.getState>['navigate']>[0]) => void {
  const navigate = useLibraryStore((s) => s.navigate)
  return (view) => {
    useSettingsStore.getState().toggleNowPlaying(false)
    navigate(view)
  }
}

const LINK = 'rounded-sm hover:text-zinc-100 hover:underline focus-visible:underline focus-visible:outline-none'

/** "Mata, Skolim, Khaid" with each name opening that artist's page. */
export function ArtistLinks({
  artists,
  className,
  linkClassName
}: {
  artists: (UnifiedArtist | ArtistRef)[]
  className?: string
  linkClassName?: string
}) {
  const open = useOpen()
  if (!artists.length) return null
  return (
    <span className={cx('truncate', className)}>
      {artists.map((artist, i) => (
        <Fragment key={`${artist.id ?? ''}${artist.name}${i}`}>
          {i > 0 && ', '}
          <button
            type="button"
            onClick={(e: MouseEvent) => {
              // Rows play on double-click and select on click; a link click is neither.
              e.stopPropagation()
              open({ kind: 'artist', ref: artistRefOf(artist) })
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={cx(LINK, linkClassName)}
          >
            {artist.name}
          </button>
        </Fragment>
      ))}
    </span>
  )
}

/** A track's album name, opening the album's page. */
export function AlbumLink({ track, className }: { track: UnifiedTrack; className?: string }) {
  const open = useOpen()
  const ref = albumRefOf(track)
  if (!ref) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        open({ kind: 'album', ref })
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`Open ${ref.name}`}
      className={cx('max-w-full truncate text-left', LINK, className)}
    >
      {ref.name}
    </button>
  )
}
