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
