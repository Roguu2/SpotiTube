import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import type { UnifiedPlaylist } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { useLibraryStore } from '@/store/useLibraryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { cx, formatTrackCount } from '@/lib/format'

const RING: Record<UnifiedPlaylist['source'], string> = {
  spotify: 'hover:ring-spotify/40',
  ytmusic: 'hover:ring-ytmusic/40',
  hybrid: 'hover:ring-white/25',
  local: 'hover:ring-white/20'
}

export function PlaylistCard({ playlist }: { playlist: UnifiedPlaylist }) {
  const navigate = useLibraryStore((s) => s.navigate)
  const loadTracks = useLibraryStore((s) => s.loadTracks)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const isCurrent = usePlayerStore((s) => s.context?.playlistId === playlist.id)

  const play = async (): Promise<void> => {
    const tracks = await loadTracks(playlist.id)
    await playQueue(tracks, 0, { playlistId: playlist.id, label: playlist.name })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role="button"
      tabIndex={0}
      onClick={() => navigate({ kind: 'playlist', playlistId: playlist.id })}
      onKeyDown={(e) => e.key === 'Enter' && navigate({ kind: 'playlist', playlistId: playlist.id })}
      className={cx(
        'group cursor-pointer rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5 transition-[background,box-shadow] hover:bg-white/[0.06]',
        RING[playlist.source],
        isCurrent && 'ring-white/15'
      )}
    >
      <div className="relative">
        <Artwork src={playlist.artworkUrl} alt={playlist.name} rounded="lg" className="aspect-square w-full shadow-lg shadow-black/40" />
        <SourceBadge source={playlist.source} className="absolute top-2 left-2 shadow-md shadow-black/50 backdrop-blur-md" />
        <button
          type="button"
          aria-label={`Play ${playlist.name}`}
          onClick={(e) => {
            e.stopPropagation()
            void play()
          }}
          className={cx(
            'absolute right-2 bottom-2 flex size-11 translate-y-2 items-center justify-center rounded-full opacity-0 shadow-xl shadow-black/50 transition-all group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100',
            playlist.source === 'ytmusic' ? 'bg-ytmusic text-white' : playlist.source === 'hybrid' ? 'bg-gradient-to-br from-spotify to-ytmusic text-white' : 'bg-spotify text-black'
          )}
        >
          <Play size={18} fill="currentColor" className="translate-x-px" />
        </button>
      </div>
      <div className="mt-3 min-w-0">
        <div className="truncate text-[14px] font-semibold text-zinc-100">{playlist.name}</div>
        <div className="mt-0.5 truncate text-[12.5px] text-zinc-500">
          {playlist.owner ? `${playlist.owner} · ` : ''}
          {formatTrackCount(playlist.trackCount)}
        </div>
      </div>
    </motion.div>
  )
}
