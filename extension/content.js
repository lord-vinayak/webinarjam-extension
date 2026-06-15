const BACKEND_URL = 'YOUR_RAILWAY_URL'
const SECRET = 'YOUR_ADMIN_SECRET'

let enabled = false

// Sync toggle state from storage
chrome.storage.local.get('monitorEnabled', ({ monitorEnabled }) => {
  enabled = !!monitorEnabled
})
chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitorEnabled != null) enabled = !!changes.monitorEnabled.newValue
})

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== '__WJ_MONITOR_STATS__') return
  if (!enabled) return

  const { signals, sessionId } = event.data
  const { presenterName } = await chrome.storage.local.get('presenterName')

  // Save latest signals so popup can display them
  chrome.storage.local.set({ lastSignals: signals })

  fetch(`${BACKEND_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
    body: JSON.stringify({
      sessionId,
      presenterName: presenterName || 'Unknown',
      timestamp: Date.now(),
      signals: { ...signals, heartbeat: true }
    })
  }).catch(() => {}) // ponytail: silent fail — network issues are visible in the dashboard itself
})
