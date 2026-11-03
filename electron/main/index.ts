import { app, BrowserWindow, session } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { registerWindowIpc } from './ipc/window'
import { registerLibraryIpc } from './ipc/library'
import { registerDspIpc } from './ipc/dsp'
import { registerUpdateIpc } from './ipc/updates'
import { registerHistoryIpc } from './ipc/history'
import { registerLyricsIpc } from './ipc/lyrics'
import { initRemote, stopRemote } from './remote'
import { UpdateService } from './services/updater'
import { getSettings } from './services/store'
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

async function bootstrap(): Promise<void> {
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
  const providers = registry
  initRemote((query) => providers.search(query))

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
    stopRemote()
    updates.stop()
    proxy.stop()
    tray?.destroy()
    taskbar?.destroy()
  })

  showMainWindow()

  // Warm up the anonymous InnerTube session so the first play/search is fast.
  void youtube.getAnonymous().catch(() => undefined)
}

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
