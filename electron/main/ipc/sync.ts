import { IpcChannels } from '@core/ipc'
import { chooseSyncFolder, getRemoteSession, getSyncStatus, initSync, runSync, stopSyncing } from '../services/sync'
import { handle, requireString } from './handle'

export function registerSyncIpc(): void {
  handle(IpcChannels.syncGetStatus, () => getSyncStatus())
  handle(IpcChannels.syncChooseFolder, () => chooseSyncFolder())
  handle(IpcChannels.syncStop, () => stopSyncing())
  handle(IpcChannels.syncNow, async () => {
    await runSync()
    return getSyncStatus()
  })
  handle(IpcChannels.syncGetSession, (deviceId: unknown) => getRemoteSession(requireString(deviceId, 'deviceId')))
  initSync()
}
