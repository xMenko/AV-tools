/**
 * Converts Open Fixture Library fixture JSON (https://github.com/OpenLightingProject/open-fixture-library,
 * docs/fixture-format.md) into the bundled database format. Used by scripts/ofl-import at build time only.
 *
 * Mirrors OFL's lib/model/Matrix.js and Mode.js for channel order (matrix insert blocks, pixel key sorting)
 * and its naming of fine channels ("<name> fine", "<name> fine^2").
 * No imports except types, so Node can run it directly (type stripping).
 */
import type { DbFixture, DbMode, FixtureDatabase, FixtureDbSource } from './fixtureDb';

interface OflChannel {
  name?: string;
  fineChannelAliases?: string[];
  capability?: { switchChannels?: Record<string, unknown> };
  capabilities?: { switchChannels?: Record<string, unknown> }[];
}

interface OflMatrixInsert {
  insert: 'matrixChannels';
  repeatFor: string | string[];
  channelOrder: 'perPixel' | 'perChannel';
  templateChannels: string[];
}

export interface OflFixture {
  name: string;
  availableChannels?: Record<string, OflChannel>;
  templateChannels?: Record<string, OflChannel>;
  matrix?: {
    pixelCount?: [number, number, number];
    pixelKeys?: (string | null)[][][];
    pixelGroups?: Record<string, unknown>;
  };
  modes: { name: string; channels: (string | null | OflMatrixInsert)[] }[];
}

export interface OflRedirect {
  name: string;
  redirectTo: string;
  reason: 'FixtureRenamed' | 'SameAsDifferentBrand';
}

const PIXEL_KEY = '$pixelKey';
const resolveTemplate = (s: string, pixelKey: string) => s.split(PIXEL_KEY).join(pixelKey);

// --- Matrix (OFL lib/model/Matrix.js) ------------------------------------------------------------

type Position = [number, number, number];

export class OflMatrix {
  readonly pixelCount: Position;
  readonly structure: (string | null)[][][];
  readonly positions = new Map<string, Position>();
  readonly groupKeys: string[];

  constructor(json: NonNullable<OflFixture['matrix']>) {
    if (json.pixelKeys) {
      this.structure = json.pixelKeys;
      const xyz: Position = [1, 1, json.pixelKeys.length];
      for (const ys of json.pixelKeys) {
        xyz[1] = Math.max(xyz[1], ys.length);
        for (const xs of ys) xyz[0] = Math.max(xyz[0], xs.length);
      }
      this.pixelCount = xyz;
    } else if (json.pixelCount) {
      this.pixelCount = json.pixelCount;
      const [cx, cy, cz] = json.pixelCount;
      const axes = [cx > 1, cy > 1, cz > 1];
      const defined = axes.filter(Boolean).length;
      const key = (x: number, y: number, z: number) => {
        if (defined <= 1) return String(Math.max(x, y, z));
        if (defined === 2) return `(${axes[0] ? x : y}, ${axes[1] ? y : z})`;
        return `(${x}, ${y}, ${z})`;
      };
      this.structure = [];
      for (let z = 1; z <= cz; z++) {
        const ys: string[][] = [];
        for (let y = 1; y <= cy; y++) {
          const xs: string[] = [];
          for (let x = 1; x <= cx; x++) xs.push(key(x, y, z));
          ys.push(xs);
        }
        this.structure.push(ys);
      }
    } else {
      throw new Error('matrix needs pixelCount or pixelKeys');
    }
    const [cx, cy, cz] = this.pixelCount;
    for (let z = 0; z < cz; z++)
      for (let y = 0; y < cy; y++)
        for (let x = 0; x < cx; x++) {
          const k = this.structure[z]?.[y]?.[x];
          if (k !== null && k !== undefined) this.positions.set(k, [x + 1, y + 1, z + 1]);
        }
    this.groupKeys = Object.keys(json.pixelGroups ?? {});
  }

  /** "eachPixelABC": alphanumerically sorted (numeric collation) */
  get pixelKeys(): string[] {
    return [...this.positions.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  /** "eachPixelXYZ" etc.: first axis changes fastest */
  pixelKeysByOrder(order: string): string[] {
    const idx = { X: 0, Y: 1, Z: 2 } as Record<string, 0 | 1 | 2>;
    const [first, second, third] = [...order].map((c) => idx[c]!);
    if (first === undefined || second === undefined || third === undefined) throw new Error(`invalid order ${order}`);
    return this.pixelKeys.sort((ka, kb) => {
      const a = this.positions.get(ka)!;
      const b = this.positions.get(kb)!;
      if (a[third] !== b[third]) return a[third] - b[third];
      if (a[second] !== b[second]) return a[second] - b[second];
      return a[first] - b[first];
    });
  }

  repeatFor(repeatFor: string | string[]): string[] {
    if (Array.isArray(repeatFor)) return repeatFor;
    if (repeatFor === 'eachPixelGroup') return this.groupKeys;
    if (repeatFor === 'eachPixelABC') return this.pixelKeys;
    const m = /^eachPixel([XYZ]{3})$/.exec(repeatFor);
    if (!m) throw new Error(`unknown repeatFor ${repeatFor}`);
    return this.pixelKeysByOrder(m[1]!);
  }
}

// --- Channel names --------------------------------------------------------------------------------

function switchingAliases(ch: OflChannel): string[] {
  const caps = ch.capabilities ?? (ch.capability ? [ch.capability] : []);
  return [...new Set(caps.flatMap((c) => Object.keys(c.switchChannels ?? {})))];
}

/** Display name for every channel key a mode can reference. */
export function channelNames(fixture: OflFixture, matrix?: OflMatrix): Map<string, string> {
  const names = new Map<string, string>();
  const add = (key: string, ch: OflChannel) => {
    const base = ch.name ?? key;
    names.set(key, base);
    (ch.fineChannelAliases ?? []).forEach((alias, i) => {
      names.set(alias, ch.name ? `${base} fine${i > 0 ? `^${i + 1}` : ''}` : alias);
    });
    for (const alias of switchingAliases(ch)) if (!names.has(alias)) names.set(alias, alias);
  };
  if (fixture.templateChannels && matrix) {
    const pixelKeys = [...matrix.positions.keys(), ...matrix.groupKeys];
    for (const [tKey, tCh] of Object.entries(fixture.templateChannels)) {
      for (const p of pixelKeys) {
        const resolved = JSON.parse(resolveTemplate(JSON.stringify(tCh), p)) as OflChannel;
        add(resolveTemplate(tKey, p), resolved);
      }
    }
  }
  // available channels override resolved template channels (OFL allows that)
  for (const [key, ch] of Object.entries(fixture.availableChannels ?? {})) add(key, ch);
  return names;
}

/** Channel keys of a mode in DMX order; null = unused channel. (OFL Mode.channelKeys) */
export function modeChannelKeys(mode: OflFixture['modes'][number], matrix?: OflMatrix): (string | null)[] {
  return mode.channels.flatMap((ref) => {
    if (ref === null || typeof ref === 'string') return [ref];
    if (!matrix) throw new Error('matrix insert without matrix');
    const pixels = matrix.repeatFor(ref.repeatFor);
    const out: string[] = [];
    if (ref.channelOrder === 'perPixel') {
      for (const p of pixels) for (const t of ref.templateChannels) out.push(resolveTemplate(t, p));
    } else {
      for (const t of ref.templateChannels) for (const p of pixels) out.push(resolveTemplate(t, p));
    }
    return out;
  });
}

/** Modes with channel display names ('' = unused). Unknown keys keep their key as name. */
export function resolveFixture(fixture: OflFixture): { name: string; channels: string[] }[] {
  const matrix = fixture.matrix ? new OflMatrix(fixture.matrix) : undefined;
  const names = channelNames(fixture, matrix);
  return fixture.modes.map((mode) => ({
    name: mode.name,
    channels: modeChannelKeys(mode, matrix).map((k) => (k === null ? '' : (names.get(k) ?? k))),
  }));
}

// --- Database ------------------------------------------------------------------------------------

export interface OflInput {
  readonly source: FixtureDbSource;
  /** manufacturers.json without $schema */
  readonly manufacturers: Record<string, { name: string }>;
  /** every fixture file: manufacturer key, fixture key, parsed JSON */
  readonly files: readonly { manufacturer: string; key: string; json: OflFixture | OflRedirect }[];
}

const isRedirect = (j: OflFixture | OflRedirect): j is OflRedirect => 'redirectTo' in j;

/**
 * Builds the database. Renamed-fixture redirects are skipped (the fixture exists under its new name);
 * "same as different brand" redirects become their own entries with the target's modes.
 * Sorted by manufacturer name, then fixture name (case-insensitive, numeric).
 */
export function buildDatabase(input: OflInput): FixtureDatabase {
  const byId = new Map(input.files.map((f) => [`${f.manufacturer}/${f.key}`, f]));
  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

  const entries: { manufacturer: string; key: string; name: string; modes: { name: string; channels: string[] }[] }[] = [];
  for (const f of input.files) {
    let json = f.json;
    if (isRedirect(json)) {
      if (json.reason !== 'SameAsDifferentBrand') continue;
      const target = byId.get(json.redirectTo)?.json;
      if (!target || isRedirect(target)) throw new Error(`redirect ${f.manufacturer}/${f.key} → ${json.redirectTo} not found`);
      entries.push({ manufacturer: f.manufacturer, key: f.key, name: json.name, modes: resolveFixture(target) });
      continue;
    }
    entries.push({ manufacturer: f.manufacturer, key: f.key, name: json.name, modes: resolveFixture(json) });
  }

  const manufacturerKeys = [...new Set(entries.map((e) => e.manufacturer))].sort((a, b) => {
    const na = input.manufacturers[a]?.name ?? a;
    const nb = input.manufacturers[b]?.name ?? b;
    return collator.compare(na, nb);
  });
  const mIndex = new Map(manufacturerKeys.map((k, i) => [k, i]));
  entries.sort((a, b) => mIndex.get(a.manufacturer)! - mIndex.get(b.manufacturer)! || collator.compare(a.name, b.name));

  // channel name table, most frequent first (smaller indices → smaller file)
  const freq = new Map<string, number>();
  for (const e of entries) for (const m of e.modes) for (const c of m.channels) freq.set(c, (freq.get(c) ?? 0) + 1);
  const channels = [...freq.keys()].sort((a, b) => freq.get(b)! - freq.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
  const cIndex = new Map(channels.map((c, i) => [c, i]));

  const fixtures: DbFixture[] = entries.map((e) => [
    mIndex.get(e.manufacturer)!,
    e.key,
    e.name,
    e.modes.map((m): DbMode => [m.name, m.channels.map((c) => cIndex.get(c)!)]),
  ]);

  return {
    format: 1,
    source: input.source,
    manufacturers: manufacturerKeys.map((k) => [k, input.manufacturers[k]?.name ?? k] as const),
    channels,
    fixtures,
  };
}
