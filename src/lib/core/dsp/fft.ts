/** Smallest power of two ≥ n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place iterative radix-2 complex FFT.
 * @param re real parts (length must be a power of two)
 * @param im imaginary parts (same length)
 * @param inverse inverse transform (result scaled by 1/N)
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length) throw new Error('fft: re/im length mismatch');
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error('fft: length must be a power of two');

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    const half = len >> 1;
    for (let start = 0; start < n; start += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const tRe = re[b]! * curRe - im[b]! * curIm;
        const tIm = re[b]! * curIm + im[b]! * curRe;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

/**
 * Cross-correlation r[k] = Σ_n signal[n + k] · reference[n] for k = 0 … signal.length − reference.length
 * (only lags where the reference fully overlaps the signal). Computed via FFT.
 */
export function crossCorrelate(signal: ArrayLike<number>, reference: ArrayLike<number>): Float64Array {
  const n = signal.length;
  const m = reference.length;
  if (m === 0 || m > n) return new Float64Array(0);
  const size = nextPow2(n + m);
  const aRe = new Float64Array(size);
  const aIm = new Float64Array(size);
  const bRe = new Float64Array(size);
  const bIm = new Float64Array(size);
  for (let i = 0; i < n; i++) aRe[i] = signal[i]!;
  for (let i = 0; i < m; i++) bRe[i] = reference[i]!;
  fft(aRe, aIm);
  fft(bRe, bIm);
  // A · conj(B)
  for (let i = 0; i < size; i++) {
    const re = aRe[i]! * bRe[i]! + aIm[i]! * bIm[i]!;
    const im = aIm[i]! * bRe[i]! - aRe[i]! * bIm[i]!;
    aRe[i] = re;
    aIm[i] = im;
  }
  fft(aRe, aIm, true);
  return aRe.slice(0, n - m + 1);
}
