import { execFile } from 'node:child_process'
import { statSync } from 'node:fs'
import { basename, delimiter, isAbsolute, join } from 'node:path'

const TIMEOUT_MS = 30_000
/** yt-dlp's release files: yt-dlp, yt-dlp.exe, yt-dlp_x86.exe, yt-dlp_macos, yt-dlp_linux… */
const YT_DLP_NAME = /^yt-dlp([_.-][\w.-]*)?$/i

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Why `path` can't be used as the yt-dlp binary, or null when it can. The path is
 * run as a program, so only an absolute path to an existing file named like
 * yt-dlp is accepted (empty means "find it on PATH").
 */
export function ytDlpPathProblem(path: string): string | null {
  if (!path) return null
  if (!isAbsolute(path)) return 'Use the full path to yt-dlp, e.g. C:\\Tools\\yt-dlp.exe'
  if (!YT_DLP_NAME.test(basename(path))) return 'That file is not yt-dlp (its name should start with "yt-dlp")'
  if (!isFile(path)) return `No file at ${path}`
  return null
}

/**
 * yt-dlp from the PATH directories only. Windows would otherwise also look in the
 * current directory first, where anything named yt-dlp.exe could be waiting.
 */
function findOnPath(): string | null {
  const names = process.platform === 'win32' ? ['yt-dlp.exe'] : ['yt-dlp']
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!dir || !isAbsolute(dir)) continue
    for (const name of names) {
      const candidate = join(dir, name)
      if (isFile(candidate)) return candidate
    }
  }
  return null
}

/**
 * Resolves a direct audio URL with an external yt-dlp binary. Used as the last
 * resort when every InnerTube client refuses to hand out streaming data.
 */
export function resolveWithYtDlp(videoId: string, binaryPath: string): Promise<string> {
  // Checked again here too: the settings file could have been edited by hand.
  const problem = ytDlpPathProblem(binaryPath)
  if (problem) return Promise.reject(new Error(`yt-dlp path in Settings: ${problem}`))
  const binary = binaryPath || findOnPath()
  if (!binary) return Promise.reject(new Error('yt-dlp not found; install it or set its path in Settings'))
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
