import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels, type ElectronAPI } from '@core/ipc'

const electronAPI: ElectronAPI = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannels.appGetInfo)
  },
  window: {
    minimize: () => ipcRenderer.send(IpcChannels.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(IpcChannels.windowToggleMaximize),
    close: () => ipcRenderer.send(IpcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(IpcChannels.windowIsMaximized),
    onMaximizedChange: (listener) => {
      const handler = (_event: IpcRendererEvent, maximized: boolean): void => listener(maximized)
      ipcRenderer.on(IpcChannels.windowMaximizedChanged, handler)
      return () => {
        ipcRenderer.removeListener(IpcChannels.windowMaximizedChanged, handler)
      }
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
