import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { dominantColor, rgba, type Rgb } from '@/lib/color'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useLibraryStore } from '@/store/useLibraryStore'

const NEUTRAL: Rgb = [40, 40, 48]

/**
 * Soft light bleeding from the top of the main stage, tinted with the current
 * album art — or the open playlist's art when nothing is playing.
 */
export function AmbientGlow() {
  const current = usePlayerStore((s) => s.current)
  const openPlaylist = useLibraryStore((s) =>
    s.view.kind === 'playlist' ? s.playlists.find((p) => p.id === (s.view as { playlistId: string }).playlistId) : undefined
  )
  const [color, setColor] = useState<Rgb>(NEUTRAL)

  const artwork = current?.artworkUrl ?? openPlaylist?.artworkUrl
  const seed = current?.id ?? openPlaylist?.id ?? ''

  useEffect(() => {
    let cancelled = false
    if (!seed) {
      setColor(NEUTRAL)
      return
    }
    void dominantColor(artwork, seed).then((rgb) => {
      if (!cancelled) setColor(rgb)
    })
    return () => {
      cancelled = true
    }
  }, [artwork, seed])

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
      animate={{
        background: `radial-gradient(120% 70% at 50% -10%, ${rgba(color, 0.32)} 0%, ${rgba(color, 0.08)} 45%, transparent 75%)`
      }}
      transition={{ duration: 1.2, ease: 'easeOut' }}
    />
  )
}
