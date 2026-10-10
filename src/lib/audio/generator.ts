import { ensureAudio } from './context';
import { dbToGain, maxLevelWithoutClipping, normalizeToFullScaleRms } from '../core/dsp/levels';
import { logSweep, pinkNoise, whiteNoise } from '../core/dsp/signals';
import { polarityPeriod, type PolarityBand } from '../core/dsp/polaritySignal';

export type SignalKind = 'sine' | 'pink' | 'white' | 'sweep' | 'polarity';
export type OutputChannel = 'both' | 'left' | 'right';

export interface GeneratorSettings {
  kind: SignalKind;
  /** Hz, sine only */
  frequency: number;
  /** RMS level in dBFS (AES17: full-scale sine = 0 dBFS) */
  levelDb: number;
  channel: OutputChannel;
  /** seconds, sweep only (plus 0.5 s pause) */
  sweepSeconds: number;
  polarityBand: PolarityBand;
}

const FADE_SECONDS = 0.05;
const NOISE_SECONDS = 8;

interface BufferInfo {
  buffer: AudioBuffer;
  /** highest level without clipping, dBFS */
  maxLevel: number;
}

const bufferCache = new Map<string, BufferInfo>();

function makeBuffer(ctx: BaseAudioContext, key: string, create: () => Float32Array<ArrayBuffer>, normalize: boolean): BufferInfo {
  const cacheKey = `${key}@${ctx.sampleRate}`;
  const cached = bufferCache.get(cacheKey);
  if (cached) return cached;
  const data = create();
  const maxLevel = normalize ? maxLevelWithoutClipping(normalizeToFullScaleRms(data)) : 0;
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.copyToChannel(data, 0);
  const info = { buffer, maxLevel };
  bufferCache.set(cacheKey, info);
  return info;
}

function bufferFor(ctx: BaseAudioContext, s: GeneratorSettings): BufferInfo | undefined {
  const fs = ctx.sampleRate;
  switch (s.kind) {
    case 'pink':
      return makeBuffer(ctx, 'pink', () => pinkNoise(NOISE_SECONDS * fs, 1), true);
    case 'white':
      return makeBuffer(ctx, 'white', () => whiteNoise(NOISE_SECONDS * fs, 1), true);
    case 'sweep':
      return makeBuffer(
        ctx,
        `sweep-${s.sweepSeconds}`,
        () => {
          const sweep = logSweep({ sampleRate: fs, startFrequency: 20, endFrequency: 20000, duration: s.sweepSeconds, fade: 0.02 });
          const out = new Float32Array(sweep.length + Math.round(0.5 * fs));
          out.set(sweep);
          return out;
        },
        false,
      );
    case 'polarity':
      return makeBuffer(ctx, `polarity-${s.polarityBand}`, () => polarityPeriod(s.polarityBand, fs), false);
    case 'sine':
      return undefined;
  }
}

/** Highest level (dBFS) the selected signal can be played at without clipping. */
export function maxLevelFor(kind: SignalKind): number {
  if (kind === 'sine' || kind === 'sweep' || kind === 'polarity') return 0;
  const info = [...bufferCache.entries()].find(([k]) => k.startsWith(`${kind}@`))?.[1];
  // Before the buffer exists: typical crest factor of normalised noise (measured ≈ −9…−11 dB)
  return info?.maxLevel ?? -10;
}

/**
 * Signal generator. All output goes through a fade gain (no clicks) and a channel merger
 * (left / right / both). Level changes are applied smoothly while running.
 */
export class SignalGenerator {
  private ctx?: AudioContext;
  private source?: AudioScheduledSourceNode;
  private level?: GainNode;
  private fade?: GainNode;
  private merger?: ChannelMergerNode;
  private current?: GeneratorSettings;
  running = false;

  async start(settings: GeneratorSettings): Promise<void> {
    this.stopNow();
    const ctx = await ensureAudio('playback');
    this.ctx = ctx;

    const level = ctx.createGain();
    level.gain.value = dbToGain(settings.levelDb);
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE_SECONDS);
    const merger = ctx.createChannelMerger(2);

    let source: AudioScheduledSourceNode;
    if (settings.kind === 'sine') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = settings.frequency;
      source = osc;
    } else {
      const node = ctx.createBufferSource();
      node.buffer = bufferFor(ctx, settings)!.buffer;
      node.loop = true;
      source = node;
    }

    source.connect(level);
    level.connect(fade);
    if (settings.channel !== 'right') fade.connect(merger, 0, 0);
    if (settings.channel !== 'left') fade.connect(merger, 0, 1);
    merger.connect(ctx.destination);
    source.start();

    Object.assign(this, { source, level, fade, merger, current: { ...settings }, running: true });
  }

  /** Applies changes; restarts only if the signal type, channel or buffer changed. */
  async update(settings: GeneratorSettings): Promise<void> {
    if (!this.running || !this.ctx || !this.current) return;
    const c = this.current;
    const needsRestart =
      c.kind !== settings.kind ||
      c.channel !== settings.channel ||
      (settings.kind === 'sweep' && c.sweepSeconds !== settings.sweepSeconds) ||
      (settings.kind === 'polarity' && c.polarityBand !== settings.polarityBand);
    if (needsRestart) {
      await this.start(settings);
      return;
    }
    const t = this.ctx.currentTime;
    this.level?.gain.setTargetAtTime(dbToGain(settings.levelDb), t, 0.02);
    if (this.source instanceof OscillatorNode) this.source.frequency.setTargetAtTime(settings.frequency, t, 0.01);
    this.current = { ...settings };
  }

  stop(): void {
    if (!this.running || !this.ctx || !this.fade || !this.source) return;
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(0, t + FADE_SECONDS);
    const source = this.source;
    const merger = this.merger;
    source.stop(t + FADE_SECONDS + 0.01);
    source.onended = () => merger?.disconnect();
    this.running = false;
    this.source = undefined;
  }

  private stopNow(): void {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.merger?.disconnect();
    this.source = undefined;
    this.running = false;
  }
}

/** Plays a buffer once (used by the polarity check in single-device mode). */
export async function playOnce(data: Float32Array<ArrayBuffer>, levelDb: number): Promise<void> {
  const ctx = await ensureAudio('play-and-record');
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = dbToGain(levelDb);
  src.connect(gain).connect(ctx.destination);
  src.start();
  await new Promise<void>((resolve) => (src.onended = () => resolve()));
  gain.disconnect();
}
