import { app, BrowserWindow } from 'electron'
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { IpcChannels, type UpdateState } from '@core/ipc'
import { getSettings } from './store'
import { errorMessage } from './http'

const { autoUpdater } = electronUpdater

const STARTUP_DELAY_MS = 15_000
const CHECK_INTERVAL_MS = 4 * 60 * 60_000
const RELEASES_URL = 'https://github.com/Roguu2/SpotiTube-releases/releases/latest'

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
    this.timer = null
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return this.state
    if (this.state.status === 'downloading' || this.state.status === 'downloaded') return this.state
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.update({ status: 'error', error: describeError(error) })
    }
    return this.state
  }

  async download(): Promise<UpdateState> {
    if (this.state.status !== 'available' && this.state.status !== 'error') return this.state
    try {
      this.update({ status: 'downloading', progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 } })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.update({ status: 'error', error: describeError(error) })
    }
    return this.state
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
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(message)) {
    return 'No connection to the update server'
  }
  return message.split('\n')[0]
}
