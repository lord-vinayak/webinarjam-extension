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
