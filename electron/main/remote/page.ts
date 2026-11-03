/**
 * The phone remote's web page, served by {@link RemoteServer}. Plain HTML, CSS
 * and JavaScript with no dependencies, so it loads instantly on any phone
 * browser. Data from the player is only ever put into the page as text.
 */

const LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1DB954"/><stop offset="100%" stop-color="#FF0000"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#g)"/><path d="M9.5 7.5v9l7-4.5z" fill="#09090b"/></svg>`

export const REMOTE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1DB954"/><stop offset="100%" stop-color="#FF0000"/></linearGradient></defs><rect width="96" height="96" rx="22" fill="#09090b"/><circle cx="48" cy="48" r="32" fill="url(#g)"/><path d="M40 33v30l24-15z" fill="#09090b"/></svg>`

export const REMOTE_MANIFEST = JSON.stringify({
  name: 'SpotiTube Remote',
  short_name: 'SpotiTube',
  start_url: '/',
  display: 'standalone',
  background_color: '#09090b',
  theme_color: '#09090b',
  icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
})

export const REMOTE_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#09090b">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>SpotiTube Remote</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon.svg">
<style>
:root { color-scheme: dark; --fg: #fafafa; --muted: rgba(255,255,255,.6); --faint: rgba(255,255,255,.38); --line: rgba(255,255,255,.1); --spotify: #1db954; --yt: #ff3b3b; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html { background: #09090b; }
/* No body background: it would paint over the blurred cover behind everything. */
html, body { margin: 0; min-height: 100%; color: var(--fg); font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
body { overflow-x: hidden; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
svg { width: 100%; height: 100%; display: block; }
[hidden] { display: none !important; }

#bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; background: #09090b; }
#bg img { position: absolute; left: 50%; top: 40%; width: 180%; height: 180%; object-fit: cover; transform: translate(-50%, -50%); filter: blur(70px) saturate(1.7); opacity: 0; transition: opacity 1s ease; }
#bg img.on { opacity: .55; }
#bg::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.55) 55%, #09090b 100%); }

main { max-width: 520px; margin: 0 auto; padding: max(14px, env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom)); }
.top { display: flex; align-items: center; justify-content: space-between; height: 36px; }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; letter-spacing: -.01em; }
.brand svg { width: 20px; height: 20px; }
.conn { font-size: 12px; color: var(--faint); display: flex; align-items: center; gap: 6px; }
.conn::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; }
.conn.live::before { background: var(--spotify); box-shadow: 0 0 8px var(--spotify); }

.art-wrap { position: relative; margin: 18px auto 0; width: min(78vw, 340px); aspect-ratio: 1; border-radius: 18px; overflow: hidden; background: rgba(255,255,255,.06); box-shadow: 0 24px 60px rgba(0,0,0,.55); }
.art-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
.art-empty { position: absolute; inset: 0; display: grid; place-items: center; font-size: 64px; color: var(--faint); }

.meta { margin-top: 22px; min-width: 0; }
.title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.title { font-size: 22px; font-weight: 800; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { flex: none; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 999px; letter-spacing: .04em; }
.badge.spotify { color: var(--spotify); background: rgba(29,185,84,.15); }
.badge.ytmusic { color: var(--yt); background: rgba(255,59,59,.15); }
.artist { color: var(--muted); font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.context { color: var(--faint); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 28px; background: transparent; margin: 0; --fill: 0%; }
input[type=range]::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(90deg, #fff var(--fill), rgba(255,255,255,.18) var(--fill)); }
input[type=range]::-moz-range-track { height: 4px; border-radius: 4px; background: rgba(255,255,255,.18); }
input[type=range]::-moz-range-progress { height: 4px; border-radius: 4px; background: #fff; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,.4); }
input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: #fff; }
.progress { margin-top: 14px; }
.times { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--faint); font-variant-numeric: tabular-nums; margin-top: -4px; }

.controls { display: flex; align-items: center; justify-content: space-between; margin: 10px 4px 0; }
.btn { width: 44px; height: 44px; padding: 11px; border-radius: 50%; color: var(--muted); transition: transform .12s ease, color .2s; }
.btn:active { transform: scale(.9); }
.btn.on { color: var(--spotify); }
.btn.big { width: 76px; height: 76px; padding: 24px; background: #fff; color: #09090b; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.btn.mid { width: 56px; height: 56px; padding: 13px; color: var(--fg); }
.repeat-one { position: relative; }
.repeat-one::after { content: "1"; position: absolute; top: 6px; right: 6px; font-size: 9px; font-weight: 800; }

.volume { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.volume .btn { width: 36px; height: 36px; padding: 8px; flex: none; }

.tabs { display: flex; gap: 6px; margin-top: 26px; padding: 4px; background: rgba(255,255,255,.06); border-radius: 999px; }
.tabs button { flex: 1; height: 36px; border-radius: 999px; font-size: 13.5px; font-weight: 600; color: var(--muted); }
.tabs button.active { background: rgba(255,255,255,.14); color: var(--fg); }
.panel { margin-top: 14px; }
.list { list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border-radius: 12px; text-align: left; }
.item:active { background: rgba(255,255,255,.07); }
.item img, .item .ph { width: 46px; height: 46px; border-radius: 8px; object-fit: cover; flex: none; background: rgba(255,255,255,.07); }
.item .txt { min-width: 0; flex: 1; }
.item .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item .s { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; gap: 6px; align-items: center; }
.tag { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; color: #7dd3fc; background: rgba(125,211,252,.12); flex: none; }
.tag.queued { color: var(--spotify); background: rgba(29,185,84,.14); }
.empty { color: var(--faint); font-size: 13.5px; text-align: center; padding: 18px 0; margin: 0; }
.more { color: var(--faint); font-size: 12.5px; text-align: center; padding: 10px 0 0; }
#q { width: 100%; height: 44px; border-radius: 999px; border: 1px solid var(--line); background: rgba(255,255,255,.07); color: var(--fg); padding: 0 18px; font: inherit; outline: none; }
#q:focus { border-color: rgba(255,255,255,.3); }
#results { margin-top: 10px; }

.gate { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px; gap: 10px; }
.gate svg { width: 64px; height: 64px; }
.gate h1 { font-size: 22px; margin: 10px 0 0; letter-spacing: -.02em; }
.gate p { color: var(--muted); max-width: 320px; margin: 0; }

.sheet { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: flex-end; z-index: 10; }
.sheet-card { width: 100%; max-width: 520px; margin: 0 auto; background: #18181d; border-radius: 22px 22px 0 0; padding: 18px 16px calc(16px + env(safe-area-inset-bottom)); animation: up .22s ease; }
@keyframes up { from { transform: translateY(40px); opacity: 0; } }
.sheet-head { display: flex; gap: 12px; align-items: center; padding: 0 6px 12px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.sheet-head img { width: 52px; height: 52px; border-radius: 8px; object-fit: cover; background: rgba(255,255,255,.07); }
.sheet-head .txt { min-width: 0; }
.sheet-card > button { display: block; width: 100%; text-align: left; padding: 14px 10px; border-radius: 12px; font-weight: 600; }
.sheet-card > button:active { background: rgba(255,255,255,.07); }
.sheet-card > button.cancel { color: var(--muted); text-align: center; margin-top: 4px; }

.toast { position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translate(-50%, 20px); background: rgba(250,250,250,.95); color: #09090b; font-size: 13.5px; font-weight: 600; padding: 10px 16px; border-radius: 999px; opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; max-width: calc(100% - 40px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; z-index: 20; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
</style>
</head>
<body>
<div id="bg"><img id="bg-img" alt=""></div>

<main id="app" hidden>
  <header class="top">
    <div class="brand">${LOGO}SpotiTube</div>
    <span id="conn" class="conn">Connecting…</span>
  </header>

  <section aria-label="Now playing">
    <div class="art-wrap"><img id="art" alt="" hidden><div id="art-empty" class="art-empty">♪</div></div>
    <div class="meta">
      <div class="title-row"><div class="title" id="title">Nothing playing</div><span id="badge" class="badge" hidden></span></div>
      <div class="artist" id="artist">Pick something on your computer or search below.</div>
      <div class="context" id="context"></div>
    </div>
    <div class="progress">
      <input type="range" id="seek" min="0" max="0" step="1" value="0" aria-label="Seek">
      <div class="times"><span id="elapsed">0:00</span><span id="total">0:00</span></div>
    </div>
    <div class="controls">
      <button class="btn" id="shuffle" aria-label="Shuffle"></button>
      <button class="btn mid" id="prev" aria-label="Previous"></button>
      <button class="btn big" id="toggle" aria-label="Play"></button>
      <button class="btn mid" id="next" aria-label="Next"></button>
      <button class="btn" id="repeat" aria-label="Repeat"></button>
    </div>
    <div class="volume">
      <button class="btn" id="mute" aria-label="Mute"></button>
      <input type="range" id="volume" min="0" max="100" step="1" value="80" aria-label="Volume">
    </div>
  </section>

  <nav class="tabs" role="tablist">
    <button role="tab" data-tab="queue" class="active">Up next</button>
    <button role="tab" data-tab="search">Search</button>
  </nav>
  <section id="tab-queue" class="panel">
    <ul id="queue" class="list"></ul>
    <p id="queue-empty" class="empty">Nothing queued.</p>
    <p id="queue-more" class="more" hidden></p>
  </section>
  <section id="tab-search" class="panel" hidden>
    <input id="q" type="search" placeholder="Songs, artists, albums" autocomplete="off" autocapitalize="off" enterkeyhint="search" aria-label="Search">
    <ul id="results" class="list"></ul>
    <p id="search-hint" class="empty">Search Spotify and YouTube Music.</p>
  </section>
</main>

<div id="gate" class="gate" hidden>
  ${LOGO}
  <h1 id="gate-title">Pair this phone</h1>
  <p id="gate-text">On your computer, open SpotiTube → Settings → Phone remote and scan the QR code with this phone's camera.</p>
</div>

<div id="sheet" class="sheet" hidden>
  <div class="sheet-card" role="dialog" aria-modal="true">
    <div class="sheet-head"><img id="sheet-art" alt=""><div class="txt"><div class="t" id="sheet-title"></div><div class="s" id="sheet-artist"></div></div></div>
    <button data-act="play-now">Play now</button>
    <button data-act="play-next">Play next</button>
    <button data-act="add-to-queue">Add to queue</button>
    <button data-act="radio">Start radio</button>
    <button class="cancel" data-act="cancel">Cancel</button>
  </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<script src="/app.js"></script>
</body>
</html>`

export const REMOTE_APP_JS = String.raw`(() => {
  'use strict'
  const TOKEN_KEY = 'spotitube.remote.token'
  const $ = (id) => document.getElementById(id)
  const ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 5v14L8 12z"/><rect x="5" y="5" width="2.4" height="14" rx="1"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5v14l10-7z"/><rect x="16.6" y="5" width="2.4" height="14" rx="1"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.4 18.4a9 9 0 0 0 0-12.8"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>'
  }

  let token = null
  if (location.hash.length > 1) {
    token = decodeURIComponent(location.hash.slice(1))
    try { localStorage.setItem(TOKEN_KEY, token) } catch (e) {}
    // Keep the secret out of the address bar, bookmarks and screenshots.
    history.replaceState(null, '', location.pathname)
  } else {
    try { token = localStorage.getItem(TOKEN_KEY) } catch (e) {}
  }

  let state = null
  let receivedAt = 0
  let seeking = false
  let volumeHeldUntil = 0
  let events = null
  let checkingAuth = false

  const el = (tag, cls, text) => {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text !== undefined) node.textContent = text
    return node
  }
  const safeImage = (img, url) => {
    // Covers are web images or inline data images (the sample playlists'); nothing else is loaded.
    if (url && /^(https:\/\/|data:image\/)/.test(url)) { img.src = url; img.hidden = false; return true }
    img.removeAttribute('src')
    img.hidden = true
    return false
  }
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0))
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  }
  const setFill = (input) => {
    const max = Number(input.max) || 0
    input.style.setProperty('--fill', (max ? (Number(input.value) / max) * 100 : 0) + '%')
  }

  let toastTimer = 0
  const toast = (text) => {
    const t = $('toast')
    t.textContent = text
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
  }

  const gate = (title, text) => {
    $('app').hidden = true
    $('gate').hidden = false
    $('gate-title').textContent = title
    $('gate-text').textContent = text
  }

  const api = (path, options) => fetch(path, Object.assign({}, options, {
    headers: Object.assign({ Authorization: 'Bearer ' + token }, (options && options.headers) || {})
  }))

  const unpaired = () => {
    if (events) events.close()
    events = null
    try { localStorage.removeItem(TOKEN_KEY) } catch (e) {}
    gate('This phone is no longer paired', "SpotiTube's pairing was reset. Scan the QR code in Settings → Phone remote again.")
  }

  const command = (type, extra) => api('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ type: type }, extra || {}))
  }).then((res) => {
    if (res.status === 401) unpaired()
    else if (!res.ok) toast("Couldn't reach SpotiTube")
  }).catch(() => toast("Couldn't reach SpotiTube"))

  // ── Rendering ────────────────────────────────────────────────────────────
  const position = () => {
    if (!state) return 0
    const elapsed = state.isPlaying ? (performance.now() - receivedAt) / 1000 : 0
    return Math.min(state.duration || Infinity, state.position + elapsed)
  }

  const trackRow = (track, tag, onTap) => {
    const li = el('li')
    const button = el('button', 'item')
    const img = el('img')
    img.alt = ''
    img.loading = 'lazy'
    if (!safeImage(img, track.artworkUrl)) button.appendChild(el('div', 'ph'))
    else button.appendChild(img)
    const txt = el('div', 'txt')
    txt.appendChild(el('div', 't', track.title))
    const sub = el('div', 's')
    if (tag) sub.appendChild(el('span', 'tag ' + tag.cls, tag.text))
    sub.appendChild(el('span', '', (track.source === 'spotify' ? 'Spotify · ' : track.source === 'ytmusic' ? 'YT Music · ' : '') + track.artists))
    txt.appendChild(sub)
    button.appendChild(txt)
    button.addEventListener('click', onTap)
    li.appendChild(button)
    return li
  }

  let lastArt = null
  let lastQueueKey = ''
  const render = () => {
    const s = state
    const track = s && s.track
    $('title').textContent = track ? track.title : 'Nothing playing'
    $('artist').textContent = track ? track.artists : 'Pick something on your computer or search below.'
    $('context').textContent = s && s.context ? 'Playing from ' + s.context : ''
    const badge = $('badge')
    badge.hidden = !track || (track.source !== 'spotify' && track.source !== 'ytmusic')
    if (track) { badge.className = 'badge ' + track.source; badge.textContent = track.source === 'spotify' ? 'SP' : 'YT' }

    const art = track ? track.artworkUrl : null
    if (art !== lastArt) {
      lastArt = art
      const shown = safeImage($('art'), art)
      $('art-empty').hidden = shown
      const bg = $('bg-img')
      bg.classList.remove('on')
      // Set before the source: inline images can finish loading straight away.
      bg.onload = () => bg.classList.add('on')
      safeImage(bg, art)
    }

    $('toggle').innerHTML = s && s.isPlaying ? ICONS.pause : ICONS.play
    $('toggle').setAttribute('aria-label', s && s.isPlaying ? 'Pause' : 'Play')
    $('shuffle').classList.toggle('on', !!(s && s.shuffle))
    const repeat = $('repeat')
    repeat.classList.toggle('on', !!(s && s.repeat !== 'off'))
    repeat.classList.toggle('repeat-one', !!(s && s.repeat === 'one'))
    $('mute').innerHTML = s && (s.muted || s.volume === 0) ? ICONS.muted : ICONS.volume
    if (s && performance.now() > volumeHeldUntil) {
      $('volume').value = String(Math.round((s.muted ? 0 : s.volume) * 100))
      setFill($('volume'))
    }

    const queueKey = s ? JSON.stringify([s.queue.map((q) => [q.position, q.track.id, q.kind]), s.queueTotal]) : ''
    if (queueKey !== lastQueueKey) {
      lastQueueKey = queueKey
      const list = $('queue')
      list.replaceChildren()
      const items = s ? s.queue : []
      for (const item of items) {
        const tag = item.kind === 'queued' ? { cls: 'queued', text: 'Queued' } : item.kind === 'autoplay' ? { cls: '', text: 'Autoplay' } : null
        list.appendChild(trackRow(item.track, tag, () => { command('jump', { position: item.position }); toast('Playing “' + item.track.title + '”') }))
      }
      $('queue-empty').hidden = items.length > 0
      const more = s ? s.queueTotal - items.length : 0
      $('queue-more').hidden = more <= 0
      $('queue-more').textContent = '+ ' + more + ' more'
    }
    tick()
  }

  const tick = () => {
    if (!seeking) {
      const seek = $('seek')
      const duration = state ? Math.floor(state.duration || 0) : 0
      seek.max = String(duration)
      seek.value = String(Math.floor(position()))
      seek.disabled = !state || !state.track
      $('elapsed').textContent = fmt(position())
      $('total').textContent = fmt(duration)
      setFill(seek)
    }
  }
  const loop = () => { tick(); requestAnimationFrame(loop) }

  // ── Wiring ───────────────────────────────────────────────────────────────
  const connect = () => {
    events = new EventSource('/api/events?token=' + encodeURIComponent(token))
    events.addEventListener('state', (e) => {
      state = JSON.parse(e.data)
      receivedAt = performance.now()
      render()
    })
    events.onopen = () => { $('conn').textContent = 'Connected'; $('conn').classList.add('live') }
    events.onerror = () => {
      $('conn').textContent = 'Reconnecting…'
      $('conn').classList.remove('live')
      // EventSource hides the status code, so ask once whether we are still paired.
      if (checkingAuth) return
      checkingAuth = true
      api('/api/search?q=').then((res) => { if (res.status === 401) unpaired() }).catch(() => {}).finally(() => { checkingAuth = false })
    }
  }

  const wire = () => {
    $('prev').innerHTML = ICONS.prev
    $('next').innerHTML = ICONS.next
    $('shuffle').innerHTML = ICONS.shuffle
    $('repeat').innerHTML = ICONS.repeat
    $('toggle').addEventListener('click', () => {
      if (state) { state.isPlaying = !state.isPlaying; state.position = position(); receivedAt = performance.now(); render() }
      command('toggle')
    })
    $('prev').addEventListener('click', () => command('previous'))
    $('next').addEventListener('click', () => command('next'))
    $('shuffle').addEventListener('click', () => command('shuffle'))
    $('repeat').addEventListener('click', () => command('repeat'))
    $('mute').addEventListener('click', () => command('mute'))

    const seek = $('seek')
    seek.addEventListener('input', () => { seeking = true; $('elapsed').textContent = fmt(Number(seek.value)); setFill(seek) })
    seek.addEventListener('change', () => {
      const seconds = Number(seek.value)
      if (state) { state.position = seconds; receivedAt = performance.now() }
      seeking = false
      command('seek', { seconds: seconds })
    })

    const volume = $('volume')
    let volumeTimer = 0
    volume.addEventListener('input', () => {
      setFill(volume)
      volumeHeldUntil = performance.now() + 1500
      clearTimeout(volumeTimer)
      volumeTimer = setTimeout(() => command('volume', { volume: Number(volume.value) / 100 }), 120)
    })

    for (const tab of document.querySelectorAll('.tabs button')) {
      tab.addEventListener('click', () => {
        for (const other of document.querySelectorAll('.tabs button')) other.classList.toggle('active', other === tab)
        $('tab-queue').hidden = tab.dataset.tab !== 'queue'
        $('tab-search').hidden = tab.dataset.tab !== 'search'
        if (tab.dataset.tab === 'search') $('q').focus()
      })
    }

    let searchTimer = 0
    let searchSeq = 0
    $('q').addEventListener('input', () => {
      clearTimeout(searchTimer)
      const query = $('q').value.trim()
      if (!query) { $('results').replaceChildren(); $('search-hint').hidden = false; $('search-hint').textContent = 'Search Spotify and YouTube Music.'; return }
      searchTimer = setTimeout(() => {
        const seq = ++searchSeq
        $('search-hint').hidden = false
        $('search-hint').textContent = 'Searching…'
        api('/api/search?q=' + encodeURIComponent(query)).then((res) => {
          if (res.status === 401) { unpaired(); return null }
          return res.ok ? res.json() : null
        }).then((data) => {
          if (seq !== searchSeq || !data) return
          const list = $('results')
          list.replaceChildren()
          for (const track of data.tracks) {
            const artists = (track.artists || []).map((a) => a.name).join(', ')
            const shown = { title: track.title, artists: artists, artworkUrl: track.artworkUrl, source: track.source }
            list.appendChild(trackRow(shown, null, () => openSheet(track, shown)))
          }
          $('search-hint').hidden = data.tracks.length > 0
          $('search-hint').textContent = 'No results for “' + query + '”.'
        }).catch(() => { if (seq === searchSeq) $('search-hint').textContent = "Couldn't search right now." })
      }, 350)
    })

    let sheetTrack = null
    const openSheet = (track, shown) => {
      sheetTrack = track
      safeImage($('sheet-art'), shown.artworkUrl)
      $('sheet-title').textContent = shown.title
      $('sheet-artist').textContent = shown.artists
      $('sheet').hidden = false
    }
    const closeSheet = () => { $('sheet').hidden = true; sheetTrack = null }
    $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet() })
    const done = { 'play-now': 'Playing', 'play-next': 'Playing next:', 'add-to-queue': 'Added to queue:', radio: 'Starting radio from' }
    for (const button of document.querySelectorAll('.sheet-card > button')) {
      button.addEventListener('click', () => {
        const act = button.dataset.act
        const track = sheetTrack
        closeSheet()
        if (act === 'cancel' || !track) return
        command(act, { trackId: track.id })
        toast(done[act] + ' “' + track.title + '”')
      })
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) render() })
  }

  if (!token) {
    gate('Pair this phone', "On your computer, open SpotiTube → Settings → Phone remote and scan the QR code with this phone's camera.")
    return
  }
  $('app').hidden = false
  wire()
  render()
  connect()
  requestAnimationFrame(loop)
})()
`
