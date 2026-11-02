import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '@/lib/format'

interface MenuProps {
  /** Element the menu is positioned against. */
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  align?: 'start' | 'end'
  placement?: 'below' | 'above'
  className?: string
  children: ReactNode
}

const GAP = 6
const VIEWPORT_MARGIN = 8

/** Portal-rendered floating panel that stays inside the window and closes on outside click / Escape. */
export function Menu({ anchor, open, onClose, align = 'end', placement = 'below', className, children }: MenuProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor || !panelRef.current) return
    const a = anchor.getBoundingClientRect()
    const p = panelRef.current.getBoundingClientRect()
    let top = placement === 'below' ? a.bottom + GAP : a.top - p.height - GAP
    if (top + p.height > window.innerHeight - VIEWPORT_MARGIN) top = a.top - p.height - GAP
    if (top < VIEWPORT_MARGIN) top = a.bottom + GAP
    let left = align === 'end' ? a.right - p.width : a.left
    left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - p.width - VIEWPORT_MARGIN)
    setPosition({ top, left })
  }, [open, anchor, align, placement])

  useEffect(() => {
    if (!open) {
      setPosition(null)
      return
    }
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [open, anchor, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="menu"
          initial={{ opacity: 0, scale: 0.97, y: placement === 'below' ? -4 : 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.12 }}
          style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
          className={cx(
            'fixed z-50 min-w-48 rounded-xl border border-white/10 bg-surface-raised/95 p-1 shadow-2xl shadow-black/60 backdrop-blur-xl',
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

interface MenuItemProps {
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  children: ReactNode
}

export function MenuItem({ icon, onSelect, danger = false, disabled = false, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors disabled:opacity-40',
        danger ? 'text-red-300 hover:bg-red-500/15' : 'text-zinc-200 hover:bg-white/8'
      )}
    >
      {icon && <span className="flex size-4 items-center justify-center text-zinc-400">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] font-semibold tracking-wider text-zinc-500 uppercase">{children}</div>
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-white/8" />
}
