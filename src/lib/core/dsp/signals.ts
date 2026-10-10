import { mulberry32 } from './random';

/** White noise, uniform distribution in [−1, 1). */
export function whiteNoise(length: number, seed = 1): Float32Array<ArrayBuffer> {
  const rnd = mulberry32(seed);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rnd() * 2 - 1;
  return out;
}

/**
 * Pink noise (−3 dB/octave) using Paul Kellet's refined filter (±0.05 dB above 9.2 Hz at 44.1 kHz).
 * Not normalised – use `normalizeToFullScaleRms` afterwards.
 */
export function pinkNoise(length: number, seed = 1): Float32Array<ArrayBuffer> {
  const rnd = mulberry32(seed);
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = rnd() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return out;
}

export interface SweepOptions {
  readonly sampleRate: number;
  /** Hz */
  readonly startFrequency: number;
  /** Hz */
  readonly endFrequency: number;
  /** seconds */
  readonly duration: number;
  /** Raised-cosine fade at start and end, seconds. */
  readonly fade?: number;
}

/**
 * Exponential (logarithmic) sine sweep (Farina):
 *   x(t) = sin(2π·f1·T/ln(f2/f1) · (e^{t·ln(f2/f1)/T} − 1)), peak 1.
 */
export function logSweep(o: SweepOptions): Float32Array<ArrayBuffer> {
  const n = Math.round(o.duration * o.sampleRate);
  const out = new Float32Array(n);
  const k = Math.log(o.endFrequency / o.startFrequency);
  const a = (2 * Math.PI * o.startFrequency * o.duration) / k;
  for (let i = 0; i < n; i++) {
    const t = i / o.sampleRate;
    out[i] = Math.sin(a * (Math.exp((t * k) / o.duration) - 1));
  }
  const fadeSamples = Math.min(Math.floor(n / 2), Math.round((o.fade ?? 0) * o.sampleRate));
  for (let i = 0; i < fadeSamples; i++) {
    const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeSamples);
    out[i] = out[i]! * g;
    out[n - 1 - i] = out[n - 1 - i]! * g;
  }
  return out;
}

/** Sine wave with peak 1. */
export function sine(frequency: number, sampleRate: number, length: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  const w = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < length; i++) out[i] = Math.sin(w * i);
  return out;
}
