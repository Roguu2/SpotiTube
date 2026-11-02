import { create } from 'zustand'

export type EmbedCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
export type EmbedSize = 'compact' | 'normal' | 'large'

interface EmbedLayout {
  /** Floating over the content, or docked into the sidebar where it covers nothing. */
  docked: boolean
  corner: EmbedCorner
  size: EmbedSize
}

interface EmbedLayoutState extends EmbedLayout {
  /** The sidebar element the docked player is laid over (it is never re-parented: that would reload it). */
  dockSlot: HTMLElement | null
  setLayout(patch: Partial<EmbedLayout>): void
  cycleSize(): void
  setDockSlot(el: HTMLElement | null): void
}

const KEY = 'spotitube.embedLayout'
const CORNERS: EmbedCorner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left']
const SIZES: EmbedSize[] = ['compact', 'normal', 'large']
const DEFAULT_LAYOUT: EmbedLayout = { docked: false, corner: 'bottom-right', size: 'normal' }

function read(): EmbedLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EmbedLayout> | null
    if (!raw) return DEFAULT_LAYOUT
    return {
      docked: raw.docked === true,
      corner: CORNERS.includes(raw.corner as EmbedCorner) ? (raw.corner as EmbedCorner) : DEFAULT_LAYOUT.corner,
      size: SIZES.includes(raw.size as EmbedSize) ? (raw.size as EmbedSize) : DEFAULT_LAYOUT.size
    }
  } catch {
    return DEFAULT_LAYOUT
  }
}

function write(layout: EmbedLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // Layout is a per-device convenience; losing it is harmless.
  }
}

export const useEmbedLayoutStore = create<EmbedLayoutState>((set, get) => ({
  ...read(),
  dockSlot: null,

  setLayout(patch) {
    set(patch)
    const { docked, corner, size } = get()
    write({ docked, corner, size })
  },

  cycleSize() {
    const next = SIZES[(SIZES.indexOf(get().size) + 1) % SIZES.length]
    get().setLayout({ size: next })
  },

  setDockSlot(dockSlot) {
    set({ dockSlot })
  }
}))
