// Safari 16.4+: controls whether Web Audio respects the silent switch.
interface AudioSession {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record';
}
interface Navigator {
  readonly audioSession?: AudioSession;
}

declare const __APP_VERSION__: string;
