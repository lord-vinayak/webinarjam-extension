# WebinarJam Session Monitor — Design Spec

**Date:** 2026-06-15  
**Status:** Approved

---

## Problem

Presenters on WebinarJam teach in full-screen mode and cannot see the chat. If their screen share drops, audio breaks, or network degrades, they have no way to know without interrupting the session. A monitoring admin needs real-time visibility into every active session to call the presenter immediately when something goes wrong.

---

## Solution Overview

Three components:

```
[Chrome Extension]  →  POST /session (1s)  →  [Railway Backend]  →  SSE /stream  →  [Admin Panel on Vercel]
```

- **Chrome Extension**: Installed by the presenter. Monitors WebRTC stats, network, and track state. POSTs a status payload every 1 second. Has a popup with a name field and ON/OFF toggle.
- **Railway Backend**: Express (Node.js) server. Stores latest session state in-memory. Fans out updates to admin clients via Server-Sent Events.
- **Admin Panel**: React app on Vercel. Connects to Railway SSE stream. Displays a card per active session with color-coded signal indicators.

Scales to 40+ simultaneous sessions with no architecture changes. In-memory bottleneck is in the hundreds of sessions.

---

## Data Payload

Extension POSTs to `POST /session` every 1 second:

```json
{
  "sessionId": "string (auto-detected from WebinarJam URL)",
  "presenterName": "string (entered by presenter in popup)",
  "timestamp": 1718400000000,
  "signals": {
    "network": "good | poor | offline",
    "screenShare": "boolean",
    "camera": "boolean",
    "audio": "good | poor",
    "webrtcState": "connected | disconnected | failed | unknown",
    "heartbeat": true
  }
}
```

### Signal Sources

| Signal | Source |
|---|---|
| `network` | `navigator.connection.effectiveType` + WebRTC outbound packet loss |
| `screenShare` | WebRTC video track with `contentHint=detail` or label containing "screen" |
| `camera` | WebRTC video track that is NOT the screen share track |
| `audio` | WebRTC outbound audio packet loss + jitter via `RTCPeerConnection.getStats()` |
| `webrtcState` | `RTCPeerConnection.connectionState` |
| `heartbeat` | Always `true` — absence means session is dead |

Session ID is auto-detected from `window.location` (WebinarJam includes room/session ID in the URL). Presenter name is persisted to `chrome.storage.local`.

---

## Backend (Railway)

**Stack:** Node.js + Express. Single file.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/session` | Receives payload from extension, updates in-memory store |
| `GET` | `/stream` | SSE endpoint for admin panel |
| `GET` | `/health` | Railway health check |

### In-Memory Store

```js
// { [sessionId]: { ...payload, lastSeen: Date.now() } }
const sessions = {}
```

### Session Eviction

A `setInterval` runs every 2s. Any session where `Date.now() - lastSeen > 5000` is deleted. All SSE clients are notified immediately after eviction so the admin panel removes the card.

### SSE Fan-out

On every POST and every eviction, the full `sessions` object is pushed to all connected SSE clients. At 40 sessions × 1s cadence, this is ~40 pushes/s — negligible.

### Auth

A single shared secret (`ADMIN_SECRET` env var):
- Extension sends it as `X-Secret` header on every POST
- SSE endpoint requires it as `?secret=...` query param
- Railway rejects requests with wrong/missing secret with `401`

---

## Chrome Extension

**Manifest version:** MV3

### Structure

```
extension/
  manifest.json
  popup.html
  popup.js
  content.js
```

### Popup (`popup.html` + `popup.js`)

- Text field for presenter name (saved to `chrome.storage.local`)
- ON/OFF toggle (saved to `chrome.storage.local`)
- Live display of current signal values (for presenter self-check before teaching)

### Content Script (`content.js`)

- Injected into WebinarJam tabs only (via `manifest.json` `matches` field)
- Monkey-patches `window.RTCPeerConnection` at inject time to capture the peer connection reference before WebinarJam creates it
- Every 1s (when toggle is ON):
  1. Calls `peerConnection.getStats()` for audio/video metrics
  2. Reads `navigator.connection` for network info
  3. Inspects `peerConnection.getSenders()` track states for screen share and camera
  4. Reads `peerConnection.connectionState` for WebRTC state
  5. Reads presenter name from `chrome.storage.local`
  6. POSTs payload to Railway with `X-Secret` header
- Session ID auto-detected from `window.location`
- Stops posting when toggle is OFF or tab is closed

### Permissions Required

```json
["storage", "activeTab"]
```

Content script host permission: `https://*.webinarjam.com/*`

---

## Admin Panel (Vercel)

**Stack:** React (Vite) — static export deployed to Vercel.

### Layout

- **Header**: "WebinarJam Monitor" + SSE connection status badge (Connected / Reconnecting)
- **Session grid**: One card per active session, updated live

### Session Card

Each card displays:
- Presenter name + session ID
- Last seen timestamp
- 6 signal indicators with color coding

### Signal Color Mapping

| Signal | Green | Yellow | Red |
|---|---|---|---|
| Network | good | poor | offline |
| Screen Share | on | — | off |
| Camera | on | — | off |
| Audio | good | poor | — |
| WebRTC State | connected | — | disconnected / failed |
| Heartbeat | <3s stale | 3–5s stale | >5s (evicted) |

### SSE Connection

- Connects to `Railway_URL/stream?secret=...` on mount
- Auto-reconnects on drop using native `EventSource` (built-in auto-reconnect)
- Shows "Reconnecting…" banner when disconnected
- Cards disappear when session is evicted

### Auth

`ADMIN_SECRET` is baked into the Vercel build as an env var (`VITE_ADMIN_SECRET`). Acceptable for internal tooling — no login UI needed.

---

## Scalability

| Sessions | In-memory | SSE fan-out | Action needed |
|---|---|---|---|
| ≤ 40 | Fine | Fine | None |
| ~200 | Pressure | Fine | Swap to Redis |
| 500+ | Must replace | Must replace | Redis + pub/sub |

---

## Repo Structure

```
webinarjam/
  extension/          # Chrome extension (MV3)
  backend/            # Express server (Railway)
  admin/              # React app (Vercel)
  docs/
    superpowers/
      specs/
        2026-06-15-webinarjam-monitor-design.md
```
