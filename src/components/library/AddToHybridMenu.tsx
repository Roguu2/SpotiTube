import { useCallback, useRef, useState, type FormEvent } from 'react'
import { ListPlus, Plus } from 'lucide-react'
import type { UnifiedTrack } from '@core/types'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/Menu'
import { SourceIcon } from '@/components/ui/SourceBadge'
import { useLibraryStore } from '@/store/useLibraryStore'
import { cx } from '@/lib/format'

interface AddToHybridMenuProps {
  tracks: UnifiedTrack[]
  /** Hide this playlist from the targets (e.g. when browsing it). */
  excludePlaylistId?: string
  /** Custom trigger renderer; defaults to an icon button. */
  trigger?: (props: { ref: (el: HTMLButtonElement | null) => void; onClick: () => void; open: boolean }) => React.ReactNode
  className?: string
}

/** Adds tracks from any source to a SpotiTube Hybrid playlist, or creates a new one inline. */
export function AddToHybridMenu({ tracks, excludePlaylistId, trigger, className }: AddToHybridMenuProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const playlists = useLibraryStore((s) => s.playlists)
  const addToHybrid = useLibraryStore((s) => s.addToHybrid)
  const createHybrid = useLibraryStore((s) => s.createHybrid)
  const hybrids = playlists.filter((p) => p.source === 'hybrid' && p.id !== excludePlaylistId)

  const close = useCallback(() => {
    setOpen(false)
    setCreating(false)
    setName('')
  }, [])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!name.trim()) return
    close()
    await createHybrid(name, tracks)
  }

  return (
    <>
      {trigger ? (
        trigger({ ref: setAnchor, onClick: () => setOpen((o) => !o), open })
      ) : (
        <button
          ref={setAnchor}
          type="button"
          aria-label="Add to hybrid playlist"
          title="Add to hybrid playlist"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          className={cx(
            'inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100',
            open && 'bg-white/10 text-zinc-100',
            className
          )}
        >
          <ListPlus size={16} />
        </button>
      )}

      <Menu anchor={anchor} open={open} onClose={close} className="w-64">
        <MenuLabel>Add {tracks.length === 1 ? 'to' : `${tracks.length} tracks to`} hybrid playlist</MenuLabel>
        <div className="max-h-64 overflow-y-auto">
          {hybrids.map((p) => (
            <MenuItem
              key={p.id}
              icon={<SourceIcon source="hybrid" size={14} />}
              onSelect={() => {
                close()
                void addToHybrid(p.id, tracks)
              }}
            >
              {p.name}
            </MenuItem>
          ))}
          {hybrids.length === 0 && <p className="px-2.5 py-1.5 text-[12.5px] text-zinc-500">No hybrid playlists yet.</p>}
        </div>
        <MenuSeparator />
        {creating ? (
          <form onSubmit={submit} className="flex gap-1.5 p-1">
            <input
              ref={inputRef}
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playlist name"
              aria-label="New playlist name"
              className="h-8 min-w-0 flex-1 rounded-md bg-black/40 px-2 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-white/30"
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-8 rounded-md bg-zinc-100 px-2.5 text-xs font-semibold text-zinc-950 disabled:opacity-40"
            >
              Create
            </button>
          </form>
        ) : (
          <MenuItem icon={<Plus size={14} />} onSelect={() => setCreating(true)}>
            New hybrid playlist…
          </MenuItem>
        )}
      </Menu>
    </>
  )
}
