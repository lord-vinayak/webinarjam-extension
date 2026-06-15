# WebinarJam Session Monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that monitors WebinarJam presenter sessions (network, screen share, audio, WebRTC state, camera) and streams the data in real time to a React admin panel via a Railway backend.

**Architecture:** Chrome extension (MV3) POSTs a status payload every 1s to an Express server on Railway, which fans out the full sessions map to admin clients via Server-Sent Events. Admin panel is a React/Vite app on Vercel.

**Tech Stack:** MV3 Chrome Extension (vanilla JS), Node.js + Express (Railway), React + Vite (Vercel)

---

## File Map

```
webinarjam/
  extension/
    manifest.json       # MV3 manifest — permissions, content script declarations
    inject.js           # Runs in MAIN world — monkey-patches RTCPeerConnection, posts stats via window.postMessage
    content.js          # Runs in ISOLATED world — relays stats to backend, manages toggle state
    popup.html          # Presenter popup UI
    popup.js            # Popup logic — name field, toggle, signal display
  backend/
    package.json
    index.js            # Express server — POST /session, GET /stream (SSE), GET /health, in-memory store, eviction
    test.js             # Self-check — boots server, POST a session, assert 200 and auth rejection
  admin/
    package.json
    vite.config.js
    index.html
    .env.example
    src/
      main.jsx          # React entry point
      App.jsx           # SSE connection, session state, top-level grid
      SessionCard.jsx   # One card per active session
      SignalBadge.jsx   # Color-coded signal indicator
  docs/
    superpowers/
      specs/2026-06-15-webinarjam-monitor-design.md
      plans/2026-06-15-webinarjam-monitor.md
```

---

## Task 0: Project Scaffold

> Git repo already initialized — skip `git init`.

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create .gitignore**

Create `E:/webinarjam/.gitignore`:

```
node_modules/
dist/
.env
.env.local
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p extension backend admin/src
```

- [ ] **Step 4: Initial commit**

```bash
git add .gitignore docs/
git commit -m "chore: init repo with spec and plan"
```

- [ ] **Step 5: Push**

Use `/git-pushing` skill to push to remote.

---

## Task 1: Backend — Core Server

**Files:**
- Create: `backend/package.json`
- Create: `backend/index.js`

- [ ] **Step 1: Create package.json**

Create `backend/package.json`:

```json
{
  "name": "wj-monitor-backend",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "node test.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd backend && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the failing test**

Create `backend/test.js`:

```js
process.env.ADMIN_SECRET = 'test-secret'
process.env.PORT = '3001'

const { server } = require('./index')

async function run() {
  await new Promise(r => setTimeout(r, 100))

  // Valid POST
  const res = await fetch('http://localhost:3001/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': 'test-secret' },
    body: JSON.stringify({
      sessionId: 'test-abc',
      presenterName: 'Alice',
      timestamp: Date.now(),
      signals: { network: 'good', screenShare: true, camera: true, audio: 'good', webrtcState: 'connected', heartbeat: true }
    })
  })
  console.assert(res.status === 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  console.assert(body.ok === true, 'expected ok: true')

  // Rejected without secret
  const bad = await fetch('http://localhost:3001/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: 'x' })
  })
  console.assert(bad.status === 401, `expected 401, got ${bad.status}`)

  // Health check
  const health = await fetch('http://localhost:3001/health')
  console.assert(health.status === 200, 'health check failed')

  console.log('✓ all backend tests passed')
  server.close()
  process.exit(0)
}

run().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: Run test — verify it fails**

```bash
cd backend && node test.js
```

Expected: Error — `Cannot find module './index'`

- [ ] **Step 5: Write index.js**

Create `backend/index.js`:

```js
const express = require('express')

const app = express()
app.use(express.json())

const SECRET = process.env.ADMIN_SECRET
const sessions = {} // { [sessionId]: { ...payload, lastSeen } }
const clients = []  // active SSE response objects

function auth(req, res, next) {
  const secret = req.headers['x-secret'] || req.query.secret
  if (secret !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
}

function broadcast() {
  const data = `data: ${JSON.stringify(sessions)}\n\n`
  clients.forEach(res => res.write(data))
}

// Evict sessions silent for >5s
setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const id of Object.keys(sessions)) {
    if (now - sessions[id].lastSeen > 5000) {
      delete sessions[id]
      changed = true
    }
  }
  if (changed) broadcast()
}, 2000)

app.post('/session', auth, (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  sessions[sessionId] = { ...req.body, lastSeen: Date.now() }
  broadcast()
  res.json({ ok: true })
})

app.get('/stream', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify(sessions)}\n\n`)
  clients.push(res)

  req.on('close', () => clients.splice(clients.indexOf(res), 1))
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`ready on ${process.env.PORT || 3000}`)
)

module.exports = { server }
```

- [ ] **Step 6: Run test — verify it passes**

```bash
cd backend && node test.js
```

Expected: `✓ all backend tests passed`

- [ ] **Step 7: Commit and push**

```bash
git add backend/
git commit -m "feat: add backend Express server with POST /session, SSE /stream, auth"
```

Then use `/git-pushing` skill.

---

## Task 2: Backend — Railway Config

**Files:**
- Create: `backend/.env.example`
- Create: `backend/Procfile`  *(Railway uses this to know how to start the app)*

- [ ] **Step 1: Create .env.example**

Create `backend/.env.example`:

```
ADMIN_SECRET=change-me-to-a-random-string
PORT=3000
```

- [ ] **Step 2: Create Procfile**

Create `backend/Procfile`:

```
web: node index.js
```

- [ ] **Step 3: Commit and push**

```bash
git add backend/.env.example backend/Procfile
git commit -m "chore: add Railway deployment config"
```

Then use `/git-pushing` skill.

> **Deploy note:** In Railway dashboard — set `ADMIN_SECRET` env var to a random string, set root directory to `backend/`, deploy. Note the Railway URL (e.g. `https://wj-monitor.railway.app`) — you'll need it for the extension and admin panel.

---

## Task 3: Extension — manifest.json

**Files:**
- Create: `extension/manifest.json`

> **Before writing:** Replace `YOUR_RAILWAY_URL` below with the actual Railway URL after deployment (e.g. `https://wj-monitor.railway.app`).

- [ ] **Step 1: Create manifest.json**

Create `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "WebinarJam Monitor",
  "version": "1.0.0",
  "description": "Monitors WebinarJam sessions and reports status to admin panel",
  "permissions": ["storage"],
  "host_permissions": [
    "https://*.webinarjam.com/*",
    "YOUR_RAILWAY_URL/*"
  ],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://*.webinarjam.com/*"],
      "js": ["inject.js"],
      "run_at": "document_start",
      "world": "MAIN"
    },
    {
      "matches": ["https://*.webinarjam.com/*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}
```

- [ ] **Step 2: Commit and push**

```bash
git add extension/manifest.json
git commit -m "feat: add MV3 extension manifest"
```

Then use `/git-pushing` skill.

---

## Task 4: Extension — inject.js (MAIN World)

**Files:**
- Create: `extension/inject.js`

> This script runs in the page's MAIN world (access to `window`). It monkey-patches `RTCPeerConnection` to capture the peer connection WebinarJam creates, reads stats every 1s, and sends them to content.js via `window.postMessage`.

- [ ] **Step 1: Create inject.js**

Create `extension/inject.js`:

```js
;(function () {
  const OrigRTC = window.RTCPeerConnection
  let pc = null

  // Capture the RTCPeerConnection WebinarJam creates
  window.RTCPeerConnection = function (...args) {
    pc = new OrigRTC(...args)
    return pc
  }
  // Copy static properties (needed for some platforms)
  Object.assign(window.RTCPeerConnection, OrigRTC)

  async function collectStats() {
    if (!pc) return null

    const signals = {
      network: 'good',
      screenShare: false,
      camera: false,
      audio: 'good',
      webrtcState: pc.connectionState || 'unknown'
    }

    // Network quality from navigator.connection
    const conn = navigator.connection
    if (conn) {
      if (!conn.effectiveType || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
        signals.network = 'offline'
      } else if (conn.effectiveType === '3g' || (conn.downlink != null && conn.downlink < 1)) {
        signals.network = 'poor'
      }
    }

    // Screen share vs camera detection from senders
    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (!track || track.kind !== 'video') continue
      const isScreen = track.contentHint === 'detail' || /screen|display|monitor/i.test(track.label)
      if (isScreen) {
        signals.screenShare = track.enabled && track.readyState === 'live'
      } else {
        signals.camera = track.enabled && track.readyState === 'live'
      }
    }

    // Audio quality from WebRTC stats
    try {
      const report = await pc.getStats()
      report.forEach(s => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') {
          const loss = (s.packetsLost || 0) / ((s.packetsSent || 0) + 1)
          if (loss > 0.05 || (s.jitter != null && s.jitter > 0.05)) signals.audio = 'poor'
        }
      })
    } catch (_) {}

    return signals
  }

  setInterval(async () => {
    const signals = await collectStats()
    if (!signals) return
    window.postMessage({
      type: '__WJ_MONITOR_STATS__',
      signals,
      sessionId: window.location.pathname
    }, '*')
  }, 1000)
})()
```

- [ ] **Step 2: Load extension in Chrome and verify postMessage fires**

1. Open `chrome://extensions/`, enable Developer Mode, click "Load unpacked", select `extension/`
2. Navigate to any `https://*.webinarjam.com/*` page
3. Open DevTools Console and run:
   ```js
   window.addEventListener('message', e => { if (e.data?.type === '__WJ_MONITOR_STATS__') console.log(e.data) })
   ```
4. Wait 2s — you should see `{type: '__WJ_MONITOR_STATS__', signals: {...}, sessionId: '...'}` logged every second

Expected: Messages appear with signal values (all may be defaults if no active WebRTC session)

- [ ] **Step 3: Commit and push**

```bash
git add extension/inject.js
git commit -m "feat: add inject.js — RTCPeerConnection monkey-patch and stats collection"
```

Then use `/git-pushing` skill.

---

## Task 5: Extension — content.js (ISOLATED World)

**Files:**
- Create: `extension/content.js`

> Replace `YOUR_RAILWAY_URL` and `YOUR_ADMIN_SECRET` with actual values before loading the extension.

- [ ] **Step 1: Create content.js**

Create `extension/content.js`:

```js
const BACKEND_URL = 'YOUR_RAILWAY_URL'
const SECRET = 'YOUR_ADMIN_SECRET'

let enabled = false

// Sync toggle state from storage
chrome.storage.local.get('monitorEnabled', ({ monitorEnabled }) => {
  enabled = !!monitorEnabled
})
chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitorEnabled != null) enabled = !!changes.monitorEnabled.newValue
})

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== '__WJ_MONITOR_STATS__') return
  if (!enabled) return

  const { signals, sessionId } = event.data
  const { presenterName } = await chrome.storage.local.get('presenterName')

  // Save latest signals so popup can display them
  chrome.storage.local.set({ lastSignals: signals })

  fetch(`${BACKEND_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
    body: JSON.stringify({
      sessionId,
      presenterName: presenterName || 'Unknown',
      timestamp: Date.now(),
      signals: { ...signals, heartbeat: true }
    })
  }).catch(() => {}) // ponytail: silent fail — network issues are visible in the dashboard itself
})
```

- [ ] **Step 2: Reload extension and verify POSTs reach backend**

1. Start backend locally: `cd backend && ADMIN_SECRET=YOUR_ADMIN_SECRET node index.js`
2. Reload extension at `chrome://extensions/`
3. Navigate to a WebinarJam page, open popup, enter a name, enable monitoring
4. In backend terminal, you should see no errors and POSTs being received

To confirm, add a temporary `console.log` to the POST handler in `index.js`:
```js
app.post('/session', auth, (req, res) => {
  console.log('received:', req.body.sessionId, req.body.signals)
  // ...
})
```

Expected: Logs appear every ~1s with the session ID and signals.

- [ ] **Step 3: Commit and push**

```bash
git add extension/content.js
git commit -m "feat: add content.js — relay stats to backend, respect toggle state"
```

Then use `/git-pushing` skill.

---

## Task 6: Extension — Popup

**Files:**
- Create: `extension/popup.html`
- Create: `extension/popup.js`

- [ ] **Step 1: Create popup.html**

Create `extension/popup.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { width: 280px; padding: 12px; font-family: sans-serif; margin: 0; }
  h3 { margin: 0 0 10px; font-size: 15px; }
  input[type="text"] { width: 100%; box-sizing: border-box; padding: 7px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
  button { width: 100%; margin-top: 8px; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; color: white; }
  #signals { margin-top: 12px; border-top: 1px solid #eee; padding-top: 10px; }
  .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .green { color: #28a745; font-weight: bold; }
  .yellow { color: #e6a817; font-weight: bold; }
  .red { color: #dc3545; font-weight: bold; }
  .grey { color: #999; font-weight: bold; }
</style>
</head>
<body>
<h3>WebinarJam Monitor</h3>
<input type="text" id="name" placeholder="Your name" />
<button id="toggle">Enable Monitoring</button>
<div id="signals"><p style="color:#999;font-size:12px;margin:6px 0">No data yet</p></div>
<script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.js**

Create `extension/popup.js`:

```js
const nameInput = document.getElementById('name')
const toggleBtn = document.getElementById('toggle')
const signalsDiv = document.getElementById('signals')

chrome.storage.local.get(['presenterName', 'monitorEnabled', 'lastSignals'], ({ presenterName, monitorEnabled, lastSignals }) => {
  nameInput.value = presenterName || ''
  renderToggle(!!monitorEnabled)
  if (lastSignals) renderSignals(lastSignals)
})

nameInput.addEventListener('input', () => {
  chrome.storage.local.set({ presenterName: nameInput.value })
})

toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get('monitorEnabled', ({ monitorEnabled }) => {
    const next = !monitorEnabled
    chrome.storage.local.set({ monitorEnabled: next })
    renderToggle(next)
  })
})

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastSignals) renderSignals(changes.lastSignals.newValue)
  if (changes.monitorEnabled) renderToggle(changes.monitorEnabled.newValue)
})

function renderToggle(enabled) {
  toggleBtn.textContent = enabled ? 'Disable Monitoring' : 'Enable Monitoring'
  toggleBtn.style.background = enabled ? '#dc3545' : '#28a745'
}

function cls(value) {
  if (['good', 'connected'].includes(value)) return 'green'
  if (['poor'].includes(value)) return 'yellow'
  if (['offline', 'disconnected', 'failed', 'unknown'].includes(value)) return 'red'
  if (value === true) return 'green'
  if (value === false) return 'red'
  return 'grey'
}

function label(key, value) {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF'
  return value
}

function renderSignals(signals) {
  const rows = [
    ['Network', signals.network],
    ['Screen Share', signals.screenShare],
    ['Camera', signals.camera],
    ['Audio', signals.audio],
    ['WebRTC', signals.webrtcState],
  ]
  signalsDiv.innerHTML = rows.map(([k, v]) =>
    `<div class="row"><span>${k}</span><span class="${cls(v)}">${label(k, v)}</span></div>`
  ).join('')
}
```

- [ ] **Step 3: Reload extension and test popup**

1. Reload extension at `chrome://extensions/`
2. Click extension icon — popup opens
3. Enter a name — it should persist after closing and reopening
4. Click "Enable Monitoring" — button turns red and says "Disable Monitoring"
5. Navigate to WebinarJam tab — signal values should appear in popup within 2s

Expected: All signals appear, toggle persists across popup open/close.

- [ ] **Step 4: Commit and push**

```bash
git add extension/popup.html extension/popup.js
git commit -m "feat: add extension popup with name field, toggle, and live signal display"
```

Then use `/git-pushing` skill.

---

## Task 7: Admin Panel — Scaffold

**Files:**
- Create: `admin/package.json`
- Create: `admin/vite.config.js`
- Create: `admin/index.html`
- Create: `admin/.env.example`
- Create: `admin/src/main.jsx`

- [ ] **Step 1: Create package.json**

Create `admin/package.json`:

```json
{
  "name": "wj-monitor-admin",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

Create `admin/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react()] })
```

- [ ] **Step 3: Create index.html**

Create `admin/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WebinarJam Monitor</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create .env.example**

Create `admin/.env.example`:

```
VITE_BACKEND_URL=https://your-railway-app.railway.app
VITE_ADMIN_SECRET=your-secret-here
```

Copy to `admin/.env.local` and fill in actual values (this file is gitignored).

- [ ] **Step 5: Create src/main.jsx**

Create `admin/src/main.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

- [ ] **Step 6: Install dependencies and verify scaffold**

```bash
cd admin && npm install
npm run dev
```

Expected: Vite dev server starts, `http://localhost:5173` opens. Page is blank (no App.jsx yet) — no errors in terminal.

- [ ] **Step 7: Commit and push**

```bash
git add admin/
git commit -m "chore: scaffold React/Vite admin panel"
```

Then use `/git-pushing` skill.

---

## Task 8: Admin Panel — SignalBadge Component

**Files:**
- Create: `admin/src/SignalBadge.jsx`

- [ ] **Step 1: Create SignalBadge.jsx**

Create `admin/src/SignalBadge.jsx`:

```jsx
const COLOR = {
  good: '#28a745',
  connected: '#28a745',
  ok: '#28a745',
  poor: '#e6a817',
  slow: '#e6a817',
  offline: '#dc3545',
  disconnected: '#dc3545',
  failed: '#dc3545',
  dead: '#dc3545',
  unknown: '#dc3545',
}

export default function SignalBadge({ label, value }) {
  const display = typeof value === 'boolean' ? (value ? 'ON' : 'OFF') : value
  const color = typeof value === 'boolean'
    ? (value ? '#28a745' : '#dc3545')
    : (COLOR[value] || '#6c757d')

  return (
    <div style={{ background: '#f8f9fa', borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 'bold', color, fontSize: 13, marginTop: 2 }}>{display}</div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test in isolation**

Temporarily add to `admin/src/main.jsx`:

```jsx
import SignalBadge from './SignalBadge'
ReactDOM.createRoot(document.getElementById('root')).render(
  <div style={{ display: 'flex', gap: 8, padding: 20 }}>
    <SignalBadge label="Network" value="good" />
    <SignalBadge label="Network" value="poor" />
    <SignalBadge label="Network" value="offline" />
    <SignalBadge label="Screen Share" value={true} />
    <SignalBadge label="Screen Share" value={false} />
    <SignalBadge label="WebRTC" value="connected" />
    <SignalBadge label="WebRTC" value="failed" />
  </div>
)
```

Run `npm run dev`. Verify:
- "good" and `true` → green
- "poor" → orange/yellow
- "offline", "failed", `false` → red

Revert `main.jsx` to the original content from Task 7 after verifying.

- [ ] **Step 3: Commit and push**

```bash
git add admin/src/SignalBadge.jsx
git commit -m "feat: add SignalBadge component with color-coded signal values"
```

Then use `/git-pushing` skill.

---

## Task 9: Admin Panel — SessionCard Component

**Files:**
- Create: `admin/src/SessionCard.jsx`

- [ ] **Step 1: Create SessionCard.jsx**

Create `admin/src/SessionCard.jsx`:

```jsx
import SignalBadge from './SignalBadge'

export default function SessionCard({ session }) {
  const { presenterName, sessionId, timestamp, signals } = session
  const ageMs = Date.now() - timestamp
  const ageSec = Math.round(ageMs / 1000)

  const heartbeatStatus = ageSec < 3 ? 'ok' : ageSec < 5 ? 'slow' : 'dead'

  // Derive card border color from worst signal
  const hasCritical =
    signals.network === 'offline' ||
    signals.screenShare === false ||
    signals.webrtcState === 'disconnected' ||
    signals.webrtcState === 'failed' ||
    heartbeatStatus === 'dead'
  const hasWarning = signals.network === 'poor' || signals.audio === 'poor' || heartbeatStatus === 'slow'
  const borderColor = hasCritical ? '#dc3545' : hasWarning ? '#e6a817' : '#28a745'

  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 10, padding: 16 }}>
      <div style={{ fontWeight: 'bold', fontSize: 15, marginBottom: 2 }}>
        {presenterName || 'Unknown'}
      </div>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 12 }}>
        {sessionId} &middot; last seen {ageSec}s ago
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <SignalBadge label="Network" value={signals.network} />
        <SignalBadge label="Screen Share" value={signals.screenShare} />
        <SignalBadge label="Camera" value={signals.camera} />
        <SignalBadge label="Audio" value={signals.audio} />
        <SignalBadge label="WebRTC" value={signals.webrtcState} />
        <SignalBadge label="Heartbeat" value={heartbeatStatus} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke-test in isolation**

Temporarily add to `admin/src/main.jsx`:

```jsx
import SessionCard from './SessionCard'

const mockSession = {
  presenterName: 'Alice',
  sessionId: '/live/abc123',
  timestamp: Date.now() - 1000,
  signals: { network: 'good', screenShare: true, camera: true, audio: 'good', webrtcState: 'connected', heartbeat: true }
}

const mockBad = {
  presenterName: 'Bob',
  sessionId: '/live/def456',
  timestamp: Date.now() - 4000,
  signals: { network: 'poor', screenShare: false, camera: false, audio: 'poor', webrtcState: 'disconnected', heartbeat: true }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: 20, maxWidth: 700 }}>
    <SessionCard session={mockSession} />
    <SessionCard session={mockBad} />
  </div>
)
```

Run `npm run dev`. Verify:
- Alice's card has green border
- Bob's card has red border

Revert `main.jsx` to original after verifying.

- [ ] **Step 3: Commit and push**

```bash
git add admin/src/SessionCard.jsx
git commit -m "feat: add SessionCard component with border color derived from worst signal"
```

Then use `/git-pushing` skill.

---

## Task 10: Admin Panel — App.jsx (SSE + Grid)

**Files:**
- Create: `admin/src/App.jsx`

- [ ] **Step 1: Create App.jsx**

Create `admin/src/App.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react'
import SessionCard from './SessionCard'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
const SECRET = import.meta.env.VITE_ADMIN_SECRET

export default function App() {
  const [sessions, setSessions] = useState({})
  const [connected, setConnected] = useState(false)
  const esRef = useRef(null)

  useEffect(() => {
    function connect() {
      const es = new EventSource(`${BACKEND_URL}/stream?secret=${SECRET}`)
      esRef.current = es

      es.onopen = () => setConnected(true)

      es.onmessage = (event) => {
        setSessions(JSON.parse(event.data))
      }

      es.onerror = () => {
        setConnected(false)
        es.close()
        setTimeout(connect, 3000) // reconnect after 3s
      }
    }

    connect()
    return () => esRef.current?.close()
  }, [])

  const sessionList = Object.values(sessions)

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', padding: 24, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>WebinarJam Monitor</h1>
        <span style={{ fontSize: 13, color: connected ? '#28a745' : '#e6a817', fontWeight: 'bold' }}>
          {connected ? '● Live' : '● Reconnecting…'}
        </span>
      </div>

      {!connected && (
        <div style={{ background: '#fff3cd', border: '1px solid #e6a817', borderRadius: 6, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          Connection lost — reconnecting to backend…
        </div>
      )}

      {sessionList.length === 0 ? (
        <p style={{ color: '#888' }}>No active sessions. Waiting for presenters to enable monitoring.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {sessionList.map(s => <SessionCard key={s.sessionId} session={s} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create admin/.env.local**

Copy `admin/.env.example` to `admin/.env.local` and fill in actual values:

```
VITE_BACKEND_URL=https://your-railway-app.railway.app
VITE_ADMIN_SECRET=your-actual-secret
```

- [ ] **Step 3: Run dev server and verify end-to-end**

1. Start backend: `cd backend && ADMIN_SECRET=your-secret node index.js`
2. Start admin: `cd admin && npm run dev`
3. Open `http://localhost:5173` — should show "No active sessions" and "● Live" (green)
4. Stop backend — should show "● Reconnecting…" banner
5. Restart backend — should reconnect and show green within 3s
6. Open a WebinarJam tab with extension enabled — a card should appear within 2s

Expected: Cards appear, update every 1s, disappear 5s after extension is disabled.

- [ ] **Step 4: Commit and push**

```bash
git add admin/src/App.jsx admin/.env.example
git commit -m "feat: add App.jsx with SSE connection, auto-reconnect, and session grid"
```

Then use `/git-pushing` skill.

---

## Task 11: Admin Panel — Vercel Deployment

**Files:**
- Create: `admin/vercel.json`

- [ ] **Step 1: Create vercel.json**

Create `admin/vercel.json`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install"
}
```

- [ ] **Step 2: Build and verify**

```bash
cd admin && npm run build
```

Expected: `dist/` folder created, no errors.

- [ ] **Step 3: Commit and push**

```bash
git add admin/vercel.json
git commit -m "chore: add Vercel deployment config for admin panel"
```

Then use `/git-pushing` skill.

> **Deploy note:** In Vercel dashboard — import repo, set root directory to `admin/`, add env vars `VITE_BACKEND_URL` and `VITE_ADMIN_SECRET`, deploy. Share the Vercel URL with the monitoring admin.

---

## Task 12: CORS Fix (Required for Extension → Backend)

**Files:**
- Modify: `backend/index.js`

> Chrome extensions send requests from `chrome-extension://` origins. The backend must allow this or fetch calls from the content script will be blocked.

- [ ] **Step 1: Add CORS headers to POST /session**

In `backend/index.js`, add before the routes:

```js
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Secret')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
```

- [ ] **Step 2: Re-run backend test**

```bash
cd backend && node test.js
```

Expected: `✓ all backend tests passed`

- [ ] **Step 3: Commit and push**

```bash
git add backend/index.js
git commit -m "fix: add CORS headers so Chrome extension can POST to backend"
```

Then use `/git-pushing` skill.

---

## End-to-End Verification Checklist

After all tasks are complete:

- [ ] Backend deployed on Railway, health check returns 200
- [ ] Extension loaded unpacked in Chrome, popup shows name field and toggle
- [ ] Navigate to WebinarJam page, enable monitoring — popup shows signal values within 2s
- [ ] Admin panel on Vercel shows "● Live" and displays a card for the active session
- [ ] Disable monitoring / close tab — card disappears from admin panel within 5s
- [ ] Open 2+ WebinarJam tabs with extension on — admin panel shows one card per session
