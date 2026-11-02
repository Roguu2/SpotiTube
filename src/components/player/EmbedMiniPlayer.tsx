import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { getEmbedPlayer } from '@/audio/YouTubeEmbedPlayer'
import { SourceIcon } from '@/components/ui/SourceBadge'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { cx } from '@/lib/format'

/**
 * Hosts YouTube's official player. It is shown whenever a track plays through
 * it — YouTube requires the player to stay visible (at least 200×200 px).
 * The host stays mounted for the app's lifetime because moving an iframe in
 * the DOM reloads it.
 */
export function EmbedMiniPlayer() {
  const hostRef = useRef<HTMLDivElement>(null)
  const active = useAudioEngineStore((s) => s.backend === 'embed' && s.transport.src !== null)
  const studioOpen = useSettingsStore((s) => s.studioOpen)
  const [large, setLarge] = useState(false)

  useEffect(() => {
    if (hostRef.current) getEmbedPlayer().attach(hostRef.current)
  }, [])

  return (
    <div
      aria-hidden={!active}
      className={cx(
        'fixed bottom-[100px] z-30 overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/70 transition-all duration-300',
        studioOpen ? 'right-[376px]' : 'right-4',
        active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/8 bg-surface-raised px-2.5 py-1.5 text-[11px] text-zinc-400">
        <SourceIcon source="ytmusic" size={12} className="text-[#ff4d4d]" />
        <span className="font-medium text-zinc-300">YouTube player</span>
        <span
          className="flex cursor-help items-center"
          title="YouTube currently doesn't let apps stream full tracks directly, so this track plays through YouTube's official player. Speed, volume, seeking and A-B loops work; EQ, pitch and reverb need a direct stream."
        >
          <Info size={12} />
        </span>
        <button
          type="button"
          aria-label={large ? 'Smaller player' : 'Larger player'}
          onClick={() => setLarge((l) => !l)}
          className="ml-auto rounded p-0.5 text-zinc-500 hover:bg-white/8 hover:text-zinc-200"
        >
          {large ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      <div ref={hostRef} className={cx('transition-[width,height] duration-300', large ? 'h-[270px] w-[480px]' : 'h-[200px] w-[356px]')} />
    </div>
  )
}
