import { app, BrowserWindow } from 'electron'
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
import privateGitHub from 'electron-updater/out/providers/PrivateGitHubProvider.js'
import type { CustomPublishOptions } from 'builder-util-runtime'
import { IpcChannels, type UpdateState } from '@core/ipc'
import { getSettings } from './store'
import { errorMessage } from './http'

const { autoUpdater } = electronUpdater

const STARTUP_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 4 * 60 * 60_000
/** After a failed check, try again sooner than the regular interval. */
const RETRY_AFTER_ERROR_MS = 15 * 60_000
const RELEASES_OWNER = 'Roguu2'
const RELEASES_REPO = 'SpotiTube-releases'
const RELEASES_URL = `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}/releases/latest`

/**
 * Reads releases through GitHub's API (api.github.com) instead of github.com's
 * release pages. Those pages sometimes fail with 5xx while the API, and the
 * file storage it redirects to, keep working. electron-updater's private-repo
 * provider already works this way; the releases repo is public, so no token.
 */
type ProviderArgs = ConstructorParameters<typeof privateGitHub.PrivateGitHubProvider>

class GitHubApiProvider extends privateGitHub.PrivateGitHubProvider {
  constructor(options: CustomPublishOptions, updater: ProviderArgs[1], runtimeOptions: ProviderArgs[3]) {
    super({ ...options, provider: 'github', owner: RELEASES_OWNER, repo: RELEASES_REPO }, updater, '', runtimeOptions)
  }
}
// The parent sends "authorization: token …" with every request; a public repo needs none (and an empty token is refused).
Object.defineProperty(GitHubApiProvider.prototype, 'configureHeaders', {
  value: (accept: string) => ({ accept })
})

/** A 5xx from GitHub: the server side failed, so another route to the same files may well work. */
function isServerError(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode
  return (typeof status === 'number' && status >= 500) || /50[0-4]/.test(errorMessage(error))
}

function releaseNotesText(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (!notes) return undefined
  const text = typeof notes === 'string' ? notes : notes.map((n) => n.note ?? '').join('\n\n')
  // GitHub release notes arrive as HTML; the UI shows plain text.
  return (
    text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h\d)>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim() || undefined
  )
}

/**
 * In-app updates from GitHub Releases (electron-updater). Updates download in
 * the background when automatic updates are enabled and install on restart —
 * immediately via "Restart to update", or silently the next time the app quits.
 */
export class UpdateService {
  private state: UpdateState = {
    status: app.isPackaged ? 'idle' : 'unsupported',
    currentVersion: app.getVersion(),
    releasesUrl: RELEASES_URL
  }
  private timer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null
  /** Switched to GitHub's API for the rest of the session after github.com failed. */
  private viaApi = false

  constructor() {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = null

    autoUpdater.on('checking-for-update', () => this.update({ status: 'checking', error: undefined }))
    autoUpdater.on('update-not-available', () =>
      this.update({ status: 'not-available', checkedAt: Date.now(), version: undefined, progress: undefined })
    )
    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.update({
        status: 'available',
        version: info.version,
        releaseNotes: releaseNotesText(info),
        checkedAt: Date.now()
      })
      if (getSettings().autoUpdate) void this.download()
    })
    autoUpdater.on('download-progress', (progress: ProgressInfo) =>
      this.update({
        status: 'downloading',
        progress: {
          percent: progress.percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total
        }
      })
    )
    autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
      this.update({ status: 'downloaded', version: info.version, progress: undefined })
    )
    autoUpdater.on('error', (error: Error) => this.update({ status: 'error', error: describeError(error) }))
  }

  getState(): UpdateState {
    return this.state
  }

  /** Schedules background checks (packaged builds only, when automatic updates are on). */
  start(): void {
    if (!app.isPackaged) return
    const tick = (): void => {
      if (getSettings().autoUpdate && this.state.status !== 'downloading' && this.state.status !== 'downloaded') {
        void this.check()
      }
    }
    setTimeout(tick, STARTUP_DELAY_MS)
    this.timer = setInterval(tick, CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.timer = null
    this.retryTimer = null
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state
    if (this.state.status === 'downloading' || this.state.status === 'downloaded') return this.state
    try {
      await this.withFallback(() => autoUpdater.checkForUpdates())
    } catch (error) {
      this.failed(error)
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    if (this.state.status !== 'available' && this.state.status !== 'error') return this.state
    try {
      this.update({ status: 'downloading', progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 } })
      await this.withFallback(async () => {
        // After switching routes the update has to be looked up again before it can be downloaded.
        if (this.state.status !== 'downloading') await autoUpdater.checkForUpdates()
        await autoUpdater.downloadUpdate()
      })
    } catch (error) {
      this.failed(error)
    }
    return this.state
  }

  /** Runs an updater call; if github.com answers 5xx, switches to GitHub's API and runs it once more. */
  private async withFallback(run: () => Promise<unknown>): Promise<void> {
    try {
      await run()
    } catch (error) {
      if (this.viaApi || !isServerError(error)) throw error
      this.viaApi = true
      autoUpdater.setFeedURL({ provider: 'custom', updateProvider: GitHubApiProvider })
      await run()
    }
  }

  private failed(error: unknown): void {
    this.update({ status: 'error', error: describeError(error) })
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (getSettings().autoUpdate) void this.check()
    }, RETRY_AFTER_ERROR_MS)
  }

  /** Quits, installs the downloaded update and relaunches. */
  install(): void {
    if (this.state.status !== 'downloaded') return
    // Silent: the assisted NSIS installer would otherwise show its full wizard and wait
    // for clicks. Force-run relaunches SpotiTube once the update is installed.
    // Deferred so the IPC reply reaches the renderer before windows close.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }

  private update(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IpcChannels.updatesStateChanged, this.state)
    }
  }
}

function describeError(error: unknown): string {
  const message = errorMessage(error)
  if (/\b(401|403|404)\b/.test(message) || /Unable to find latest version/i.test(message)) {
    return 'The update server could not be reached (releases may be private or not published yet)'
  }
  if (/code signature|not signed|ShipIt/i.test(message)) {
    return 'This build is not code-signed, so macOS cannot install updates automatically — download the new version manually'
  }
  if (isServerError(error)) {
    return "GitHub isn't responding right now — SpotiTube will try again in a few minutes"
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(message)) {
    return 'No connection to the update server'
  }
  return message.split('\n')[0]
}
