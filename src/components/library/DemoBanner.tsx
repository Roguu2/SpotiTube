import { Sparkles } from 'lucide-react'
import { useLibraryStore } from '@/store/useLibraryStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { Button } from '@/components/ui/IconButton'

/** Explains that sample playlists are shown until accounts are connected. */
export function DemoBanner() {
  const providers = useLibraryStore((s) => s.providers)
  const openSettings = useSettingsStore((s) => s.setSettingsOpen)
  const demo = providers.filter((p) => p.showingDemo)
  if (!demo.length) return null

  const names = demo.map((p) => (p.providerId === 'spotify' ? 'Spotify' : 'YouTube Music')).join(' and ')
  return (
    <div className="mt-5 flex items-center gap-4 rounded-xl bg-gradient-to-r from-spotify/10 via-white/[0.03] to-ytmusic/10 px-4 py-3 ring-1 ring-white/8">
      <Sparkles size={18} className="shrink-0 text-zinc-300" />
      <p className="min-w-0 flex-1 text-[13px] text-zinc-300">
        You're browsing <span className="font-semibold text-zinc-100">sample {names} playlists</span>. They stream real
        recordings, so everything works — connect your accounts to see your own library.
      </p>
      <Button size="sm" variant="primary" onClick={() => openSettings(true)}>
        Connect accounts
      </Button>
    </div>
  )
}
