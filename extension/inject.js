;(function () {
  const OrigRTC = window.RTCPeerConnection
  let pc = null

  // Capture the RTCPeerConnection WebinarJam creates
  window.RTCPeerConnection = function (...args) {
    pc = new OrigRTC(...args)
    return pc
  }
  // Copy static properties (needed for some platforms)
  Object.assign(window.RTCPeerConnection, OrigRTC)

  async function collectStats() {
    if (!pc) return null

    const signals = {
      network: 'good',
      screenShare: false,
      camera: false,
      audio: 'good',
      webrtcState: pc.connectionState || 'unknown'
    }

    // Network quality from navigator.connection
    const conn = navigator.connection
    if (conn) {
      if (!conn.effectiveType || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
        signals.network = 'offline'
      } else if (conn.effectiveType === '3g' || (conn.downlink != null && conn.downlink < 1)) {
        signals.network = 'poor'
      }
    }

    // Screen share vs camera detection from senders
    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (!track || track.kind !== 'video') continue
      const isScreen = track.contentHint === 'detail' || /screen|display|monitor/i.test(track.label)
      if (isScreen) {
        signals.screenShare = track.enabled && track.readyState === 'live'
      } else {
        signals.camera = track.enabled && track.readyState === 'live'
      }
    }

    // Audio quality from WebRTC stats
    try {
      const report = await pc.getStats()
      report.forEach(s => {
        if (s.type === 'outbound-rtp' && s.kind === 'audio') {
          const loss = (s.packetsLost || 0) / ((s.packetsSent || 0) + 1)
          if (loss > 0.05 || (s.jitter != null && s.jitter > 0.05)) signals.audio = 'poor'
        }
      })
    } catch (_) {}

    return signals
  }

  setInterval(async () => {
    const signals = await collectStats()
    if (!signals) return
    window.postMessage({
      type: '__WJ_MONITOR_STATS__',
      signals,
      sessionId: window.location.pathname
    }, '*')
  }, 1000)
})()
