/**
 * Level conventions (AES17): 0 dBFS = RMS of a full-scale sine (peak 1.0 → RMS 1/√2).
 * All generator levels in the app are RMS levels in this convention.
 */
export const FULL_SCALE_SINE_RMS = Math.SQRT1_2;

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (gain: number): number => 20 * Math.log10(gain);
export const powerToDb = (power: number): number => 10 * Math.log10(power);

export function rms(x: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i]! * x[i]!;
  return x.length ? Math.sqrt(sum / x.length) : 0;
}

export function peak(x: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

/** RMS level in dBFS (AES17) of a sample block. */
export function rmsDbfs(x: ArrayLike<number>): number {
  return gainToDb(rms(x) / FULL_SCALE_SINE_RMS);
}

/** Scales a buffer in place so that its RMS equals 0 dBFS (AES17). Returns the resulting peak. */
export function normalizeToFullScaleRms(x: Float32Array): number {
  const r = rms(x);
  if (r === 0) return 0;
  const k = FULL_SCALE_SINE_RMS / r;
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * k;
  return peak(x);
}

/**
 * Highest RMS level (dBFS, AES17) a signal can be played at without clipping,
 * given its peak after `normalizeToFullScaleRms`.
 */
export function maxLevelWithoutClipping(normalizedPeak: number): number {
  return normalizedPeak > 0 ? -gainToDb(normalizedPeak) : Infinity;
}
