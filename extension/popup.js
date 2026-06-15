const nameInput = document.getElementById('name')
const toggleBtn = document.getElementById('toggle')
const signalsDiv = document.getElementById('signals')

chrome.storage.local.get(['presenterName', 'monitorEnabled', 'lastSignals'], ({ presenterName, monitorEnabled, lastSignals }) => {
  nameInput.value = presenterName || ''
  renderToggle(!!monitorEnabled)
  if (lastSignals) renderSignals(lastSignals)
})

nameInput.addEventListener('input', () => {
  chrome.storage.local.set({ presenterName: nameInput.value })
})

toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get('monitorEnabled', ({ monitorEnabled }) => {
    const next = !monitorEnabled
    chrome.storage.local.set({ monitorEnabled: next })
    renderToggle(next)
  })
})

chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastSignals) renderSignals(changes.lastSignals.newValue)
  if (changes.monitorEnabled) renderToggle(changes.monitorEnabled.newValue)
})

function renderToggle(enabled) {
  toggleBtn.textContent = enabled ? 'Disable Monitoring' : 'Enable Monitoring'
  toggleBtn.style.background = enabled ? '#dc3545' : '#28a745'
}

function cls(value) {
  if (['good', 'connected'].includes(value)) return 'green'
  if (['poor'].includes(value)) return 'yellow'
  if (['offline', 'disconnected', 'failed', 'unknown'].includes(value)) return 'red'
  if (value === true) return 'green'
  if (value === false) return 'red'
  return 'grey'
}

function label(key, value) {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF'
  return value
}

function renderSignals(signals) {
  const rows = [
    ['Network', signals.network],
    ['Screen Share', signals.screenShare],
    ['Camera', signals.camera],
    ['Audio', signals.audio],
    ['WebRTC', signals.webrtcState],
  ]
  signalsDiv.innerHTML = rows.map(([k, v]) =>
    `<div class="row"><span>${k}</span><span class="${cls(v)}">${label(k, v)}</span></div>`
  ).join('')
}
