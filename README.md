<p align="center">
  <img src="build/icon.png" width="96" alt="SpotiTube icon" />
</p>

<h1 align="center">SpotiTube</h1>

<p align="center">
  One desktop player for <b>Spotify</b> and <b>YouTube Music</b> — with a queue you control.<br/>
  Electron · React 19 · TypeScript
</p>

![Unified library with the queue open](docs/screenshots/library.png)

## Features

- **Unified library** — Spotify and YouTube Music playlists in one view, every card, sidebar item and track row
  colour-badged by source (Spotify green, YT Music red, Hybrid gradient). Filter tabs: **All**, **Spotify only**,
  **YT Music only** and **Split view** (both catalogs in parallel columns).
- **Likes** — the heart in the player bar, Now playing and the mini player saves songs to a **Liked songs** playlist
  (it syncs like any hybrid playlist) and, when the account is connected, to Spotify's Liked Songs or your YouTube
  Music likes. Spotify accounts connected before 0.4 need to reconnect once to allow it.
- **Hybrid playlists** — mix tracks from both services into local SpotiTube playlists.
- **Side-by-side search** across both catalogs. Playing a result starts a radio: that song, then music like it.
- **Sync through your YouTube Music account** — with YouTube Music connected, turn on *Sync playlists with this
  account* in Settings: your SpotiTube playlists (and Liked songs) are kept as private playlists in that account, so
  every computer signed in to it, and the YouTube Music apps, have them. Additions, removals, renames and deletions on
  either side are merged; Spotify tracks travel as the YouTube upload SpotiTube plays for them.
- **Plays everything through YouTube Music** — Spotify tracks are matched to the best YouTube Music upload
  automatically; **Change version** (in the queue) swaps to a live, remix, slowed or other version and pins it.
  If YouTube won't play an upload here (Premium-only, region-locked, removed), SpotiTube switches to another upload
  of the same song on its own and remembers to skip that one next time. See [How playback works](#how-playback-works).
- **Queue** — see what's playing and what's next; **Play next** / **Add to queue** on any track (right-click or ⋯),
  drag & drop or `Alt+↑/↓` to reorder, remove, clear, or jump to any entry. Queued tracks play before the rest of the
  playlist, and shuffle leaves them in place.
- **Albums & artists** — click an album or artist name in any song list, the player bar or Now playing: album
  pages list every track (play, shuffle, queue or save as a playlist); artist pages show top songs, albums, singles
  and artists like them, with Play and Radio. They come from YouTube Music for every source, no sign-in needed.
- **Discover** — not sure what to play? **Surprise me** picks a random playlist from any of YouTube Music's moods
  (Chill, Party, Workout…) or genres (Hip-hop, Rock, Jazz…) and plays it shuffled; or pick a mood or genre and choose
  one of its playlists. Like one? Save it to your library. Leans local (e.g. Polish rap in Poland).
- **Now playing & synced lyrics** — click the cover in the player bar (or `Ctrl/Cmd + L`) for a full-screen view
  over a backdrop made from the album art, with time-synced lyrics from [LRCLIB](https://lrclib.net) that follow the
  song. Click a line to jump there; nudge the sync if a version's timing differs.
- **Song notifications** — optionally, a quiet system notification with the cover when a new song starts while
  SpotiTube is in the background (Settings).
- **Discord status** — optionally show *Listening to SpotiTube* with the song, artist, cover, a progress bar and an
  *Open on Spotify / YouTube Music* button on your Discord profile (Settings; Discord must be running).
- **Mini player** — shrink the window into a small always-on-top player (`Ctrl/Cmd + Shift + M` or the
  picture-in-picture button): compact (square video and the essentials) or larger with every control. YouTube's
  player stands in for the cover. It remembers where you put it and which size you like.
- **Autoplay & radio** — when the queue runs out, SpotiTube keeps going with similar tracks (shown as *Autoplay* at the
  end of the queue, so anything you queue still plays first; switch it off in the queue or in Settings).
  **Start radio** on any track builds an endless mix around it.
- **Find & sort in playlists** — filter a playlist by title, artist or album (`Ctrl/Cmd + F`) and sort it by title,
  artist, album or length; the sort is remembered per playlist.
- **Smooth fades** — skipping, pausing and resuming fade the music briefly instead of cutting it off (Settings).
- **Sleep timer** — the moon button in the player bar stops playback after 15–90 minutes or at the end of the track.
- **Recently played** — every track you listen to for 30 s or more (or half of a shorter one), grouped by day, with
  **Jump back in** cards for the playlists you played from. Clear it any time in Settings.
- **Resume where you left off** — the queue, shuffle/repeat and the playing track come back on launch, paused at the
  same spot. Drag the seek bar before pressing play to start somewhere else. Can be turned off in Settings. The window
  size and position and the last open view are restored too.
- **Start with Windows** (or at login on macOS), from Settings.
- **Desktop integration** — frameless window with native controls (Windows) or inset traffic lights (macOS);
  previous / play-pause / next buttons on the **taskbar thumbnail** (Windows) or in the **Dock menu** (macOS); the
  current song in the window title; media keys, OS media overlay (MediaSession), tray controls, optional close-to-tray.
- **Works out of the box** — sample Spotify and YouTube Music playlists stream real recordings before you connect any
  account; a built-in synthesizer covers the case where no stream can be resolved (e.g. offline).

| Split view | Queue |
| --- | --- |
| ![Split view](docs/screenshots/split-view.png) | ![Queue](docs/screenshots/queue.png) |

## Getting started

**Requirements:** Node.js 22.12+ (24 LTS recommended) and npm. Windows 10/11, macOS 12+ or a 64-bit Linux desktop for running the app.

```bash
git clone https://github.com/Roguu2/SpotiTube.git
cd SpotiTube
npm install
npm run dev
```

> **npm 12+:** install scripts are blocked unless allow-listed. `package.json` already allows `electron` (which
> downloads its binary on install) and `electron-winstaller`. If you upgrade Electron and `npm run dev` reports a
> missing binary, run `npm install-scripts approve electron`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload (renderer) and auto-restart (main/preload) |
| `npm run build` | Type-check main, preload and renderer, then bundle to `out/` |
| `npm start` | Run the production bundle from `out/` |
| `npm run build:win` | Build and package a Windows NSIS installer into `release/<version>/` |
| `npm run build:mac` | Build and package a universal macOS `.dmg` (must run on macOS) |
| `npm run build:linux` | Build a Linux `.AppImage` and `.deb` (run on Linux) |
| `npm run build:unpack` | Build and package without an installer (quick local check) |
| `npm run icon` | Regenerate `build/icon.png` from `scripts/generate-icon.mjs` |

## Connecting your accounts

Open **Settings** (gear icon in the sidebar, or `Ctrl/Cmd + ,`).

### Spotify

SpotiTube uses the Authorization Code flow with **PKCE**, so you only need a client ID — no secret.

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create an app.
2. Select **Web API** as the API used.
3. Add the redirect URI `http://127.0.0.1:43821/callback` (also shown, with a copy button, in Settings).
4. Copy the app's **Client ID** into SpotiTube and press **Connect Spotify**. Your browser opens for consent.

Apps in Spotify's *development mode* only work for users added under **User Management** in the dashboard — add
the Spotify account you sign in with.

Spotify provides the catalog, playlists and metadata. Audio always comes from YouTube Music, because Spotify does
not offer full-track streams to third-party apps.

### YouTube Music

Search, public playlists and streaming work without signing in. To load **your** library and Liked Music:

1. Open [music.youtube.com](https://music.youtube.com) in your browser, signed in.
2. Press `F12` → **Network**, reload, and click any request named `browse`.
3. Under **Request Headers**, copy the whole value of `cookie`.
4. Paste it into Settings → YouTube Music and press **Connect**.

The cookie must contain `SAPISID` / `__Secure-3PAPISID`. If YouTube signs you out of that browser session, reconnect
with a fresh cookie.

## How playback works

Spotify does not offer full-track audio to third-party apps, so every track is played from YouTube Music. SpotiTube
picks one of two modes per track, automatically:

| Mode | When | What you get |
| --- | --- | --- |
| **Direct stream** | YouTube serves the complete audio stream | Played locally through the Web Audio engine (no visible player) |
| **YouTube player** | YouTube serves only part of the stream | Complete playback through YouTube's official embedded player, shown in a mini-player you can make compact, move to any corner or dock in the sidebar |

YouTube currently serves only the first ~1 MB (about a minute) of a direct stream to apps without a proof-of-origin
token. SpotiTube does not try to generate such tokens or otherwise get around YouTube's protections. It checks once
whether complete streams are available and otherwise uses the official player, so tracks always play to the end
instead of going silent. If a direct stream is cut off mid-song, playback continues in the official player at the
same position.

### Optional: yt-dlp

When the built-in extraction via [YouTube.js](https://github.com/LuanRT/YouTube.js) fails outright, SpotiTube can use
[yt-dlp](https://github.com/yt-dlp/yt-dlp) if it is installed on your `PATH` or configured in Settings.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Seek −5 s / +5 s |
| `Ctrl/Cmd + ←` / `→` | Previous / next track |
| `↑` / `↓` | Volume up / down |
| `M` | Mute |
| `Ctrl/Cmd + F` | Find in the open playlist, otherwise Search |
| `Ctrl/Cmd + E` | Toggle the queue |
| `Ctrl/Cmd + L` | Now playing & lyrics (`Esc` closes) |
| `Ctrl/Cmd + Shift + M` | Mini player on / off |
| `Ctrl/Cmd + ,` | Settings |


## Releases and CI

Two GitHub Actions workflows build on `windows-latest`, `macos-15-intel` and `ubuntu-latest`:

- **`build.yml`** — on every push to `main` and on pull requests: type-check, bundle, package, and upload the
  `.exe`, `.dmg`, `.AppImage` and `.deb` as workflow artifacts (kept 14 days).
- **`release.yml`** — on a `v*` tag: builds every installer and publishes them to the public
  [SpotiTube-releases](https://github.com/Roguu2/SpotiTube-releases/releases) repository. The source repo stays
  private; the public repo only holds installers and the update feed.

The release goes live automatically, but only after every platform build succeeds and every file is uploaded;
otherwise it stays a draft. Release notes are generated from the commits since the previous tag.

**One-time setup:** create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
with access to **only** `Roguu2/SpotiTube-releases` and the permission **Contents: Read and write**. Then store it in
this repo as the `RELEASES_TOKEN` secret:

```bash
gh secret set RELEASES_TOKEN --repo Roguu2/SpotiTube
```

To cut a release:

```bash
npm version patch
```

```bash
git push --follow-tags
```

Installed apps pick it up within hours, or immediately via **Settings → Updates → Check for updates**.

### In-app updates

Installed builds update themselves from GitHub Releases (`electron-updater`):

- **Checks:** SpotiTube checks 15 s after launch and every 4 hours. You can also check any time in
  **Settings → Updates**.
- **Download:** with **Automatic updates** on (the default), a new version downloads in the background. When it's
  ready, a **Restart to update** card appears in the sidebar. Restarting installs silently and relaunches the app;
  otherwise the update installs the next time SpotiTube quits.
- **Feed:** updates come from the published releases in the public `SpotiTube-releases` repo, through the
  `latest.yml` / `latest-mac.yml` files the release workflow uploads. Drafts are ignored.
- **macOS:** automatic installation only works for code-signed builds. Unsigned macOS builds report the update and
  link to the download page instead.

Installers are **not code-signed**. Windows SmartScreen will warn on first run (**More info → Run anyway**). On
macOS, right-click the app and choose **Open** the first time, or run `xattr -cr /Applications/SpotiTube.app`. To
sign, add `CSC_LINK` / `CSC_KEY_PASSWORD` (and Apple notarization credentials) as repository secrets and remove
`CSC_IDENTITY_AUTO_DISCOVERY: false` from the workflows.

## Architecture

```
┌──────────────────────────── Main process (Node) ─────────────────────────────┐
│  ProviderRegistry ── SpotifyProvider ── SpotifyAuth (PKCE, loopback :43821)  │
│        │          ├─ YouTubeMusicProvider ── YouTubeClient (youtubei.js)     │
│        │          ├─ HybridProvider (local playlists)                        │
│        │          └─ DemoProvider (sample library)                           │
│        ├─ TrackMatcher ─ scores YT Music candidates for non-YT tracks        │
│        ├─ StreamResolver ─ YTMUSIC → IOS → MWEB clients → yt-dlp, cached     │
│        └─ StreamProxy ─ 127.0.0.1:<random>, CORS + byte ranges, auto-refresh │
│  electron-store (settings, secrets, hybrid playlists, history, DSP profiles) │
│  Tray · media keys · window controls                                         │
└───────────────▲──────────────────────────────────────────────────────────────┘
                │ typed IPC (contextBridge → window.electronAPI)
┌───────────────┴──────────── Renderer (React) ────────────────────────────────┐
│  Zustand: useLibraryStore · usePlayerStore · useAudioEngineStore ·           │
│           useSettingsStore · useHistoryStore                                 │
│  AudioEngine (Web Audio graph, below)                                        │
└──────────────────────────────────────────────────────────────────────────────┘

<audio> → preamp → 10-band EQ → pitch worklet ─┬─ dry ──────────────┬→ limiter → volume → analyser → out
                                               └─ convolver → wet ──┘
```

```
electron/
  main/            app lifecycle, window, tray, IPC handlers
    providers/     spotify/, ytmusic/, hybrid/, demo/ — IMusicProvider implementations
    services/      stream resolver, track matcher, stream proxy, stores, synth
  preload/         contextBridge API (sandboxed, CommonJS)
src/
  core/            shared types, IPC contract, DSP model — no Node or DOM APIs
  audio/           AudioEngine, reverb impulse generator, pitch-shifter worklet
  store/           Zustand stores
  components/      layout, library, player, studio, settings, ui primitives
  providers/       renderer-side source metadata (labels, colours)
```

### Adding a music source

Every source implements `IMusicProvider` from [`src/core/types.ts`](src/core/types.ts):

```ts
interface IMusicProvider {
  getPlaylists(): Promise<UnifiedPlaylist[]>
  getPlaylistTracks(playlistId: string): Promise<UnifiedTrack[]>
  searchTracks(query: string): Promise<UnifiedTrack[]>
  resolveStreamUrl(track: UnifiedTrack): Promise<string>
}
```

To add one (SoundCloud, local FLAC/MP3, …):

1. Add its id to `ProviderId` / `SourceId`.
2. Implement the interface under `electron/main/providers/<name>/`.
3. Register it in `ProviderRegistry`.
4. Add badge colours in [`src/providers/sources.ts`](src/providers/sources.ts).

`resolveStreamUrl` may return any `https:` URL; the stream proxy handles range requests, CORS and URL expiry.

### Security

- **Renderer isolation:** the renderer runs sandboxed with context isolation and no Node integration.
- **IPC:** every handler validates its input and rejects senders other than the app's own pages.
- **Secrets:** the Spotify refresh token and the YouTube cookie are encrypted with the OS keychain (DPAPI, Keychain or
  libsecret) through Electron `safeStorage`.
- **YouTube player code:** the signature deciphering code runs in an isolated `vm` context with a timeout.
- **Stream proxy:** it binds to `127.0.0.1`, serves only randomly-named streams it has registered, and rejects
  requests with a foreign `Host` header.

## Data locations

Everything is stored locally in the app's user-data directory:

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\SpotiTube\` |
| macOS | `~/Library/Application Support/SpotiTube/` |

`spotitube.json` holds settings, encrypted secrets, hybrid playlists and pinned stream sources. `history.json` holds
the last 500 plays, `session.json` the saved queue and `window-state.json` the window size and position. `dsp-profiles.json` holds per-track audio settings and custom EQ presets. Deleting the folder resets the app.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| *“INVALID_CLIENT: Invalid redirect URI”* | The dashboard redirect URI must be exactly `http://127.0.0.1:43821/callback`. |
| *“Port 43821 is in use”* | Another app holds the OAuth callback port; close it and retry. |
| Spotify connects but shows no playlists | Add your account under **User Management** in the Spotify dashboard (development mode). |
| A track plays the *synth preview* | No matching upload was found. Open the queue and use **Change version** under the playing track. |
| “Uploader does not allow this video in other apps” | SpotiTube tries other uploads automatically; you can also pick one with **Change version** in the queue. |
| Wrong version auto-matched | Use **Change version** in the queue; your choice is pinned for that track from then on. |

## Disclaimer

SpotiTube is an independent, unofficial project for personal use. It is not affiliated with, endorsed by or
sponsored by Spotify or YouTube/Google. It streams audio through unofficial YouTube interfaces, which may conflict
with YouTube's Terms of Service and can break whenever YouTube changes them. Use it at your own discretion.
