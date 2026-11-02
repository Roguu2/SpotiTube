import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { IpcChannels } from '@core/ipc'

const BACKGROUND = '#09090b'

export function createMainWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: BACKGROUND,
    title: 'SpotiTube',
    autoHideMenuBar: true,
    // macOS keeps native traffic lights inset into our custom titlebar;
    // Windows/Linux go fully frameless and render their own controls.
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } }
      : { frame: false }),
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Media keys and queue auto-advance must start playback without a click.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.once('ready-to-show', () => win.show())

  const emitMaximized = (): void => {
    win.webContents.send(IpcChannels.windowMaximizedChanged, win.isMaximized())
  }
  win.on('maximize', emitMaximized)
  win.on('unmaximize', emitMaximized)

  // Never navigate the app window away; open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!devUrl || !url.startsWith(devUrl)) event.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }

  return win
}
