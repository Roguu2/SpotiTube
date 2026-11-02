import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { cx } from '@/lib/format'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  className?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, description, className, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onPointerDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className={cx(
              'flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl shadow-black/70',
              className
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-white/6 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
                {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
              </div>
              <IconButton label="Close" size="sm" onClick={onClose}>
                <X size={16} />
              </IconButton>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
