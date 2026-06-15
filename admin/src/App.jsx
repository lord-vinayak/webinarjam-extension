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
