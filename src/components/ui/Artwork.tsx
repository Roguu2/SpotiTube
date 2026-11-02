import { useState } from 'react'
import { Disc3 } from 'lucide-react'
import { cx } from '@/lib/format'

interface ArtworkProps {
  src?: string
  alt: string
  className?: string
  rounded?: 'md' | 'lg' | 'xl'
}

/** Cover art with a graceful placeholder when the image is missing or fails to load. */
export function Artwork({ src, alt, className, rounded = 'md' }: ArtworkProps) {
  const [failed, setFailed] = useState(false)
  const radius = { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl' }[rounded]

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cx('flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-600', radius, className)}
      >
        <Disc3 className="size-1/2 max-h-10 max-w-10" strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
      className={cx('bg-zinc-900 object-cover', radius, className)}
    />
  )
}
