import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { dominantColor, rgba, type Rgb } from '@/lib/color'

const NEUTRAL: Rgb = [40, 40, 48]

/** The album art, hugely blurred and slowly drifting, with a tint from its most vivid colour. */
export function Backdrop({ artworkUrl, seed }: { artworkUrl?: string; seed: string }) {
  const [color, setColor] = useState<Rgb>(NEUTRAL)

  useEffect(() => {
    let cancelled = false
    if (!seed) {
      setColor(NEUTRAL)
      return
    }
    void dominantColor(artworkUrl, seed).then((rgb) => {
      if (!cancelled) setColor(rgb)
    })
    return () => {
      cancelled = true
    }
  }, [artworkUrl, seed])

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <AnimatePresence initial={false}>
        {artworkUrl && (
          <motion.img
            key={artworkUrl}
            src={artworkUrl}
            alt=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="st-drift absolute top-1/2 left-1/2 h-[170%] w-[170%] object-cover blur-[110px] saturate-[1.8]"
          />
        )}
      </AnimatePresence>
      <motion.div
        className="absolute inset-0"
        animate={{
          background: `radial-gradient(90% 80% at 20% 30%, ${rgba(color, 0.35)} 0%, transparent 70%)`
        }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-black/75" />
    </div>
  )
}
