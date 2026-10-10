import { logSweep } from './signals';

/**
 * The polarity test signal shared by sender (generator) and receiver (polarity check):
 * a 0.5 s log sweep, repeated every 1 s. Any 1.6 s recording contains one complete sweep.
 */
export type PolarityBand = 'midHigh' | 'low';

export const POLARITY_BANDS: Record<PolarityBand, { start: number; end: number; label: string }> = {
  midHigh: { start: 300, end: 8000, label: 'Mitte/Hoch (300 Hz – 8 kHz)' },
  low: { start: 40, end: 200, label: 'Sub/Low (40 – 200 Hz)' },
};

export const POLARITY_SWEEP_SECONDS = 0.5;
export const POLARITY_PERIOD_SECONDS = 1.0;
/** Receiver capture length: period + sweep + margin. */
export const POLARITY_CAPTURE_SECONDS = 1.6;

export function polarityReference(band: PolarityBand, sampleRate: number): Float32Array<ArrayBuffer> {
  const b = POLARITY_BANDS[band];
  return logSweep({
    sampleRate,
    startFrequency: b.start,
    endFrequency: b.end,
    duration: POLARITY_SWEEP_SECONDS,
    fade: band === 'low' ? 0.02 : 0.01,
  });
}

/** One period of the repeating sender signal: sweep followed by silence. */
export function polarityPeriod(band: PolarityBand, sampleRate: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(Math.round(POLARITY_PERIOD_SECONDS * sampleRate));
  out.set(polarityReference(band, sampleRate));
  return out;
}
