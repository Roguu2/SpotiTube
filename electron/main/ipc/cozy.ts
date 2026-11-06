import { IpcChannels } from '@core/ipc'
import { clearCompanionImage, getCompanionImageUrl, pickCompanionImage } from '../services/companionImage'
import { handle } from './handle'

/** Cozy mode's own picture as its companion. */
export function registerCozyIpc(): void {
  handle(IpcChannels.cozyGetCompanionImage, () => getCompanionImageUrl())
  handle(IpcChannels.cozyPickCompanionImage, () => pickCompanionImage())
  handle(IpcChannels.cozyClearCompanionImage, () => clearCompanionImage())
}
