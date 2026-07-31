interface WebRTCRuntime {
  RTCPeerConnection: typeof globalThis.RTCPeerConnection;
  RTCSessionDescription: typeof globalThis.RTCSessionDescription;
  RTCIceCandidate: typeof globalThis.RTCIceCandidate;
}

let cachedRuntime: WebRTCRuntime | null = null;

export function getWebRTCRuntime(): WebRTCRuntime {
  if (cachedRuntime) {
    return cachedRuntime;
  }

  // 1. Check browser globals (if running in a browser-like or preset environment)
  if (
    typeof globalThis.RTCPeerConnection !== 'undefined' &&
    typeof globalThis.RTCSessionDescription !== 'undefined' &&
    typeof globalThis.RTCIceCandidate !== 'undefined'
  ) {
    cachedRuntime = {
      RTCPeerConnection: globalThis.RTCPeerConnection,
      RTCSessionDescription: globalThis.RTCSessionDescription,
      RTCIceCandidate: globalThis.RTCIceCandidate,
    };
    return cachedRuntime;
  }

  // 2. Load node runtime conditionally
  try {
    const requireFunc = typeof require !== 'undefined' ? require : (globalThis as Record<string, unknown>).require;
    if (!requireFunc || typeof requireFunc !== 'function') {
      throw new Error('Node require function is not available');
    }
    const wrtc = (requireFunc as (id: string) => Record<string, unknown>)('@roamhq/wrtc');
    cachedRuntime = {
      RTCPeerConnection: wrtc.RTCPeerConnection as unknown as typeof globalThis.RTCPeerConnection,
      RTCSessionDescription: wrtc.RTCSessionDescription as unknown as typeof globalThis.RTCSessionDescription,
      RTCIceCandidate: wrtc.RTCIceCandidate as unknown as typeof globalThis.RTCIceCandidate,
    };
    return cachedRuntime;
  } catch (error) {
    throw new Error(
      `WebRTC runtime not found: global constructors are missing, and failed to load '@roamhq/wrtc' (Node environment: ${error instanceof Error ? error.message : 'Unknown'}).`
    );
  }
}
