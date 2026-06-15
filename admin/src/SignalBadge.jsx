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
  muted: '#dc3545',
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
