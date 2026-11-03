import { useEffect } from 'react'
import { Laptop, Play, X } from 'lucide-react'
import type { RemoteSessionInfo } from '@core/ipc'
import { Artwork } from '@/components/ui/Artwork'
import { sessionKey, useSyncStore } from '@/store/useSyncStore'
import { useAudioEngineStore } from '@/store/useAudioEngineStore'
import { formatTime } from '@/lib/format'

/** Shared, so the selector below returns the same array while nothing is loaded (a new one would re-render forever). */
const NO_SESSIONS: RemoteSessionInfo[] = []

/** "Continue here": picks up what another synced computer was playing, at the same spot. */
export function ContinueCard() {
  const sessions = useSyncStore((s) => s.status?.sessions ?? NO_SESSIONS)
  const dismissed = useSyncStore((s) => s.dismissed)
  const continueFrom = useSyncStore((s) => s.continueFrom)
  const dismiss = useSyncStore((s) => s.dismiss)
  const playing = useAudioEngineStore((s) => s.transport.isPlaying)

  useEffect(() => {
    void useSyncStore.getState().load()
  }, [])

  const offer = sessions.find((session) => !dismissed.includes(sessionKey(session)))
  // Never interrupt music that is already playing here.
  if (!offer || playing) return null

  return (
    <div className="mx-3 mb-2 rounded-xl bg-white/[0.05] p-2.5 ring-1 ring-white/8">
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-zinc-500 uppercase">
        <Laptop size={12} />
        <span className="truncate">On {offer.deviceName}</span>
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => dismiss(offer)}
          className="ml-auto rounded p-0.5 text-zinc-500 hover:bg-white/8 hover:text-zinc-200"
        >
          <X size={12} />
        </button>
      </div>
      <div className="flex items-center gap-2.5">
        <Artwork src={offer.track.artworkUrl} alt="" className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold text-zinc-100">{offer.track.title}</div>
          <div className="truncate text-[11.5px] text-zinc-500">
            {offer.track.artists} · {formatTime(offer.currentTime)}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void continueFrom(offer)}
          aria-label={`Continue here from ${offer.deviceName}`}
          title="Continue here"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-spotify text-black transition hover:scale-105"
        >
          <Play size={14} fill="currentColor" className="translate-x-px" />
        </button>
      </div>
    </div>
  )
}
