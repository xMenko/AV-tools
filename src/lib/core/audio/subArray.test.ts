import { describe, expect, it } from 'vitest';
import { calculateSubArc, calculateSubSpacing, type SubSpacingInput } from './subArray';

// Reference values computed with Python (math), c = 343.21462268256795 m/s (20 °C).
const C20 = 343.21462268256795;
const cabinet = { width: 0.6, height: 0.8, depth: 0.9 };

function spacing(input: Partial<SubSpacingInput>) {
  const r = calculateSubSpacing({ cabinet, orientation: 'width', crossoverFrequency: 100, speedOfSound: C20, ...input });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function arc(count: number, d: number, angle: number) {
  const r = calculateSubArc({ count, spacing: d, openingAngleDegrees: angle, speedOfSound: C20 });
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('sub spacing', () => {
  it('100 Hz crossover', () => {
    const r = spacing({});
    expect(r.wavelength).toBeCloseTo(3.4321462268256795, 9);
    expect(r.maximumSpacing).toBeCloseTo(1.7160731134128397, 9); // λ/2
    expect(r.recommendedSpacing).toBeCloseTo(0.8580365567064199, 9); // λ/4
    expect(r.maximumGap).toBeCloseTo(1.1160731134128397, 9); // λ/2 − 0.6
    expect(r.recommendedGap).toBeCloseTo(0.2580365567064199, 9); // λ/4 − 0.6
    expect(r.cabinetTooLarge).toBe(false);
  });

  it('orientation selects the dimension along the line', () => {
    const r = spacing({ orientation: 'depth', crossoverFrequency: 80 });
    expect(r.cabinetSize).toBe(0.9);
    expect(r.maximumSpacing).toBeCloseTo(2.1450913917660497, 9);
    expect(r.recommendedSpacing).toBeCloseTo(1.0725456958830248, 9);
  });

  it('custom recommended fraction, maximum stays λ/2', () => {
    const r = spacing({ recommendedFraction: 1 / 3 });
    expect(r.recommendedSpacing).toBeCloseTo(3.4321462268256795 / 3, 9);
    expect(r.maximumSpacing).toBeCloseTo(1.7160731134128397, 9);
  });

  it('flags cabinets larger than the maximum spacing', () => {
    const r = spacing({ crossoverFrequency: 400 }); // λ/2 ≈ 0.43 m < 0.6 m
    expect(r.cabinetTooLarge).toBe(true);
    expect(r.maximumGap).toBeLessThan(0);
  });

  it('rejects invalid input', () => {
    const base = { cabinet, orientation: 'width' as const, crossoverFrequency: 100, speedOfSound: C20 };
    expect(calculateSubSpacing({ ...base, crossoverFrequency: 0 })).toEqual({ ok: false, error: 'invalidFrequency' });
    expect(calculateSubSpacing({ ...base, cabinet: { ...cabinet, width: 0 } })).toEqual({ ok: false, error: 'invalidDimensions' });
    expect(calculateSubSpacing({ ...base, recommendedFraction: 0.6 })).toEqual({ ok: false, error: 'invalidFraction' });
  });
});

describe('sub arc delay', () => {
  it('5 subs, 1.2 m, 60° – centre T0, outside largest', () => {
    const r = arc(5, 1.2, 60);
    expect(r.radius).toBeCloseTo(4.8, 9);
    expect(r.centreDistance).toBeCloseTo(4.156921938165306, 9);
    expect(r.lineLength).toBeCloseTo(4.8, 9);
    const expected = [0.001873690744317337, 0.0004945581603277728, 0, 0.0004945581603277728, 0.001873690744317337];
    r.elements.forEach((e, i) => expect(e.delay).toBeCloseTo(expected[i]!, 12));
    expect(r.elements.map((e) => e.index)).toEqual([1, 2, 3, 4, 5]);
    r.elements.forEach((e, i) => expect(e.position).toBeCloseTo([-2.4, -1.2, 0, 1.2, 2.4][i]!, 12));
  });

  it('even count: inner pair is T0', () => {
    // raw: 1.8102968303139253 ms (outer), 0.23640842994977337 ms (inner) → normalised
    const outer = 0.0018102968303139253 - 0.00023640842994977337;
    const r = arc(4, 1.0, 90);
    [outer, 0, 0, outer].forEach((d, i) => expect(r.elements[i]!.delay).toBeCloseTo(d, 12));
  });

  it('symmetric, non-negative, centre zero, outside maximum', () => {
    const delays = arc(9, 0.9, 120).elements.map((e) => e.delay);
    expect(delays.every((d) => d >= 0)).toBe(true);
    delays.forEach((d, i) => expect(d).toBeCloseTo(delays[delays.length - 1 - i]!, 12));
    expect(delays[4]).toBe(0);
    expect(delays[0]).toBeCloseTo(Math.max(...delays), 12);
  });

  it('rejects invalid input', () => {
    const c = C20;
    expect(calculateSubArc({ count: 1, spacing: 1, openingAngleDegrees: 60, speedOfSound: c })).toEqual({ ok: false, error: 'invalidCount' });
    expect(calculateSubArc({ count: 4, spacing: 1, openingAngleDegrees: 0, speedOfSound: c })).toEqual({ ok: false, error: 'invalidAngle' });
    expect(calculateSubArc({ count: 4, spacing: 1, openingAngleDegrees: 190, speedOfSound: c })).toEqual({ ok: false, error: 'invalidAngle' });
    expect(calculateSubArc({ count: 4, spacing: -1, openingAngleDegrees: 60, speedOfSound: c })).toEqual({ ok: false, error: 'invalidSpacing' });
    expect(calculateSubArc({ count: 2.5, spacing: 1, openingAngleDegrees: 60, speedOfSound: c })).toEqual({ ok: false, error: 'invalidCount' });
  });
});
