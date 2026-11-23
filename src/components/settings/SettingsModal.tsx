import { useEffect, useState, type ReactNode } from 'react'
import {
  AppWindow,
  ArrowDownToLine,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  ExternalLink,
  HardDrive,
  Link2,
  LoaderCircle,
  Lock,
  Music2,
  RotateCw,
  TriangleAlert,
  Wrench,
  type LucideIcon
} from 'lucide-react'
import type { StorageUsage, UpdateState, YtSyncStatus } from '@core/ipc'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/IconButton'
import { SourceBadge } from '@/components/ui/SourceBadge'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUpdateStore } from '@/store/useUpdateStore'
import { useHistoryStore } from '@/store/useHistoryStore'
import { usePlayerStore } from '@/store/usePlayerStore'
import { cx } from '@/lib/format'

type TabId = 'accounts' | 'playback' | 'app' | 'storage' | 'updates' | 'advanced'

const TABS: { id: TabId; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'accounts', label: 'Accounts', description: 'Connect Spotify and YouTube Music to bring in your own playlists and liked songs.', icon: Link2 },
  { id: 'playback', label: 'Playback', description: 'What plays next and how songs start and stop.', icon: Music2 },
  { id: 'app', label: 'App & window', description: 'How SpotiTube starts, closes and shows itself on your computer.', icon: AppWindow },
  { id: 'storage', label: 'Storage & privacy', description: 'What SpotiTube keeps on this computer, and clearing it.', icon: HardDrive },
  { id: 'updates', label: 'Updates', description: 'New versions of SpotiTube.', icon: ArrowDownToLine },
  { id: 'advanced', label: 'Advanced', description: 'Rarely needed options for troubleshooting playback.', icon: Wrench }
]

/** Settings, one topic per tab, so each page stays short enough to read at a glance. */
export function SettingsModal() {
  const open = useSettingsStore((s) => s.settingsOpen)
  const setOpen = useSettingsStore((s) => s.setSettingsOpen)
  const appInfo = useSettingsStore((s) => s.appInfo)
  const [tabId, setTabId] = useState<TabId>('accounts')
  const tab = TABS.find((t) => t.id === tabId) ?? TABS[0]

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Settings"
      description="Accounts, playback and how the app behaves"
      className="h-[min(780px,calc(100vh-48px))] max-w-4xl"
    >
      <div className="flex h-full min-h-0">
        <nav aria-label="Settings sections" role="tablist" aria-orientation="vertical" className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-white/6 p-3">
          {TABS.map((t) => {
            const Icon = t.icon
            const active = t.id === tabId
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTabId(t.id)}
                className={cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors duration-150',
                  active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                )}
              >
                <Icon size={16} className={active ? 'text-spotify' : 'text-zinc-500'} />
                {t.label}
              </button>
            )
          })}
          <p className="mt-auto px-3 pt-4 text-[11.5px] text-zinc-500">SpotiTube {appInfo ? `v${appInfo.version}` : ''}</p>
        </nav>

        <div role="tabpanel" aria-label={tab.label} className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
          <h3 className="text-[19px] font-semibold tracking-tight text-zinc-50">{tab.label}</h3>
          <p className="mt-1 mb-6 text-[13.5px] leading-relaxed text-zinc-400">{tab.description}</p>
          {tabId === 'accounts' && <AccountsTab />}
          {tabId === 'playback' && <PlaybackTab />}
          {tabId === 'app' && <AppTab />}
          {tabId === 'storage' && <StorageTab />}
          {tabId === 'updates' && <UpdatesTab />}
          {tabId === 'advanced' && <AdvancedTab />}
        </div>
      </div>
    </Modal>
  )
}

/* ── Building blocks ─────────────────────────────────────────────────── */

/** A titled group of rows. */
function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mb-6', className)}>
      {title && <h4 className="mb-2 px-1 text-[11.5px] font-semibold tracking-[0.12em] text-zinc-500 uppercase">{title}</h4>}
      <div className="divide-y divide-white/6 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07]">{children}</div>
    </section>
  )
}

function RowText({ label, description }: { label: ReactNode; description?: ReactNode }) {
  return (
    <span className="min-w-0">
      <span className="block text-[13.5px] font-medium text-zinc-100">{label}</span>
      {description && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-400">{description}</span>}
    </span>
  )
}

/** A label and description with something on the right (a button, a value). */
function Row({ label, description, children }: { label: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 px-4 py-3.5">
      <RowText label={label} description={description} />
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
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
    <label
      className={cx(
        'group flex items-start justify-between gap-6 px-4 py-3.5 transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-white/[0.035]'
      )}
    >
      <RowText label={label} description={description} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-[background-color,box-shadow] duration-150 disabled:cursor-not-allowed',
          checked ? 'bg-spotify group-hover:shadow-[0_0_0_4px_rgba(29,185,84,0.18)]' : 'bg-white/15 group-hover:shadow-[0_0_0_4px_rgba(255,255,255,0.06)]'
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200 ease-out group-active:scale-90',
            checked && 'translate-x-4'
          )}
        />
      </button>
    </label>
  )
}

const inputClass =
  'h-10 w-full rounded-lg bg-black/30 px-3 text-[13.5px] text-zinc-100 ring-1 ring-white/10 outline-none placeholder:text-zinc-600 focus:ring-white/30'

/** Names of things on another site's screen ("Create app"), so they stand out in the steps. */
function Ui({ children }: { children: ReactNode }) {
  return <b className="font-semibold text-white">{children}</b>
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[12px] font-medium text-zinc-100 ring-1 ring-white/10">{children}</kbd>
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-[12.5px] font-medium text-zinc-100 transition-colors duration-150 hover:bg-white/15"
    >
      {children} <ExternalLink size={12} />
    </a>
  )
}

/** A value to paste somewhere else, with a copy button. */
function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.target.select()} className={cx(inputClass, 'font-mono text-zinc-300')} />
      <Button variant="secondary" onClick={() => void copy()} aria-label={`Copy ${label}`}>
        {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-5 px-4 py-4">{children}</ol>
}

function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-semibold text-zinc-100 tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5">
        <p className="text-[13.5px] leading-relaxed text-zinc-300">{title}</p>
        {children}
      </div>
    </li>
  )
}

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: ReactNode }) {
  const Icon = tone === 'warn' ? TriangleAlert : Lock
  return (
    <div
      className={cx(
        'flex gap-2.5 rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed',
        tone === 'warn' ? 'bg-amber-400/10 text-amber-100/90 ring-1 ring-amber-300/20' : 'bg-white/[0.04] text-zinc-400 ring-1 ring-white/6'
      )}
    >
      <Icon size={14} className={cx('mt-0.5 shrink-0', tone === 'warn' ? 'text-amber-300' : 'text-zinc-500')} />
      <span>{children}</span>
    </div>
  )
}

/** A gentle warning under an input while what's typed doesn't look right yet. */
function InputHint({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-amber-200/90">
      <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {children}
    </p>
  )
}

/** "Something not working?" — questions and answers, folded away until needed. */
function Troubleshooting({ items }: { items: { q: ReactNode; a: ReactNode }[] }) {
  return (
    <details className="group border-t border-white/6 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-zinc-300 hover:text-white">
        <CircleHelp size={15} className="text-zinc-500" /> Something not working?
        <ChevronDown size={14} className="ml-auto text-zinc-500 transition-transform duration-150 group-open:rotate-180" />
      </summary>
      <dl className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={index}>
            <dt className="text-[13px] font-medium text-zinc-200">{item.q}</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-400">{item.a}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

function StatusPill({ connected, name }: { connected: boolean; name?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
        connected ? 'bg-spotify/15 text-spotify' : 'bg-white/6 text-zinc-400'
      )}
    >
      <span className={cx('size-1.5 rounded-full', connected ? 'bg-spotify' : 'bg-zinc-500')} />
      {connected ? `Connected${name ? ` · ${name}` : ''}` : 'Not connected'}
    </span>
  )
}

function AccountCard({
  source,
  name,
  connected,
  displayName,
  children
}: {
  source: 'spotify' | 'ytmusic'
  name: string
  connected: boolean
  displayName?: string
  children: ReactNode
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07]">
      <header className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3.5">
        <h4 className="flex items-center gap-2.5 text-[15px] font-semibold text-zinc-50">
          <SourceBadge source={source} /> {name}
        </h4>
        <StatusPill connected={connected} name={displayName} />
      </header>
      {children}
    </section>
  )
}

/* ── Accounts ────────────────────────────────────────────────────────── */

function AccountsTab() {
  return (
    <>
      <SpotifyAccount />
      <YouTubeMusicAccount />
      <Note>
        Your Spotify sign-in and YouTube cookie are stored encrypted with your computer's keychain and are only ever sent to Spotify and
        YouTube.
      </Note>
    </>
  )
}

const CLIENT_ID = /^[0-9a-f]{32}$/i

function SpotifyAccount() {
  const settings = useSettingsStore((s) => s.settings)
  const auth = useSettingsStore((s) => s.auth)
  const connecting = useSettingsStore((s) => s.connecting)
  const update = useSettingsStore((s) => s.update)
  const connect = useSettingsStore((s) => s.connectSpotify)
  const disconnect = useSettingsStore((s) => s.disconnectSpotify)
  const [clientId, setClientId] = useState(settings?.spotifyClientId ?? '')

  useEffect(() => setClientId(settings?.spotifyClientId ?? ''), [settings?.spotifyClientId])

  const saveClientId = (): void => {
    if (clientId.trim() !== settings?.spotifyClientId) void update({ spotifyClientId: clientId })
  }

  const connected = auth?.spotify.connected ?? false
  const trimmed = clientId.trim()
  const redirectUri = settings?.spotifyRedirectUri ?? ''

  return (
    <AccountCard source="spotify" name="Spotify" connected={connected} displayName={auth?.spotify.displayName}>
      {connected ? (
        <Row label="Your Spotify library is in SpotiTube" description="Your playlists and liked songs show up in the library and play through YouTube.">
          <Button variant="danger" onClick={() => void disconnect()}>
            Disconnect
          </Button>
        </Row>
      ) : (
        <>
          <p className="px-4 pt-4 text-[13px] leading-relaxed text-zinc-400">
            Spotify asks every app to have its own free developer key (a <Ui>Client ID</Ui>). It takes about two minutes, once:
          </p>
          <Steps>
            <Step n={1} title={<>Open the Spotify Developer Dashboard and sign in with your Spotify account.</>}>
              <ExternalButton href="https://developer.spotify.com/dashboard">Open the dashboard</ExternalButton>
            </Step>
            <Step
              n={2}
              title={
                <>
                  Click <Ui>Create app</Ui>. Give it any name and description, for example “SpotiTube”.
                </>
              }
            />
            <Step
              n={3}
              title={
                <>
                  Under <Ui>Redirect URIs</Ui>, paste this address and click <Ui>Add</Ui>:
                </>
              }
            >
              <CopyField value={redirectUri} label="redirect URI" />
            </Step>
            <Step
              n={4}
              title={
                <>
                  Under <Ui>Which API/SDKs are you planning to use?</Ui> tick <Ui>Web API</Ui>, accept the terms and click <Ui>Save</Ui>.
                </>
              }
            />
            <Step
              n={5}
              title={
                <>
                  Open the app's <Ui>Settings</Ui>, copy its <Ui>Client ID</Ui> and paste it here. (You don't need the Client secret.)
                </>
              }
            >
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                onBlur={saveClientId}
                onKeyDown={(e) => e.key === 'Enter' && saveClientId()}
                spellCheck={false}
                aria-label="Spotify Client ID"
                placeholder="Client ID, e.g. 1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d"
                className={cx(inputClass, 'font-mono')}
              />
              <InputHint show={!!trimmed && !CLIENT_ID.test(trimmed)}>
                A Client ID is 32 letters and digits. Check you copied all of it, and not the Client secret.
              </InputHint>
            </Step>
            <Step n={6} title={<>Connect, then click <Ui>Agree</Ui> in the browser window that opens.</>}>
              <Button
                variant="primary"
                disabled={!trimmed || connecting !== null}
                onClick={() => {
                  saveClientId()
                  void connect()
                }}
              >
                {connecting === 'spotify' && <LoaderCircle size={14} className="animate-spin" />}
                {connecting === 'spotify' ? 'Waiting for your browser…' : 'Connect Spotify'}
              </Button>
            </Step>
          </Steps>
          <Troubleshooting
            items={[
              {
                q: '“INVALID_CLIENT: Invalid redirect URI”',
                a: (
                  <>
                    The address in step 3 must match exactly, including <code className="text-zinc-200">http://127.0.0.1</code> and the port. Open
                    your app's Settings in the dashboard, check <Ui>Redirect URIs</Ui> and save again.
                  </>
                )
              },
              {
                q: '“User not registered in the Developer Dashboard”',
                a: (
                  <>
                    A new Spotify app only lets in the account that created it. To use it with another Spotify account, add that account's
                    e-mail under <Ui>User Management</Ui> in the app's settings.
                  </>
                )
              },
              {
                q: 'The browser opened but nothing happened',
                a: 'Finish signing in there and click Agree; SpotiTube connects as soon as the browser shows that you can close the tab. If you closed it, click Connect again.'
              }
            ]}
          />
        </>
      )}
    </AccountCard>
  )
}

function YouTubeMusicAccount() {
  const auth = useSettingsStore((s) => s.auth)
  const connecting = useSettingsStore((s) => s.connecting)
  const connect = useSettingsStore((s) => s.connectYouTubeMusic)
  const disconnect = useSettingsStore((s) => s.disconnectYouTubeMusic)
  const [cookie, setCookie] = useState('')
  const connected = auth?.ytmusic.connected ?? false
  const pasted = cookie.trim()

  return (
    <AccountCard source="ytmusic" name="YouTube Music" connected={connected} displayName={auth?.ytmusic.displayName}>
      {connected ? (
        <>
          <YtMusicSyncSettings />
          <Row label="Disconnect" description="Removes the saved cookie from this computer. Your YouTube Music account isn't changed.">
            <Button variant="danger" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </Row>
        </>
      ) : (
        <>
          <p className="px-4 pt-4 text-[13px] leading-relaxed text-zinc-400">
            Search and playback already work without signing in. Connecting brings in your YouTube Music playlists and liked songs, and lets
            you sync SpotiTube playlists. YouTube has no developer key for this, so SpotiTube signs in with your browser's cookie:
          </p>
          <Steps>
            <Step n={1} title={<>Open YouTube Music in Chrome, Edge or Firefox and make sure you're signed in.</>}>
              <ExternalButton href="https://music.youtube.com">Open YouTube Music</ExternalButton>
            </Step>
            <Step
              n={2}
              title={
                <>
                  Press <Key>F12</Key> (or <Key>Ctrl</Key> <Key>Shift</Key> <Key>I</Key>; on a Mac <Key>⌥</Key> <Key>⌘</Key> <Key>I</Key>) and open
                  the <Ui>Network</Ui> tab.
                </>
              }
            />
            <Step
              n={3}
              title={
                <>
                  Type <Ui>browse</Ui> in the filter box, then click <Ui>Library</Ui> in YouTube Music so a request shows up in the list.
                </>
              }
            />
            <Step
              n={4}
              title={
                <>
                  Click the <Ui>browse</Ui> request. Under <Ui>Headers</Ui> → <Ui>Request Headers</Ui>, find <Ui>cookie</Ui>, right-click its value
                  and choose <Ui>Copy value</Ui>. In Firefox, switch on <Ui>Raw</Ui> and copy the whole line that starts with <Ui>Cookie:</Ui>.
                </>
              }
            />
            <Step n={5} title={<>Paste it here and connect:</>}>
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                rows={3}
                spellCheck={false}
                aria-label="YouTube Music cookie"
                placeholder="VISITOR_INFO1_LIVE=…; SAPISID=…; __Secure-3PAPISID=…"
                className={cx(inputClass, 'h-auto resize-none py-2 font-mono text-[12px] leading-relaxed')}
              />
              <InputHint show={!!pasted && !/SAPISID=/i.test(pasted)}>
                This doesn't look like the whole cookie: it should contain <code>SAPISID=</code>. Copy the cookie header's full value.
              </InputHint>
              <Button
                variant="primary"
                disabled={!pasted || connecting !== null}
                onClick={() =>
                  void connect(cookie).then((ok) => {
                    if (ok) setCookie('')
                  })
                }
              >
                {connecting === 'ytmusic' && <LoaderCircle size={14} className="animate-spin" />}
                {connecting === 'ytmusic' ? 'Checking…' : 'Connect YouTube Music'}
              </Button>
            </Step>
          </Steps>
          <div className="px-4 pb-4">
            <Note tone="warn">
              The cookie works like a password to your YouTube account: never share it with anyone. SpotiTube keeps it encrypted on this
              computer and only sends it to YouTube.
            </Note>
          </div>
          <Troubleshooting
            items={[
              {
                q: '“YouTube did not accept the cookie”',
                a: 'Make sure you copied the value from a signed-in tab, in one piece, and that it contains SAPISID=. Then try again with a freshly copied cookie.'
              },
              {
                q: 'It worked, but stopped after a while',
                a: 'Signing out of YouTube in that browser (or clearing its cookies) ends the session the cookie belongs to. Copy a new one and connect again; copying it from a browser you stay signed in to keeps it working longest.'
              },
              {
                q: "I can't find the browse request",
                a: 'Keep the Network tab open while you click around YouTube Music (Library, Home); requests only appear while DevTools is open. Clearing the filter box shows every request.'
              }
            ]}
          />
        </>
      )}
    </AccountCard>
  )
}

/** Sync through the connected YouTube Music account: SpotiTube playlists live there too, on every device. */
function YtMusicSyncSettings() {
  const [status, setStatus] = useState<YtSyncStatus | null>(null)

  useEffect(() => {
    void window.electronAPI.ytsync.getStatus().then(setStatus)
    return window.electronAPI.ytsync.onStatusChange(setStatus)
  }, [])

  if (!status) return null
  return (
    <>
      <SettingToggle
        label="Sync playlists with this account"
        description="Your SpotiTube playlists (and Liked songs) are kept as private playlists in this YouTube Music account, so every computer signed in to it, and the YouTube Music app, has them. Changes on any side are merged."
        checked={status.enabled}
        onChange={(v) => void window.electronAPI.ytsync.setEnabled(v).then(setStatus)}
      />
      {status.enabled && (
        <Row
          label={status.error ? 'Sync problem' : status.running ? 'Syncing…' : 'In sync'}
          description={
            status.error ? (
              <span className="text-red-300">{status.error}</span>
            ) : (
              `${status.playlists} ${status.playlists === 1 ? 'playlist' : 'playlists'} · last synced ${ago(status.lastSyncAt)}`
            )
          }
        >
          <Button size="sm" variant="secondary" disabled={status.running} onClick={() => void window.electronAPI.ytsync.syncNow().then(setStatus)}>
            {status.running ? <LoaderCircle size={13} className="animate-spin" /> : <RotateCw size={13} />} Sync now
          </Button>
        </Row>
      )}
    </>
  )
}

/* ── Playback ────────────────────────────────────────────────────────── */

function PlaybackTab() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const setAutoplayEnabled = usePlayerStore((s) => s.setAutoplayEnabled)
  if (!settings) return null

  return (
    <>
      <Card title="What plays">
        <SettingToggle
          label="Autoplay similar songs"
          description="When your queue runs out, keep going with songs like the last one. Your own queue always plays first."
          checked={settings.autoplay}
          onChange={(v) => void setAutoplayEnabled(v)}
        />
        <SettingToggle
          label="Resume where you left off"
          description="When SpotiTube opens, bring back your queue and the song you were on, paused at the same moment."
          checked={settings.restoreSession}
          onChange={(v) => void update({ restoreSession: v })}
        />
      </Card>
      <Card title="Sound">
        <SettingToggle
          label="Smooth fades"
          description="Fade the music in and out briefly when you skip, pause or resume, instead of cutting it off."
          checked={settings.smoothFades}
          onChange={(v) => void update({ smoothFades: v })}
        />
        <SettingToggle
          label="Play a stand-in when a song can't be found"
          description="If no version of a song can be streamed (for example offline), play a short generated preview instead of skipping it."
          checked={settings.syntheticFallback}
          onChange={(v) => void update({ syntheticFallback: v })}
        />
      </Card>
    </>
  )
}

/* ── App & window ────────────────────────────────────────────────────── */

/** Start with Windows / open at login on macOS; Linux desktops handle autostart themselves. */
function AutostartToggle() {
  const platform = useSettingsStore((s) => s.appInfo?.platform)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    void window.electronAPI.app.getAutostart().then(setEnabled)
  }, [])

  if (platform === 'linux' || enabled === null) return null
  return (
    <SettingToggle
      label={platform === 'darwin' ? 'Open at login' : 'Start with Windows'}
      description="Open SpotiTube automatically when you sign in to your computer."
      checked={enabled}
      onChange={(v) => {
        setEnabled(v)
        void window.electronAPI.app.setAutostart(v).then(setEnabled)
      }}
    />
  )
}

function AppTab() {
  const settings = useSettingsStore((s) => s.settings)
  const appInfo = useSettingsStore((s) => s.appInfo)
  const update = useSettingsStore((s) => s.update)
  if (!settings) return null

  return (
    <>
      <Card title="Starting and closing">
        <AutostartToggle />
        <SettingToggle
          label="Keep playing when the window is closed"
          description="Closing the window hides SpotiTube in the system tray and the music goes on. Quit it from the tray icon."
          checked={settings.closeToTray}
          onChange={(v) => void update({ closeToTray: v })}
        />
      </Card>
      <Card title="Letting you know">
        <SettingToggle
          label="Song notifications"
          description="A quiet system notification with the cover when a new song starts while SpotiTube is in the background."
          checked={settings.trackNotifications}
          onChange={(v) => void update({ trackNotifications: v })}
        />
        <SettingToggle
          label="Show what you're playing on Discord"
          description={
            appInfo?.discordAvailable
              ? 'Your Discord profile shows the song while it plays. Discord has to be running on this computer.'
              : 'Not available in this build yet.'
          }
          checked={settings.discordPresence && !!appInfo?.discordAvailable}
          disabled={!appInfo?.discordAvailable}
          onChange={(v) => void update({ discordPresence: v })}
        />
      </Card>
      <Card title="Library">
        <SettingToggle
          label="Show sample playlists"
          description="Until an account is connected, show a few example Spotify and YouTube Music playlists to try things out."
          checked={settings.showDemoContent}
          onChange={(v) => void update({ showDemoContent: v })}
        />
      </Card>
    </>
  )
}

/* ── Storage & privacy ───────────────────────────────────────────────── */

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

function StorageTab() {
  const playCount = useHistoryStore((s) => s.plays.length)
  const clearHistory = useHistoryStore((s) => s.clear)
  const [storage, setStorage] = useState<StorageUsage | null>(null)
  const [clearingCache, setClearingCache] = useState(false)

  useEffect(() => {
    void window.electronAPI.storage.getUsage().then(setStorage)
  }, [])

  return (
    <>
      <Card title="On this computer">
        <Row
          label="Listening history"
          description={
            <>
              {playCount ? `${playCount.toLocaleString()} plays saved.` : 'Nothing saved yet.'}
              {storage &&
                ` SpotiTube keeps the last ${storage.maxPlays.toLocaleString()} plays from up to ${Math.round(storage.maxPlayAgeDays / 30)} months; older ones are removed on their own.`}
            </>
          }
        >
          <Button size="sm" variant="secondary" disabled={!playCount} onClick={() => void clearHistory()}>
            Clear
          </Button>
        </Row>
        <Row
          label="Cache"
          description={
            storage
              ? `Player files and covers: ${formatBytes(storage.cacheBytes)} of at most ${formatBytes(storage.cacheLimitBytes)}. Clearing it is safe; it fills up again as you listen.`
              : 'Checking…'
          }
        >
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
        </Row>
      </Card>
      <Note>
        SpotiTube has no account or server of its own. Your history, playlists and settings stay on this computer; sign-ins and cookies are
        encrypted with your computer's keychain and only sent to Spotify and YouTube.
      </Note>
    </>
  )
}

/* ── Updates ─────────────────────────────────────────────────────────── */

function UpdatesTab() {
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
    'not-available': 'You have the latest version',
    downloading: `Downloading ${update.version}… ${Math.round(update.progress?.percent ?? 0)}%`,
    downloaded: `Version ${update.version} is ready to install`,
    error: update.error ?? 'Update check failed',
    unsupported: 'Updates are only available in installed builds'
  }

  return (
    <>
      <Card>
        <Row
          label={
            <>
              SpotiTube <span className="tabular-nums">v{update.currentVersion}</span>
            </>
          }
          description={
            <>
              <span className={update.status === 'error' ? 'text-red-300' : undefined}>{statusText[update.status]}</span>
              {update.status === 'downloading' && (
                <span className="mt-2 block h-1 w-48 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full bg-spotify transition-[width]" style={{ width: `${Math.round(update.progress?.percent ?? 0)}%` }} />
                </span>
              )}
            </>
          }
        >
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
        </Row>
        {update.releaseNotes && (update.status === 'available' || update.status === 'downloading' || update.status === 'downloaded') && (
          <div className="max-h-40 overflow-y-auto px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-line text-zinc-400">{update.releaseNotes}</div>
        )}
        {update.status === 'error' && (
          <div className="px-4 py-3">
            <ExternalButton href={update.releasesUrl}>Download the latest version manually</ExternalButton>
          </div>
        )}
      </Card>
      <Card>
        <SettingToggle
          label="Automatic updates"
          description="Check for new versions in the background and download them; they install the next time SpotiTube restarts."
          checked={settings.autoUpdate}
          onChange={(v) => void updateSettings({ autoUpdate: v })}
        />
      </Card>
    </>
  )
}

/* ── Advanced ────────────────────────────────────────────────────────── */

function AdvancedTab() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [ytDlpPath, setYtDlpPath] = useState(settings?.ytDlpPath ?? '')

  useEffect(() => setYtDlpPath(settings?.ytDlpPath ?? ''), [settings?.ytDlpPath])

  if (!settings) return null
  const save = (): void => {
    if (ytDlpPath.trim() !== settings.ytDlpPath) void update({ ytDlpPath })
  }

  return (
    <Card title="Playback fallback">
      <div className="space-y-2.5 px-4 py-3.5">
        <RowText
          label="yt-dlp (optional)"
          description="If YouTube refuses every other way to stream a song, SpotiTube can ask the yt-dlp tool instead. Leave this empty to use yt-dlp from your PATH, or give the full path to the program."
        />
        <input
          value={ytDlpPath}
          onChange={(e) => setYtDlpPath(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          spellCheck={false}
          aria-label="yt-dlp path"
          placeholder="C:\Tools\yt-dlp.exe"
          className={cx(inputClass, 'font-mono')}
        />
      </div>
    </Card>
  )
}
