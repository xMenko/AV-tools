import { parseFixtureDatabase, searchIndex, type FixtureDatabase } from '../core/dmx/fixtureDb';

export interface LoadedDatabase {
  readonly db: FixtureDatabase;
  /** normalized search text per fixture */
  readonly index: string[];
  /** fixture id → index in db.fixtures */
  readonly byId: Map<string, number>;
}

let pending: Promise<LoadedDatabase | undefined> | undefined;

/**
 * Loads the bundled fixture database (same origin, precached by the service worker → works offline).
 * Loaded once per session; undefined if the file is missing or invalid.
 */
export function loadFixtureDatabase(): Promise<LoadedDatabase | undefined> {
  pending ??= fetch('./fixtures.json')
    .then((r) => (r.ok ? r.json() : undefined))
    .then((json: unknown) => {
      const db = parseFixtureDatabase(json);
      if (!db) return undefined;
      const byId = new Map(db.fixtures.map(([m, key], i) => [`${db.manufacturers[m]![0]}/${key}`, i]));
      return { db, index: searchIndex(db), byId };
    })
    .catch(() => undefined)
    .then((loaded) => {
      if (!loaded) pending = undefined; // allow a retry
      return loaded;
    });
  return pending;
}
