import { crossCorrelate } from './fft';

export type PolarityStatus = 'positive' | 'negative' | 'unclear' | 'noSignal';

export interface PolarityOptions {
  readonly sampleRate: number;
  /** Lowest frequency of the reference signal, Hz – sets the analysis window (1 / fLow). */
  readonly lowestFrequency: number;
  /** Minimum peak-to-background ratio, dB. Below → 'noSignal'. */
  readonly minSnrDb?: number;
  /** Minimum |main peak| / |largest opposite-sign peak nearby|. Below → 'unclear'. */
  readonly minDominance?: number;
}

export interface PolarityResult {
  readonly status: PolarityStatus;
  /** Main correlation peak relative to the background, dB. */
  readonly snrDb: number;
  /** |main peak| / |largest opposite-sign peak within the window| */
  readonly dominance: number;
  /** Arrival of the reference in the recording, seconds (includes device latency). */
  readonly lag: number;
}

// Noise alone reaches ≈ 13–14 dB (max of ~10⁴ Gaussian samples ≈ 4.5–5 σ), real arrivals reach 30 dB+.
export const POLARITY_DEFAULTS = { minSnrDb: 20, minDominance: 1.3 } as const;

/**
 * Matched-filter polarity detection: cross-correlates the recording with the known reference signal.
 * The sign of the strongest correlation peak is the polarity of the dominant arrival.
 * Phone microphones have unknown polarity themselves → the UI offers a reference measurement on a
 * known-good loudspeaker and compares against it.
 */
export function detectPolarity(
  recording: ArrayLike<number>,
  reference: ArrayLike<number>,
  options: PolarityOptions,
): PolarityResult {
  const minSnrDb = options.minSnrDb ?? POLARITY_DEFAULTS.minSnrDb;
  const minDominance = options.minDominance ?? POLARITY_DEFAULTS.minDominance;
  const corr = crossCorrelate(recording, reference);
  if (corr.length === 0) return { status: 'noSignal', snrDb: -Infinity, dominance: 0, lag: 0 };

  let peakIndex = 0;
  for (let i = 1; i < corr.length; i++) if (Math.abs(corr[i]!) > Math.abs(corr[peakIndex]!)) peakIndex = i;
  const peak = corr[peakIndex]!;

  const window = Math.max(1, Math.round(options.sampleRate / options.lowestFrequency));

  // Largest opposite-sign value close to the main peak
  let opposite = 0;
  const from = Math.max(0, peakIndex - window);
  const to = Math.min(corr.length - 1, peakIndex + window);
  for (let i = from; i <= to; i++) {
    const v = corr[i]!;
    if (Math.sign(v) === -Math.sign(peak)) opposite = Math.max(opposite, Math.abs(v));
  }
  const dominance = opposite > 0 ? Math.abs(peak) / opposite : Infinity;

  // Background: RMS of the correlation outside ±2 windows around the peak
  let sum = 0;
  let count = 0;
  for (let i = 0; i < corr.length; i++) {
    if (Math.abs(i - peakIndex) <= 2 * window) continue;
    sum += corr[i]! * corr[i]!;
    count++;
  }
  const background = count > 0 ? Math.sqrt(sum / count) : 0;
  const snrDb = background > 0 ? 20 * Math.log10(Math.abs(peak) / background) : Infinity;

  const lag = peakIndex / options.sampleRate;
  let status: PolarityStatus;
  if (peak === 0 || snrDb < minSnrDb) status = 'noSignal';
  else if (dominance < minDominance) status = 'unclear';
  else status = peak > 0 ? 'positive' : 'negative';
  return { status, snrDb, dominance, lag };
}

/** Applies a stored microphone reference: if the reference loudspeaker measured 'negative', invert. */
export function applyMicReference(
  status: PolarityStatus,
  reference: 'positive' | 'negative' | undefined,
): PolarityStatus {
  if (reference !== 'negative') return status;
  if (status === 'positive') return 'negative';
  if (status === 'negative') return 'positive';
  return status;
}
