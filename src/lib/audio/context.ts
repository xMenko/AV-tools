/**
 * Shared AudioContext. Browsers (especially iOS Safari) only start audio after a user gesture,
 * so call `ensureAudio()` from a click/tap handler.
 */
let ctx: AudioContext | undefined;

export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  return ctx;
}

export async function ensureAudio(session: AudioSession['type'] = 'playback'): Promise<AudioContext> {
  try {
    // 'playback' ignores the iPhone silent switch; 'play-and-record' is needed while the mic is open.
    if (navigator.audioSession) navigator.audioSession.type = session;
  } catch {
    /* not supported */
  }
  const c = getAudioContext();
  if (c.state !== 'running') await c.resume();
  return c;
}

export function isAudioSupported(): boolean {
  return typeof window !== 'undefined' && 'AudioContext' in window;
}
