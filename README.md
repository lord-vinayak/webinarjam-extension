# WebinarJam Monitor

Real-time monitoring for WebinarJam presenter sessions. The presenter installs a Chrome extension that streams signal data (network, screen share, audio, camera, WebRTC state, heartbeat, chat) to an admin panel via a backend relay. A monitoring person watches the panel and can call the presenter if issues arise.

```
presenter browser                backend (Railway)        admin panel (Vercel)
  extension inject.js  ──POST /session──▶  Express/SSE  ──SSE /stream──▶  React dashboard
```

---

## Components

| Directory   | What it is                          |
|-------------|-------------------------------------|
| `extension/` | Chrome extension (MV3)             |
| `backend/`   | Express server — session store + SSE relay |
| `admin/`     | React + Vite dashboard              |

---

## Local Development Setup

### 1. Backend

```bash
cd backend
cp .env.example .env          # then edit .env
npm install
npm start          # uses node --env-file=.env internally
```

`.env` values:

| Key            | Example value          | Notes                        |
|----------------|------------------------|------------------------------|
| `ADMIN_SECRET` | `localsecret`          | Shared secret — set the same value in extension and admin |
| `PORT`         | `3000`                 | Optional, defaults to 3000   |

### 2. Admin panel

```bash
cd admin
cp .env.example .env.local    # then edit .env.local
npm install
npm run dev
```

`.env.local` values:

| Key                  | Local value               |
|----------------------|---------------------------|
| `VITE_BACKEND_URL`   | `http://localhost:3000`   |
| `VITE_ADMIN_SECRET`  | `localsecret`             |

Open `http://localhost:5173` in a browser. You'll see "No active sessions" until a presenter enables the extension.

### 3. Chrome extension

1. Open `extension/content.js` — verify `BACKEND_URL` and `SECRET` match your backend:
   ```js
   const BACKEND_URL = 'http://localhost:3000'
   const SECRET = 'localsecret'
   ```
2. Go to `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Pin the "WebinarJam Monitor" extension from the toolbar.

### 4. Run a test session

1. Start the backend and admin panel (steps 1–2 above).
2. Open any `https://*.webinarjam.com/` page in Chrome.
3. Click the extension icon → enter your name → click **Start Monitoring** (button turns red).
4. The admin panel at `localhost:5173` should show a session card within 1–2 seconds.

---

## Production Deployment

### Backend → Railway

1. Push the repo to GitHub.
2. Create a new Railway project → **Deploy from GitHub** → select this repo → set root to `backend/`.
3. Set environment variables in Railway dashboard:
   - `ADMIN_SECRET` — a strong random string (e.g. `openssl rand -hex 32`)
   - `PORT` is set automatically by Railway; leave it unset.
4. Note the public URL Railway assigns (e.g. `https://webinarjam-monitor.up.railway.app`).

### Admin panel → Vercel

1. Create a new Vercel project → import this repo → set root directory to `admin/`.
2. Set environment variables in Vercel dashboard:
   - `VITE_BACKEND_URL` — Railway URL from above
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

## Signals monitored

| Signal       | How detected                                     | States                        |
|--------------|--------------------------------------------------|-------------------------------|
| Network      | `navigator.connection.effectiveType`             | good / poor / offline         |
| Screen share | `getDisplayMedia` intercept                      | ON / OFF                      |
| Camera       | RTCPeerConnection video sender `track.enabled`   | ON / OFF                      |
| Audio        | `track.enabled` + WebRTC packet loss/jitter      | good / poor / muted           |
| WebRTC state | `RTCPeerConnection.connectionState`              | connected / disconnected / …  |
| Heartbeat    | Time since last POST                             | ok / slow / dead              |
| Chat         | MutationObserver on `ul.chat_list.default`       | unread count + last 10 msgs   |

The admin panel card turns **red** on any critical signal and **yellow** on warnings.

---

## Architecture notes

- Extension uses two content script worlds: `inject.js` runs in the **MAIN** world (accesses `window.RTCPeerConnection` and `navigator.mediaDevices`) and `content.js` runs in the **ISOLATED** world (accesses `chrome.*` APIs). They communicate via `window.postMessage`.
- `RTCPeerConnection` is wrapped with a **Proxy** (not a plain function) so WebinarJam's virtual background library can still patch `RTCPeerConnection.prototype`.
- The backend holds sessions in memory with a 5-second TTL; sessions evicted automatically when the extension goes silent.
- `GET /stream` uses Server-Sent Events (SSE); the admin panel auto-reconnects after 3 seconds on disconnect.
