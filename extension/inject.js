;(function () {
  const OrigRTC = window.RTCPeerConnection
  let pc = null
  let screenTrack = null // reference to the original getDisplayMedia video track

  // Intercept getDisplayMedia — most reliable screen share signal,
  // independent of track labels or contentHint which WebinarJam doesn't set predictably
  const origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getDisplayMedia = async function (...args) {
    const stream = await origGetDisplayMedia(...args)
    const tracks = stream.getVideoTracks()
    screenTrack = tracks[0] ?? null
    tracks.forEach(track => {
      track.addEventListener('ended', () => { screenTrack = null })
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

    // --- Screen share detection ---
    // Poll the ORIGINAL getDisplayMedia track's readyState directly.
    // This is reliable regardless of what WebinarJam does downstream
    // (e.g. piping through a canvas for virtual backgrounds), because the
    // original MediaStreamTrack object's readyState always reflects reality.
    const isScreenSharing = screenTrack != null && screenTrack.readyState === 'live'
    if (screenTrack && screenTrack.readyState !== 'live') {
      // Track ended but 'ended' event may not have fired yet — clean up
      screenTrack = null
    }
    signals.screenShare = isScreenSharing

    // --- Camera detection ---
    // WebinarJam transforms video tracks through its pipeline (virtual background canvas),
    // so track IDs don't match. However, WebRTC uses a distinct RTCRtpSender for each
    // active stream (camera and screen share). 
    // We can deduce the camera state by counting active video senders.
    let activeVideoSenders = 0
    for (const sender of pc.getSenders()) {
      const track = sender.track
      if (!track || track.kind !== 'video') continue
      if (track.enabled && track.readyState === 'live') {
        activeVideoSenders++
      }
    }
    
    // If screen share is ON, it accounts for 1 active video sender. 
    // Any >1 active video senders means the camera is also ON.
    // If screen share is OFF, any >0 active video senders means the camera is ON.
    signals.camera = isScreenSharing ? (activeVideoSenders > 1) : (activeVideoSenders > 0)

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
      sessionId: window.location.pathname,
      // ponytail: const at script top-level is not a window property — access by name
      webinarName: (typeof localConfiguration !== 'undefined' ? localConfiguration.webinarName : null) ?? 'Unknown'
    }, '*')
  }, 1000)
})()
