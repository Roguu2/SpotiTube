import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownToLine, RotateCw } from 'lucide-react'
import { useUpdateStore } from '@/store/useUpdateStore'

/** Sidebar card that appears while an update is available, downloading or ready to install. */
export function UpdateBanner() {
  const update = useUpdateStore((s) => s.update)
  const download = useUpdateStore((s) => s.download)
  const install = useUpdateStore((s) => s.install)

  const visible = update && ['available', 'downloading', 'downloaded'].includes(update.status)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="mx-3 mb-2 rounded-xl bg-gradient-to-br from-spotify/15 to-ytmusic/10 p-3 ring-1 ring-white/10"
          role="status"
        >
          <p className="text-[12.5px] font-semibold text-zinc-100">
            {update.status === 'downloaded' ? 'Update ready' : 'Update available'}
            <span className="ml-1.5 font-normal text-zinc-400">v{update.version}</span>
          </p>

          {update.status === 'downloading' && (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-spotify transition-[width] duration-300"
                  style={{ width: `${Math.round(update.progress?.percent ?? 0)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 tabular-nums">
                Downloading… {Math.round(update.progress?.percent ?? 0)}%
              </p>
            </div>
          )}

          {update.status === 'available' && (
            <button
              type="button"
              onClick={() => void download()}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-white/10 px-2.5 text-[12px] font-medium text-zinc-100 hover:bg-white/15"
            >
              <ArrowDownToLine size={13} /> Download
            </button>
          )}

          {update.status === 'downloaded' && (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md bg-spotify px-2.5 text-[12px] font-semibold text-black hover:bg-[#1ed760]"
            >
              <RotateCw size={13} /> Restart to update
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
