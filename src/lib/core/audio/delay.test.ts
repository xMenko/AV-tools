import { describe, expect, it } from 'vitest';
import { point } from '../geometry/point3d';
import { speedOfSound } from '../units/speedOfSound';
import { calculateDelayLine, type DelayField, type DelayLine, type DelaySettings } from './delay';

// Reference values computed with Python (math.sqrt), c(T) = 331.3 · √(1 + T/273.15).
const C20 = 343.21462268256795;
const close = (a: number | undefined, b: number, digits = 9) => {
  expect(a).toBeDefined();
  expect(a!).toBeCloseTo(b, digits);
};

const settings = (overrides: Partial<DelaySettings> = {}): DelaySettings => ({
  temperatureCelsius: 20,
  mainHeight: 10,
  offset: 0,
  systemLatency: 0,
  ...overrides,
});
const field = (x: number, z: number, y = 0, id = 'f'): DelayField => ({ id, name: '', position: point(x, z, y) });
const line = (fields: DelayField[], extra: Partial<DelayLine> = {}): DelayLine => ({
  id: 'L1',
  name: 'L1',
  mode: { kind: 'sourceToSource' },
  fields,
  ...extra,
});

function run(l: DelayLine, s: DelaySettings) {
  const r = calculateDelayLine(l, s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('speedOfSound', () => {
  it('0 °C', () => expect(speedOfSound(0)).toBe(331.3));
  it('20 °C', () => close(speedOfSound(20), C20));
  it('35 °C', () => close(speedOfSound(35), 351.8859440791726));
  it('−10 °C', () => close(speedOfSound(-10), 325.17902206082));
});

describe('delay – source to source', () => {
  it('flat 40 m', () => {
    const r = run(line([field(40, 10)]), settings());
    close(r.fields[0]!.distance, 40);
    close(r.fields[0]!.delay, 0.11654515092439743); // 40 / 343.2146…
  });

  it('includes height difference', () => {
    // Δz = 4 → √(30² + 4²) = 30.265491900843113
    const r = run(line([field(30, 6)]), settings());
    close(r.fields[0]!.distance, 30.265491900843113);
    close(r.fields[0]!.delay, 0.08818240803462221);
  });

  it('includes lateral offset', () => {
    // (30, 2, 5) vs main z = 10 → √(30² + 2² + 5²) = 30.479501308256342
    const r = run(line([field(30, 5, 2)]), settings());
    close(r.fields[0]!.distance, 30.479501308256342);
    close(r.fields[0]!.delay, 0.08880595200177761);
  });

  it('manual speed of sound overrides temperature', () => {
    const r = run(line([field(34, 10)]), settings({ speedOfSoundOverride: 340, temperatureCelsius: 99 }));
    close(r.fields[0]!.delay, 0.1);
    expect(r.speedOfSound).toBe(340);
  });
});

describe('delay – listener reference', () => {
  it('uses the path difference', () => {
    // main (0,0,10), delay (20,0,6), listener (60,0,1.7)
    const mToL = Math.sqrt(60 ** 2 + 8.3 ** 2); // 60.57136287058431
    const dToL = Math.sqrt(40 ** 2 + 4.3 ** 2); // 40.23046109604015
    const r = run(line([field(20, 6)], { mode: { kind: 'listener', listener: point(60, 1.7) } }), settings());
    close(mToL, 60.57136287058431);
    close(r.fields[0]!.distance, mToL - dToL);
    close(r.fields[0]!.delay, (mToL - dToL) / C20);
  });

  it('warns when the listener is in front of the delay', () => {
    const r = run(line([field(40, 6)], { mode: { kind: 'listener', listener: point(10, 1.7) } }), settings());
    expect(r.fields[0]!.delay).toBeUndefined();
    expect(r.fields[0]!.warning).toBe('listenerNotBehindDelay');
    expect(r.summary).toBeUndefined();
  });
});

describe('delay – offsets, latency, summary', () => {
  const base = 0.11654515092439743;

  it('global offset and per-line override', () => {
    const s = settings({ mainHeight: 5, offset: 0.01 });
    close(run(line([field(40, 5)]), s).fields[0]!.delay, base + 0.01);
    close(run(line([field(40, 5)], { offsetOverride: 0.005 }), s).fields[0]!.delay, base + 0.005);
  });

  it('subtracts system latency', () => {
    close(run(line([field(40, 5)]), settings({ mainHeight: 5, systemLatency: 0.002 })).fields[0]!.delay, base - 0.002);
  });

  it('warns when latency exceeds the delay', () => {
    const r = run(line([field(40, 5)]), settings({ mainHeight: 5, systemLatency: 0.2 }));
    expect(r.fields[0]!.delay).toBeUndefined();
    expect(r.fields[0]!.warning).toBe('latencyExceedsDelay');
  });

  it('summary over fields', () => {
    const r = run(line([field(20, 5, 0, 'a'), field(40, 5, 0, 'b'), field(60, 5, 0, 'c')]), settings({ mainHeight: 5 }));
    close(r.summary?.minimum, 0.058272575462198716);
    close(r.summary?.maximum, 0.17481772638659615);
    close(r.summary?.mean, base);
    close(r.summary?.spread, base);
  });

  it('empty line has no summary', () => {
    const r = run(line([]), settings());
    expect(r.fields).toHaveLength(0);
    expect(r.summary).toBeUndefined();
  });
});

describe('delay – validation', () => {
  it('rejects c = 0', () => {
    expect(calculateDelayLine(line([]), settings({ speedOfSoundOverride: 0 }))).toEqual({ ok: false, error: 'invalidSpeedOfSound' });
  });
  it('rejects implausible temperature', () => {
    expect(calculateDelayLine(line([]), settings({ temperatureCelsius: 200 }))).toEqual({ ok: false, error: 'temperatureOutOfRange' });
  });
  it('rejects NaN positions', () => {
    expect(calculateDelayLine(line([field(NaN, 5)]), settings())).toEqual({ ok: false, error: 'nonFiniteInput' });
  });
});
