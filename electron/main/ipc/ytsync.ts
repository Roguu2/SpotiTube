import { IpcChannels } from '@core/ipc'
import type { YtMusicSync } from '../services/ytmusicSync'
import { handle } from './handle'

export function registerYtSyncIpc(sync: YtMusicSync): void {
  handle(IpcChannels.ytsyncGetStatus, () => sync.status())
  handle(IpcChannels.ytsyncSetEnabled, (enabled: unknown) => sync.setEnabled(enabled === true))
  handle(IpcChannels.ytsyncNow, async () => {
    await sync.run()
    return sync.status()
  })
}
