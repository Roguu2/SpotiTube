import { app, BrowserWindow, ipcMain, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { IpcChannels, type PresenceInfo, type TrackNotice } from '@core/ipc'
import { createMainWindow } from './window'
import { registerWindowIpc } from './ipc/window'
import { registerLibraryIpc } from './ipc/library'
import { registerDspIpc } from './ipc/dsp'
import { registerUpdateIpc } from './ipc/updates'
import { registerHistoryIpc } from './ipc/history'
import { registerLyricsIpc } from './ipc/lyrics'
import { registerLikesIpc } from './ipc/likes'
import { registerStorageIpc } from './ipc/storage'
import { registerYtSyncIpc } from './ipc/ytsync'
import { registerCozyIpc } from './ipc/cozy'
import { registerMediaScheme, serveMedia } from './services/companionImage'
import { YtMusicSync } from './services/ytmusicSync'
import { DiscordPresence } from './services/discord'
import { notifyTrack } from './services/trackNotifications'
import { isMiniMode } from './services/windowState'
import { isAppPage, isTrustedSender } from './ipc/handle'
import { UpdateService } from './services/updater'
import { cleanUpRemovedFeatures, getSettings } from './services/store'
import { YouTubeClient } from './services/youtube'
import { StreamResolver } from './services/streamResolver'
import { TrackMatcher } from './services/trackMatcher'
import { StreamProxy } from './services/streamProxy'
import { ProviderRegistry } from './services/ProviderRegistry'
import {
  AppTray,
  TaskbarControls,
  registerMediaKeys,
  startNowPlayingBridge,
  unregisterMediaKeys
} from './services/media'
import { SpotifyAuth } from './providers/spotify/SpotifyAuth'
import { SpotifyProvider } from './providers/spotify/SpotifyProvider'
import { YouTubeMusicProvider } from './providers/ytmusic/YouTubeMusicProvider'
import { HybridProvider } from './providers/hybrid/HybridProvider'
import { DemoProvider } from './providers/demo/DemoProvider'

const APP_ID = 'com.spotitube.app'

// Before the app is ready: the page loads your companion picture from this scheme.
registerMediaScheme()

let mainWindow: BrowserWindow | null = null
let tray: AppTray | null = null
let taskbar: TaskbarControls | null = null
let isQuitting = false

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
    taskbar?.attach(mainWindow)
    mainWindow.on('close', (event) => {
      if (!isQuitting && getSettings().closeToTray) {
        event.preventDefault()
        mainWindow?.hide()
      }
    })
    mainWindow.on('closed', () => {
      mainWindow = null
    })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/**
 * The renderer is a local file, so the YouTube embed would load without a
 * Referer and be refused. YouTube asks embedding apps to identify themselves;
 * we send the app id as the referring origin.
 */
function identifyEmbedRequests(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/embed/*'] },
    (details, callback) => {
      if (!details.requestHeaders['Referer']) details.requestHeaders['Referer'] = `https://${APP_ID}/`
      callback({ requestHeaders: details.requestHeaders })
    }
  )
}

/** What the app's own page uses: fullscreen (cozy mode) and copying text (Settings). */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write'])

/**
 * Electron grants every permission by default, to every frame. Refuse all but
 * the few the app uses, and give those only to the app's own page; the YouTube
 * frame may go fullscreen and nothing else (camera, mic, location, HID…).
 */
function restrictPermissions(): void {
  const allowed = (permission: string, url: string): boolean =>
    ALLOWED_PERMISSIONS.has(permission) && (isAppPage(url) || (permission === 'fullscreen' && url.startsWith('https://www.youtube-nocookie.com/')))
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(permission, details.requestingUrl ?? contents?.getURL() ?? ''))
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin, details) => {
    return allowed(permission, details.requestingUrl ?? details.embeddingOrigin ?? requestingOrigin ?? contents?.getURL() ?? '')
  })
}

async function bootstrap(): Promise<void> {
  restrictPermissions()
  const youtube = new YouTubeClient()
  const resolver = new StreamResolver(youtube)
  const matcher = new TrackMatcher(youtube)
  const proxy = new StreamProxy()
  // Mid-playback refusals switch every following track straight to the official player.
  proxy.onUpstreamBlocked = () => resolver.markBlocked()
  await proxy.start()
  identifyEmbedRequests()

  const spotifyAuth = new SpotifyAuth(() => getSettings().spotifyClientId)
  const spotify = new SpotifyProvider(spotifyAuth, matcher, resolver)
  const ytmusic = new YouTubeMusicProvider(youtube, resolver)
  const demo = new DemoProvider(matcher, resolver)

  // Hybrid tracks keep their original provider, so streaming routes back through the registry.
  let registry: ProviderRegistry | null = null
  const hybrid = new HybridProvider((track) => {
    if (!registry) throw new Error('Provider registry is not ready')
    return registry.provider(track.providerId).resolveStreamUrl(track)
  })
  registry = new ProviderRegistry({ spotify, ytmusic, hybrid, demo }, matcher, resolver, proxy)

  registerWindowIpc()
  registerLibraryIpc({ registry, spotifyAuth, spotify, hybrid, youtube })
  registerDspIpc()
  registerHistoryIpc()
  registerLyricsIpc()
  registerLikesIpc({ hybrid, spotify, youtube })
  registerStorageIpc(DISK_CACHE_LIMIT_BYTES)
  serveMedia()
  registerCozyIpc()
  cleanUpRemovedFeatures()

  const ytSync = new YtMusicSync({ youtube, matcher, listAccountPlaylists: () => ytmusic.getPlaylists() })
  registry.hidePlaylists(() => ytSync.mirroredPlaylistIds())
  registerYtSyncIpc(ytSync)
  ytSync.start()

  const presence = new DiscordPresence()
  ipcMain.on(IpcChannels.presenceUpdate, (event, enabled: unknown, info: PresenceInfo | null) => {
    if (!isTrustedSender(event)) return
    presence.setEnabled(enabled === true)
    presence.update(enabled === true ? info : null)
  })
  ipcMain.on(IpcChannels.mediaNotifyTrack, (event, notice: TrackNotice) => {
    // The mini player is always in view, so it needs no announcement.
    if (!isTrustedSender(event) || !getSettings().trackNotifications || isMiniMode()) return
    if (typeof notice?.title !== 'string' || typeof notice.artists !== 'string') return
    void notifyTrack(mainWindow, notice, showMainWindow)
  })

  const updates = new UpdateService()
  registerUpdateIpc(updates)
  updates.start()
  registerMediaKeys()
  startNowPlayingBridge()
  taskbar = new TaskbarControls()

  tray = new AppTray({
    showWindow: showMainWindow,
    quit: () => {
      isQuitting = true
      app.quit()
    }
  })

  app.on('will-quit', () => {
    unregisterMediaKeys()
    presence.destroy()
    ytSync.stop()
    updates.stop()
    proxy.stop()
    tray?.destroy()
    taskbar?.destroy()
  })

  showMainWindow()

  // Warm up the anonymous InnerTube session so the first play/search is fast.
  void youtube.getAnonymous().catch(() => undefined)
}

// Chromium's HTTP cache (YouTube player files, covers) would otherwise grow to several hundred MB;
// over the limit, Chromium drops the least recently used entries itself.
const DISK_CACHE_LIMIT_BYTES = 100 * 1024 * 1024
app.commandLine.appendSwitch('disk-cache-size', String(DISK_CACHE_LIMIT_BYTES))

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.on('before-quit', () => {
    isQuitting = true
  })

  void app.whenReady().then(async () => {
    electronApp.setAppUserModelId(APP_ID)

    // F12 toggles DevTools in development; Ctrl/Cmd+R reload is disabled in production.
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

    await bootstrap()
    app.on('activate', showMainWindow)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
