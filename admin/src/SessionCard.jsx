import { useState } from 'react'
import SignalBadge from './SignalBadge'

export default function SessionCard({ session }) {
  const { presenterName, sessionId, timestamp, signals, chat } = session
  const [chatOpen, setChatOpen] = useState(false)

  const ageMs = Date.now() - timestamp
  const ageSec = Math.round(ageMs / 1000)
  const heartbeatStatus = ageSec < 3 ? 'ok' : ageSec < 5 ? 'slow' : 'dead'

  const hasCritical =
    signals.network === 'offline' ||
    signals.screenShare === false ||
    signals.audio === 'muted' ||
    signals.webrtcState === 'disconnected' ||
    signals.webrtcState === 'failed' ||
    heartbeatStatus === 'dead'
  const hasWarning = signals.network === 'poor' || signals.audio === 'poor' || heartbeatStatus === 'slow'
  const borderColor = hasCritical ? '#dc3545' : hasWarning ? '#e6a817' : '#28a745'

  const unread = chat?.unreadCount ?? 0
  const messages = chat?.recentMessages ?? []

  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <div style={{ fontWeight: 'bold', fontSize: 15 }}>{presenterName || 'Unknown'}</div>
        {unread > 0 && (
          <button
            onClick={() => setChatOpen(o => !o)}
            style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: 12, padding: '2px 9px', fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}
          >
            {unread} unread
          </button>
        )}
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

      {unread === 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#aaa', cursor: 'default' }}>No chat messages yet</div>
      )}

      {unread > 0 && (
        <button
          onClick={() => setChatOpen(o => !o)}
          style={{ marginTop: 10, background: 'none', border: 'none', color: '#555', fontSize: 12, cursor: 'pointer', padding: 0 }}
        >
          {chatOpen ? '▲ Hide chat' : `▼ Show last ${messages.length} messages`}
        </button>
      )}

      {chatOpen && messages.length > 0 && (
        <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8, maxHeight: 220, overflowY: 'auto' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 'bold', fontSize: 12, color: msg.isAdmin ? '#6f42c1' : '#333' }}>
                {msg.username}{msg.isAdmin ? ' ★' : ''}
              </span>
              <span style={{ fontSize: 12, color: '#555', marginLeft: 6 }}>{msg.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
