import { execFile } from 'node:child_process'

const TIMEOUT_MS = 30_000

/**
 * Resolves a direct audio URL with an external yt-dlp binary. Used as the last
 * resort when every InnerTube client refuses to hand out streaming data.
 */
export function resolveWithYtDlp(videoId: string, binaryPath: string): Promise<string> {
  const binary = binaryPath || 'yt-dlp'
  const args = [
    '--no-playlist',
    '--no-warnings',
    '-f',
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
    '--get-url',
    `https://music.youtube.com/watch?v=${videoId}`
  ]

  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: TIMEOUT_MS, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        const code = (error as NodeJS.ErrnoException).code
        reject(
          new Error(
            code === 'ENOENT'
              ? `yt-dlp not found (${binary}); install it or set its path in Settings`
              : `yt-dlp failed: ${stderr.trim().split('\n').pop() ?? error.message}`
          )
        )
        return
      }
      const url = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith('https://'))
      if (url) resolve(url)
      else reject(new Error('yt-dlp returned no audio URL'))
    })
  })
}
