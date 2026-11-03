import { EMPTY_LOOP, sanitizeLoop, type LoopRegion } from '@core/dsp'
import type { TransportState } from './AudioEngine'

const ORIGIN = 'https://www.youtube-nocookie.com'
const READY_TIMEOUT_MS = 15_000
const LOAD_TIMEOUT_MS = 20_000
const HANDSHAKE_INTERVAL_MS = 250
const TICK_MS = 50
/** How often the UI-facing transport is refreshed between player messages. */
const EMIT_INTERVAL_MS = 250

/** YouTube IFrame player states. */
const PlayerState = {
  Unstarted: -1,
  Ended: 0,
  Playing: 1,
  Paused: 2,
  Buffering: 3,
  Cued: 5
} as const

/** Error codes for which another upload of the same song may still work. */
const RECOVERABLE_CODES = new Set([100, 101, 150, 152, 153])

export class EmbedPlaybackError extends Error {
  constructor(readonly code: number) {
    super(
      code === 101 || code === 150
        ? 'The uploader does not allow this video to be played in other apps'
        : code === 100
          ? 'This video is no longer available'
          : code === 5
            ? 'The YouTube player could not play this video'
            : `YouTube player error ${code}`
    )
    this.name = 'EmbedPlaybackError'
  }

  /** True when trying a different upload of the same song makes sense. */
  get tryAnotherUpload(): boolean {
    return RECOVERABLE_CODES.has(this.code)
  }
}

interface PlayerInfo {
  currentTime?: number
  duration?: number
  playerState?: number
  playbackRate?: number
  videoLoadedFraction?: number
}

interface PendingLoad {
  videoId: string
  autoplay: boolean
  resolve: () => void
  reject: (error: Error) => void
  timer: number
}

type Listener = (state: TransportState) => void

const IDLE: TransportState = {
  src: null,
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  bufferedAhead: 0,
  ended: false,
  error: null
}

/** Quietest level the embed plays at: YouTube treats every volume from 1 to 5 as 5. */
const MIN_EMBED_VOLUME = 5

/** Fade lengths. A skip fades the old track out quickly and the new one in once it actually plays. */
const SKIP_FADE_OUT_MS = 220
const SKIP_FADE_IN_MS = 450
const PAUSE_FADE_MS = 160
const RESUME_FADE_MS = 300
const FADE_STEP_MS = 30
/** Fades run in decibels down to this, which sounds even; YouTube's floor of 5 % sits just above it. */
const FADE_FLOOR_DB = -30

/**
 * Maps the 0–1 slider to YouTube's whole-number 5–100 volume (linear gain) on an
 * exponential curve, so every slider step changes loudness by the same number of
 * decibels (about 2.6 dB per 10 %) instead of the bottom fifth of the slider
 * collapsing onto YouTube's floor.
 */
export function embedVolume(volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  return Math.round(MIN_EMBED_VOLUME * (100 / MIN_EMBED_VOLUME) ** v)
}

/**
 * Drives YouTube's official embedded player through its postMessage protocol.
 * No YouTube script runs in SpotiTube's own window: the player lives in a
 * cross-origin iframe and only exchanges JSON messages with us.
 *
 * Used whenever YouTube does not provide complete direct streams. Audio cannot
 * be routed through Web Audio from a cross-origin frame, so only speed,
 * volume, seeking and A-B looping are available here.
 */
export class YouTubeEmbedPlayer {
  private iframe: HTMLIFrameElement | null = null
  private ready: Promise<void> | null = null
  private markReady: (() => void) | null = null
  private handshakeTimer: number | null = null
  private info: Required<PlayerInfo> = {
    currentTime: 0,
    duration: 0,
    playerState: PlayerState.Unstarted,
    playbackRate: 1,
    videoLoadedFraction: 0
  }
  private infoAt = 0
  private transport: TransportState = { ...IDLE }
  private readonly listeners = new Set<Listener>()
  private pending: PendingLoad | null = null
  private videoId: string | null = null
  private loop: LoopRegion = { ...EMPTY_LOOP }
  private volume = 1
  private muted = false
  private rate = 1
  private tickTimer: number | null = null
  private lastEmit = 0
  /** 1 = full volume, 0 = faded out. Multiplies the user's volume. */
  private fade = 1
  private fadesEnabled = true
  private fadeTimer: number | null = null
  private fadeDone: ((completed: boolean) => void) | null = null
  /** Fade in once YouTube reports that the (new or resumed) video is actually playing. */
  private fadeInOnPlay: number | null = null
  private loadToken = 0

  constructor() {
    window.addEventListener('message', this.onMessage)
  }

  /** Mounts the player frame into a visible host element (once; never re-parented, which would reload it). */
  attach(host: HTMLElement): void {
    if (this.iframe) {
      if (this.iframe.parentElement !== host) host.appendChild(this.iframe)
      return
    }
    const iframe = document.createElement('iframe')
    iframe.title = 'YouTube player'
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture'
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    iframe.className = 'h-full w-full border-0'
    host.appendChild(iframe)
    this.iframe = iframe
  }

  get isAttached(): boolean {
    return this.iframe !== null
  }

  getTransport(): TransportState {
    return this.transport
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.transport)
    return () => this.listeners.delete(listener)
  }

  /** Loads and (by default) starts a video. Rejects with {@link EmbedPlaybackError} if YouTube refuses it. */
  async load(videoId: string, { autoplay = true, startAt = 0 } = {}): Promise<void> {
    if (!this.iframe) throw new Error('YouTube player is not mounted')
    const token = ++this.loadToken
    // Skipping mid-song: duck the old track first instead of cutting it off.
    if (this.fadesEnabled && this.transport.isPlaying && this.ready) {
      const faded = await this.fadeTo(0, SKIP_FADE_OUT_MS)
      if (token !== this.loadToken) throw new Error('Superseded by another track')
      if (faded) this.fadeInOnPlay = SKIP_FADE_IN_MS
    }
    this.cancelPending(new Error('Superseded by another track'))
    this.videoId = videoId
    this.info = { ...this.info, currentTime: startAt, duration: 0, playerState: PlayerState.Unstarted, videoLoadedFraction: 0 }
    this.infoAt = performance.now()
    this.update({ ...IDLE, src: `youtube:${videoId}`, isBuffering: true, currentTime: startAt })

    const loaded = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (this.pending?.videoId !== videoId) return
        this.pending = null
        reject(new Error('The YouTube player did not start in time'))
      }, LOAD_TIMEOUT_MS)
      this.pending = { videoId, autoplay, resolve, reject, timer }
    })
    // Rejections are delivered through the `await loaded` below; this only prevents
    // an "unhandled rejection" when booting fails first and `loaded` is never awaited.
    loaded.catch(() => undefined)

    try {
      await this.start(videoId, autoplay, startAt)
    } catch (error) {
      this.cancelPending(error instanceof Error ? error : new Error(String(error)))
      throw error
    }
    await loaded
    this.applyAudio()
  }

  private async start(videoId: string, autoplay: boolean, startAt: number): Promise<void> {
    if (!this.ready) {
      // First video: boot the player directly on it.
      const params = new URLSearchParams({
        enablejsapi: '1',
        autoplay: autoplay ? '1' : '0',
        controls: '0',
        disablekb: '1',
        fs: '0',
        iv_load_policy: '3',
        playsinline: '1',
        rel: '0',
        start: String(Math.floor(startAt))
      })
      this.ready = this.boot(`${ORIGIN}/embed/${encodeURIComponent(videoId)}?${params}`)
      await this.ready
      this.applyAudio()
    } else {
      await this.ready
      this.command(autoplay ? 'loadVideoById' : 'cueVideoById', [videoId, startAt])
    }
  }

  play(): void {
    if (!this.videoId) return
    if (this.transport.ended) this.seek(this.loopStartOr(0))
    if (this.fade < 1) {
      // Resumed mid-fade (or after a faded pause): come back up smoothly.
      if (this.info.playerState === PlayerState.Playing) void this.fadeTo(1, RESUME_FADE_MS)
      else this.fadeInOnPlay = RESUME_FADE_MS
    }
    this.command('playVideo')
  }

  pause(): void {
    if (!this.fadesEnabled || !this.transport.isPlaying) {
      this.command('pauseVideo')
      return
    }
    this.fadeInOnPlay = null
    void this.fadeTo(0, PAUSE_FADE_MS).then((completed) => {
      // A play() during the fade cancels it, and with it the pause.
      if (completed) this.command('pauseVideo')
    })
  }

  /** Short volume ramps on skip, pause and resume. */
  setFadesEnabled(enabled: boolean): void {
    this.fadesEnabled = enabled
    if (!enabled) this.resetFade()
  }

  toggle(): void {
    if (this.transport.isPlaying) this.pause()
    else this.play()
  }

  seek(seconds: number): void {
    const duration = this.info.duration
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration - 0.25) : seconds)
    this.command('seekTo', [target, true])
    this.info.currentTime = target
    this.infoAt = performance.now()
    this.update({ currentTime: target, ended: false })
  }

  stop(): void {
    this.resetFade()
    this.cancelPending(new Error('Playback stopped'))
    if (this.videoId) this.command('stopVideo')
    this.videoId = null
    this.stopTicker()
    this.update({ ...IDLE })
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = volume
    this.muted = muted
    this.applyAudio()
  }

  setRate(rate: number): void {
    this.rate = rate
    this.command('setPlaybackRate', [rate])
  }

  setLoop(loop: LoopRegion): void {
    this.loop = sanitizeLoop(loop)
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private boot(src: string): Promise<void> {
    const iframe = this.iframe as HTMLIFrameElement
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.stopHandshake()
        this.ready = null
        reject(new Error('The YouTube player did not respond'))
      }, READY_TIMEOUT_MS)
      this.markReady = () => {
        window.clearTimeout(timeout)
        this.stopHandshake()
        this.markReady = null
        resolve()
      }
      iframe.addEventListener(
        'load',
        () => {
          // The player only starts reporting after it hears a "listening" message.
          this.handshakeTimer = window.setInterval(
            () => this.post({ event: 'listening', id: 1, channel: 'widget' }),
            HANDSHAKE_INTERVAL_MS
          )
        },
        { once: true }
      )
      iframe.src = src
    })
  }

  private stopHandshake(): void {
    if (this.handshakeTimer !== null) window.clearInterval(this.handshakeTimer)
    this.handshakeTimer = null
  }

  private post(message: Record<string, unknown>): void {
    this.iframe?.contentWindow?.postMessage(JSON.stringify(message), ORIGIN)
  }

  private command(func: string, args: unknown[] = []): void {
    this.post({ event: 'command', func, args, id: 1, channel: 'widget' })
  }

  private applyAudio(): void {
    if (this.muted || this.volume <= 0) {
      // YouTube treats "volume 0 + unMute" as unmuted and bumps the volume back up to 5,
      // so silence has to be an explicit mute.
      this.command('mute')
    } else {
      this.sendLevel()
      this.command('unMute')
    }
    this.command('setPlaybackRate', [this.rate])
  }

  /** The user's volume scaled by the current fade, as one YouTube volume command. */
  private sendLevel(): void {
    if (this.muted || this.volume <= 0) return
    const gain = this.fade >= 1 ? 1 : 10 ** (((1 - Math.max(0, this.fade)) * FADE_FLOOR_DB) / 20)
    this.command('setVolume', [Math.max(MIN_EMBED_VOLUME, Math.round(embedVolume(this.volume) * gain))])
  }

  /** Ramps the fade to `target` (smoothstep). Resolves false if another fade took over first. */
  private fadeTo(target: number, ms: number): Promise<boolean> {
    this.cancelFade()
    const from = this.fade
    if (from === target) return Promise.resolve(true)
    const started = performance.now()
    return new Promise<boolean>((resolve) => {
      this.fadeDone = resolve
      this.fadeTimer = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - started) / ms)
        this.fade = from + (target - from) * t * t * (3 - 2 * t)
        this.sendLevel()
        if (t < 1) return
        this.fade = target
        this.clearFadeTimer()
        this.fadeDone = null
        resolve(true)
      }, FADE_STEP_MS)
    })
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer)
    this.fadeTimer = null
  }

  private cancelFade(): void {
    this.clearFadeTimer()
    const done = this.fadeDone
    this.fadeDone = null
    done?.(false)
  }

  /** Back to full volume immediately (fades turned off, or playback stopped). */
  private resetFade(): void {
    this.cancelFade()
    this.fadeInOnPlay = null
    if (this.fade !== 1) {
      this.fade = 1
      this.sendLevel()
    }
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (event.origin !== ORIGIN || event.source !== this.iframe?.contentWindow) return
    let data: { event?: string; info?: unknown }
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return
    }
    this.markReady?.()

    switch (data.event) {
      case 'initialDelivery':
      case 'infoDelivery':
        this.applyInfo(data.info as PlayerInfo)
        break
      case 'onStateChange':
        this.applyInfo({ playerState: data.info as number })
        break
      case 'onError':
        this.handleError(Number(data.info))
        break
    }
  }

  private applyInfo(info: PlayerInfo | undefined): void {
    if (!info) return
    if (typeof info.currentTime === 'number') {
      this.info.currentTime = info.currentTime
      this.infoAt = performance.now()
    }
    if (typeof info.duration === 'number' && info.duration > 0) this.info.duration = info.duration
    if (typeof info.playbackRate === 'number') this.info.playbackRate = info.playbackRate
    if (typeof info.videoLoadedFraction === 'number') this.info.videoLoadedFraction = info.videoLoadedFraction
    if (typeof info.playerState === 'number' && info.playerState !== this.info.playerState) {
      this.info.playerState = info.playerState
      this.onStateChange(info.playerState)
    }
    this.emit(true)
  }

  private onStateChange(state: number): void {
    const pending = this.pending
    if (pending && (state === PlayerState.Playing || (!pending.autoplay && (state === PlayerState.Cued || state === PlayerState.Paused)))) {
      window.clearTimeout(pending.timer)
      this.pending = null
      pending.resolve()
    }

    if (state === PlayerState.Playing) this.startTicker()
    else this.stopTicker()

    if (state === PlayerState.Playing && this.fadeInOnPlay !== null) {
      const ms = this.fadeInOnPlay
      this.fadeInOnPlay = null
      void this.fadeTo(1, ms)
    }

    if (state === PlayerState.Ended && this.loop.enabled && this.loop.a !== null) {
      this.seek(this.loop.a)
      this.command('playVideo')
    }
  }

  private handleError(code: number): void {
    const error = new EmbedPlaybackError(code)
    if (this.pending) {
      const pending = this.pending
      window.clearTimeout(pending.timer)
      this.pending = null
      pending.reject(error)
      return
    }
    this.stopTicker()
    this.update({ isPlaying: false, isBuffering: false, error: error.message })
  }

  private cancelPending(error: Error): void {
    if (!this.pending) return
    window.clearTimeout(this.pending.timer)
    this.pending.reject(error)
    this.pending = null
  }

  /** Playhead estimated between player reports, which arrive only a few times per second. */
  private estimatedTime(): number {
    const { currentTime, duration, playerState, playbackRate } = this.info
    if (playerState !== PlayerState.Playing) return currentTime
    const elapsed = ((performance.now() - this.infoAt) / 1000) * playbackRate
    return duration > 0 ? Math.min(duration, currentTime + elapsed) : currentTime + elapsed
  }

  private startTicker(): void {
    if (this.tickTimer !== null) return
    this.tickTimer = window.setInterval(() => {
      this.enforceLoop()
      this.emit(false)
    }, TICK_MS)
  }

  private stopTicker(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
    this.tickTimer = null
  }

  private enforceLoop(): void {
    const { a, b, enabled } = this.loop
    if (!enabled || a === null || b === null) return
    if (this.estimatedTime() >= b) this.seek(a)
  }

  private loopStartOr(fallback: number): number {
    return this.loop.enabled && this.loop.a !== null ? this.loop.a : fallback
  }

  private emit(force: boolean): void {
    const now = performance.now()
    if (!force && now - this.lastEmit < EMIT_INTERVAL_MS) return
    this.lastEmit = now
    const { duration, playerState, videoLoadedFraction } = this.info
    const currentTime = this.estimatedTime()
    this.update({
      isPlaying: playerState === PlayerState.Playing || playerState === PlayerState.Buffering,
      isBuffering: playerState === PlayerState.Buffering || playerState === PlayerState.Unstarted,
      currentTime,
      duration,
      bufferedAhead: Math.max(0, videoLoadedFraction * duration - currentTime),
      ended: playerState === PlayerState.Ended && !this.loop.enabled
    })
  }

  private update(patch: Partial<TransportState>): void {
    this.transport = { ...this.transport, ...patch }
    for (const listener of this.listeners) listener(this.transport)
  }
}

let shared: YouTubeEmbedPlayer | null = null

export function getEmbedPlayer(): YouTubeEmbedPlayer {
  shared ??= new YouTubeEmbedPlayer()
  return shared
}
