/**
 * Fractional-octave bands, base-10 system per IEC 61260-1:
 *   G = 10^(3/10)
 *   b odd  (1, 3):  f_m = 1000 · G^(x/b)
 *   b even (6):     f_m = 1000 · G^((2x+1)/(2b))
 *   edges: f_m · G^(±1/(2b))
 */
export type BandFraction = 1 | 3 | 6;

export interface Band {
  /** exact mid-band frequency, Hz */
  readonly center: number;
  readonly lower: number;
  readonly upper: number;
  /** nominal label, e.g. "31.5", "1k", "12.5k" */
  readonly label: string;
}

const G = 10 ** (3 / 10);

const NOMINAL_THIRD = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000,
  2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];

function formatHz(f: number): string {
  if (f >= 1000) {
    const k = f / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(k >= 10 ? 1 : 2))}k`;
  }
  return `${Number.isInteger(f) ? f : Number(f.toFixed(1))}`;
}

function nominal(center: number, fraction: BandFraction): number {
  if (fraction === 6) {
    // no standard nominal series – round to 2–3 significant digits
    const digits = center >= 100 ? 2 : 1;
    const p = 10 ** (Math.floor(Math.log10(center)) - digits);
    return Math.round(center / p) * p;
  }
  let best = NOMINAL_THIRD[0]!;
  for (const n of NOMINAL_THIRD) if (Math.abs(Math.log(n / center)) < Math.abs(Math.log(best / center))) best = n;
  return best;
}

export interface AxisTick {
  /** position in band slots: band i spans [i, i + 1], its centre is i + 0.5 */
  readonly position: number;
  readonly label: string;
}

/**
 * Axis ticks every octave on the third-octave series 20, 40, 80 … 10k, 20k (exact: 1000 · G^(k/3), k ≡ 1 mod 3).
 * For b = 3 these are band centres, for b = 6 band edges (IEC 61260-1: even-b edges = third-octave centres).
 * Octave bands (b = 1) have no tick on this series – label their centres instead.
 */
export function octaveAxisTicks(bands: readonly Band[]): AxisTick[] {
  const ticks: AxisTick[] = [];
  const same = (a: number, b: number) => Math.abs(Math.log(a / b)) < 1e-6;
  if (bands.length === 0) return ticks;
  const kOf = (f: number) => (3 * Math.log(f / 1000)) / Math.log(G);
  const kMin = Math.floor(kOf(bands[0]!.lower));
  const kMax = Math.ceil(kOf(bands.at(-1)!.upper));
  for (let k = kMin; k <= kMax; k++) {
    if (((k % 3) + 3) % 3 !== 1) continue;
    const f = 1000 * G ** (k / 3);
    const label = formatHz(nominal(f, 3));
    for (let i = 0; i < bands.length; i++) {
      const band = bands[i]!;
      let position: number | undefined;
      if (same(band.center, f)) position = i + 0.5;
      else if (same(band.lower, f)) position = i;
      else if (i === bands.length - 1 && same(band.upper, f)) position = i + 1;
      if (position !== undefined) {
        ticks.push({ position, label });
        break;
      }
    }
  }
  return ticks;
}

/** Bands whose exact centre lies within [fMin, fMax] (5 % tolerance for the nominal limits). */
export function makeBands(fraction: BandFraction, fMin = 20, fMax = 20000): Band[] {
  const result: Band[] = [];
  const b = fraction;
  for (let x = -40; x <= 40; x++) {
    const center = b % 2 === 1 ? 1000 * G ** (x / b) : 1000 * G ** ((2 * x + 1) / (2 * b));
    if (center < fMin * 0.95 || center > fMax * 1.05) continue;
    result.push({
      center,
      lower: center * G ** (-1 / (2 * b)),
      upper: center * G ** (1 / (2 * b)),
      label: formatHz(nominal(center, fraction)),
    });
  }
  return result;
}

export interface BandLevel {
  readonly band: Band;
  /** summed linear power in the band (same unit as the input) */
  readonly power: number;
  /** band width / bin width – below 1 the band is narrower than one FFT bin (low resolution) */
  readonly binsCovered: number;
}

/**
 * Sums a one-sided power spectrum into bands. Each bin k covers [k·Δ − Δ/2, k·Δ + Δ/2] and contributes
 * proportionally to its overlap with the band. DC (k = 0) is ignored.
 * @param power linear power per bin (e.g. 10^(dB/10) of AnalyserNode output)
 * @param binWidth sampleRate / fftSize, Hz
 */
export function aggregateBands(power: ArrayLike<number>, binWidth: number, bands: readonly Band[]): BandLevel[] {
  return bands.map((band) => {
    const first = Math.max(1, Math.floor(band.lower / binWidth - 0.5));
    const last = Math.min(power.length - 1, Math.ceil(band.upper / binWidth + 0.5));
    let sum = 0;
    for (let k = first; k <= last; k++) {
      const lo = (k - 0.5) * binWidth;
      const hi = (k + 0.5) * binWidth;
      const overlap = Math.min(hi, band.upper) - Math.max(lo, band.lower);
      if (overlap > 0) sum += power[k]! * (overlap / binWidth);
    }
    return { band, power: sum, binsCovered: (band.upper - band.lower) / binWidth };
  });
}

/** Converts dB values per bin (e.g. AnalyserNode.getFloatFrequencyData) to linear power, in place into `out`. */
export function dbToPowerInto(db: ArrayLike<number>, out: Float64Array): Float64Array {
  for (let i = 0; i < db.length; i++) {
    const v = db[i]!;
    out[i] = Number.isFinite(v) ? 10 ** (v / 10) : 0;
  }
  return out;
}
