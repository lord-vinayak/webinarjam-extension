const BACKEND_URL = 'http://localhost:3000'
const SECRET = 'localsecret'

let enabled = false
let unreadCount = 0
let recentMessages = [] // [{username, text, isAdmin, time}], newest first, max 10

// Sync toggle state from storage
chrome.storage.local.get('monitorEnabled', ({ monitorEnabled }) => {
  enabled = !!monitorEnabled
})
chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitorEnabled != null) enabled = !!changes.monitorEnabled.newValue
})

function extractMessage(li) {
  return {
    username: li.querySelector('.chat-username')?.textContent?.trim() || 'Unknown',
    text: li.querySelector('.font-12.lh-headline')?.textContent?.trim() || '',
    isAdmin: li.classList.contains('admin'),
    time: Date.now()
  }
}

function initChatObserver() {
  const chatList = document.querySelector('ul.chat_list')
  if (!chatList) {
    // ul.chat_list not in DOM yet — wait for it
    new MutationObserver((_, obs) => {
      const list = document.querySelector('ul.chat_list')
      if (!list) return
      obs.disconnect()
      initChatObserver()
    }).observe(document.body, { childList: true, subtree: true })
    return
  }

  // Seed recentMessages from existing DOM (DOM order = newest first due to flex-column-reverse)
  recentMessages = [...chatList.querySelectorAll('li.chat_list-chat')]
    .slice(0, 10)
    .map(extractMessage)

  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1 || !node.classList.contains('chat_list-chat')) continue
        recentMessages.unshift(extractMessage(node))
        if (recentMessages.length > 10) recentMessages.pop()
        unreadCount++
      }
    }
  }).observe(chatList, { childList: true })
}

// Defer until DOM exists — content.js runs at document_start where document.body is null
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatObserver)
} else {
  initChatObserver()
}

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== '__WJ_MONITOR_STATS__') return
  if (!enabled) return

  const { signals, sessionId } = event.data
  let presenterName
  try {
    ;({ presenterName } = await chrome.storage.local.get('presenterName'))
  } catch (_) { return } // extension context invalidated (e.g. after reload)

  // Save latest signals so popup can display them
  chrome.storage.local.set({ lastSignals: signals })

  fetch(`${BACKEND_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
    body: JSON.stringify({
      sessionId,
      presenterName: presenterName || 'Unknown',
      timestamp: Date.now(),
      signals: { ...signals, heartbeat: true },
      chat: { unreadCount, recentMessages }
    })
  }).catch(() => {})
})
