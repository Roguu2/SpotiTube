import { useEffect, useRef, type RefObject } from 'react'
import type { DesktopPlatform } from '@core/ipc'
import { getEmbedPlayer } from './audio/YouTubeEmbedPlayer'
import { AnimatePresence } from 'framer-motion'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { AmbientGlow } from './components/layout/AmbientGlow'
import { LibraryView } from './components/library/LibraryView'
import { PlaylistView } from './components/library/PlaylistView'
import { SearchView } from './components/library/SearchView'
import { HistoryView } from './components/library/HistoryView'
import { DiscoverView } from './components/library/DiscoverView'
import { AlbumView } from './components/library/AlbumView'
import { ArtistView } from './components/library/ArtistView'
import { PlayerBar } from './components/player/PlayerBar'
import { EmbedMiniPlayer } from './components/player/EmbedMiniPlayer'
import { MiniPlayer } from './components/player/MiniPlayer'
import { QueuePanel } from './components/queue/QueuePanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { NowPlayingView } from './components/nowplaying/NowPlayingView'
import { Toasts } from './components/ui/Toasts'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePlaybackPersistence } from './hooks/usePlaybackPersistence'
import { useRemoteBridge } from './hooks/useRemoteBridge'
import { usePresenceBridge } from './hooks/usePresenceBridge'
import { useTrackNotifications } from './hooks/useTrackNotifications'
import { useLibraryStore } from './store/useLibraryStore'
import { useSettingsStore } from './store/useSettingsStore'

export function App() {
  useAppBootstrap()
  useKeyboardShortcuts()
  usePlaybackPersistence()
  useRemoteBridge()
  usePresenceBridge()
  useTrackNotifications()

  const appInfo = useSettingsStore((s) => s.appInfo)
  const miniMode = useSettingsStore((s) => s.miniMode)
  const smoothFades = useSettingsStore((s) => s.settings?.smoothFades ?? true)
  const view = useLibraryStore((s) => s.view)
  const mainRef = useRef<HTMLElement>(null)

  // The main process owns the window, so its word on the mode is final.
  useEffect(() => window.electronAPI.window.onMiniChange((mini) => useSettingsStore.setState({ miniMode: mini })), [])

  useEffect(() => getEmbedPlayer().setFadesEnabled(smoothFades), [smoothFades])

  // Every navigation starts at the top of the new view.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [view])

  if (!appInfo) return <div className="h-full bg-base" />

  return (
    <div className="flex h-full flex-col bg-base">
      {/* One tree for both layouts: YouTube's player below must never remount (its iframe would reload). */}
      {miniMode ? <MiniPlayer /> : <FullLayout platform={appInfo.platform} mainRef={mainRef} />}
      <EmbedMiniPlayer />
      <SettingsModal />
      <Toasts />
    </div>
  )
}

function FullLayout({ platform, mainRef }: { platform: DesktopPlatform; mainRef: RefObject<HTMLElement | null> }) {
  const queueOpen = useSettingsStore((s) => s.queueOpen)
  const nowPlayingOpen = useSettingsStore((s) => s.nowPlayingOpen)
  const view = useLibraryStore((s) => s.view)

  return (
    <>
      <TitleBar platform={platform} />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main
          ref={mainRef}
          // Scroll anchoring would shift the page as library sections load in above the fold.
          className="relative isolate min-w-0 flex-1 overflow-y-auto bg-surface/40 [overflow-anchor:none]"
        >
          <AmbientGlow />
          {view.kind === 'library' && <LibraryView />}
          {view.kind === 'playlist' && <PlaylistView key={view.playlistId} playlistId={view.playlistId} />}
          {view.kind === 'search' && <SearchView />}
          {view.kind === 'history' && <HistoryView />}
          {view.kind === 'discover' && <DiscoverView />}
          {view.kind === 'album' && <AlbumView key={JSON.stringify(view.ref)} albumRef={view.ref} />}
          {view.kind === 'artist' && <ArtistView key={JSON.stringify(view.ref)} artistRef={view.ref} />}
        </main>
        <AnimatePresence initial={false}>{queueOpen && <QueuePanel key="queue" />}</AnimatePresence>
        <AnimatePresence>{nowPlayingOpen && <NowPlayingView key="now-playing" />}</AnimatePresence>
      </div>
      <PlayerBar />
    </>
  )
}
