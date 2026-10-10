import { ensureAudio } from './context';

export interface Microphone {
  readonly context: AudioContext;
  readonly source: MediaStreamAudioSourceNode;
  readonly stream: MediaStream;
  close(): void;
}

export type MicrophoneError = 'unsupported' | 'denied' | 'notFound' | 'insecure' | 'unknown';

/**
 * Opens the microphone with all voice processing disabled (measurement use).
 * Audio is processed in memory only – never stored or transmitted.
 */
export async function openMicrophone(): Promise<{ ok: true; mic: Microphone } | { ok: false; error: MicrophoneError }> {
  if (!window.isSecureContext) return { ok: false, error: 'insecure' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, error: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
      video: false,
    });
    const context = await ensureAudio('play-and-record');
    const source = context.createMediaStreamSource(stream);
    return {
      ok: true,
      mic: {
        context,
        source,
        stream,
        close() {
          source.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          try {
            if (navigator.audioSession) navigator.audioSession.type = 'playback';
          } catch {
            /* ignore */
          }
        },
      },
    };
  } catch (e) {
    const name = e instanceof DOMException ? e.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, error: 'denied' };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { ok: false, error: 'notFound' };
    return { ok: false, error: 'unknown' };
  }
}

export const MICROPHONE_ERROR_TEXT: Record<MicrophoneError, string> = {
  unsupported: 'Dieser Browser unterstützt keinen Mikrofonzugriff.',
  denied: 'Mikrofonzugriff wurde verweigert. Bitte in den Einstellungen des Browsers erlauben.',
  notFound: 'Kein Mikrofon gefunden.',
  insecure: 'Mikrofon nur über HTTPS verfügbar.',
  unknown: 'Mikrofon konnte nicht geöffnet werden.',
};
