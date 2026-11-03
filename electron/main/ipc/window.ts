import { app, BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IpcChannels, type AppInfo, type DesktopPlatform } from '@core/ipc'
import { isMiniMode, setMiniMode } from '../services/windowState'
import { isTrustedSender } from './handle'

function senderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowIpc(): void {
  ipcMain.handle(
    IpcChannels.appGetInfo,
    (): AppInfo => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform as DesktopPlatform,
      isDev: is.dev
    })
  )

  ipcMain.on(IpcChannels.windowMinimize, (event) => senderWindow(event)?.minimize())

  ipcMain.on(IpcChannels.windowToggleMaximize, (event) => {
    const win = senderWindow(event)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })

  ipcMain.on(IpcChannels.windowClose, (event) => senderWindow(event)?.close())

  ipcMain.handle(IpcChannels.windowIsMaximized, (event) => senderWindow(event)?.isMaximized() ?? false)

  ipcMain.handle(IpcChannels.windowSetMini, (event, enabled: unknown) => {
    const win = senderWindow(event)
    if (!win || !isTrustedSender(event)) return isMiniMode()
    return setMiniMode(win, enabled === true)
  })
}
