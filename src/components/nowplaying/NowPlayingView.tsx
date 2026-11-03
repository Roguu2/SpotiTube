import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { artistLine, type UnifiedTrack } from '@core/types'
import { Artwork } from '@/components/ui/Artwork'
import { IconButton } from '@/components/ui/IconButton'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { AddToHybridMenu } from '@/components/library/AddToHybridMenu'
import { LikeButton } from '@/components/ui/LikeButton'
import { useEmbedActive } from '@/components/player/EmbedMiniPlayer'
import { LyricsPanel } from './LyricsPanel'
import { Backdrop } from './Backdrop'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useEmbedLayoutStore } from '@/store/useEmbedLayoutStore'
import { useLyricsStore } from '@/store/useLyricsStore'

const PREFETCH_DELAY_MS = 5_000

/**
 * Full-screen Now playing: the cover (or YouTube's player, which must stay
 * visible) on the left, synced lyrics on the right, over a backdrop made from
 * the album art. Covers everything between the title bar and the player bar.
 */
export function NowPlayingView() {
  const current = usePlayerStore((s) => s.current)
  const context = usePlayerStore((s) => s.context)
  const close = useSettingsStore((s) => s.toggleNowPlaying)
  const navigate = useLibraryStore((s) => s.navigate)
  const setStageSlot = useEmbedLayoutStore((s) => s.setStageSlot)
  const embedActive = useEmbedActive()
  const upNext = usePlayerStore((s) => s.queue[s.order[s.position + 1]] as UnifiedTrack | undefined)
  const loadLyrics = useLyricsStore((s) => s.load)

  // Fetch the next song's lyrics ahead of time so they are there the moment it starts.
  useEffect(() => {
    if (!upNext) return
    const timer = window.setTimeout(() => loadLyrics(upNext), PREFETCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [upNext, loadLyrics])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // Menus and dialogs close first.
      if (useSettingsStore.getState().settingsOpen || document.querySelector('[role=menu]')) return
      close(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // Hand the player back to its corner or dock when this view goes away.
  useEffect(() => () => setStageSlot(null), [setStageSlot])

  return (
    <motion.section
      aria-label="Now playing and lyrics"
      // Opacity only: moving the view would misplace the YouTube player laid over its slot.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="absolute inset-0 isolate z-20 flex flex-col overflow-hidden bg-base"
    >
      <Backdrop artworkUrl={current?.artworkUrl} seed={current?.id ?? ''} />

      <header className="flex shrink-0 items-center gap-3 px-10 pt-5 pb-3">
        <IconButton label="Close Now playing (Esc)" onClick={() => close(false)} className="text-white/70 hover:bg-white/10">
          <ChevronDown size={20} />
        </IconButton>
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold tracking-[0.18em] text-white/50 uppercase">Now playing</p>
          {context && (
            <button
              type="button"
              disabled={!context.playlistId}
              onClick={() => {
                if (!context.playlistId) return
                navigate({ kind: 'playlist', playlistId: context.playlistId })
                close(false)
              }}
              className="block max-w-full truncate text-[13px] font-semibold text-white/85 enabled:hover:underline"
            >
              {context.label}
            </button>
          )}
        </div>
      </header>

      {current ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(356px,5fr)_minmax(0,6fr)] gap-12 px-10 pb-8 xl:gap-16 xl:px-16">
          <div className="flex min-h-0 min-w-0 flex-col justify-center gap-6">
            {embedActive ? (
              <div
                ref={setStageSlot}
                aria-hidden="true"
                className="aspect-video w-full max-w-[640px] min-w-[356px] rounded-2xl bg-black/40"
              />
            ) : (
              <Artwork
                src={current.artworkUrl}
                alt=""
                rounded="xl"
                className="aspect-square max-h-[48vh] w-full max-w-[420px] shadow-2xl shadow-black/60"
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <h2 className="line-clamp-2 text-[clamp(26px,2.8vw,42px)] leading-[1.08] font-extrabold tracking-tight text-white">
                  {current.title}
                </h2>
                <LikeButton track={current} size={22} className="mt-1 size-8" />
                <AddToHybridMenu tracks={[current]} className="mt-1 size-8 shrink-0" />
              </div>
              <p className="mt-1.5 truncate text-[clamp(15px,1.3vw,19px)] text-white/70">{artistLine(current)}</p>
              <div className="mt-3 flex min-w-0 items-center gap-2 text-[12.5px] text-white/45">
                <SourceBadge source={current.source} variant="tag" />
                {current.album?.name && <span className="truncate">{current.album.name}</span>}
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 py-2">
            <LyricsPanel key={current.id} track={current} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-[14px] text-white/50">
          Pick a track to start listening.
        </div>
      )}
    </motion.section>
  )
}
