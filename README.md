# WebinarJam Monitor

Real-time monitoring for WebinarJam presenter sessions. The presenter installs a Chrome extension that streams signal data to an admin panel via a backend relay. A monitoring person watches the panel and can call the presenter if issues arise.

```
presenter browser                backend (Railway)        admin panel (Vercel)
  extension inject.js  ──POST /session──▶  Express/SSE  ──SSE /stream──▶  React dashboard
```

---

## Table of Contents

- [Components](#components)
- [Signals Monitored](#signals-monitored)
- [Local Development Setup](#local-development-setup)
- [Chrome Extension — Load & Use](#chrome-extension--load--use)
- [Production Deployment](#production-deployment)
- [Admin Panel Features](#admin-panel-features)
- [Architecture Notes](#architecture-notes)
- [Troubleshooting](#troubleshooting)

---

## Components

| Directory    | What it is                                        |
|--------------|---------------------------------------------------|
| `extension/` | Chrome extension (Manifest V3)                   |
| `backend/`   | Express server — in-memory session store + SSE relay |
| `admin/`     | React + Vite dashboard                            |

---

## Signals Monitored

| Signal             | How detected                                           | States / Values                    |
|--------------------|--------------------------------------------------------|------------------------------------|
| Network            | `navigator.connection.effectiveType`                   | good / poor / offline              |
| Screen share       | `getDisplayMedia` intercept on track `readyState`      | ON / OFF                           |
| Camera             | Active video RTCRtpSenders (excluding screen track)    | ON / OFF                           |
| Audio              | `track.enabled` + WebRTC packet loss / jitter stats    | good / poor / muted                |
| WebRTC state       | `RTCPeerConnection.connectionState`                    | connected / disconnected / failed… |
| Heartbeat          | Time since last POST received by backend               | ok / slow / dead                   |
| Chat messages      | MutationObserver on `ul.chat_list.default`             | unread count + last 10 messages    |
| Participant count  | DOM read of `.wji-people` sibling `.label` on page     | integer, updated every second      |

The admin card border turns **red** on any critical signal (offline, muted, disconnected, dead heartbeat) and **yellow** on warnings (poor network, poor audio, slow heartbeat).

---

## Local Development Setup

### 1. Backend

```bash
cd backend
cp .env.example .env          # then edit .env
npm install
npm start
```

`.env` variables:

| Key            | Example value | Notes                                              |
|----------------|---------------|----------------------------------------------------|
| `ADMIN_SECRET` | `localsecret` | Shared secret — must match extension and admin panel |
| `PORT`         | `3000`        | Optional, defaults to 3000                         |

### 2. Admin panel

```bash
cd admin
cp .env.example .env.local    # then edit .env.local
npm install
npm run dev
```

`.env.local` variables:

| Key                  | Local value             |
|----------------------|-------------------------|
| `VITE_BACKEND_URL`   | `http://localhost:3000` |
| `VITE_ADMIN_SECRET`  | `localsecret`           |

Open `http://localhost:5173`. You'll see "No active sessions" until a presenter enables the extension.

### 3. Chrome extension

1. Open `extension/content.js` — verify `BACKEND_URL` and `SECRET` match your backend:
   ```js
   const BACKEND_URL = 'http://localhost:3000'
   const SECRET = 'localsecret'
   ```
2. Go to `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Pin the "WebinarJam Monitor" extension from the toolbar.

### 4. Run a test session

1. Start the backend and admin panel (steps 1–2).
2. Open any `https://*.webinarjam.com/` page in Chrome.
3. Click the extension icon → click **Enable Monitoring** (button turns red).
4. The admin panel at `localhost:5173` shows a session card within 1–2 seconds.

---

## Chrome Extension — Load & Use

### Files to load

Load the `extension/` folder directly in Chrome (no zip needed for local use):

```
extension/
├── manifest.json
├── inject.js
├── content.js
├── popup.html
└── popup.js
```

For distribution, zip the **contents** of the folder (not the folder itself).

### Extension popup

The popup shows:
- The current **webinar name** (read from `localConfiguration.webinarName` on the page)
- **Enable / Disable Monitoring** toggle button
- Live signal values for Network, Screen Share, Camera, Audio, and WebRTC — updated every second

---

## Production Deployment

### Backend → Railway

1. Push the repo to GitHub.
2. Create a Railway project → **Deploy from GitHub** → set root directory to `backend/`.
3. Set environment variables in Railway dashboard:
   - `ADMIN_SECRET` — a strong random string (`openssl rand -hex 32`)
   - `PORT` is set automatically by Railway; leave it unset.
4. Note the public URL Railway assigns (e.g. `https://your-app.up.railway.app`).

### Admin panel → Vercel

1. Create a Vercel project → import this repo → set root directory to `admin/`.
2. Set environment variables in Vercel dashboard:
   - `VITE_BACKEND_URL` — the Railway URL from above
   - `VITE_ADMIN_SECRET` — same secret as backend
3. Deploy. Vercel auto-builds on every push.

### Extension — update for production

Edit `extension/content.js`:
```js
const BACKEND_URL = 'https://your-railway-app.up.railway.app'
const SECRET = 'your-production-secret'
```

Edit `extension/manifest.json` — replace the `host_permissions` entry:
```json
"host_permissions": [
  "https://*.webinarjam.com/*",
  "https://your-railway-app.up.railway.app/*"
]
```

Reload the extension at `chrome://extensions/` after any file change.

---

## Admin Panel Features

### Session cards

Each active presenter session is shown as a card. The card includes:

- **Presenter / webinar name** and session ID
- **Last seen** — seconds since the last heartbeat from the extension
- **Participant count** — live count of attendees currently in the webinar room (👥 N), read from the WebinarJam page DOM every second
- **Signal badges** — color-coded rows for Network, Screen Share, Camera, Audio, WebRTC, and Heartbeat
- **Chat** — unread message count badge; click to expand the last 10 chat messages with sender name, admin status, and message text

### Webinar filter

When multiple webinars are running simultaneously, a **Filter Webinars** multi-select appears above the session grid. Select one or more webinar names to narrow the view. Hold **Ctrl** (Windows) or **Cmd** (Mac) to select multiple. Click **Clear Filter** to show all sessions again. The panel shows a "Showing X of Y sessions" count.

### Connection status

A **● Live** / **● Reconnecting…** indicator in the top-right corner shows the SSE connection state. If the connection drops, the panel auto-reconnects after 3 seconds and shows a yellow warning banner.

---

## Architecture Notes

### Extension: two-world design

`inject.js` runs in the **MAIN** world (same JavaScript context as the page) — it can access `window.RTCPeerConnection`, `navigator.mediaDevices`, and `localConfiguration` (a WebinarJam page global). `content.js` runs in the **ISOLATED** world — it can access `chrome.*` APIs and the live DOM. They communicate via `window.postMessage`.

### Screen share detection

`inject.js` intercepts `navigator.mediaDevices.getDisplayMedia` before WebinarJam calls it. It holds a reference to the original `MediaStreamTrack` and checks `track.readyState === 'live'` on every tick. This is reliable even when WebinarJam pipes the track through a canvas (for virtual backgrounds), because the original track object always reflects reality.

### Camera detection

WebRTC uses one `RTCRtpSender` per active video track. If screen share is ON, it accounts for one active video sender; any additional active video sender means the camera is also ON. If screen share is OFF, any active video sender means the camera is ON.

### RTCPeerConnection proxy

`RTCPeerConnection` is wrapped with a **Proxy** (not a plain subclass or function override) so that WebinarJam's virtual background library can still patch `RTCPeerConnection.prototype` and the `instanceof` check remains valid.

### Participant count

`content.js` reads the text content of the `.label` element that is a sibling of the `.wji-people` icon in the WebinarJam navbar on every heartbeat (once per second). The integer value is included in the POST body as `participantCount` and displayed in the admin card. If the element is not found, `null` is sent and the admin card omits the count.

### Chat monitoring

`content.js` waits for `ul.chat_list.default` to appear in the DOM (using a `MutationObserver` fallback if it isn't present at `DOMContentLoaded`) then seeds `recentMessages` from existing DOM nodes and observes new additions. The unread count and last 10 messages are included in every heartbeat POST.

### Backend session lifecycle

Sessions are stored in memory as a plain object keyed by `presenterHash` (or `sessionId`). A `setInterval` runs every 2 seconds and evicts any session whose `lastSeen` is older than 5 seconds. Every change (new session, update, eviction) is broadcast to all connected SSE clients.

### Admin panel SSE

`App.jsx` opens an `EventSource` to `GET /stream`. On every SSE message it replaces the full `sessions` state, which re-renders all cards. On error, it closes the connection and reconnects after 3 seconds.

---

## Troubleshooting

**Extension not sending data**
- Check the extension is enabled (popup button should be red "Disable Monitoring").
- Open DevTools on the WebinarJam tab → Console — look for fetch errors.
- Confirm `BACKEND_URL` and `SECRET` in `content.js` match your backend.

**Admin panel shows "No active sessions"**
- Confirm the backend is running and reachable at `VITE_BACKEND_URL`.
- Open the browser console on the admin panel — look for SSE connection errors.
- Check `VITE_ADMIN_SECRET` matches `ADMIN_SECRET` on the backend.

**Participant count not showing**
- The count is only available on the presenter's live room page (the count element is in the WebinarJam room navbar). It won't appear on registration or replay pages.

**Screen share shows OFF when sharing**
- This can happen if the extension was loaded *after* `getDisplayMedia` was first called. Reload the WebinarJam tab with the extension enabled, then start sharing.

**Sessions disappear every 5 seconds**
- The backend TTL is 5 seconds. If the extension heartbeat is blocked or throttled (e.g. background tab throttling), increase `SESSION_TTL_MS` in `backend/index.js`.
