import { session } from 'electron'
import { IpcChannels, type StorageUsage } from '@core/ipc'
import { MAX_PLAY_AGE_MS, MAX_PLAYS } from '../services/historyStore'
import { handle } from './handle'

async function usage(cacheLimitBytes: number): Promise<StorageUsage> {
  return {
    cacheBytes: await session.defaultSession.getCacheSize(),
    cacheLimitBytes,
    maxPlays: MAX_PLAYS,
    maxPlayAgeDays: Math.round(MAX_PLAY_AGE_MS / (24 * 60 * 60_000))
  }
}

export function registerStorageIpc(cacheLimitBytes: number): void {
  handle(IpcChannels.storageGetUsage, () => usage(cacheLimitBytes))
  handle(IpcChannels.storageClearCache, async () => {
    await session.defaultSession.clearCache()
    return usage(cacheLimitBytes)
  })
}
