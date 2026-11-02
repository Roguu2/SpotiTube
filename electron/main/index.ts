import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerWindowIpc } from './ipc/window'

let mainWindow: BrowserWindow | null = null

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  void app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.spotitube.app')

    // F12 toggles DevTools in development; Ctrl/Cmd+R reload is disabled in production.
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    registerWindowIpc()
    showMainWindow()

    app.on('activate', showMainWindow)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
