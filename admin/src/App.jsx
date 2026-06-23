import { useState, useEffect, useRef, useMemo } from 'react'
import SessionCard from './SessionCard'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL
const SECRET = import.meta.env.VITE_ADMIN_SECRET

export default function App() {
  const [sessions, setSessions] = useState({})
  const [connected, setConnected] = useState(false)
  const [selectedWebinars, setSelectedWebinars] = useState([])
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

  const webinarNames = useMemo(() => {
    return [
      ...new Set(
        sessionList.map(
          s => s.presenterName || 'Unknown'
        )
      )
    ].sort()
  }, [sessionList])

  const filteredSessions =
    selectedWebinars.length === 0
      ? sessionList
      : sessionList.filter(s =>
          selectedWebinars.includes(
            s.presenterName || 'Unknown'
          )
        )

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

      {/* Webinar Filter */}
      {webinarNames.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            padding: 16,
            borderRadius: 8,
            marginBottom: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: 10,
              fontWeight: 'bold',
              fontSize: 14
            }}
          >
            Filter Webinars
            {selectedWebinars.length > 0 &&
              ` (${selectedWebinars.length} selected)`}
          </label>

          <select
            multiple
            value={selectedWebinars}
            onChange={(e) => {
              const values = Array.from(
                e.target.selectedOptions,
                option => option.value
              )

              setSelectedWebinars(values)
            }}
            style={{
              width: '100%',
              maxWidth: '450px',
              height: '140px',
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #ccc'
            }}
          >
            {webinarNames.map(name => (
              <option
                key={name}
                value={name}
              >
                {name}
              </option>
            ))}
          </select>

          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 10,
              alignItems: 'center'
            }}
          >
            <button
              onClick={() => setSelectedWebinars([])}
              style={{
                padding: '6px 12px',
                border: '1px solid #ccc',
                borderRadius: 4,
                background: '#fff',
                cursor: 'pointer'
              }}
            >
              Clear Filter
            </button>

            <span
              style={{
                fontSize: 12,
                color: '#666'
              }}
            >
              Hold Ctrl (Windows) or Cmd (Mac) to select multiple webinars
            </span>
          </div>
        </div>
      )}

      {/* Sessions */}
      {sessionList.length === 0 ? (
        <p style={{ color: '#888' }}>No active sessions. Waiting for presenters to enable monitoring.</p>
      ) : (
        <div
          style={{
            marginBottom: 10,
            fontSize: 13,
            color: '#666'
          }}
        >
          Showing {filteredSessions.length} of {sessionList.length} sessions
        </div>
      )}

      {filteredSessions.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16
          }}
        >
          {filteredSessions.map(session => (
            <SessionCard
              key={session.sessionId}
              session={session}
            />
          ))}
        </div>
      )}

      {sessionList.length > 0 &&
        filteredSessions.length === 0 && (
          <div
            style={{
              background: '#fff',
              padding: 20,
              borderRadius: 8,
              textAlign: 'center',
              color: '#777'
            }}
          >
            No sessions match the selected webinar filter.
          </div>
        )}
    </div>
  )
}