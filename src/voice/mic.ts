// One shared microphone stream and capture AudioContext, opened lazily on the first
// push-to-talk or VAD enable (both happen inside a user gesture).

let streamPromise: Promise<MediaStream> | null = null
let captureCtx: AudioContext | null = null

const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
}

export function getMicStream(): Promise<MediaStream> {
  if (!streamPromise) {
    streamPromise = navigator.mediaDevices.getUserMedia(CONSTRAINTS).then((stream) => {
      // If the device goes away, open a fresh stream next time.
      stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { streamPromise = null }))
      return stream
    })
    streamPromise.catch(() => { streamPromise = null })
  }
  return streamPromise
}

/** AudioContext used for capture (push-to-talk recorder and VAD). */
export function getCaptureContext(): AudioContext {
  if (!captureCtx || captureCtx.state === 'closed') captureCtx = new AudioContext()
  if (captureCtx.state === 'suspended') void captureCtx.resume()
  return captureCtx
}
