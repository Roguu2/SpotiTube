import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IpcChannel, IpcResult } from '@core/ipc'
import { errorMessage } from '../services/http'

/** The bundled renderer page (this file is bundled into out/main). */
const RENDERER_PAGE = resolve(join(import.meta.dirname, '../renderer/index.html'))

function samePath(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

/**
 * Whether `url` is the app's own page: exactly the bundled index.html (not just
 * any local file), or the dev server while developing.
 */
export function isAppPage(url: string): boolean {
  if (url.startsWith('file://')) {
    try {
      return samePath(resolve(fileURLToPath(url.split(/[?#]/)[0])), RENDERER_PAGE)
    } catch {
      return false
    }
  }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  return is.dev && !!devUrl && url.startsWith(devUrl)
}

/** Only our own renderer (bundled page or the dev server) may call privileged handlers. */
export function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isAppPage(event.senderFrame?.url ?? '')
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
