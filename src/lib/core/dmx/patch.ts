import { type Result, ok, err } from '../result';
import { type ArtNetBase, maxUniverse } from './artnet';

export const UNIVERSE_SIZE = 512;
/** Upper bound per group so a typo (e.g. 10 000 000) cannot freeze the UI. */
export const MAX_GROUP_COUNT = 10_000;

/** Several identical fixtures (same mode) patched together. */
export interface PatchGroup {
  readonly id: string;
  /** channels per fixture, 1–512 */
  readonly channels: number;
  /** number of fixtures, ≥ 1 */
  readonly count: number;
  /** target universe, 1-based */
  readonly universe: number;
  /** fixed start address of the first fixture; undefined = placed automatically */
  readonly startAddress?: number;
  /** unused channels between two fixtures of the group, ≥ 0; kept free for other groups too */
  readonly gap: number;
  /**
   * Automatic groups only: if the group does not fit completely into a universe, move it as a whole to
   * the next one instead of splitting it. Groups larger than a universe are always split.
   */
  readonly keepTogether?: boolean;
}

/** Addresses that must stay free (e.g. 1–20 for haze). */
export interface ReservedRange {
  readonly universe: number;
  readonly from: number;
  readonly to: number;
}

/** Where an automatic group starts in a universe that is already partly used. */
export type Placement =
  /** lowest address where the whole group fits as one block; otherwise after the last fixture */
  | 'contiguous'
  /** after the highest address used by a fixture in the universe */
  | 'afterLast'
  /** every fixture takes the lowest free address (densest, may split a group into blocks) */
  | 'fill';

export interface PatchOptions {
  /** Start addresses on the grid 1, 1 + N, 1 + 2N …; 1 = no alignment, 10 = x01, x11, x21 … */
  readonly alignStep: number;
  /** 'device': every fixture starts on the grid; 'group': only the first fixture of a group in each universe */
  readonly alignScope: 'device' | 'group';
  readonly placement: Placement;
  readonly reserved: readonly ReservedRange[];
  /** Only limits the highest universe (Art-Net Port-Address 0–32767). */
  readonly artNetBase?: ArtNetBase;
}

export type GroupIssue =
  /** channels, count, universe, start address or gap invalid – group skipped */
  | 'invalidInput'
  /** fixed start address + channels − 1 > 512 */
  | 'startTooHigh'
  /** ran past the highest universe */
  | 'noUniverseLeft';

export interface PatchedFixture {
  /** running number over all groups in input order, 1-based */
  readonly number: number;
  readonly groupId: string;
  /** 1-based within the group */
  readonly index: number;
  readonly universe: number;
  readonly start: number;
  /** start + channels − 1, never > 512 */
  readonly end: number;
}

export interface GroupResult {
  readonly groupId: string;
  readonly fixtures: readonly PatchedFixture[];
  readonly issue?: GroupIssue;
  /** fixtures that could not be patched because of `issue` */
  readonly unplaced: number;
  /** fixtures are spread over more than one universe – the UI asks whether to keep the group together */
  readonly split: boolean;
}

/** Overlap of a fixed group with another fixed group or a reserved range (never moved silently). */
export interface PatchConflict {
  readonly universe: number;
  /** the group listed first */
  readonly groupId: string;
  readonly with: { readonly kind: 'group'; readonly groupId: string } | { readonly kind: 'reserved'; readonly index: number };
  /** lowest and highest overlapping address; addresses in between need not all overlap */
  readonly from: number;
  readonly to: number;
}

export interface UniverseUsage {
  readonly universe: number;
  /** addresses used by fixtures */
  readonly used: number;
  /** gaps between fixtures of a group (kept free) */
  readonly gaps: number;
  /** reserved addresses not used by fixtures */
  readonly reserved: number;
  readonly free: number;
}

export interface PatchResult {
  readonly groups: readonly GroupResult[];
  readonly conflicts: readonly PatchConflict[];
  /** every universe with fixtures or reserved ranges, ascending */
  readonly universes: readonly UniverseUsage[];
}

export type PatchError = 'invalidOptions' | 'invalidReservedRange';

interface Range {
  readonly from: number;
  readonly to: number;
}

interface Placed {
  readonly index: number;
  readonly universe: number;
  readonly start: number;
  readonly end: number;
}

const FREE = 0;
const RESERVED = 1;
const FIXTURE = 2;
const GAP = 3;

const isInt = (x: number, min: number, max: number) => Number.isInteger(x) && x >= min && x <= max;

/** Smallest address ≥ a on the grid 1 + k·step. */
export function alignUp(a: number, step: number): number {
  return step <= 1 ? a : 1 + Math.ceil((a - 1) / step) * step;
}

function validGroup(g: PatchGroup, lastUniverse: number): boolean {
  return (
    isInt(g.channels, 1, UNIVERSE_SIZE) &&
    isInt(g.count, 1, MAX_GROUP_COUNT) &&
    isInt(g.universe, 1, lastUniverse) &&
    (g.startAddress === undefined || isInt(g.startAddress, 1, UNIVERSE_SIZE)) &&
    isInt(g.gap, 0, UNIVERSE_SIZE - 1)
  );
}

/** Occupancy of one universe; index = DMX address (0 unused). */
class UniverseMap {
  readonly mask = new Uint8Array(UNIVERSE_SIZE + 1);
  /** highest end address of a fixture */
  lastFixtureEnd = 0;

  mark(from: number, to: number, kind: number) {
    for (let a = from; a <= Math.min(to, UNIVERSE_SIZE); a++) {
      // fixtures win over reserved/gap; gaps only fill free addresses
      if (kind === FIXTURE || this.mask[a] === FREE) this.mask[a] = kind;
    }
    if (kind === FIXTURE) this.lastFixtureEnd = Math.max(this.lastFixtureEnd, to);
  }

  /** Highest blocked address in [from, to], or 0 if all free. */
  blockedIn(from: number, to: number): number {
    for (let a = to; a >= from; a--) if (this.mask[a] !== FREE) return a;
    return 0;
  }

  /** Lowest address ≥ from on the grid where `channels` addresses are free. */
  findSlot(from: number, channels: number, step: number): number | undefined {
    let a = alignUp(from, step);
    while (a + channels - 1 <= UNIVERSE_SIZE) {
      const blocked = this.blockedIn(a, a + channels - 1);
      if (blocked === 0) return a;
      a = alignUp(blocked + 1, step);
    }
    return undefined;
  }
}

/**
 * Distributes fixture groups over DMX universes.
 *
 * Rules (spec 2.3):
 * 1. A fixture never crosses the universe boundary: start + channels − 1 ≤ 512.
 * 2. Groups with a fixed start address are laid out first, exactly as entered (fixture i starts after
 *    fixture i − 1 plus gap, aligned). Overlaps with other fixed groups or reserved ranges are reported
 *    as conflicts and not moved. Fixtures that do not fit continue in the next universe like rule 3.
 * 3. Groups without a start address follow in input order and avoid reserved ranges, gaps and everything
 *    patched so far. Their start depends on `placement`. Fixtures that do not fit continue at the start
 *    of the next universe, or – with `keepTogether` – the whole rest of the group moves there.
 * 4. Gaps between fixtures of a group stay free for other groups.
 */
export function calculatePatch(groups: readonly PatchGroup[], options: PatchOptions): Result<PatchResult, PatchError> {
  const lastUniverse = maxUniverse(options.artNetBase ?? 0);
  if (!isInt(options.alignStep, 1, UNIVERSE_SIZE)) return err('invalidOptions');
  for (const r of options.reserved) {
    if (!isInt(r.universe, 1, lastUniverse) || !isInt(r.from, 1, UNIVERSE_SIZE) || !isInt(r.to, r.from, UNIVERSE_SIZE)) {
      return err('invalidReservedRange');
    }
  }

  const maps = new Map<number, UniverseMap>();
  const mapOf = (u: number) => {
    let m = maps.get(u);
    if (!m) maps.set(u, (m = new UniverseMap()));
    return m;
  };
  options.reserved.forEach((r) => mapOf(r.universe).mark(r.from, r.to, RESERVED));

  /** Grid for a fixture: the first one in a universe always uses the grid. */
  const stepFor = (firstInUniverse: boolean) => (firstInUniverse || options.alignScope === 'device' ? options.alignStep : 1);

  interface State {
    readonly placed: Placed[];
    issue?: GroupIssue;
    unplaced: number;
    /** pass 2 continues with fixture `next` in `universe` */
    continueAt?: { next: number; universe: number };
  }
  const states: State[] = groups.map(() => ({ placed: [], unplaced: 0 }));

  const commit = (s: State, list: readonly Placed[]) => {
    for (const p of list) {
      s.placed.push(p);
      mapOf(p.universe).mark(p.start, p.end, FIXTURE);
    }
  };
  /** Gap after a fixture when the next fixture of the group follows in the same universe. Idempotent. */
  const markGaps = (s: State, g: PatchGroup) => {
    if (g.gap === 0) return;
    const byIndex = new Map(s.placed.map((p) => [p.index, p]));
    for (const p of s.placed) {
      const next = byIndex.get(p.index + 1);
      if (next?.universe === p.universe) mapOf(p.universe).mark(p.end + 1, p.end + g.gap, GAP);
    }
  };

  // Pass 1: fixed groups, laid out as entered.
  const fixedPlaced: { group: number; universe: number; range: Range }[] = [];
  groups.forEach((g, gi) => {
    const s = states[gi]!;
    if (!validGroup(g, lastUniverse)) {
      s.issue = 'invalidInput';
      s.unplaced = Number.isInteger(g.count) && g.count > 0 ? g.count : 0;
      return;
    }
    if (g.startAddress === undefined) return;
    let start = g.startAddress;
    const list: Placed[] = [];
    for (let i = 0; i < g.count; i++) {
      if (i > 0) start = alignUp(list[i - 1]!.end + 1 + g.gap, stepFor(false));
      if (start + g.channels - 1 > UNIVERSE_SIZE) {
        if (i === 0) {
          s.issue = 'startTooHigh';
          s.unplaced = g.count;
        } else s.continueAt = { next: i, universe: g.universe + 1 };
        break;
      }
      list.push({ index: i, universe: g.universe, start, end: start + g.channels - 1 });
    }
    commit(s, list);
    list.forEach((p) => fixedPlaced.push({ group: gi, universe: p.universe, range: { from: p.start, to: p.end } }));
  });

  // Conflicts among fixed groups and with reserved ranges.
  const conflictMap = new Map<string, PatchConflict>();
  const addConflict = (key: string, c: PatchConflict) => {
    const same = conflictMap.get(key);
    conflictMap.set(key, same ? { ...same, from: Math.min(same.from, c.from), to: Math.max(same.to, c.to) } : c);
  };
  const overlap = (x: Range, y: Range): Range | undefined =>
    x.from <= y.to && x.to >= y.from ? { from: Math.max(x.from, y.from), to: Math.min(x.to, y.to) } : undefined;
  fixedPlaced.forEach((a, ai) => {
    const id = groups[a.group]!.id;
    options.reserved.forEach((r, ri) => {
      const o = r.universe === a.universe ? overlap(a.range, r) : undefined;
      if (o) addConflict(`${a.universe}|${a.group}|r${ri}`, { universe: a.universe, groupId: id, with: { kind: 'reserved', index: ri }, ...o });
    });
    for (const b of fixedPlaced.slice(ai + 1)) {
      if (b.group === a.group || b.universe !== a.universe) continue;
      const o = overlap(a.range, b.range);
      const other = groups[b.group]!.id;
      if (o) addConflict(`${a.universe}|${a.group}|g${b.group}`, { universe: a.universe, groupId: id, with: { kind: 'group', groupId: other }, ...o });
    }
  });
  groups.forEach((g, gi) => {
    if (g.startAddress !== undefined) markGaps(states[gi]!, g);
  });

  /** Greedy layout of fixtures first… in universe u from address `from`; stops at the first that does not fit. */
  function layoutGreedy(g: PatchGroup, u: number, from: number, first: number): Placed[] {
    const m = mapOf(u);
    const out: Placed[] = [];
    let a = from;
    for (let i = first; i < g.count; i++) {
      const start = m.findSlot(a, g.channels, stepFor(out.length === 0));
      if (start === undefined) break;
      out.push({ index: i, universe: u, start, end: start + g.channels - 1 });
      a = start + g.channels + g.gap;
    }
    return out;
  }

  /** Lowest block where all fixtures first… fit back to back (gap, grid); undefined if none. */
  function layoutBlock(g: PatchGroup, u: number, first: number): Placed[] | undefined {
    const m = mapOf(u);
    let candidate = m.findSlot(1, g.channels, stepFor(true));
    while (candidate !== undefined) {
      const out: Placed[] = [];
      let start = candidate;
      let blockedAt = 0;
      for (let i = first; i < g.count; i++) {
        if (i > first) start = alignUp(out.at(-1)!.end + 1 + g.gap, stepFor(false));
        const end = start + g.channels - 1;
        if (end > UNIVERSE_SIZE) return undefined; // later candidates only end higher
        blockedAt = m.blockedIn(start, end);
        if (blockedAt) break;
        out.push({ index: i, universe: u, start, end });
      }
      if (!blockedAt) return out;
      candidate = m.findSlot(candidate + 1, g.channels, stepFor(true));
    }
    return undefined;
  }

  /** Would the fixtures first… fit into an empty universe? (Otherwise a split is unavoidable.) */
  function fitsEmptyUniverse(g: PatchGroup, first: number): boolean {
    let end = 0;
    for (let i = first; i < g.count; i++) {
      const start = i === first ? 1 : alignUp(end + 1 + g.gap, stepFor(false));
      end = start + g.channels - 1;
      if (end > UNIVERSE_SIZE) return false;
    }
    return true;
  }

  // Pass 2: automatic groups and overflowing rests of fixed groups.
  groups.forEach((g, gi) => {
    const s = states[gi]!;
    if (s.issue) return;
    let i: number;
    let u: number;
    if (g.startAddress === undefined) {
      i = 0;
      u = g.universe;
    } else if (s.continueAt) {
      i = s.continueAt.next;
      u = s.continueAt.universe;
    } else return;

    const together = g.startAddress === undefined && g.keepTogether === true && fitsEmptyUniverse(g, i);
    while (i < g.count) {
      if (u > lastUniverse) {
        s.issue = 'noUniverseLeft';
        s.unplaced = g.count - i;
        break;
      }
      const m = mapOf(u);
      let list: Placed[];
      if (options.placement === 'fill') list = layoutGreedy(g, u, 1, i);
      else if (options.placement === 'afterLast') list = layoutGreedy(g, u, m.lastFixtureEnd + 1, i);
      else list = layoutBlock(g, u, i) ?? layoutGreedy(g, u, m.lastFixtureEnd + 1, i);
      if (together && list.length < g.count - i) list = [];
      commit(s, list);
      i += list.length;
      u++;
    }
    markGaps(s, g);
  });

  let number = 0;
  const groupResults: GroupResult[] = groups.map((g, gi) => {
    const s = states[gi]!;
    const fixtures = [...s.placed]
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ number: ++number, groupId: g.id, index: p.index + 1, universe: p.universe, start: p.start, end: p.end }));
    const split = new Set(fixtures.map((f) => f.universe)).size > 1;
    return { groupId: g.id, fixtures, issue: s.issue, unplaced: s.unplaced, split };
  });

  const universes: UniverseUsage[] = [...maps.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([universe, m]) => {
      const count = [0, 0, 0, 0];
      for (let a = 1; a <= UNIVERSE_SIZE; a++) count[m.mask[a]!]!++;
      const [free, reserved, used, gaps] = count as [number, number, number, number];
      return used + reserved + gaps === 0 ? [] : [{ universe, used, gaps, reserved, free }];
    });

  return ok({ groups: groupResults, conflicts: [...conflictMap.values()], universes });
}
