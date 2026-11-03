import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannels, type RemoteCommand, type RemoteState, type RemoteStatus, type SearchResults } from '@core/ipc'
import { handle, isTrustedSender } from '../ipc/handle'
import { getSecret, getSettings, setSecret, updateSettings } from '../services/store'
import { createRemoteToken, RemoteServer } from './server'

const STATUS_DEBOUNCE_MS = 150

let server: RemoteServer | null = null
let statusTimer: NodeJS.Timeout | null = null

function pairingToken(): string {
  let token = getSecret('remoteToken')
  if (!token) {
    token = createRemoteToken()
    setSecret('remoteToken', token)
  }
  return token
}

function toWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function status(): Promise<RemoteStatus> {
  return (server as RemoteServer).status(getSettings().remoteEnabled)
}

/** Phones connecting and dropping off come in bursts; tell the renderer once they settle. */
function scheduleStatus(): void {
  if (statusTimer) clearTimeout(statusTimer)
  statusTimer = setTimeout(() => {
    statusTimer = null
    void status().then((value) => toWindows(IpcChannels.remoteStatusChanged, value))
  }, STATUS_DEBOUNCE_MS)
}

/** Sets up the phone remote and starts it if it was on last time. */
export function initRemote(search: (query: string) => Promise<SearchResults>): void {
  server = new RemoteServer({
    getToken: pairingToken,
    search,
    onCommand: (command: RemoteCommand) => toWindows(IpcChannels.remoteCommand, command),
    onStatusChange: scheduleStatus
  })
  const remote = server

  handle(IpcChannels.remoteGetStatus, () => status())
  handle(IpcChannels.remoteSetEnabled, async (enabled: unknown) => {
    const on = enabled === true
    updateSettings({ remoteEnabled: on })
    if (on) await remote.start()
    else remote.stop()
    return status()
  })
  handle(IpcChannels.remoteResetPairing, () => {
    setSecret('remoteToken', createRemoteToken())
    remote.disconnectAll()
    return status()
  })
  ipcMain.on(IpcChannels.remotePublishState, (event, state: RemoteState) => {
    if (isTrustedSender(event) && remote.running) remote.publish(state)
  })

  if (getSettings().remoteEnabled) void remote.start()
}

export function stopRemote(): void {
  server?.stop()
}
