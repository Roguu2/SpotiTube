import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/layout/Sidebar'
import { AmbientGlow } from './components/layout/AmbientGlow'
import { LibraryView } from './components/library/LibraryView'
import { PlaylistView } from './components/library/PlaylistView'
import { SearchView } from './components/library/SearchView'
import { PlayerBar } from './components/player/PlayerBar'
import { EmbedMiniPlayer } from './components/player/EmbedMiniPlayer'
import { QueuePanel } from './components/queue/QueuePanel'
import { SettingsModal } from './components/settings/SettingsModal'
import { Toasts } from './components/ui/Toasts'
import { useAppBootstrap } from './hooks/useAppBootstrap'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useLibraryStore } from './store/useLibraryStore'
import { useSettingsStore } from './store/useSettingsStore'

export function App() {
  useAppBootstrap()
  useKeyboardShortcuts()

  const appInfo = useSettingsStore((s) => s.appInfo)
  const queueOpen = useSettingsStore((s) => s.queueOpen)
  const view = useLibraryStore((s) => s.view)
  const mainRef = useRef<HTMLElement>(null)

  // Every navigation starts at the top of the new view.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [view])

  if (!appInfo) return <div className="h-full bg-base" />

  return (
    <div className="flex h-full flex-col bg-base">
      <TitleBar platform={appInfo.platform} />
      <div className="flex min-h-0 flex-1">
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
        </main>
        <AnimatePresence initial={false}>{queueOpen && <QueuePanel key="queue" />}</AnimatePresence>
      </div>
      <PlayerBar />
      <EmbedMiniPlayer />
      <SettingsModal />
      <Toasts />
    </div>
  )
}
