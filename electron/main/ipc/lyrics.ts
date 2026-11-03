import { IpcChannels } from '@core/ipc'
import type { UnifiedTrack } from '@core/types'
import { getLyrics } from '../services/lyrics'
import { handle, requireTrack } from './handle'

export function registerLyricsIpc(): void {
  handle(IpcChannels.lyricsGet, (track: unknown) => getLyrics(requireTrack<UnifiedTrack>(track)))
}
