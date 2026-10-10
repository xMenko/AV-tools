import { describe, expect, it } from 'vitest';
import { ANALYSER_POWER_TO_FULL_SCALE, blackman } from './analyser';
import { fft } from './fft';
import { dbToGain, normalizeToFullScaleRms } from './levels';
import { aggregateBands, makeBands } from './octaveBands';
import { sine, whiteNoise } from './signals';

const FS = 48000;
const N = 16384;

/** Reproduces AnalyserNode scaling (without smoothing): one-sided |X[k]|², X = DFT(x·w)/N. */
function analyserPower(x: Float32Array): Float64Array {
  const w = blackman(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = x[i]! * w[i]!;
  fft(re, im);
  const out = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) out[k] = (re[k]! ** 2 + im[k]! ** 2) / (N * N);
  return out;
}

const dbOf = (p: number) => 10 * Math.log10(p * ANALYSER_POWER_TO_FULL_SCALE);

describe('AnalyserNode scaling', () => {
  it('full-scale 1 kHz sine reads 0 dBFS in the 1 kHz third-octave band', () => {
    const levels = aggregateBands(analyserPower(sine(1000, FS, N)), FS / N, makeBands(3));
    const band = levels.find((l) => l.band.label === '1k')!;
    expect(dbOf(band.power)).toBeCloseTo(0, 1);
  });

  it('white noise at −20 dBFS sums to −20 dBFS over all bands', () => {
    // white noise: little energy below the lowest band edge, so the band sum is the full signal power
    const x = whiteNoise(N, 4);
    normalizeToFullScaleRms(x);
    const g = dbToGain(-20);
    for (let i = 0; i < N; i++) x[i] = x[i]! * g;
    const total = aggregateBands(analyserPower(x), FS / N, makeBands(3, 20, 24000)).reduce((a, l) => a + l.power, 0);
    expect(Math.abs(dbOf(total) - -20)).toBeLessThan(0.5);
  });
});
