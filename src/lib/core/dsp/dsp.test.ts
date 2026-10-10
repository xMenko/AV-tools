import { describe, expect, it } from 'vitest';
import { biquadFilter } from './biquad';
import { crossCorrelate, fft } from './fft';
import { FULL_SCALE_SINE_RMS, maxLevelWithoutClipping, normalizeToFullScaleRms, rmsDbfs } from './levels';
import { aggregateBands, makeBands, octaveAxisTicks } from './octaveBands';
import { applyMicReference, detectPolarity } from './polarity';
import { mulberry32 } from './random';
import { logSweep, pinkNoise, sine, whiteNoise } from './signals';

const FS = 48000;

/** One-sided periodogram (|X|²) of a power-of-two-length signal, rectangular window. */
function periodogram(x: Float32Array): Float64Array {
  const re = Float64Array.from(x);
  const im = new Float64Array(x.length);
  fft(re, im);
  const out = new Float64Array(x.length / 2);
  for (let k = 0; k < out.length; k++) out[k] = re[k]! ** 2 + im[k]! ** 2;
  return out;
}

const db = (p: number) => 10 * Math.log10(p);

describe('fft', () => {
  it('matches a naive DFT', () => {
    const rnd = mulberry32(7);
    const n = 16;
    const x = Array.from({ length: n }, () => rnd() - 0.5);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let sr = 0, si = 0;
      for (let t = 0; t < n; t++) {
        sr += x[t]! * Math.cos((-2 * Math.PI * k * t) / n);
        si += x[t]! * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(sr, 10);
      expect(im[k]).toBeCloseTo(si, 10);
    }
  });

  it('inverse restores the input', () => {
    const re = Float64Array.from([1, 2, 3, 4, 0, -1, 0.5, 2]);
    const im = new Float64Array(8);
    const copy = re.slice();
    fft(re, im);
    fft(re, im, true);
    copy.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 12));
  });

  it('cross-correlation matches the naive sum', () => {
    const rnd = mulberry32(3);
    const s = Array.from({ length: 40 }, () => rnd() - 0.5);
    const r = Array.from({ length: 9 }, () => rnd() - 0.5);
    const c = crossCorrelate(s, r);
    expect(c.length).toBe(32);
    for (let k = 0; k < c.length; k++) {
      let sum = 0;
      for (let n = 0; n < r.length; n++) sum += s[n + k]! * r[n]!;
      expect(c[k]).toBeCloseTo(sum, 10);
    }
  });
});

describe('levels', () => {
  it('full-scale sine is 0 dBFS (AES17)', () => {
    expect(rmsDbfs(sine(1000, FS, FS))).toBeCloseTo(0, 3);
  });
  it('normalisation to 0 dBFS RMS and headroom', () => {
    const x = pinkNoise(FS * 2, 5);
    const p = normalizeToFullScaleRms(x);
    expect(rmsDbfs(x)).toBeCloseTo(0, 6);
    expect(p).toBeGreaterThan(FULL_SCALE_SINE_RMS * 2); // crest factor of pink noise ≫ sine
    expect(maxLevelWithoutClipping(p)).toBeLessThan(-6);
  });
});

describe('octave bands', () => {
  it('third-octave set 20 Hz – 20 kHz', () => {
    const b = makeBands(3);
    expect(b).toHaveLength(31);
    expect(b[0]!.label).toBe('20');
    expect(b.at(-1)!.label).toBe('20k');
    expect(b.find((x) => x.label === '1k')!.center).toBeCloseTo(1000, 9);
    expect(b.map((x) => x.label)).toContain('31.5');
    expect(b.map((x) => x.label)).toContain('12.5k');
    for (let i = 0; i < b.length - 1; i++) expect(b[i]!.upper).toBeCloseTo(b[i + 1]!.lower, 9);
  });

  it('octave set', () => {
    expect(makeBands(1).map((x) => x.label)).toEqual(['31.5', '63', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']);
  });

  it('sixth-octave bands are contiguous and twice as many', () => {
    const b = makeBands(6);
    expect(b.length).toBeGreaterThanOrEqual(60);
    for (let i = 0; i < b.length - 1; i++) expect(b[i]!.upper).toBeCloseTo(b[i + 1]!.lower, 9);
  });

  // Reference: IEC 61260-1 – for b = 6 the band edges 1000 · G^(k/6) (k even) coincide with the third-octave
  // centres; 20 Hz = 1000 · G^(-17/3) ≈ 19.95 Hz, 20 kHz = 1000 · G^(13/3) ≈ 19.95 kHz (nominal labels).
  const OCTAVE_SERIES = ['20', '40', '80', '160', '315', '630', '1.25k', '2.5k', '5k', '10k', '20k'];

  it('axis ticks for sixth-octave bands sit on band edges 20, 40, 80 …', () => {
    const b = makeBands(6);
    const t = octaveAxisTicks(b);
    expect(t.map((x) => x.label)).toEqual(OCTAVE_SERIES);
    expect(t.map((x) => x.position)).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60]);
    expect(b).toHaveLength(60);
    expect(b[0]!.lower).toBeCloseTo(1000 * 10 ** (-1.7), 9); // 19.95 Hz
  });

  it('axis ticks for third-octave bands sit on band centres', () => {
    const t = octaveAxisTicks(makeBands(3));
    expect(t.map((x) => x.label)).toEqual(OCTAVE_SERIES);
    expect(t.map((x) => x.position)).toEqual([0.5, 3.5, 6.5, 9.5, 12.5, 15.5, 18.5, 21.5, 24.5, 27.5, 30.5]);
  });

  it('octave bands have no ticks on the 20 Hz series', () => {
    expect(octaveAxisTicks(makeBands(1))).toEqual([]);
  });

  it('a bin-centred 1 kHz sine lands in the 1 kHz band', () => {
    const n = 2 ** 14;
    const binWidth = FS / n;
    const f = Math.round(1000 / binWidth) * binWidth;
    const levels = aggregateBands(periodogram(sine(f, FS, n)), binWidth, makeBands(3));
    const total = levels.reduce((a, l) => a + l.power, 0);
    expect(levels.find((l) => l.band.label === '1k')!.power / total).toBeGreaterThan(0.99);
  });

  it('white noise rises ≈ 1 dB per third octave', () => {
    const n = 2 ** 18;
    const levels = aggregateBands(periodogram(whiteNoise(n, 11)), FS / n, makeBands(3, 100, 10000));
    const y = levels.map((l) => db(l.power));
    const x = y.map((_, i) => i);
    const mx = x.reduce((a, b) => a + b) / x.length;
    const my = y.reduce((a, b) => a + b) / y.length;
    const slope = x.reduce((a, xi, i) => a + (xi - mx) * (y[i]! - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
    expect(slope).toBeGreaterThan(0.9);
    expect(slope).toBeLessThan(1.1);
  });

  it('pink noise has equal energy per octave (±1.5 dB, 63 Hz – 8 kHz)', () => {
    const n = 2 ** 18;
    const levels = aggregateBands(periodogram(pinkNoise(n, 3)), FS / n, makeBands(1, 63, 8000)).map((l) => db(l.power));
    const mean = levels.reduce((a, b) => a + b) / levels.length;
    levels.forEach((l) => expect(Math.abs(l - mean)).toBeLessThan(1.5));
  });
});

describe('log sweep', () => {
  it('has the requested length, fades and keeps its energy inside the band', () => {
    const s = logSweep({ sampleRate: FS, startFrequency: 200, endFrequency: 8000, duration: 0.5, fade: 0.01 });
    expect(s.length).toBe(24000);
    expect(Math.abs(s[0]!)).toBeLessThan(1e-6);
    expect(Math.abs(s.at(-1)!)).toBeLessThan(1e-2);
    const n = 2 ** 15;
    const padded = new Float32Array(n);
    padded.set(s);
    const p = periodogram(padded);
    const binWidth = FS / n;
    let inside = 0, total = 0;
    p.forEach((v, k) => {
      total += v;
      if (k * binWidth >= 150 && k * binWidth <= 9000) inside += v;
    });
    expect(inside / total).toBeGreaterThan(0.97);
  });
});

describe('polarity', () => {
  const ref = logSweep({ sampleRate: FS, startFrequency: 300, endFrequency: 8000, duration: 0.5, fade: 0.01 });
  const opts = { sampleRate: FS, lowestFrequency: 300 };

  function recording(gain: number, delaySeconds: number, noiseDb: number, transform?: (x: Float32Array) => Float32Array) {
    const out = new Float32Array(Math.round(1.5 * FS));
    const signal = transform ? transform(ref) : ref;
    const offset = Math.round(delaySeconds * FS);
    for (let i = 0; i < signal.length && offset + i < out.length; i++) out[offset + i] = gain * signal[i]!;
    const noise = whiteNoise(out.length, 99);
    const g = 10 ** (noiseDb / 20);
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + g * noise[i]!;
    return out;
  }

  it('detects positive polarity and the arrival time', () => {
    const r = detectPolarity(recording(0.3, 0.3, -30), ref, opts);
    expect(r.status).toBe('positive');
    expect(r.lag).toBeCloseTo(0.3, 3);
  });

  it('detects inverted polarity', () => {
    expect(detectPolarity(recording(-0.3, 0.42, -30), ref, opts).status).toBe('negative');
  });

  it('works through a loudspeaker-like band-pass (HP 400 Hz, LP 6 kHz) and an echo', () => {
    const speaker = (x: Float32Array) => {
      const bp = biquadFilter(biquadFilter(x, 'highpass', 400, FS), 'lowpass', 6000, FS);
      const out = bp.slice();
      const echo = Math.round(0.012 * FS);
      for (let i = echo; i < out.length; i++) out[i] = out[i]! + 0.4 * bp[i - echo]!;
      return out;
    };
    expect(detectPolarity(recording(0.2, 0.2, -35, speaker), ref, opts).status).toBe('positive');
    expect(detectPolarity(recording(-0.2, 0.2, -35, speaker), ref, opts).status).toBe('negative');
  });

  it('works for a subwoofer band (40–200 Hz sweep through LP 120 Hz)', () => {
    const subRef = logSweep({ sampleRate: FS, startFrequency: 40, endFrequency: 200, duration: 0.5, fade: 0.02 });
    const out = new Float32Array(Math.round(1.5 * FS));
    const filtered = biquadFilter(subRef, 'lowpass', 120, FS);
    filtered.forEach((v, i) => (out[i + 9600] = -0.3 * v));
    const r = detectPolarity(out, subRef, { sampleRate: FS, lowestFrequency: 40 });
    expect(r.status).toBe('negative');
  });

  it('reports noSignal for noise only', () => {
    expect(detectPolarity(whiteNoise(Math.round(1.5 * FS), 5), ref, opts).status).toBe('noSignal');
  });

  it('mic reference inverts the interpretation', () => {
    expect(applyMicReference('positive', 'negative')).toBe('negative');
    expect(applyMicReference('negative', 'negative')).toBe('positive');
    expect(applyMicReference('positive', 'positive')).toBe('positive');
    expect(applyMicReference('unclear', 'negative')).toBe('unclear');
  });
});
