import { memo, useState } from 'react'
import { Clock3, Play, X } from 'lucide-react'
import { artistLine, type UnifiedTrack } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { EqualizerBars } from '@/components/ui/EqualizerBars'
import { AddToHybridMenu } from './AddToHybridMenu'
import { TrackQueueMenu } from './TrackQueueMenu'
import { usePlayerStore, type QueueContext } from '@/store/usePlayerStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { cx, formatDurationMs } from '@/lib/format'

interface TrackListProps {
  tracks: UnifiedTrack[]
  context: QueueContext
  /** When set, rows offer "remove from this hybrid playlist". */
  hybridPlaylistId?: string
  compact?: boolean
}

export function TrackList({ tracks, context, hybridPlaylistId, compact = false }: TrackListProps) {
  const currentId = usePlayerStore((s) => s.current?.id)
  const isPlaying = useAudioEngineStore((s) => s.transport.isPlaying)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const removeFromHybrid = useLibraryStore((s) => s.removeFromHybrid)

  return (
    <div role="table" aria-label={context.label} className="text-[13px]">
      {!compact && (
        <div
          role="row"
          className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,0.7fr)_4.5rem_6.5rem] items-center gap-3 border-b border-white/6 px-3 pb-2 text-[11px] font-medium tracking-wider text-zinc-500 uppercase"
        >
          <span className="text-right">#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="flex justify-end">
            <Clock3 size={13} aria-label="Duration" />
          </span>
          <span />
        </div>
      )}
      <div role="rowgroup" className={compact ? '' : 'pt-1'}>
        {tracks.map((track, index) => (
          <TrackRow
            key={`${track.id}:${index}`}
            track={track}
            index={index}
            compact={compact}
            active={track.id === currentId}
            playing={track.id === currentId && isPlaying}
            onPlay={() => void playQueue(tracks, index, context)}
            onRemove={hybridPlaylistId ? () => void removeFromHybrid(hybridPlaylistId, [track.id]) : undefined}
            hybridPlaylistId={hybridPlaylistId}
          />
        ))}
      </div>
    </div>
  )
}

interface TrackRowProps {
  track: UnifiedTrack
  index: number
  compact: boolean
  active: boolean
  playing: boolean
  onPlay: () => void
  onRemove?: () => void
  hybridPlaylistId?: string
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  compact,
  active,
  playing,
  onPlay,
  onRemove,
  hybridPlaylistId
}: TrackRowProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      role="row"
      tabIndex={0}
      onDoubleClick={onPlay}
      onKeyDown={(e) => e.key === 'Enter' && onPlay()}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(true)
      }}
      // Cheap virtualisation: skip layout/paint for off-screen rows in long playlists.
      style={{ contentVisibility: 'auto', containIntrinsicSize: compact ? 'auto 52px' : 'auto 56px' }}
      className={cx(
        'group grid items-center gap-3 rounded-lg px-3 outline-none transition-colors hover:bg-white/5 focus-visible:bg-white/8',
        compact
          ? 'grid-cols-[minmax(0,1fr)_3.5rem_4rem] py-1.5'
          : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,0.7fr)_4.5rem_6.5rem] py-2',
        active && 'bg-white/[0.07]'
      )}
    >
      {!compact && (
        <span role="cell" className="flex justify-end text-zinc-500 tabular-nums">
          <span className={cx('group-hover:hidden', active && 'text-spotify')}>
            {active ? <EqualizerBars playing={playing} /> : index + 1}
          </span>
          <button
            type="button"
            aria-label={`Play ${track.title}`}
            onClick={onPlay}
            className="hidden text-zinc-100 group-hover:inline-flex"
          >
            <Play size={14} fill="currentColor" />
          </button>
        </span>
      )}

      <div role="cell" className="flex min-w-0 items-center gap-3">
        <div className="relative shrink-0">
          <Artwork src={track.artworkUrl} alt="" className="size-10" />
          {compact && (
            <button
              type="button"
              aria-label={`Play ${track.title}`}
              onClick={onPlay}
              className="absolute inset-0 hidden items-center justify-center rounded-md bg-black/55 text-white group-hover:flex"
            >
              <Play size={14} fill="currentColor" />
            </button>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('truncate font-medium', active ? 'text-spotify' : 'text-zinc-100')}>{track.title}</span>
            {track.explicit && (
              <span className="shrink-0 rounded-sm bg-zinc-600/60 px-1 text-[9px] font-bold text-zinc-300">E</span>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <SourceBadge source={track.source} variant="tag" />
            <span className="truncate text-zinc-400">{artistLine(track)}</span>
          </div>
        </div>
      </div>

      {!compact && (
        <span role="cell" className="truncate text-zinc-400">
          {track.album?.name}
        </span>
      )}

      <span role="cell" className="text-right text-zinc-400 tabular-nums">
        {formatDurationMs(track.durationMs)}
      </span>

      <span
        role="cell"
        className={cx(
          'flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100',
          menuOpen && 'opacity-100'
        )}
      >
        <TrackQueueMenu track={track} onPlayNow={onPlay} open={menuOpen} onOpenChange={setMenuOpen} />
        <AddToHybridMenu tracks={[track]} excludePlaylistId={hybridPlaylistId} />
        {onRemove && (
          <button
            type="button"
            aria-label="Remove from playlist"
            title="Remove from playlist"
            onClick={onRemove}
            className="inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-red-500/15 hover:text-red-300"
          >
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  )
})
