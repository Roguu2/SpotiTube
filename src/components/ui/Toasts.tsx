import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useToastStore, type ToastKind } from '@/store/useToastStore'

const ICONS: Record<ToastKind, typeof Info> = { info: Info, success: CircleCheck, error: TriangleAlert }
const TONES: Record<ToastKind, string> = {
  info: 'text-sky-300',
  success: 'text-spotify',
  error: 'text-red-400'
}

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed right-4 bottom-28 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICONS[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              role={t.kind === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-white/10 bg-surface-raised/95 px-3.5 py-3 text-[13px] text-zinc-200 shadow-xl shadow-black/50 backdrop-blur-xl"
            >
              <Icon size={16} className={`mt-0.5 shrink-0 ${TONES[t.kind]}`} />
              <p className="min-w-0 flex-1 leading-snug break-words">{t.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <X size={14} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
