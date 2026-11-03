import { net, nativeImage, Notification, type BrowserWindow, type NativeImage } from 'electron'
import type { TrackNotice } from '@core/ipc'

const ARTWORK_TIMEOUT_MS = 3_000
const MAX_ARTWORK_BYTES = 2 * 1024 * 1024
const ICON_SIZE = 128

let shown: Notification | null = null

/** Cover art as an image the OS can show; anything that isn't a web image is skipped. */
async function artwork(url: string | undefined): Promise<NativeImage | undefined> {
  if (!url?.startsWith('https://')) return undefined
  try {
    const response = await net.fetch(url, { signal: AbortSignal.timeout(ARTWORK_TIMEOUT_MS) })
    if (!response.ok) return undefined
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_ARTWORK_BYTES) return undefined
    const image = nativeImage.createFromBuffer(bytes)
    return image.isEmpty() ? undefined : image.resize({ width: ICON_SIZE, height: ICON_SIZE, quality: 'best' })
  } catch {
    return undefined
  }
}

/**
 * A quiet system notification for a new song — only when SpotiTube isn't in
 * front of you (the window isn't focused and it isn't the mini player). The
 * previous one is replaced rather than stacked.
 */
export async function notifyTrack(window: BrowserWindow | null, notice: TrackNotice, showWindow: () => void): Promise<void> {
  if (!Notification.isSupported()) return
  if (window && !window.isDestroyed() && window.isFocused()) return
  const icon = await artwork(notice.artworkUrl)
  shown?.close()
  const notification = new Notification({
    title: notice.title,
    body: notice.album ? `${notice.artists} — ${notice.album}` : notice.artists,
    icon,
    silent: true
  })
  notification.on('click', showWindow)
  notification.show()
  shown = notification
}
