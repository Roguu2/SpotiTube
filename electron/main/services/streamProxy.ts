import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { renderSynthPreview } from './synth'
import { errorMessage } from './http'

/** googlevideo throttles large single requests; fetch upstream in bounded slices. */
const UPSTREAM_CHUNK = 1024 * 1024
const MAX_STREAMS = 256
const MAX_SYNTH_CACHE = 4
const SYNTH_SCHEME = 'synth:'

/** Produces the upstream URL; `force` means the previous URL was rejected and must be replaced. */
export type UpstreamResolver = (force: boolean) => Promise<string>

interface StreamEntry {
  key: string
  resolve: UpstreamResolver
  upstream?: string
  meta?: { size: number; type: string }
}

class UpstreamRejected extends Error {
  constructor(readonly status: number) {
    super(`upstream responded ${status}`)
  }
}

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'
  let start: number
  let end: number
  if (!match[1]) {
    // Suffix range: last N bytes.
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  }
  if (start >= size || start > end) return 'invalid'
  return { start, end }
}

/**
 * Loopback HTTP server that serves registered streams to the renderer with
 * permissive CORS headers and byte-range support. This lets an <audio> element
 * feed a Web Audio graph without cross-origin taint, and hides upstream URL
 * expiry: rejected URLs are re-resolved transparently mid-playback.
 */
export class StreamProxy {
  private server: Server | null = null
  private port = 0
  private readonly entries = new Map<string, StreamEntry>()
  private readonly tokensByKey = new Map<string, string>()
  private readonly synthCache = new Map<string, Buffer>()

  async start(): Promise<void> {
    if (this.server) return
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain', ...this.corsHeaders() })
          res.end(errorMessage(error))
        } else {
          res.destroy()
        }
      })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    this.port = (server.address() as AddressInfo).port
    this.server = server
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  /** Registers (or replaces) the stream for `key` and returns its local URL. */
  register(key: string, resolve: UpstreamResolver, initialUpstream?: string): string {
    if (!this.server) throw new Error('Stream proxy is not running')

    const previous = this.tokensByKey.get(key)
    if (previous) this.entries.delete(previous)

    if (this.entries.size >= MAX_STREAMS) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) {
        this.tokensByKey.delete(this.entries.get(oldest)?.key ?? '')
        this.entries.delete(oldest)
      }
    }

    const token = randomUUID()
    this.entries.set(token, { key, resolve, upstream: initialUpstream })
    this.tokensByKey.set(key, token)
    return `http://127.0.0.1:${this.port}/stream/${token}`
  }

  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Reject DNS-rebinding attempts: only our exact loopback origin is valid.
    if (req.headers.host !== `127.0.0.1:${this.port}`) {
      res.writeHead(403).end()
      return
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, this.corsHeaders()).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, this.corsHeaders()).end()
      return
    }

    const match = /^\/stream\/([0-9a-f-]{36})$/.exec(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    const entry = match ? this.entries.get(match[1]) : undefined
    if (!entry) {
      res.writeHead(404, this.corsHeaders()).end()
      return
    }

    entry.upstream ??= await entry.resolve(false)
    if (entry.upstream.startsWith(SYNTH_SCHEME)) {
      this.serveBuffer(req, res, this.synth(entry.upstream.slice(SYNTH_SCHEME.length)), 'audio/wav')
      return
    }
    await this.serveRemote(req, res, entry)
  }

  private synth(seed: string): Buffer {
    let buffer = this.synthCache.get(seed)
    if (!buffer) {
      buffer = renderSynthPreview(seed)
      if (this.synthCache.size >= MAX_SYNTH_CACHE) {
        const oldest = this.synthCache.keys().next().value
        if (oldest !== undefined) this.synthCache.delete(oldest)
      }
      this.synthCache.set(seed, buffer)
    }
    return buffer
  }

  private serveBuffer(req: IncomingMessage, res: ServerResponse, data: Buffer, type: string): void {
    const range = parseRange(req.headers.range, data.length)
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${data.length}`, ...this.corsHeaders() }).end()
      return
    }
    const { start, end } = range ?? { start: 0, end: data.length - 1 }
    res.writeHead(range ? 206 : 200, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${data.length}` } : {}),
      ...this.corsHeaders()
    })
    if (req.method === 'HEAD') res.end()
    else res.end(data.subarray(start, end + 1))
  }

  /** Runs `operation` against the current upstream URL, re-resolving once if it was rejected. */
  private async withUpstream<T>(entry: StreamEntry, operation: (url: string) => Promise<T>): Promise<T> {
    try {
      return await operation(entry.upstream as string)
    } catch (error) {
      if (!(error instanceof UpstreamRejected)) throw error
      entry.upstream = await entry.resolve(true)
      entry.meta = undefined
      return operation(entry.upstream)
    }
  }

  private async probe(entry: StreamEntry): Promise<{ size: number; type: string }> {
    if (entry.meta) return entry.meta

    entry.meta = await this.withUpstream(entry, async (url) => {
      // googlevideo URLs carry the size and mime type; skip the network round-trip.
      const params = new URL(url).searchParams
      const clen = Number(params.get('clen'))
      const mime = params.get('mime')
      if (clen > 0 && mime) return { size: clen, type: mime }

      const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15_000) })
      await response.body?.cancel()
      if (response.status === 403 || response.status === 410) throw new UpstreamRejected(response.status)
      const total = Number(response.headers.get('content-range')?.split('/')[1])
      const size = total > 0 ? total : Number(response.headers.get('content-length'))
      if (!size) throw new Error(`Upstream did not report a size (HTTP ${response.status})`)
      return { size, type: response.headers.get('content-type') ?? 'audio/mp4' }
    })
    return entry.meta
  }

  private async serveRemote(req: IncomingMessage, res: ServerResponse, entry: StreamEntry): Promise<void> {
    const { size, type } = await this.probe(entry)
    const range = parseRange(req.headers.range, size)
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, ...this.corsHeaders() }).end()
      return
    }
    const { start, end } = range ?? { start: 0, end: size - 1 }

    res.writeHead(range ? 206 : 200, {
      'Content-Type': type,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      ...this.corsHeaders()
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }

    const abort = new AbortController()
    res.on('close', () => abort.abort())

    for (let position = start; position <= end && !abort.signal.aborted; ) {
      const chunkEnd = Math.min(end, position + UPSTREAM_CHUNK - 1)
      const written = await this.withUpstream(entry, (url) => this.pipeSlice(url, position, chunkEnd, res, abort.signal))
      if (written === 0) throw new Error('Upstream returned an empty slice')
      position += written
    }
    if (!abort.signal.aborted) res.end()
  }

  /** Streams bytes [from, to] of `url` into `res`; returns the number of bytes written. */
  private async pipeSlice(url: string, from: number, to: number, res: ServerResponse, signal: AbortSignal): Promise<number> {
    const response = await fetch(url, { headers: { Range: `bytes=${from}-${to}` }, signal })
    if (response.status === 403 || response.status === 410) {
      await response.body?.cancel()
      throw new UpstreamRejected(response.status)
    }
    if (response.status !== 206 && !(response.status === 200 && from === 0)) {
      await response.body?.cancel()
      throw new Error(`Upstream responded ${response.status}`)
    }
    if (!response.body) return 0

    let remaining = to - from + 1
    let written = 0
    for await (const chunk of response.body) {
      if (signal.aborted) break
      const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
      remaining -= slice.byteLength
      written += slice.byteLength
      if (!res.write(slice)) await once(res, 'drain', { signal }).catch(() => undefined)
      if (remaining <= 0) break
    }
    return written
  }
}
