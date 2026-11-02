import { BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import { IpcChannels, type MediaCommand, type NowPlayingInfo } from '@core/ipc'
import { isTrustedSender } from '../ipc/handle'

const MEDIA_KEYS: [accelerator: string, command: MediaCommand][] = [
  ['MediaPlayPause', 'play-pause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'previous'],
  ['MediaStop', 'stop']
]

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

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(createTrayIcon())
    this.tray.on('click', () => actions.showWindow())
    this.render()

    ipcMain.on(IpcChannels.mediaNowPlaying, (event, info: NowPlayingInfo | null) => {
      if (!isTrustedSender(event)) return
      this.nowPlaying = info
      this.render()
    })
  }

  destroy(): void {
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
