import { IpcChannels } from '@core/ipc'
import type { UpdateService } from '../services/updater'
import { handle } from './handle'

export function registerUpdateIpc(updates: UpdateService): void {
  handle(IpcChannels.updatesGetState, () => updates.getState())
  handle(IpcChannels.updatesCheck, () => updates.check())
  handle(IpcChannels.updatesDownload, () => updates.download())
  handle(IpcChannels.updatesInstall, () => updates.install())
}
