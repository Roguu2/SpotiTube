import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import type { PresenceInfo } from '@core/ipc'

/**
 * Discord Rich Presence ("Listening to SpotiTube") over Discord's local IPC
 * socket. Talks the documented RPC framing directly — a few dozen lines that
 * spare a dependency. Opt-in; nothing is sent while it is off.
 */

/**
 * The Discord application the status appears under (Discord Developer Portal →
 * Applications → SpotiTube → Application ID). It is public, not a secret.
 */
export const DISCORD_APPLICATION_ID = ''

const Op = { Handshake: 0, Frame: 1, Close: 2, Ping: 3, Pong: 4 } as const
type Op = (typeof Op)[keyof typeof Op]

const RECONNECT_MS = 15_000
/** Discord accepts 5 activity updates per 20 s; stay comfortably below. */
const MIN_UPDATE_GAP_MS = 4_500

function socketPaths(): string[] {
  const ids = Array.from({ length: 10 }, (_, i) => i)
  if (process.platform === 'win32') return ids.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  const base = process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? '/tmp'
  // Regular installs, then the Flatpak and Snap sandboxes.
  return [base, join(base, 'app', 'com.discordapp.Discord'), join(base, 'snap.discord')].flatMap((dir) =>
    ids.map((i) => join(dir, `discord-ipc-${i}`))
  )
}

function encode(op: Op, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
/** Discord rejects strings shorter than two characters. */
const field = (text: string, max: number): string => clip(text.padEnd(2, ' '), max)

function activityFor(info: PresenceInfo): Record<string, unknown> {
  const now = Date.now()
  const activity: Record<string, unknown> = {
    type: 2, // "Listening to"
    details: field(info.title, 128),
    state: field(`by ${info.artists}`, 128),
    timestamps:
      info.duration > 0
        ? { start: Math.round(now - info.position * 1000), end: Math.round(now + (info.duration - info.position) * 1000) }
        : { start: Math.round(now - info.position * 1000) },
    instance: false
  }
  // Discord shows web images directly; inline images (the sample playlists') can't be used.
  if (info.artworkUrl?.startsWith('https://') && info.artworkUrl.length <= 256) {
    activity.assets = { large_image: info.artworkUrl, large_text: field(info.album ?? info.title, 128) }
  }
  if (info.url) activity.buttons = [{ label: info.source === 'spotify' ? 'Open on Spotify' : 'Open on YouTube Music', url: info.url }]
  return activity
}

export class DiscordPresence {
  private socket: Socket | null = null
  private ready = false
  private enabled = false
  private buffer = Buffer.alloc(0)
  private reconnectTimer: NodeJS.Timeout | null = null
  private updateTimer: NodeJS.Timeout | null = null
  private lastSentAt = 0
  /** What Discord should show; `null` clears the status. */
  private wanted: PresenceInfo | null = null
  private nonce = 0

  get available(): boolean {
    return DISCORD_APPLICATION_ID !== ''
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return
    this.enabled = enabled && this.available
    if (this.enabled) this.connect()
    else this.disconnect()
  }

  /** Shows what's playing, or clears the status when nothing is (or it is paused). */
  update(info: PresenceInfo | null): void {
    this.wanted = info && info.isPlaying ? info : null
    this.schedule()
  }

  private schedule(): void {
    if (!this.ready || this.updateTimer) return
    const wait = Math.max(0, this.lastSentAt + MIN_UPDATE_GAP_MS - Date.now())
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null
      this.send()
    }, wait)
  }

  private send(): void {
    if (!this.socket || !this.ready) return
    this.lastSentAt = Date.now()
    this.socket.write(
      encode(Op.Frame, {
        cmd: 'SET_ACTIVITY',
        args: { pid: process.pid, activity: this.wanted ? activityFor(this.wanted) : null },
        nonce: String(++this.nonce)
      })
    )
  }

  private connect(paths = socketPaths()): void {
    if (!this.enabled || this.socket) return
    const [path, ...rest] = paths
    if (!path) {
      this.retryLater()
      return
    }
    const socket = connect(path)
    socket.once('connect', () => {
      this.socket = socket
      this.buffer = Buffer.alloc(0)
      socket.write(encode(Op.Handshake, { v: 1, client_id: DISCORD_APPLICATION_ID }))
    })
    socket.on('data', (chunk: Buffer) => this.receive(chunk))
    socket.once('error', () => {
      socket.destroy()
      // Not this socket: try the next one, unless we were already connected through it.
      if (this.socket === socket) this.dropped()
      else this.connect(rest)
    })
    socket.once('close', () => {
      if (this.socket === socket) this.dropped()
    })
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 8) {
      const op = this.buffer.readInt32LE(0)
      const length = this.buffer.readInt32LE(4)
      if (this.buffer.length < 8 + length) return
      const body = this.buffer.subarray(8, 8 + length).toString('utf8')
      this.buffer = this.buffer.subarray(8 + length)
      let message: { evt?: string } = {}
      try {
        message = JSON.parse(body) as { evt?: string }
      } catch {
        continue
      }
      if (op === Op.Ping) this.socket?.write(encode(Op.Pong, message))
      else if (op === Op.Close) this.socket?.destroy()
      else if (op === Op.Frame && message.evt === 'READY') {
        this.ready = true
        this.schedule()
      }
    }
  }

  private dropped(): void {
    this.socket = null
    this.ready = false
    this.retryLater()
  }

  /** Discord isn't running (or restarted): look again in a while. */
  private retryLater(): void {
    if (!this.enabled || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, RECONNECT_MS)
  }

  private disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.updateTimer) clearTimeout(this.updateTimer)
    this.reconnectTimer = null
    this.updateTimer = null
    if (this.socket && this.ready) {
      // Clear the status rather than leaving it behind until Discord notices.
      this.socket.end(encode(Op.Frame, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: 'bye' }))
    } else {
      this.socket?.destroy()
    }
    this.socket = null
    this.ready = false
  }

  destroy(): void {
    this.enabled = false
    this.disconnect()
  }
}
