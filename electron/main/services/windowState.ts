import Store from 'electron-store'
import { screen, type BrowserWindow, type Rectangle } from 'electron'

export interface WindowState {
  bounds: Rectangle | null
  maximized: boolean
}

const DEFAULT_SIZE = { width: 1360, height: 860 }
const SAVE_DEBOUNCE_MS = 500
/** At least this much of the window must be on a screen for saved bounds to be reused. */
const MIN_VISIBLE_PX = 120

const store = new Store<WindowState>({
  name: 'window-state',
  defaults: { bounds: null, maximized: false }
})

function isOnScreen(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return width >= MIN_VISIBLE_PX && height >= MIN_VISIBLE_PX
  })
}

/**
 * Size and position for the next window: last session's, unless that would put
 * the window off-screen (e.g. the monitor it was on has been unplugged).
 */
export function initialWindowBounds(): Partial<Rectangle> & { width: number; height: number } {
  const saved = store.get('bounds')
  if (saved && isOnScreen(saved)) return saved
  return { ...DEFAULT_SIZE, ...(saved ? { width: saved.width, height: saved.height } : {}) }
}

export function wasMaximized(): boolean {
  return store.get('maximized')
}

/** Remembers the window's normal (un-maximized) bounds and maximized state as they change. */
export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const save = (): void => {
    timer = null
    if (window.isDestroyed() || window.isMinimized()) return
    const maximized = window.isMaximized() || window.isFullScreen()
    // While maximized, keep the last normal bounds so un-maximizing after a restart restores them.
    store.set(maximized ? { maximized } : { maximized, bounds: window.getNormalBounds() })
  }
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', save)
  window.on('unmaximize', save)
  window.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
