import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { IpcChannels, type MediaCommand, type NowPlayingInfo } from '@core/ipc'
import { isTrustedSender } from '../ipc/handle'

const MEDIA_KEYS: [accelerator: string, command: MediaCommand][] = [
  ['MediaPlayPause', 'play-pause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'previous'],
  ['MediaStop', 'stop']
]

// ── Now playing ─────────────────────────────────────────────────────────────

type NowPlayingListener = (info: NowPlayingInfo | null) => void

const nowPlayingListeners = new Set<NowPlayingListener>()
let nowPlaying: NowPlayingInfo | null = null

/** Relays the renderer's now-playing state to every OS surface (tray, taskbar, Dock). */
export function startNowPlayingBridge(): void {
  ipcMain.on(IpcChannels.mediaNowPlaying, (event, info: NowPlayingInfo | null) => {
    if (!isTrustedSender(event)) return
    nowPlaying = info
    for (const listener of nowPlayingListeners) listener(info)
  })
}

export function onNowPlaying(listener: NowPlayingListener): () => void {
  nowPlayingListeners.add(listener)
  listener(nowPlaying)
  return () => nowPlayingListeners.delete(listener)
}

export function sendMediaCommand(command: MediaCommand): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.mediaCommand, command)
  }
}

/**
 * Hardware media keys. On macOS the renderer's MediaSession integration owns
 * them (globalShortcut would require Accessibility permission there).
 */
export function registerMediaKeys(): void {
  if (process.platform === 'darwin') return
  for (const [accelerator, command] of MEDIA_KEYS) {
    // Registration fails silently when another app already owns the key.
    globalShortcut.register(accelerator, () => sendMediaCommand(command))
  }
}

export function unregisterMediaKeys(): void {
  globalShortcut.unregisterAll()
}

/** Draws the SpotiTube mark (green→red disc with a play glyph) as a BGRA bitmap. */
function createTrayIcon(): NativeImage {
  const size = 32
  const pixels = Buffer.alloc(size * size * 4)
  const center = (size - 1) / 2
  const radius = size / 2 - 1

  const insidePlay = (x: number, y: number): boolean => {
    // Triangle with vertices (12,9), (12,23), (23,16).
    const area = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
      (ax - cx) * (by - cy) - (bx - cx) * (ay - cy)
    const d1 = area(x, y, 12, 9, 12, 23)
    const d2 = area(x, y, 12, 23, 23, 16)
    const d3 = area(x, y, 23, 16, 12, 9)
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0
    return !(hasNeg && hasPos)
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center)
      const coverage = Math.max(0, Math.min(1, radius - distance + 0.5))
      if (coverage === 0) continue
      const t = (x + y) / (2 * (size - 1))
      let [r, g, b] = [29 + (255 - 29) * t, 185 * (1 - t), 84 * (1 - t)]
      if (insidePlay(x + 0.5, y + 0.5)) [r, g, b] = [9, 9, 11]
      const offset = (y * size + x) * 4
      pixels[offset] = b
      pixels[offset + 1] = g
      pixels[offset + 2] = r
      pixels[offset + 3] = Math.round(coverage * 255)
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 })
}

export interface TrayActions {
  showWindow: () => void
  quit: () => void
}

/** System tray with transport controls that mirror the renderer's now-playing state. */
export class AppTray {
  private readonly tray: Tray
  private nowPlaying: NowPlayingInfo | null = null

  private readonly unsubscribe: () => void

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(createTrayIcon())
    this.tray.on('click', () => actions.showWindow())
    this.unsubscribe = onNowPlaying((info) => {
      this.nowPlaying = info
      this.render()
    })
  }

  destroy(): void {
    this.unsubscribe()
    this.tray.destroy()
  }

  private render(): void {
    const playing = this.nowPlaying
    this.tray.setToolTip(playing ? `${playing.title} — ${playing.artist}` : 'SpotiTube')
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: playing ? `${playing.title} — ${playing.artist}`.slice(0, 60) : 'Nothing playing',
          enabled: false
        },
        { type: 'separator' },
        {
          label: playing?.isPlaying ? 'Pause' : 'Play',
          enabled: !!playing,
          click: () => sendMediaCommand('play-pause')
        },
        { label: 'Next', enabled: !!playing, click: () => sendMediaCommand('next') },
        { label: 'Previous', enabled: !!playing, click: () => sendMediaCommand('previous') },
        { type: 'separator' },
        { label: 'Show SpotiTube', click: () => this.actions.showWindow() },
        { label: 'Quit', click: () => this.actions.quit() }
      ])
    )
  }
}

// ── Taskbar (Windows) and Dock (macOS) controls ──────────────────────────────

type ControlGlyph = 'previous' | 'play' | 'pause' | 'next'

const THUMBAR_READY_DELAY_MS = 800

/** Draws a white transport glyph as a 16pt (32 px @2x) bitmap, anti-aliased by supersampling. */
function createControlIcon(glyph: ControlGlyph): NativeImage {
  const size = 32
  const samples = 4
  const pixels = Buffer.alloc(size * size * 4)

  type Point = [number, number]
  const triangle = (a: Point, b: Point, c: Point) => (x: number, y: number): boolean => {
    const side = (p: Point, q: Point): number => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1])
    const d1 = side(a, b)
    const d2 = side(b, c)
    const d3 = side(c, a)
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
  }
  const rect = (x0: number, y0: number, w: number, h: number) => (x: number, y: number): boolean =>
    x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h

  const shapes: Record<ControlGlyph, ((x: number, y: number) => boolean)[]> = {
    play: [triangle([10, 7], [10, 25], [25, 16])],
    pause: [rect(9, 7, 5, 18), rect(18, 7, 5, 18)],
    next: [triangle([7, 7], [7, 25], [20, 16]), rect(21, 7, 4, 18)],
    previous: [rect(7, 7, 4, 18), triangle([25, 7], [25, 25], [12, 16])]
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = x + (sx + 0.5) / samples
          const py = y + (sy + 0.5) / samples
          if (shapes[glyph].some((inside) => inside(px, py))) covered++
        }
      }
      const offset = (y * size + x) * 4
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
      pixels[offset + 3] = Math.round((covered / (samples * samples)) * 255)
    }
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size, scaleFactor: 2 })
}

/**
 * Previous / play-pause / next buttons on the window's taskbar thumbnail
 * (Windows), the same commands in the Dock menu (macOS), and the current song
 * as the window title — what you see when hovering the app in the taskbar.
 */
export class TaskbarControls {
  private window: BrowserWindow | null = null
  private thumbarReady = false
  private info: NowPlayingInfo | null = null
  private readonly icons = new Map<ControlGlyph, NativeImage>()
  private readonly unsubscribe: () => void

  constructor() {
    this.unsubscribe = onNowPlaying((info) => {
      this.info = info
      this.render()
    })
  }

  /** Binds to a (new) main window. */
  attach(window: BrowserWindow): void {
    this.window = window
    this.thumbarReady = false
    // The page title would otherwise overwrite the song shown in the taskbar.
    window.on('page-title-updated', (event) => event.preventDefault())
    // Thumbnail buttons can only be added once the window's taskbar button exists, which
    // Windows creates asynchronously after the window is first shown. Buttons "added"
    // earlier are silently dropped, and Electron only sends updates afterwards — so the
    // first call must wait until then.
    window.once('show', () => {
      setTimeout(() => {
        this.thumbarReady = true
        this.render()
      }, THUMBAR_READY_DELAY_MS)
    })
    this.render()
  }

  destroy(): void {
    this.unsubscribe()
  }

  private icon(glyph: ControlGlyph): NativeImage {
    let image = this.icons.get(glyph)
    if (!image) {
      image = createControlIcon(glyph)
      this.icons.set(glyph, image)
    }
    return image
  }

  private render(): void {
    const info = this.info
    const window = this.window && !this.window.isDestroyed() ? this.window : null

    if (window) {
      window.setTitle(info ? `${info.title} · ${info.artist}` : 'SpotiTube')
      if (process.platform === 'win32' && this.thumbarReady) {
        const disabled: Electron.ThumbarButton['flags'] = info ? [] : ['disabled']
        window.setThumbarButtons([
          {
            tooltip: 'Previous',
            icon: this.icon('previous'),
            flags: disabled,
            click: () => sendMediaCommand('previous')
          },
          {
            tooltip: info?.isPlaying ? 'Pause' : 'Play',
            icon: this.icon(info?.isPlaying ? 'pause' : 'play'),
            flags: disabled,
            click: () => sendMediaCommand('play-pause')
          },
          {
            tooltip: 'Next',
            icon: this.icon('next'),
            flags: disabled,
            click: () => sendMediaCommand('next')
          }
        ])
        window.setThumbnailToolTip(info ? `${info.title} — ${info.artist}` : 'SpotiTube')
      }
    }

    if (process.platform === 'darwin' && app.dock) {
      app.dock.setMenu(
        Menu.buildFromTemplate([
          { label: info ? `${info.title} — ${info.artist}`.slice(0, 60) : 'Nothing playing', enabled: false },
          { type: 'separator' },
          { label: info?.isPlaying ? 'Pause' : 'Play', enabled: !!info, click: () => sendMediaCommand('play-pause') },
          { label: 'Next', enabled: !!info, click: () => sendMediaCommand('next') },
          { label: 'Previous', enabled: !!info, click: () => sendMediaCommand('previous') }
        ])
      )
    }
  }
}
