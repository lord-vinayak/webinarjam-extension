const express = require('express')

const app = express()
app.use(express.json())

const SECRET = process.env.ADMIN_SECRET
const sessions = {} // { [sessionId]: { ...payload, lastSeen } }
const clients = []  // active SSE response objects

function auth(req, res, next) {
  const secret = req.headers['x-secret'] || req.query.secret
  if (secret !== SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
}

function broadcast() {
  const data = `data: ${JSON.stringify(sessions)}\n\n`
  clients.forEach(res => res.write(data))
}

// Evict sessions silent for >5s
setInterval(() => {
  const now = Date.now()
  let changed = false
  for (const id of Object.keys(sessions)) {
    if (now - sessions[id].lastSeen > 5000) {
      delete sessions[id]
      changed = true
    }
  }
  if (changed) broadcast()
}, 2000)

app.post('/session', auth, (req, res) => {
  const { sessionId } = req.body
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' })
  sessions[sessionId] = { ...req.body, lastSeen: Date.now() }
  broadcast()
  res.json({ ok: true })
})

app.get('/stream', auth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.flushHeaders()

  res.write(`data: ${JSON.stringify(sessions)}\n\n`)
  clients.push(res)

  req.on('close', () => clients.splice(clients.indexOf(res), 1))
})

app.get('/health', (_req, res) => res.json({ ok: true }))

const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`ready on ${process.env.PORT || 3000}`)
)

module.exports = { server }
