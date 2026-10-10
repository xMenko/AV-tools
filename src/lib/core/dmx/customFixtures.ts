/**
 * User-defined fixtures (stored locally in the browser, never transmitted) and their file
 * export/import. Same shape as database fixtures, so the patch UI treats both alike.
 */
import { type Result, ok, err } from '../result';
import type { Fixture, FixtureMode } from './fixtureDb';

export const CUSTOM_ID_PREFIX = 'custom/';
export const EXPORT_FORMAT = 'av-tools-fixtures';
export const EXPORT_VERSION = 1;

export const MAX_CHANNELS = 512;
export const MAX_TEXT = 120;
export const MAX_MODES = 50;
export const MAX_FIXTURES = 2000;

export const isCustomId = (id: string) => id.startsWith(CUSTOM_ID_PREFIX);

export type CustomFixtureError =
  | 'missingName'
  | 'noModes'
  | 'tooManyModes'
  | 'missingModeName'
  | 'duplicateModeName'
  | 'invalidChannelCount'
  | 'textTooLong';

/** Channel names for a mode: one name per line; missing names become "Kanal n". Extra lines are ignored. */
export function channelNamesFromText(count: number, text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  return Array.from({ length: count }, (_, i) => lines[i] || `Kanal ${i + 1}`);
}

/** Number of non-empty lines – used to suggest the channel count when names are pasted. */
export const countNameLines = (text: string) => text.split(/\r?\n/).filter((l) => l.trim()).length;

/** Checks a fixture as edited by the user; trims texts. */
export function validateCustomFixture(f: Fixture): Result<Fixture, CustomFixtureError> {
  const manufacturer = f.manufacturer.trim();
  const name = f.name.trim();
  if (!name) return err('missingName');
  if (f.modes.length === 0) return err('noModes');
  if (f.modes.length > MAX_MODES) return err('tooManyModes');
  if (manufacturer.length > MAX_TEXT || name.length > MAX_TEXT) return err('textTooLong');
  const modes: FixtureMode[] = [];
  const seen = new Set<string>();
  for (const m of f.modes) {
    const modeName = m.name.trim();
    if (!modeName) return err('missingModeName');
    if (modeName.length > MAX_TEXT) return err('textTooLong');
    if (seen.has(modeName.toLowerCase())) return err('duplicateModeName');
    seen.add(modeName.toLowerCase());
    if (m.channels.length < 1 || m.channels.length > MAX_CHANNELS) return err('invalidChannelCount');
    if (m.channels.some((c) => c.length > MAX_TEXT)) return err('textTooLong');
    modes.push({ name: modeName, channels: m.channels.map((c) => c.trim()) });
  }
  return ok({ id: f.id, manufacturer, name, modes });
}

export interface FixtureExport {
  readonly format: typeof EXPORT_FORMAT;
  readonly version: typeof EXPORT_VERSION;
  /** ISO date */
  readonly exported: string;
  readonly fixtures: readonly Fixture[];
}

export function exportCustomFixtures(fixtures: readonly Fixture[], date: Date): FixtureExport {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exported: date.toISOString().slice(0, 10), fixtures };
}

export type ImportError = 'notJson' | 'wrongFormat' | 'newerVersion' | 'tooMany' | 'invalidFixture';

const isString = (x: unknown): x is string => typeof x === 'string';

/** Parses an export file. Every fixture must be valid; ids are forced into the custom namespace. */
export function parseFixtureExport(text: string): Result<Fixture[], ImportError> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err('notJson');
  }
  if (typeof json !== 'object' || json === null) return err('wrongFormat');
  const o = json as Partial<FixtureExport>;
  if (o.format !== EXPORT_FORMAT || !Array.isArray(o.fixtures)) return err('wrongFormat');
  if (typeof o.version !== 'number' || o.version > EXPORT_VERSION) return err('newerVersion');
  if (o.fixtures.length > MAX_FIXTURES) return err('tooMany');
  const out: Fixture[] = [];
  for (const raw of o.fixtures as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return err('invalidFixture');
    const f = raw as Record<string, unknown>;
    if (!isString(f.id) || !isString(f.name) || !isString(f.manufacturer) || !Array.isArray(f.modes)) return err('invalidFixture');
    const modes: FixtureMode[] = [];
    for (const m of f.modes as unknown[]) {
      const mm = m as Record<string, unknown> | null;
      if (!mm || !isString(mm.name) || !Array.isArray(mm.channels) || !mm.channels.every(isString)) return err('invalidFixture');
      modes.push({ name: mm.name, channels: mm.channels as string[] });
    }
    const id = isCustomId(f.id) ? f.id : `${CUSTOM_ID_PREFIX}${f.id}`;
    const v = validateCustomFixture({ id, manufacturer: f.manufacturer, name: f.name, modes });
    if (!v.ok) return err('invalidFixture');
    out.push(v.value);
  }
  return ok(out);
}

/** Adds imported fixtures; an imported fixture with an existing id replaces it. */
export function mergeCustomFixtures(
  existing: readonly Fixture[],
  imported: readonly Fixture[],
): { fixtures: Fixture[]; added: number; updated: number } {
  const byId = new Map(existing.map((f) => [f.id, f]));
  let added = 0;
  let updated = 0;
  for (const f of imported) {
    if (byId.has(f.id)) updated++;
    else added++;
    byId.set(f.id, f);
  }
  return { fixtures: [...byId.values()], added, updated };
}
