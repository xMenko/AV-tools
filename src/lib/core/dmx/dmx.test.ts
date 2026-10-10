import { describe, expect, it } from 'vitest';
import { artNetAddress, maxUniverse } from './artnet';
import { DEFAULT_DIP_PROFILE, addressToDip, dipOnSwitches, dipPositions, dipRange, dipToAddress, type DipProfile } from './dip';
import { alignUp, calculatePatch, type PatchGroup, type PatchOptions, type PatchResult } from './patch';

// All expectations below are hand calculations; the arithmetic is written out in the comments.

const opts = (o: Partial<PatchOptions> = {}): PatchOptions => ({
  alignStep: 1,
  alignScope: 'device',
  placement: 'contiguous',
  reserved: [],
  ...o,
});
const group = (id: string, channels: number, count: number, extra: Partial<PatchGroup> = {}): PatchGroup => ({
  id,
  channels,
  count,
  universe: 1,
  gap: 0,
  ...extra,
});
function run(groups: PatchGroup[], o: Partial<PatchOptions> = {}): PatchResult {
  const r = calculatePatch(groups, opts(o));
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const starts = (r: PatchResult, gi = 0) => r.groups[gi]!.fixtures.map((f) => [f.universe, f.start]);

describe('alignUp', () => {
  // grid 1, 11, 21 …: 17 → 21, 21 → 21, 1 → 1
  it('grid 10', () => {
    expect(alignUp(17, 10)).toBe(21);
    expect(alignUp(21, 10)).toBe(21);
    expect(alignUp(1, 10)).toBe(1);
    expect(alignUp(22, 10)).toBe(31);
  });
  it('step 1 = no alignment', () => expect(alignUp(17, 1)).toBe(17));
});

describe('patch – automatic addresses', () => {
  it('consecutive fixtures: 4 × 16 ch → 1, 17, 33, 49 (end 64)', () => {
    const r = run([group('a', 16, 4)]);
    expect(starts(r)).toEqual([[1, 1], [1, 17], [1, 33], [1, 49]]);
    expect(r.groups[0]!.fixtures.at(-1)!.end).toBe(64);
    expect(r.groups[0]!.split).toBe(false);
  });

  it('gap: 3 × 16 ch, gap 2 → 1, 19, 37 (1 + 16 + 2 = 19)', () => {
    expect(starts(run([group('a', 16, 3, { gap: 2 })]))).toEqual([[1, 1], [1, 19], [1, 37]]);
  });

  it('alignment x01/x11 per fixture: 3 × 16 ch → 1, 21, 41', () => {
    expect(starts(run([group('a', 16, 3)], { alignStep: 10 }))).toEqual([[1, 1], [1, 21], [1, 41]]);
  });

  it('alignment per group: only the first fixture on the grid', () => {
    // reserved 1–5 → first free on grid 10 is 11; then 11 + 16 = 27, 43
    const r = run([group('a', 16, 3)], { alignStep: 10, alignScope: 'group', reserved: [{ universe: 1, from: 1, to: 5 }] });
    expect(starts(r)).toEqual([[1, 11], [1, 27], [1, 43]]);
  });

  it('alignment per group: the first fixture in the next universe is on the grid again', () => {
    // 32 × 16 fill universe 1; universe 2 reserved 1–3 → 4 → grid 10 → 11
    const r = run([group('a', 16, 33)], { alignStep: 10, alignScope: 'group', reserved: [{ universe: 2, from: 1, to: 3 }] });
    expect(r.groups[0]!.fixtures[32]).toMatchObject({ universe: 2, start: 11 });
  });

  it('exact fit: 32 × 16 ch fill universe 1 (last 497–512), the 33rd starts universe 2 at 1', () => {
    const r = run([group('a', 16, 33)]);
    const f = r.groups[0]!.fixtures;
    expect(f[31]).toMatchObject({ universe: 1, start: 497, end: 512 });
    expect(f[32]).toMatchObject({ universe: 2, start: 1, end: 16 });
    expect(r.groups[0]!.split).toBe(true);
  });

  it('never crosses 512: 21 × 25 ch → 20 fit (end 500), the 21st goes to universe 2', () => {
    // 20 · 25 = 500; 501 + 24 = 525 > 512
    const f = run([group('a', 25, 21)]).groups[0]!.fixtures;
    expect(f[19]).toMatchObject({ universe: 1, start: 476, end: 500 });
    expect(f[20]).toMatchObject({ universe: 2, start: 1, end: 25 });
    for (const x of f) expect(x.end).toBeLessThanOrEqual(512);
  });

  it('reserved range is skipped: reserved 1–20 → 21, 37; with grid 10 → 21, 41', () => {
    const reserved = [{ universe: 1, from: 1, to: 20 }];
    expect(starts(run([group('a', 16, 2)], { reserved }))).toEqual([[1, 21], [1, 37]]);
    expect(starts(run([group('a', 16, 2)], { reserved, alignStep: 10 }))).toEqual([[1, 21], [1, 41]]);
  });

  it('next group continues after the previous one', () => {
    const r = run([group('a', 16, 2), group('b', 8, 2)]);
    expect(starts(r, 1)).toEqual([[1, 33], [1, 41]]);
    expect(r.groups[1]!.fixtures.map((f) => f.number)).toEqual([3, 4]);
  });

  it('gaps of a group stay free for later groups (all placements)', () => {
    // a: 1–10, 21–30, 41–50 (gaps 11–20, 31–40) → b starts at 51
    for (const placement of ['contiguous', 'afterLast', 'fill'] as const) {
      const r = run([group('a', 10, 3, { gap: 10 }), group('b', 5, 2)], { placement });
      expect(starts(r, 1)).toEqual([[1, 51], [1, 56]]);
      expect(r.universes).toEqual([{ universe: 1, used: 40, gaps: 20, reserved: 0, free: 452 }]);
    }
  });

  it('target universe is respected', () => {
    expect(starts(run([group('a', 10, 2, { universe: 3 })]))).toEqual([[3, 1], [3, 11]]);
  });
});

describe('patch – placement of automatic groups', () => {
  // fixed 41–50; auto 3 × 20 ch
  const groups = () => [group('fix', 10, 1, { startAddress: 41 }), group('a', 20, 3)];

  it('fill: every fixture takes the lowest free address → 1, 21, 51', () => {
    expect(starts(run(groups(), { placement: 'fill' }), 1)).toEqual([[1, 1], [1, 21], [1, 51]]);
  });

  it('contiguous: lowest block for all three (1–60 would hit 41) → 51, 71, 91', () => {
    expect(starts(run(groups(), { placement: 'contiguous' }), 1)).toEqual([[1, 51], [1, 71], [1, 91]]);
  });

  it('contiguous: a small group still fills the hole before a fixed group', () => {
    // 2 × 20 = 1–40 fits before 41
    const r = run([group('fix', 10, 1, { startAddress: 41 }), group('a', 20, 2)], { placement: 'contiguous' });
    expect(starts(r, 1)).toEqual([[1, 1], [1, 21]]);
  });

  it('afterLast: behind the highest fixture address, even if there is room before', () => {
    const r = run([group('fix', 10, 1, { startAddress: 41 }), group('a', 20, 2)], { placement: 'afterLast' });
    expect(starts(r, 1)).toEqual([[1, 51], [1, 71]]);
  });

  it('automatic fixtures avoid a fixed group, independent of list order', () => {
    // fixed 101–110, 111–120; auto 8 × 16 ch
    const fixed = group('fix', 10, 2, { startAddress: 101 });
    const auto = group('a', 16, 8);
    // fill: 1 … 81–96, then 97–112 would hit 101 → 121, 137
    const fill = [[1, 1], [1, 17], [1, 33], [1, 49], [1, 65], [1, 81], [1, 121], [1, 137]];
    expect(starts(run([auto, fixed], { placement: 'fill' }), 0)).toEqual(fill);
    expect(starts(run([fixed, auto], { placement: 'fill' }), 1)).toEqual(fill);
    // contiguous: 8 · 16 = 128 addresses do not fit below 101 → 121 … 233
    const block = [121, 137, 153, 169, 185, 201, 217, 233].map((a) => [1, a]);
    expect(starts(run([auto, fixed], { placement: 'contiguous' }), 0)).toEqual(block);
    // numbering follows the list, not the address
    expect(run([auto, fixed]).groups[1]!.fixtures[0]!.number).toBe(9);
  });
});

describe('patch – keeping groups together', () => {
  // a: 20 × 16 = 1–320; b: 10 × 20 = 200 > 192 free (321–512)
  const groups = (keepTogether: boolean) => [group('a', 16, 20), group('b', 20, 10, { keepTogether })];

  it('split (default): 9 fixtures 321 … 481–500 in universe 1, the 10th in universe 2', () => {
    // 321 + 20 · 8 = 481; 501 + 19 = 520 > 512
    const g = run(groups(false)).groups[1]!;
    expect(g.fixtures.filter((f) => f.universe === 1)).toHaveLength(9);
    expect(g.fixtures[8]).toMatchObject({ universe: 1, start: 481, end: 500 });
    expect(g.fixtures[9]).toMatchObject({ universe: 2, start: 1 });
    expect(g.split).toBe(true);
  });

  it('keep together: the whole group moves to universe 2 (1 … 181)', () => {
    const g = run(groups(true)).groups[1]!;
    expect(g.fixtures.map((f) => f.universe)).toEqual(new Array(10).fill(2));
    expect(g.fixtures[0]!.start).toBe(1);
    expect(g.fixtures[9]!.start).toBe(181);
    expect(g.split).toBe(false);
  });

  it('keep together, but larger than a universe: split anyway (40 × 16 = 640 > 512)', () => {
    const g = run([group('a', 16, 40, { keepTogether: true })]).groups[0]!;
    expect(g.fixtures.filter((f) => f.universe === 1)).toHaveLength(32);
    expect(g.split).toBe(true);
  });
});

describe('patch – fixed start addresses', () => {
  it('overlapping fixed groups are reported, not moved', () => {
    // A: 1–10, 11–20; B: 15–19 → overlap 15–19
    const r = run([group('A', 10, 2, { startAddress: 1 }), group('B', 5, 1, { startAddress: 15 })]);
    expect(starts(r, 1)).toEqual([[1, 15]]);
    expect(r.conflicts).toEqual([{ universe: 1, groupId: 'A', with: { kind: 'group', groupId: 'B' }, from: 15, to: 19 }]);
  });

  it('overlap spanning several fixtures is one conflict with the full range', () => {
    // A: 1–10, 11–20, 21–30; B: 5–24 → overlaps 5–10, 11–20, 21–24 → 5–24
    const r = run([group('A', 10, 3, { startAddress: 1 }), group('B', 20, 1, { startAddress: 5 })]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ from: 5, to: 24 });
  });

  it('three overlapping fixed groups: one conflict per pair', () => {
    // A 1–10, B 5–14, C 8–17 → A/B 5–10, A/C 8–10, B/C 8–14
    const r = run([group('A', 10, 1, { startAddress: 1 }), group('B', 10, 1, { startAddress: 5 }), group('C', 10, 1, { startAddress: 8 })]);
    expect(r.conflicts.map((c) => [c.groupId, c.with.kind === 'group' && c.with.groupId, c.from, c.to])).toEqual([
      ['A', 'B', 5, 10],
      ['A', 'C', 8, 10],
      ['B', 'C', 8, 14],
    ]);
  });

  it('groups with the same id are still checked against each other', () => {
    const r = run([group('x', 10, 1, { startAddress: 1 }), group('x', 10, 1, { startAddress: 5 })]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ from: 5, to: 10 });
  });

  it('fixed group in a reserved range is a conflict', () => {
    const r = run([group('A', 8, 1, { startAddress: 10 })], { reserved: [{ universe: 1, from: 1, to: 20 }] });
    expect(r.conflicts).toEqual([{ universe: 1, groupId: 'A', with: { kind: 'reserved', index: 0 }, from: 10, to: 17 }]);
  });

  it('start too high: 510 + 4 − 1 = 513 > 512', () => {
    const g = run([group('A', 4, 1, { startAddress: 510 })]).groups[0]!;
    expect(g.issue).toBe('startTooHigh');
    expect(g.fixtures).toHaveLength(0);
    expect(g.unplaced).toBe(1);
  });

  it('fixed group overflow continues at the first free address of the next universe', () => {
    // 505–508, 509–512, then universe 2: reserved 1–10 → 11–14
    const r = run([group('A', 4, 3, { startAddress: 505 })], { reserved: [{ universe: 2, from: 1, to: 10 }] });
    expect(starts(r)).toEqual([[1, 505], [1, 509], [2, 11]]);
    expect(r.groups[0]!.split).toBe(true);
  });

  it('gap is not kept at a universe break', () => {
    // 501–506, next would be 509–514 → universe 2: 1–6, 9–14 (gap 7–8)
    const r = run([group('A', 6, 3, { startAddress: 501, gap: 2 })]);
    expect(starts(r)).toEqual([[1, 501], [2, 1], [2, 9]]);
    expect(r.universes).toEqual([
      { universe: 1, used: 6, gaps: 0, reserved: 0, free: 506 },
      { universe: 2, used: 12, gaps: 2, reserved: 0, free: 498 },
    ]);
  });

  it('fixed group with grid: later fixtures aligned, the first stays as entered', () => {
    // 3–18, then 19 → 21, 37 → 41
    expect(starts(run([group('A', 16, 3, { startAddress: 3 })], { alignStep: 10 }))).toEqual([[1, 3], [1, 21], [1, 41]]);
  });
});

describe('patch – usage and limits', () => {
  it('usage per universe: 64 used, 10 reserved, 438 free', () => {
    // 4 × 16 = 64; reserved 100–109 = 10; 512 − 74 = 438
    const r = run([group('a', 16, 4)], { reserved: [{ universe: 1, from: 100, to: 109 }] });
    expect(r.universes).toEqual([{ universe: 1, used: 64, gaps: 0, reserved: 10, free: 438 }]);
  });

  it('reserved addresses used by a conflicting fixed group count as used', () => {
    const r = run([group('A', 8, 1, { startAddress: 10 })], { reserved: [{ universe: 1, from: 1, to: 20 }] });
    // fixture 10–17 = 8 used; reserved 1–9, 18–20 = 12
    expect(r.universes).toEqual([{ universe: 1, used: 8, gaps: 0, reserved: 12, free: 492 }]);
  });

  it('no universe left after the last Art-Net universe', () => {
    const last = maxUniverse(0); // 32768
    const g = run([group('a', 512, 2, { universe: last })]).groups[0]!;
    expect(g.fixtures).toHaveLength(1);
    expect(g.issue).toBe('noUniverseLeft');
    expect(g.unplaced).toBe(1);
  });

  it('invalid group input is skipped, other groups are still patched', () => {
    for (const bad of [
      group('x', 0, 1),
      group('x', 513, 1),
      group('x', 1.5, 1),
      group('x', Number.NaN, 1),
      group('x', 8, 0),
      group('x', 8, 1, { universe: 0 }),
      group('x', 8, 1, { startAddress: 0 }),
      group('x', 8, 1, { startAddress: 513 }),
      group('x', 8, 1, { gap: -1 }),
    ]) {
      const r = run([bad, group('ok', 8, 1)]);
      expect(r.groups[0]!.issue).toBe('invalidInput');
      expect(r.groups[1]!.fixtures).toHaveLength(1);
    }
  });

  it('too many fixtures in a group: invalid, unplaced shows the entered count', () => {
    const g = run([group('x', 1, 20_000)]).groups[0]!;
    expect(g.issue).toBe('invalidInput');
    expect(g.unplaced).toBe(20_000);
  });

  it('invalid options and reserved ranges are errors', () => {
    for (const alignStep of [0, 1.5, 513]) {
      expect(calculatePatch([], opts({ alignStep }))).toEqual({ ok: false, error: 'invalidOptions' });
    }
    for (const r of [
      { universe: 1, from: 20, to: 10 },
      { universe: 1, from: 1, to: 513 },
      { universe: 0, from: 1, to: 10 },
    ]) {
      expect(calculatePatch([], opts({ reserved: [r] }))).toEqual({ ok: false, error: 'invalidReservedRange' });
    }
  });

  it('empty patch', () => {
    expect(run([])).toEqual({ groups: [], conflicts: [], universes: [] });
  });
});

describe('Art-Net address', () => {
  // Port-Address = universe − 1 (+1 with base 1); Net = PA >> 8, Sub-Net = (PA >> 4) & 15, Universe = PA & 15
  const a = (u: number, base: 0 | 1 = 0) => {
    const r = artNetAddress(u, base);
    if (!r.ok) throw new Error(r.error);
    return [r.value.net, r.value.subnet, r.value.universe];
  };
  it('base 0: 1 → 0:0:0, 16 → 0:0:15, 17 → 0:1:0, 257 → 1:0:0, 32768 → 127:15:15', () => {
    expect(a(1)).toEqual([0, 0, 0]);
    expect(a(16)).toEqual([0, 0, 15]);
    expect(a(17)).toEqual([0, 1, 0]);
    expect(a(257)).toEqual([1, 0, 0]);
    expect(a(32768)).toEqual([127, 15, 15]);
  });
  it('base 1: 1 → 0:0:1, 16 → 0:1:0, 32767 → 127:15:15', () => {
    expect(a(1, 1)).toEqual([0, 0, 1]);
    expect(a(16, 1)).toEqual([0, 1, 0]);
    expect(a(32767, 1)).toEqual([127, 15, 15]);
  });
  it('out of range', () => {
    expect(artNetAddress(0).ok).toBe(false);
    expect(artNetAddress(32769).ok).toBe(false);
    expect(artNetAddress(32768, 1).ok).toBe(false);
    expect(artNetAddress(1.5).ok).toBe(false);
  });
});

describe('DIP switches', () => {
  const on = (address: number, p: DipProfile = DEFAULT_DIP_PROFILE) => {
    const r = dipOnSwitches(address, p);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const p = (o: Partial<DipProfile>): DipProfile => ({ ...DEFAULT_DIP_PROFILE, ...o });

  it('standard: 1 → [1], 37 = 1 + 4 + 32 → [1, 3, 6], 511 → 1–9, 256 → [9]', () => {
    expect(on(1)).toEqual([1]);
    expect(on(37)).toEqual([1, 3, 6]);
    expect(on(511)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(on(256)).toEqual([9]);
  });

  it('standard: 0 and 512 are out of range', () => {
    expect(addressToDip(0, DEFAULT_DIP_PROFILE).ok).toBe(false);
    expect(addressToDip(512, DEFAULT_DIP_PROFILE).ok).toBe(false);
  });

  it('switch 10 is a function switch and stays OFF', () => {
    const r = addressToDip(511, DEFAULT_DIP_PROFILE);
    expect(r.ok && r.value).toEqual([true, true, true, true, true, true, true, true, true, false]);
    const r9 = addressToDip(1, p({ switches: 9 }));
    expect(r9.ok && r9.value.length).toBe(9);
  });

  it('MSB first: 1 → [9], 256 → [1], 37 = 32 + 4 + 1 → [4, 7, 9]', () => {
    const msb = p({ msbFirst: true });
    expect(on(1, msb)).toEqual([9]);
    expect(on(256, msb)).toEqual([1]);
    expect(on(37, msb)).toEqual([4, 7, 9]);
  });

  it('inverted: 1 → switches 2–9 ON', () => {
    expect(on(1, p({ inverted: true }))).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('offset 1: address = sum + 1 → 1 = all OFF, 512 = all ON, 38 → [1, 3, 6]', () => {
    const o1 = p({ offset: 1 });
    expect(on(1, o1)).toEqual([]);
    expect(on(512, o1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(on(38, o1)).toEqual([1, 3, 6]);
  });

  it('positions for address 0 (no valid DMX address): all OFF, inverted all ON; 512 not representable with offset 0', () => {
    expect(dipPositions(0, DEFAULT_DIP_PROFILE)).toEqual(new Array(10).fill(false));
    expect(dipPositions(0, p({ inverted: true, switches: 9 }))).toEqual(new Array(9).fill(true));
    expect(dipPositions(512, DEFAULT_DIP_PROFILE)).toBeUndefined();
    expect(dipPositions(0, p({ offset: 1 }))).toBeUndefined();
    expect(dipPositions(1.5, DEFAULT_DIP_PROFILE)).toBeUndefined();
  });

  it('range: offset 0 → 1–511, offset 1 → 1–512', () => {
    expect(dipRange(DEFAULT_DIP_PROFILE)).toEqual({ min: 1, max: 511 });
    expect(dipRange(p({ offset: 1 }))).toEqual({ min: 1, max: 512 });
  });

  it('switches → address: all OFF = 0 (invalid, UI warns), round trip for 1–511 in every profile', () => {
    expect(dipToAddress(new Array(10).fill(false), DEFAULT_DIP_PROFILE)).toBe(0);
    for (const prof of [DEFAULT_DIP_PROFILE, p({ msbFirst: true }), p({ inverted: true }), p({ offset: 1 }), p({ switches: 9 })]) {
      for (let addr = 1; addr <= (prof.offset ? 512 : 511); addr++) {
        const r = addressToDip(addr, prof);
        if (!r.ok) throw new Error(`${addr}`);
        expect(dipToAddress(r.value, prof)).toBe(addr);
      }
    }
  });
});
