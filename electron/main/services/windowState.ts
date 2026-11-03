import Store from 'electron-store'
import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { IpcChannels } from '@core/ipc'

export interface WindowState {
  bounds: Rectangle | null
  maximized: boolean
  /** Where the mini player last sat. */
  miniPosition: { x: number; y: number } | null
}

export const NORMAL_MIN_SIZE = { width: 960, height: 600 }
/** Fits YouTube's player at 356×200 (it must stay at least 200 px tall) plus the controls. */
const MINI_SIZE = { width: 380, height: 432 }
const MINI_MARGIN = 24
const DEFAULT_SIZE = { width: 1360, height: 860 }
const SAVE_DEBOUNCE_MS = 500
/** At least this much of the window must be on a screen for saved bounds to be reused. */
const MIN_VISIBLE_PX = 120

const store = new Store<WindowState>({
  name: 'window-state',
  defaults: { bounds: null, maximized: false, miniPosition: null }
})

/** What to go back to when leaving mini mode; `null` while the window is normal. */
let mini: { bounds: Rectangle; maximized: boolean } | null = null

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
    if (mini) {
      // The mini player's spot is remembered on its own; the normal bounds stay as they were.
      const [x, y] = window.getPosition()
      store.set('miniPosition', { x, y })
      return
    }
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

export function isMiniMode(): boolean {
  return mini !== null
}

/** Last spot of the mini player if it is still on a screen, else the bottom-right of the window's display. */
function miniPosition(window: BrowserWindow): { x: number; y: number } {
  const saved = store.get('miniPosition')
  if (saved && isOnScreen({ ...saved, ...MINI_SIZE })) return saved
  const { workArea } = screen.getDisplayMatching(window.getBounds())
  return {
    x: workArea.x + workArea.width - MINI_SIZE.width - MINI_MARGIN,
    y: workArea.y + workArea.height - MINI_SIZE.height - MINI_MARGIN
  }
}

/**
 * Shrinks the window into a small always-on-top player, or brings it back to
 * the size, place and maximized state it had before.
 */
export function setMiniMode(window: BrowserWindow, enabled: boolean): boolean {
  if (enabled === (mini !== null)) return enabled
  const isMac = process.platform === 'darwin'

  if (enabled) {
    mini = { bounds: window.getNormalBounds(), maximized: window.isMaximized() }
    if (window.isFullScreen()) window.setFullScreen(false)
    if (window.isMaximized()) window.unmaximize()
    window.setMinimumSize(MINI_SIZE.width, MINI_SIZE.height)
    window.setBounds({ ...miniPosition(window), ...MINI_SIZE })
    window.setResizable(false)
    window.setMaximizable(false)
    window.setFullScreenable(false)
    window.setAlwaysOnTop(true, 'floating')
    if (isMac) window.setWindowButtonVisibility(false)
  } else {
    const restore = mini as NonNullable<typeof mini>
    mini = null
    window.setAlwaysOnTop(false)
    window.setResizable(true)
    window.setMaximizable(true)
    window.setFullScreenable(true)
    window.setMinimumSize(NORMAL_MIN_SIZE.width, NORMAL_MIN_SIZE.height)
    window.setBounds(restore.bounds)
    if (restore.maximized) window.maximize()
    if (isMac) window.setWindowButtonVisibility(true)
  }

  window.webContents.send(IpcChannels.windowMiniChanged, enabled)
  return enabled
}
