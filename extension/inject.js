;(function () {
  const OrigRTC = window.RTCPeerConnection
  let pc = null
  let screenSharing = false

  // Intercept getDisplayMedia — most reliable screen share signal,
  // independent of track labels or contentHint which WebinarJam doesn't set predictably
  const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getDisplayMedia = async function (...args) {
    const stream = await origGetDisplayMedia(...args)
    screenSharing = true
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => { screenSharing = false })
    })
    return stream
  }

  // ponytail: Proxy preserves prototype chain and all static props transparently,
  // so WebinarJam's virtual background library can still patch RTCPeerConnection.prototype
  window.RTCPeerConnection = new Proxy(OrigRTC, {
    construct(target, args) {
      pc = new target(...args)
      return pc
    }
  })

  async function collectStats() {
    if (!pc) return null

    const signals = {
      network: 'good',
      screenShare: screenSharing,
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

    // Camera detection from senders (screen share is tracked via getDisplayMedia interception above)
    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (!track || track.kind !== 'video') continue
      signals.camera = track.enabled && track.readyState === 'live'
    }

    // Audio: check if mic track is muted/disabled first, then check quality
    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (!track || track.kind !== 'audio') continue
      if (!track.enabled || track.muted) { signals.audio = 'muted'; break }
    }

    if (signals.audio !== 'muted') {
      try {
        const report = await pc.getStats()
        report.forEach(s => {
          if (s.type === 'outbound-rtp' && s.kind === 'audio') {
            const loss = (s.packetsLost || 0) / ((s.packetsSent || 0) + 1)
            if (loss > 0.05 || (s.jitter != null && s.jitter > 0.05)) signals.audio = 'poor'
          }
        })
      } catch (_) {}
    }

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
