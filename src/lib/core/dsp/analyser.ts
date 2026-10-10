/**
 * Scaling of the Web Audio AnalyserNode (spec): X[k] = (1/N) · Σ x[n]·w[n]·e^(−j2πkn/N),
 * Blackman window w with a0 = 0.42, a1 = 0.5, a2 = 0.08; getFloatFrequencyData returns 20·log10|X[k]|.
 *
 * Summing |X[k]|² over the positive bins gives ≈ ½ · σ² · mean(w²) for a signal with variance σ².
 * Dividing by that value for a full-scale sine (σ² = ½) yields levels in dBFS (AES17),
 * so a full-scale sine reads 0 dB in its band and the sum of all bands equals the broadband RMS level.
 */
export const BLACKMAN = { a0: 0.42, a1: 0.5, a2: 0.08 } as const;

/** mean(w²) of the Blackman window = a0² + a1²/2 + a2²/2 */
export const BLACKMAN_POWER_GAIN = BLACKMAN.a0 ** 2 + BLACKMAN.a1 ** 2 / 2 + BLACKMAN.a2 ** 2 / 2;

/** Multiply summed AnalyserNode bin powers by this to get power relative to a full-scale sine. */
export const ANALYSER_POWER_TO_FULL_SCALE = 1 / (0.5 * BLACKMAN_POWER_GAIN * 0.5);

export function blackman(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = (2 * Math.PI * i) / n;
    w[i] = BLACKMAN.a0 - BLACKMAN.a1 * Math.cos(p) + BLACKMAN.a2 * Math.cos(2 * p);
  }
  return w;
}
