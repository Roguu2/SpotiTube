import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { IpcChannel, IpcResult } from '@core/ipc'
import { errorMessage } from '../services/http'

/** Only our own renderer (bundled file or the dev server) may call privileged handlers. */
export function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (url.startsWith('file://')) return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return is.dev && !!devUrl && url.startsWith(devUrl)
}

/**
 * Registers an `invoke` handler whose result is wrapped in an {@link IpcResult}
 * envelope, so the preload can rethrow errors with their original message.
 */
export function handle<Args extends unknown[], Result>(
  channel: IpcChannel,
  handler: (...args: Args) => Result | Promise<Result>
): void {
  ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<Result>> => {
    if (!isTrustedSender(event)) {
      return { ok: false, error: { code: 'FORBIDDEN', message: 'Untrusted IPC sender' } }
    }
    try {
      return { ok: true, data: await handler(...(args as Args)) }
    } catch (error) {
      const code = error instanceof Error ? error.name : 'Error'
      return { ok: false, error: { code, message: errorMessage(error) } }
    }
  })
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string`)
  return value
}

export function requireTrack<T extends { id: string; providerId: string }>(value: unknown): T {
  const track = value as T | null
  if (!track || typeof track.id !== 'string' || typeof track.providerId !== 'string') {
    throw new TypeError('Invalid track payload')
  }
  return track
}
