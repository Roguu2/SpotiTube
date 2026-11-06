import { app, BrowserWindow, dialog, protocol, type OpenDialogOptions } from 'electron'
import { randomUUID } from 'node:crypto'
import { closeSync, copyFileSync, mkdirSync, openSync, readdirSync, readSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Your own picture as cozy mode's companion. The chosen file is checked to
 * really be an image, copied into the app's data folder, and served to the
 * page from a private scheme that answers for that one file and nothing else,
 * so the page never reads from disk itself.
 */

export const MEDIA_SCHEME = 'spotitube-media'
const HOST = 'companion'
const MAX_BYTES = 20 * 1024 * 1024
const FILE_NAME = /^companion-[0-9a-f-]{36}\.(png|gif|webp|jpg)$/

const TYPES = [
  { ext: 'png', mime: 'image/png', test: (b: Buffer) => b.readUInt32BE(0) === 0x89504e47 },
  { ext: 'gif', mime: 'image/gif', test: (b: Buffer) => b.toString('ascii', 0, 4) === 'GIF8' },
  { ext: 'webp', mime: 'image/webp', test: (b: Buffer) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
  { ext: 'jpg', mime: 'image/jpeg', test: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }
] as const

const folder = (): string => join(app.getPath('userData'), 'companion')

/** What the file's first bytes say it is; the extension alone proves nothing. */
function sniff(path: string): (typeof TYPES)[number] | null {
  const head = Buffer.alloc(12)
  const fd = openSync(path, 'r')
  try {
    if (readSync(fd, head, 0, head.length, 0) < head.length) return null
  } finally {
    closeSync(fd)
  }
  return TYPES.find((type) => type.test(head)) ?? null
}

function currentFile(): { name: string; mime: string } | null {
  let names: string[]
  try {
    names = readdirSync(folder())
  } catch {
    return null
  }
  const name = names.find((candidate) => FILE_NAME.test(candidate))
  if (!name) return null
  const ext = name.slice(name.lastIndexOf('.') + 1)
  return { name, mime: TYPES.find((type) => type.ext === ext)?.mime ?? 'application/octet-stream' }
}

const urlOf = (name: string): string => `${MEDIA_SCHEME}://${HOST}/${name}`

/** Must run before the app is ready: lets the page load images from the scheme. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true } }])
}

/** Answers spotitube-media://companion/<the current file>; every other URL is a 404. */
export function serveMedia(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const current = currentFile()
    if (url.host !== HOST || !current || url.pathname !== `/${current.name}`) return new Response(null, { status: 404 })
    const data = await readFile(join(folder(), current.name))
    return new Response(data, { headers: { 'Content-Type': current.mime, 'Cache-Control': 'no-store' } })
  })
}

export function getCompanionImageUrl(): string | null {
  const current = currentFile()
  return current ? urlOf(current.name) : null
}

/** Asks for an image and makes it the companion; null when the dialog is cancelled. */
export async function pickCompanionImage(): Promise<string | null> {
  const options: OpenDialogOptions = {
    title: 'Choose your companion',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'gif', 'webp', 'jpg', 'jpeg'] }]
  }
  const window = BrowserWindow.getFocusedWindow()
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  const source = result.filePaths[0]
  if (result.canceled || !source) return null

  if (statSync(source).size > MAX_BYTES) throw new Error('That image is over 20 MB; pick a smaller one')
  const type = sniff(source)
  if (!type) throw new Error('That file is not a PNG, GIF, WebP or JPEG image')

  // A new name for every pick, so the page never shows a cached older picture.
  const name = `companion-${randomUUID()}.${type.ext}`
  rmSync(folder(), { recursive: true, force: true })
  mkdirSync(folder(), { recursive: true })
  copyFileSync(source, join(folder(), name))
  return urlOf(name)
}

export function clearCompanionImage(): void {
  rmSync(folder(), { recursive: true, force: true })
}
