import { useEffect, useState, type ReactNode } from 'react'
import { ArrowDownToLine, Check, Copy, ExternalLink, FolderSync, LoaderCircle, RotateCw, Smartphone } from 'lucide-react'
import type { StorageUsage, UpdateState } from '@core/ipc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/IconButton'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUpdateStore } from '@/store/useUpdateStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { useRemoteStore } from '@/store/useRemoteStore'
import { useSyncStore } from '@/store/useSyncStore'
import { cx } from '@/lib/format'

export function SettingsModal() {
  const open = useSettingsStore((s) => s.settingsOpen)
  const setOpen = useSettingsStore((s) => s.setSettingsOpen)
  const appInfo = useSettingsStore((s) => s.appInfo)

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Settings" description="Accounts, streaming and app behaviour" className="max-w-2xl">
      <div className="divide-y divide-white/6">
        <SpotifySection />
        <YouTubeMusicSection />
        <PlaybackSection />
        <RemoteSection />
        <SyncSection />
        <UpdatesSection />
        <section className="px-6 py-4 text-[12px] text-zinc-500">
          SpotiTube {appInfo ? `v${appInfo.version}` : ''} · Credentials and cookies are encrypted with your operating
          system's keychain and never leave this device except to talk to Spotify and YouTube.
        </section>
      </div>
    </Modal>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-zinc-300">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-zinc-500">{hint}</span>}
    </label>
  )
}

const inputClass =
  'h-9 w-full rounded-lg bg-black/30 px-3 text-[13px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-white/25'

function StatusPill({ connected, name }: { connected: boolean; name?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
        connected ? 'bg-spotify/15 text-spotify' : 'bg-white/6 text-zinc-400'
      )}
    >
      <span className={cx('size-1.5 rounded-full', connected ? 'bg-spotify' : 'bg-zinc-500')} />
      {connected ? `Connected${name ? ` · ${name}` : ''}` : 'Not connected — showing samples'}
    </span>
  )
}

function SpotifySection() {
  const settings = useSettingsStore((s) => s.settings)
  const auth = useSettingsStore((s) => s.auth)
  const connecting = useSettingsStore((s) => s.connecting)
  const update = useSettingsStore((s) => s.update)
  const connect = useSettingsStore((s) => s.connectSpotify)
  const disconnect = useSettingsStore((s) => s.disconnectSpotify)
  const [clientId, setClientId] = useState(settings?.spotifyClientId ?? '')
  const [copied, setCopied] = useState(false)

  useEffect(() => setClientId(settings?.spotifyClientId ?? ''), [settings?.spotifyClientId])

  const saveClientId = (): void => {
    if (clientId.trim() !== settings?.spotifyClientId) void update({ spotifyClientId: clientId })
  }

  const copyRedirect = async (): Promise<void> => {
    if (!settings) return
    await navigator.clipboard.writeText(settings.spotifyRedirectUri)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const connected = auth?.spotify.connected ?? false

  return (
    <section className="space-y-4 px-6 py-5">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[14px] font-semibold">
          <SourceBadge source="spotify" /> Spotify
        </h3>
        <StatusPill connected={connected} name={auth?.spotify.displayName} />
      </header>

      <Field
        label="Client ID"
        hint={
          <>
            Create an app in the{' '}
            <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-zinc-300 underline underline-offset-2">
              Spotify Developer Dashboard <ExternalLink size={10} />
            </a>
            , enable “Web API”, and add the redirect URI below. No client secret is needed (PKCE).
          </>
        }
      >
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          onBlur={saveClientId}
          onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
          spellCheck={false}
          placeholder="e.g. 1a2b3c4d5e6f…"
          className={cx(inputClass, 'font-mono')}
        />
      </Field>

      <Field label="Redirect URI">
        <div className="flex gap-2">
          <input readOnly value={settings?.spotifyRedirectUri ?? ''} className={cx(inputClass, 'font-mono text-zinc-400')} />
          <Button variant="secondary" onClick={() => void copyRedirect()} aria-label="Copy redirect URI">
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        </div>
      </Field>

      <div className="flex gap-2">
        {connected ? (
          <Button variant="danger" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!clientId.trim() || connecting !== null}
            onClick={() => {
              saveClientId()
              void connect()
            }}
          >
            {connecting === 'spotify' && <LoaderCircle size={14} className="animate-spin" />}
            {connecting === 'spotify' ? 'Waiting for browser…' : 'Connect Spotify'}
          </Button>
        )}
      </div>
    </section>
  )
}

function YouTubeMusicSection() {
  const auth = useSettingsStore((s) => s.auth)
  const connecting = useSettingsStore((s) => s.connecting)
  const connect = useSettingsStore((s) => s.connectYouTubeMusic)
  const disconnect = useSettingsStore((s) => s.disconnectYouTubeMusic)
  const [cookie, setCookie] = useState('')
  const connected = auth?.ytmusic.connected ?? false

  return (
    <section className="space-y-4 px-6 py-5">
      <header className="flex items-center justify-between">
        <h3 className="flex items-center gap-2.5 text-[14px] font-semibold">
          <SourceBadge source="ytmusic" /> YouTube Music
        </h3>
        <StatusPill connected={connected} name={auth?.ytmusic.displayName} />
      </header>

      {connected ? (
        <Button variant="danger" onClick={() => void disconnect()}>
          Disconnect
        </Button>
      ) : (
        <>
          <Field
            label="Browser cookie"
            hint={
              <>
                Search and streaming work without an account. To load your library: open{' '}
                <a href="https://music.youtube.com" target="_blank" rel="noreferrer" className="text-zinc-300 underline underline-offset-2">
                  music.youtube.com
                </a>{' '}
                signed in, press F12 → Network, click any <code className="text-zinc-300">browse</code> request and copy the
                value of its <code className="text-zinc-300">cookie</code> request header.
              </>
            }
          >
            <textarea
              value={cookie}
              onChange={(e) => setCookie(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="VISITOR_INFO1_LIVE=…; SAPISID=…; __Secure-3PAPISID=…"
              className={cx(inputClass, 'h-auto resize-none py-2 font-mono text-[11.5px] leading-relaxed')}
            />
          </Field>
          <Button
            variant="primary"
            disabled={!cookie.trim() || connecting !== null}
            onClick={() =>
              void connect(cookie).then((ok) => {
                if (ok) setCookie('')
              })
            }
          >
            {connecting === 'ytmusic' && <LoaderCircle size={14} className="animate-spin" />}
            {connecting === 'ytmusic' ? 'Verifying…' : 'Connect YouTube Music'}
          </Button>
        </>
      )}
    </section>
  )
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={cx('flex items-start justify-between gap-6', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
      <span>
        <span className="block text-[13px] font-medium text-zinc-200">{label}</span>
        <span className="block text-[11.5px] text-zinc-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-spotify' : 'bg-white/15')}
      >
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(0, Math.round(bytes / 1024))} KB`
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

function ago(at: number | null): string {
  if (!at) return 'never'
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`
}

function SyncSection() {
  const status = useSyncStore((s) => s.status)
  const busy = useSyncStore((s) => s.busy)
  const load = useSyncStore((s) => s.load)
  const chooseFolder = useSyncStore((s) => s.chooseFolder)
  const stop = useSyncStore((s) => s.stop)
  const syncNow = useSyncStore((s) => s.syncNow)

  useEffect(() => {
    void load()
  }, [load])

  if (!status) return null

  return (
    <section className="space-y-4 px-6 py-5">
      <h3 className="flex items-center gap-2.5 text-[14px] font-semibold">
        <FolderSync size={15} className="text-zinc-400" /> Sync between computers
      </h3>
      <p className="text-[12px] leading-relaxed text-zinc-500">
        Pick a folder you already sync — OneDrive, Dropbox, iCloud Drive or Google Drive — on each computer. Hybrid
        playlists, chosen song versions, playback settings and listening history follow you, and you can continue a song
        where another computer left off. Accounts and passwords never sync.
      </p>
      {status.enabled ? (
        <div className="space-y-3 rounded-lg bg-black/25 px-3.5 py-3 ring-1 ring-white/6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate font-mono text-[11.5px] text-zinc-300" title={status.folder ?? undefined}>
                {status.folder}
              </div>
              <div className="text-[11.5px] text-zinc-500">
                This computer: {status.deviceName} · last synced {ago(status.lastSyncAt)}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void syncNow()}>
                {busy ? <LoaderCircle size={13} className="animate-spin" /> : <RotateCw size={13} />} Sync now
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void stop()}>
                Stop
              </Button>
            </div>
          </div>
          {status.error && <p className="text-[12px] text-red-400">{status.error}</p>}
          {status.devices.length > 0 ? (
            <ul className="space-y-1 text-[12px] text-zinc-400">
              {status.devices.map((device) => (
                <li key={device.id} className="flex justify-between gap-4">
                  <span className="truncate">{device.name}</span>
                  <span className="shrink-0 text-zinc-500">seen {ago(device.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-zinc-500">No other computer in this folder yet — choose the same folder there.</p>
          )}
        </div>
      ) : (
        <Button variant="secondary" disabled={busy} onClick={() => void chooseFolder()}>
          {busy ? <LoaderCircle size={14} className="animate-spin" /> : <FolderSync size={14} />} Choose sync folder…
        </Button>
      )}
    </section>
  )
}

function RemoteSection() {
  const status = useRemoteStore((s) => s.status)
  const busy = useRemoteStore((s) => s.busy)
  const setEnabled = useRemoteStore((s) => s.setEnabled)
  const resetPairing = useRemoteStore((s) => s.resetPairing)
  const [copied, setCopied] = useState(false)

  if (!status) return null
  const live = status.enabled && status.running

  const copy = (): void => {
    if (!status.url) return
    void navigator.clipboard.writeText(status.url).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <section className="space-y-4 px-6 py-5">
      <h3 className="flex items-center gap-2.5 text-[14px] font-semibold">
        <Smartphone size={15} className="text-zinc-400" /> Phone remote
        {live && (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-zinc-300">
            {status.clients === 0 ? 'No phone connected' : status.clients === 1 ? '1 phone connected' : `${status.clients} phones connected`}
          </span>
        )}
      </h3>
      <SettingToggle
        label="Control SpotiTube from your phone"
        description="Your phone's browser becomes a remote — play, skip, volume, queue and search — while it's on the same Wi-Fi."
        checked={status.enabled}
        onChange={(v) => void setEnabled(v)}
      />
      {busy && (
        <p className="flex items-center gap-2 text-[12px] text-zinc-500">
          <LoaderCircle size={13} className="animate-spin" /> Starting…
        </p>
      )}
      {status.enabled && status.error && <p className="text-[12px] text-red-400">{status.error}</p>}
      {live && status.qrDataUrl && status.url && (
        <div className="flex gap-5 rounded-lg bg-black/25 p-4 ring-1 ring-white/6">
          <img src={status.qrDataUrl} alt="QR code that opens and pairs the remote" className="size-36 shrink-0 rounded-lg bg-white p-1.5" />
          <div className="min-w-0 space-y-2.5 text-[12.5px] text-zinc-400">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Connect your phone to the same Wi-Fi as this computer.</li>
              <li>Scan the code with the phone&apos;s camera — that opens and pairs the remote.</li>
              <li>Add it to the home screen for one-tap access next time.</li>
            </ol>
            <button
              type="button"
              onClick={copy}
              title="Copy address"
              className="flex max-w-full items-center gap-1.5 truncate rounded-md bg-white/6 px-2 py-1 font-mono text-[11.5px] text-zinc-300 hover:bg-white/10"
            >
              {copied ? <Check size={12} className="shrink-0 text-spotify" /> : <Copy size={12} className="shrink-0" />}
              <span className="truncate">{status.url}</span>
            </button>
            {status.otherUrls.length > 0 && (
              <p className="text-[11px] text-zinc-500">Not loading? Other addresses of this computer: {status.otherUrls.join(', ')}</p>
            )}
            <p className="text-[11px] text-zinc-500">
              Anyone on your network with this code can control playback. If Windows asks, allow SpotiTube on private
              networks.{' '}
              <button type="button" onClick={() => void resetPairing()} className="text-zinc-300 underline-offset-2 hover:underline">
                Reset pairing
              </button>
            </p>
          </div>
        </div>
      )}
    </section>
  )
}

function UpdatesSection() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.update)
  const update = useUpdateStore((s) => s.update)
  const check = useUpdateStore((s) => s.check)
  const download = useUpdateStore((s) => s.download)
  const install = useUpdateStore((s) => s.install)

  if (!settings || !update) return null
  const busy = update.status === 'checking' || update.status === 'downloading'

  const statusText: Record<UpdateState['status'], string> = {
    idle: 'Not checked yet',
    checking: 'Checking for updates…',
    available: `Version ${update.version} is available`,
    'not-available': 'You are on the latest version',
    downloading: `Downloading ${update.version}… ${Math.round(update.progress?.percent ?? 0)}%`,
    downloaded: `Version ${update.version} is ready to install`,
    error: update.error ?? 'Update check failed',
    unsupported: 'Updates are only available in installed builds'
  }

  return (
    <section className="space-y-4 px-6 py-5">
      <h3 className="text-[14px] font-semibold">Updates</h3>
      <div className="flex items-center justify-between gap-4 rounded-lg bg-black/25 px-3.5 py-3 ring-1 ring-white/6">
        <div className="min-w-0">
          <p className="text-[13px] text-zinc-200">
            SpotiTube <span className="tabular-nums">v{update.currentVersion}</span>
          </p>
          <p className={cx('mt-0.5 text-[12px]', update.status === 'error' ? 'text-red-300' : 'text-zinc-500')}>
            {statusText[update.status]}
          </p>
          {update.status === 'downloading' && (
            <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-spotify transition-[width]" style={{ width: `${Math.round(update.progress?.percent ?? 0)}%` }} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {update.status === 'downloaded' ? (
            <Button variant="primary" onClick={() => void install()}>
              <RotateCw size={14} /> Restart to update
            </Button>
          ) : update.status === 'available' ? (
            <Button variant="primary" onClick={() => void download()}>
              <ArrowDownToLine size={14} /> Download
            </Button>
          ) : (
            <Button variant="secondary" disabled={busy || update.status === 'unsupported'} onClick={() => void check()}>
              {update.status === 'checking' && <LoaderCircle size={14} className="animate-spin" />}
              Check for updates
            </Button>
          )}
        </div>
      </div>
      {update.releaseNotes && (update.status === 'available' || update.status === 'downloading' || update.status === 'downloaded') && (
        <div className="max-h-32 overflow-y-auto rounded-lg bg-black/20 px-3.5 py-2.5 text-[12px] whitespace-pre-line text-zinc-400 ring-1 ring-white/6">
          {update.releaseNotes}
        </div>
      )}
      {update.status === 'error' && (
        <a
          href={update.releasesUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-zinc-300 underline underline-offset-2"
        >
          Download the latest version manually <ExternalLink size={11} />
        </a>
      )}
      <SettingToggle
        label="Automatic updates"
        description="Check for new versions in the background and download them; they install the next time SpotiTube restarts."
        checked={settings.autoUpdate}
        onChange={(v) => void updateSettings({ autoUpdate: v })}
      />
    </section>
  )
}

function PlaybackSection() {
  const settings = useSettingsStore((s) => s.settings)
  const appInfo = useSettingsStore((s) => s.appInfo)
  const update = useSettingsStore((s) => s.update)
  const playCount = useHistoryStore((s) => s.plays.length)
  const clearHistory = useHistoryStore((s) => s.clear)
  const setAutoplayEnabled = usePlayerStore((s) => s.setAutoplayEnabled)
  const [ytDlpPath, setYtDlpPath] = useState(settings?.ytDlpPath ?? '')
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [clearingCache, setClearingCache] = useState(false)

  useEffect(() => setYtDlpPath(settings?.ytDlpPath ?? ''), [settings?.ytDlpPath])
  useEffect(() => {
    void window.electronAPI.storage.getUsage().then(setStorage)
  }, [])

  if (!settings) return null
  const saveYtDlp = (): void => {
    if (ytDlpPath.trim() !== settings.ytDlpPath) void update({ ytDlpPath })
  }

  return (
    <section className="space-y-4 px-6 py-5">
      <h3 className="text-[14px] font-semibold">Playback & app</h3>
      <SettingToggle
        label="Show sample playlists"
        description="Display demo Spotify / YT Music playlists for sources that are not connected."
        checked={settings.showDemoContent}
        onChange={(v) => void update({ showDemoContent: v })}
      />
      <SettingToggle
        label="Synthesized fallback"
        description="Play a generated preview when no stream can be found (e.g. offline) instead of skipping."
        checked={settings.syntheticFallback}
        onChange={(v) => void update({ syntheticFallback: v })}
      />
      <SettingToggle
        label="Close to tray"
        description="Keep playing in the system tray when the window is closed."
        checked={settings.closeToTray}
        onChange={(v) => void update({ closeToTray: v })}
      />
      <SettingToggle
        label="Song notifications"
        description="A quiet system notification with the cover when a new song starts while SpotiTube is in the background."
        checked={settings.trackNotifications}
        onChange={(v) => void update({ trackNotifications: v })}
      />
      <SettingToggle
        label="Discord status"
        description={
          appInfo?.discordAvailable
            ? "Show the song you're listening to on your Discord profile while it plays (Discord must be running)."
            : 'Not available in this build yet.'
        }
        checked={settings.discordPresence && !!appInfo?.discordAvailable}
        disabled={!appInfo?.discordAvailable}
        onChange={(v) => void update({ discordPresence: v })}
      />
      <SettingToggle
        label="Autoplay similar tracks"
        description="When the queue runs out, keep playing tracks similar to the last one. Your queue always plays first."
        checked={settings.autoplay}
        onChange={(v) => void setAutoplayEnabled(v)}
      />
      <SettingToggle
        label="Smooth fades"
        description="Fade the music briefly when you skip, pause or resume instead of cutting it off."
        checked={settings.smoothFades}
        onChange={(v) => void update({ smoothFades: v })}
      />
      <SettingToggle
        label="Resume where you left off"
        description="On launch, bring back the queue and the track you were listening to, paused at the same spot."
        checked={settings.restoreSession}
        onChange={(v) => void update({ restoreSession: v })}
      />
      <div className="flex items-start justify-between gap-6">
        <span>
          <span className="block text-[13px] font-medium text-zinc-200">Listening history</span>
          <span className="block text-[11.5px] text-zinc-500">
            {playCount ? `${playCount.toLocaleString()} plays saved on this computer.` : 'Nothing saved yet.'}
            {storage &&
              ` Keeps the last ${storage.maxPlays} plays from up to ${Math.round(storage.maxPlayAgeDays / 30)} months; older ones are removed on their own.`}
          </span>
        </span>
        <Button size="sm" variant="secondary" disabled={!playCount} onClick={() => void clearHistory()}>
          Clear
        </Button>
      </div>
      <div className="flex items-start justify-between gap-6">
        <span>
          <span className="block text-[13px] font-medium text-zinc-200">Cache</span>
          <span className="block text-[11.5px] text-zinc-500">
            {storage
              ? `Player files and covers: ${formatBytes(storage.cacheBytes)} (capped at ${formatBytes(storage.cacheLimitBytes)}). Clearing it is safe; it refills as you listen.`
              : 'Checking…'}
          </span>
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={!storage || storage.cacheBytes === 0 || clearingCache}
          onClick={() => {
            setClearingCache(true)
            void window.electronAPI.storage
              .clearCache()
              .then(setStorage)
              .finally(() => setClearingCache(false))
          }}
        >
          {clearingCache ? <LoaderCircle size={13} className="animate-spin" /> : 'Clear'}
        </Button>
      </div>
      <Field label="yt-dlp path (optional)" hint="Used as a last-resort stream extractor. Leave empty to use yt-dlp from your PATH.">
        <input
          value={ytDlpPath}
          onChange={(e) => setYtDlpPath(e.target.value)}
          onBlur={saveYtDlp}
          onKeyDown={(e) => e.key === 'Enter' && saveYtDlp()}
          spellCheck={false}
          placeholder="C:\Tools\yt-dlp.exe"
          className={cx(inputClass, 'font-mono')}
        />
      </Field>
    </section>
  )
}
