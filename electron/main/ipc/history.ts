import { IpcChannels } from '@core/ipc'
import { clearPlays, getPlays, getSession, recordPlay, savePosition, saveSession } from '../services/historyStore'
import { handle } from './handle'

export function registerHistoryIpc(): void {
  handle(IpcChannels.historyGet, () => getPlays())
  handle(IpcChannels.historyRecordPlay, (track: unknown, context: unknown) => recordPlay(track, context))
  handle(IpcChannels.historyClear, () => clearPlays())
  handle(IpcChannels.historyGetSession, () => getSession())
  handle(IpcChannels.historySaveSession, (session: unknown) => saveSession(session))
  handle(IpcChannels.historySavePosition, (position: unknown, currentTime: unknown) => savePosition(position, currentTime))
}
