import { type Result, ok, err } from '../result';

// ---------------------------------------------------------------------------
// Spacing ("Zahnlücken-Rechner") — all distances centre to centre (acoustic centre).
// ---------------------------------------------------------------------------

/** Which cabinet dimension lies along the sub line. */
export type CabinetOrientation = 'width' | 'depth' | 'height';

export interface CabinetDimensions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Fixed maximum spacing: λ/2 at the crossover (above it grating lobes appear below the crossover). */
export const MAX_SPACING_FRACTION = 0.5;
/** Default recommended spacing: λ/4 (user-adjustable, 0 < f ≤ 1/2). */
export const DEFAULT_RECOMMENDED_FRACTION = 0.25;

export interface SubSpacingInput {
  readonly cabinet: CabinetDimensions;
  readonly orientation: CabinetOrientation;
  /** Highest frequency the subs reproduce (crossover), Hz. */
  readonly crossoverFrequency: number;
  /** m/s */
  readonly speedOfSound: number;
  /** Recommended spacing as fraction of λ; default 0.25. */
  readonly recommendedFraction?: number;
}

export interface SubSpacingResult {
  /** λ at the crossover, m */
  readonly wavelength: number;
  /** Cabinet size along the line, m */
  readonly cabinetSize: number;
  /** Centre-to-centre spacing, m */
  readonly maximumSpacing: number;
  readonly recommendedSpacing: number;
  /** Edge-to-edge gap = spacing − cabinet size, m (negative → cabinets would overlap) */
  readonly maximumGap: number;
  readonly recommendedGap: number;
  /** Cabinet wider than the maximum spacing: crossover too high for a single row of these cabinets. */
  readonly cabinetTooLarge: boolean;
}

export type SubArrayError =
  | 'invalidFrequency'
  | 'invalidSpeedOfSound'
  | 'invalidDimensions'
  | 'invalidFraction'
  | 'invalidCount'
  | 'invalidSpacing'
  | 'invalidAngle';

export function cabinetSizeAlong(cabinet: CabinetDimensions, orientation: CabinetOrientation): number {
  return cabinet[orientation];
}

/** λ = c / f; spacing = fraction · λ (centre to centre). Cabinet size only feeds the gap and the warning. */
export function calculateSubSpacing(input: SubSpacingInput): Result<SubSpacingResult, SubArrayError> {
  const f = input.crossoverFrequency;
  if (!Number.isFinite(f) || f <= 0) return err('invalidFrequency');
  if (!Number.isFinite(input.speedOfSound) || input.speedOfSound <= 0) return err('invalidSpeedOfSound');
  const { width, height, depth } = input.cabinet;
  if (![width, height, depth].every((d) => Number.isFinite(d) && d > 0)) return err('invalidDimensions');
  const fraction = input.recommendedFraction ?? DEFAULT_RECOMMENDED_FRACTION;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > MAX_SPACING_FRACTION) return err('invalidFraction');

  const wavelength = input.speedOfSound / f;
  const cabinetSize = cabinetSizeAlong(input.cabinet, input.orientation);
  const maximumSpacing = wavelength * MAX_SPACING_FRACTION;
  const recommendedSpacing = wavelength * fraction;
  return ok({
    wavelength,
    cabinetSize,
    maximumSpacing,
    recommendedSpacing,
    maximumGap: maximumSpacing - cabinetSize,
    recommendedGap: recommendedSpacing - cabinetSize,
    cabinetTooLarge: cabinetSize > maximumSpacing,
  });
}

// ---------------------------------------------------------------------------
// Arc delay: emulate a convex arc on a straight line.
// ---------------------------------------------------------------------------

export interface SubArcInput {
  /** ≥ 2 */
  readonly count: number;
  /** Centre-to-centre spacing, m */
  readonly spacing: number;
  /** Total opening angle of the virtual arc, degrees, 0 < θ ≤ 180 */
  readonly openingAngleDegrees: number;
  /** m/s */
  readonly speedOfSound: number;
}

export interface SubArcElement {
  /** 1-based, left to right */
  readonly index: number;
  /** Position relative to the line centre, m */
  readonly position: number;
  /** Seconds; centre sub(s) = 0 */
  readonly delay: number;
}

export interface SubArcResult {
  /** Radius of the virtual arc through the outermost subs, m */
  readonly radius: number;
  /** Distance from the virtual point source to the line, m */
  readonly centreDistance: number;
  /** Centre-to-centre length of the line, m */
  readonly lineLength: number;
  readonly elements: readonly SubArcElement[];
}

/**
 * Virtual point source behind the line, arc through the two outermost subs.
 *   x_i = (i − (n−1)/2) · d,   x_o = (n−1)/2 · d
 *   R = x_o / sin(θ/2),        h = x_o / tan(θ/2)
 *   t_i = (√(x_i² + h²) − h) / c, normalised so the earliest sub is 0
 * → centre sub(s) T0, delay grows towards the outside.
 */
export function calculateSubArc(input: SubArcInput): Result<SubArcResult, SubArrayError> {
  const { count: n, spacing: d, openingAngleDegrees: theta, speedOfSound: c } = input;
  if (!Number.isInteger(n) || n < 2) return err('invalidCount');
  if (!Number.isFinite(d) || d <= 0) return err('invalidSpacing');
  if (!Number.isFinite(theta) || theta <= 0 || theta > 180) return err('invalidAngle');
  if (!Number.isFinite(c) || c <= 0) return err('invalidSpeedOfSound');

  const half = (n - 1) / 2;
  const outer = half * d;
  const halfAngle = (theta * Math.PI) / 360;
  const radius = outer / Math.sin(halfAngle);
  const h = outer / Math.tan(halfAngle);

  const positions = Array.from({ length: n }, (_, i) => (i - half) * d);
  const raw = positions.map((x) => (Math.sqrt(x * x + h * h) - h) / c);
  // Even count: the two inner subs are off-axis – shift so they become T0.
  const earliest = Math.min(...raw);

  return ok({
    radius,
    centreDistance: h,
    lineLength: 2 * outer,
    elements: positions.map((position, i) => ({
      index: i + 1,
      position,
      delay: Math.max(0, raw[i]! - earliest),
    })),
  });
}
