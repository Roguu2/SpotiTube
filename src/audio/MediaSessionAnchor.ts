/** Length of the silent clip; over Chromium's 5 s minimum for a player to count as music, not a sound effect. */
const SILENCE_SECONDS = 10
const SAMPLE_RATE = 8000

/** A mono 16-bit PCM WAV of pure silence. */
function silentWav(): Blob {
  const samples = SILENCE_SECONDS * SAMPLE_RATE
  const view = new DataView(new ArrayBuffer(44 + samples * 2))
  const text = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples * 2, true)
  return new Blob([view.buffer], { type: 'audio/wav' })
}

/**
 * Keeps the OS media controls (Windows' media flyout / SMTC, macOS Now Playing)
 * pointed at SpotiTube's own document while YouTube's official player plays.
 *
 * Chromium hands the OS the media session of the top-most frame that has a
 * player. In embed mode the only player lives in YouTube's cross-origin
 * iframe, so the OS would show YouTube's title and channel name, without
 * next/previous, and route the buttons to YouTube instead of our handlers. A
 * silent looping `<audio>` in this document, playing exactly while the embed
 * plays, makes the app's own `navigator.mediaSession` (metadata, action
 * handlers, position) the one the OS sees.
 */
class MediaSessionAnchor {
  private media: HTMLAudioElement | null = null

  /** Plays the silent clip while `active`, pauses it otherwise. */
  sync(active: boolean): void {
    if (!active) {
      if (this.media && !this.media.paused) this.media.pause()
      return
    }
    const media = (this.media ??= this.create())
    if (media.paused) void media.play().catch(() => undefined)
  }

  private create(): HTMLAudioElement {
    const media = new Audio(URL.createObjectURL(silentWav()))
    media.loop = true
    return media
  }
}

let shared: MediaSessionAnchor | null = null

export function getMediaSessionAnchor(): MediaSessionAnchor {
  shared ??= new MediaSessionAnchor()
  return shared
}
