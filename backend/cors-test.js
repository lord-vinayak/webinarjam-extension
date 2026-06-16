// Quick validation that CORS middleware works correctly
process.env.ADMIN_SECRET = 'test-secret'
process.env.PORT = '3002'

const { server } = require('./index')

async function testCORS() {
  await new Promise(r => setTimeout(r, 100))

  // Test 1: OPTIONS request should return 204
  console.log('Test 1: OPTIONS request...')
  const optRes = await fetch('http://localhost:3002/session', {
    method: 'OPTIONS',
    headers: { 'Content-Type': 'application/json' }
  })
  console.log(`  Status: ${optRes.status} (expected 204)`)
  console.log(`  CORS header: ${optRes.headers.get('access-control-allow-origin')} (expected *)`)

  // Test 2: POST request should have CORS headers
  console.log('\nTest 2: POST request CORS headers...')
  const postRes = await fetch('http://localhost:3002/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret': 'test-secret'
    },
    body: JSON.stringify({ sessionId: 'test' })
  })
  console.log(`  Status: ${postRes.status} (expected 200)`)
  console.log(`  CORS Allow-Origin: ${postRes.headers.get('access-control-allow-origin')} (expected *)`)
  console.log(`  CORS Allow-Methods: ${postRes.headers.get('access-control-allow-methods')} (expected GET, POST, OPTIONS)`)
  console.log(`  CORS Allow-Headers: ${postRes.headers.get('access-control-allow-headers')} (expected Content-Type, X-Secret)`)

  // Test 3: GET /stream should preserve existing CORS header
  console.log('\nTest 3: SSE /stream CORS headers...')
  const streamRes = await fetch('http://localhost:3002/stream', {
    headers: { 'X-Secret': 'test-secret' }
  })
  console.log(`  Status: ${streamRes.status} (expected 200)`)
  console.log(`  CORS header (set-cookie stream): ${streamRes.headers.get('access-control-allow-origin')} (expected *)`)

  console.log('\n✓ CORS middleware tests completed')
  server.close()
  process.exit(0)
}

testCORS().catch(e => { console.error(e); process.exit(1) })
