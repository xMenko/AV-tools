import { describe, expect, it } from 'vitest';
import { fixtureAt, normalizeSearch, parseFixtureDatabase, searchEntry, searchFixtures, searchIndex } from './fixtureDb';
import { OflMatrix, buildDatabase, resolveFixture, type OflFixture } from './ofl';
import bundledJson from '../../../../public/fixtures.json?raw';

// Reference: OFL docs/fixture-format.md (commit 174eae5), sections "Fine channels", "Matrix structure",
// "Template channels" – the expected lists below are copied from the examples there.

const fixture = (f: Partial<OflFixture>): OflFixture => ({ name: 'Test', modes: [], ...f });
const channels = (f: OflFixture, mode = 0) => resolveFixture(f)[mode]!.channels;

describe('OFL channel names', () => {
  it('fine channels: "Intensity", "Intensity fine", "Intensity fine^2" (generic/desk-channel)', () => {
    const f = fixture({
      availableChannels: { Intensity: { fineChannelAliases: ['Intensity fine', 'Intensity fine^2'] } },
      modes: [{ name: '24 bit', channels: ['Intensity', 'Intensity fine', 'Intensity fine^2'] }],
    });
    expect(channels(f)).toEqual(['Intensity', 'Intensity fine', 'Intensity fine^2']);
  });

  it('fine channel of an unnamed channel is "<key> fine", not the alias (martin/mac-700-wash "Cyan fine")', () => {
    const f = fixture({
      availableChannels: { 'Cyan Intensity': { fineChannelAliases: ['Cyan fine'] }, Pan: { fineChannelAliases: ['Pan Fine'] } },
      modes: [{ name: 'm', channels: ['Cyan Intensity', 'Cyan fine', 'Pan', 'Pan Fine'] }],
    });
    expect(channels(f)).toEqual(['Cyan Intensity', 'Cyan Intensity fine', 'Pan', 'Pan fine']);
  });

  it('channel "name" overrides the key, fine channels follow the name', () => {
    const f = fixture({
      availableChannels: { 'Pan 1': { name: 'Pan', fineChannelAliases: ['Pan 1 fine', 'Pan 1 fine^2'] } },
      modes: [{ name: 'm', channels: ['Pan 1', 'Pan 1 fine', 'Pan 1 fine^2'] }],
    });
    expect(channels(f)).toEqual(['Pan', 'Pan fine', 'Pan fine^2']);
  });

  it('null = unused channel → empty name; switching channel alias keeps its key', () => {
    const f = fixture({
      availableChannels: {
        'Auto Programs': { capabilities: [{ switchChannels: { 'Speed / Sensitivity': 'Speed' } }] },
        Speed: {},
      },
      modes: [{ name: 'm', channels: ['Auto Programs', null, 'Speed / Sensitivity'] }],
    });
    expect(channels(f)).toEqual(['Auto Programs', '', 'Speed / Sensitivity']);
  });
});

describe('OFL matrix', () => {
  it('pixel keys of a "+" (pixelKeys with holes): 5 pixels, sorted alphanumerically', () => {
    const m = new OflMatrix({
      pixelKeys: [
        [
          [null, 'Top', null],
          ['Left', 'Center', 'Right'],
          [null, 'Bottom', null],
        ],
      ],
    });
    expect(m.pixelCount).toEqual([3, 3, 1]);
    expect(m.pixelKeys).toEqual(['Bottom', 'Center', 'Left', 'Right', 'Top']);
  });

  it('1-D pixelCount: keys "1" … "12", numeric order (not 1, 10, 11, 12, 2 …)', () => {
    expect(new OflMatrix({ pixelCount: [12, 1, 1] }).repeatFor('eachPixelABC')).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i + 1)),
    );
  });

  it('3-D 2×2×2, eachPixelXYZ: reading order (docs example)', () => {
    expect(new OflMatrix({ pixelCount: [2, 2, 2] }).repeatFor('eachPixelXYZ')).toEqual([
      '(1, 1, 1)', '(2, 1, 1)', '(1, 2, 1)', '(2, 2, 1)', '(1, 1, 2)', '(2, 1, 2)', '(1, 2, 2)', '(2, 2, 2)',
    ]);
  });

  it('2-D 2×3, keys "(x, y)", eachPixelYXZ: y changes fastest', () => {
    expect(new OflMatrix({ pixelCount: [2, 3, 1] }).repeatFor('eachPixelYXZ')).toEqual([
      '(1, 1)', '(1, 2)', '(1, 3)', '(2, 1)', '(2, 2)', '(2, 3)',
    ]);
  });

  // docs: ring example with pixel groups, perPixel and perChannel results
  const rings = (channelOrder: 'perPixel' | 'perChannel') =>
    fixture({
      matrix: {
        pixelKeys: [[['I1', 'I2', 'M1', 'M2', 'O1', 'O2']]],
        pixelGroups: { 'Inner ring': { name: ['^I'] }, 'Middle ring': { name: ['^M'] }, 'Outer ring': { name: ['^O'] } },
      },
      templateChannels: { 'Red $pixelKey': {}, 'Green $pixelKey': {}, 'Blue $pixelKey': {} },
      modes: [
        {
          name: 'm',
          channels: [
            { insert: 'matrixChannels', repeatFor: 'eachPixelGroup', channelOrder, templateChannels: ['Red $pixelKey', 'Green $pixelKey', 'Blue $pixelKey'] },
          ],
        },
      ],
    });

  it('insert block perPixel (docs)', () => {
    expect(channels(rings('perPixel'))).toEqual([
      'Red Inner ring', 'Green Inner ring', 'Blue Inner ring',
      'Red Middle ring', 'Green Middle ring', 'Blue Middle ring',
      'Red Outer ring', 'Green Outer ring', 'Blue Outer ring',
    ]);
  });

  it('insert block perChannel (docs)', () => {
    expect(channels(rings('perChannel'))).toEqual([
      'Red Inner ring', 'Red Middle ring', 'Red Outer ring',
      'Green Inner ring', 'Green Middle ring', 'Green Outer ring',
      'Blue Inner ring', 'Blue Middle ring', 'Blue Outer ring',
    ]);
  });

  it('template channel with name and fine alias; available channel overrides a resolved one', () => {
    const f = fixture({
      matrix: { pixelCount: [2, 1, 1] },
      templateChannels: { 'Dim $pixelKey': { name: 'Dimmer $pixelKey', fineChannelAliases: ['Dim $pixelKey fine'] } },
      availableChannels: { 'Dim 2': { name: 'Dimmer zwei' } },
      modes: [{ name: 'm', channels: [{ insert: 'matrixChannels', repeatFor: 'eachPixelABC', channelOrder: 'perPixel', templateChannels: ['Dim $pixelKey', 'Dim $pixelKey fine'] }] }],
    });
    // The override replaces only "Dim 2"; its fine channel still comes from the template (as in OFL's model).
    expect(channels(f)).toEqual(['Dimmer 1', 'Dimmer 1 fine', 'Dimmer zwei', 'Dimmer 2 fine']);
  });
});

describe('fixture database', () => {
  const source = { name: 'OFL', url: 'u', repository: 'r', commit: 'c', date: '2026-10-07', license: 'MIT' };
  const db = buildDatabase({
    source,
    manufacturers: { zeta: { name: 'Zeta' }, alpha: { name: 'alpha' } },
    files: [
      { manufacturer: 'zeta', key: 'par', json: fixture({ name: 'PAR 10', availableChannels: { Dimmer: {} }, modes: [{ name: '1ch', channels: ['Dimmer'] }] }) },
      { manufacturer: 'zeta', key: 'par2', json: fixture({ name: 'PAR 9', availableChannels: { Red: {}, Dimmer: {} }, modes: [{ name: '2ch', channels: ['Dimmer', 'Red'] }] }) },
      { manufacturer: 'alpha', key: 'old', json: { name: 'Old', redirectTo: 'zeta/par', reason: 'FixtureRenamed' } },
      { manufacturer: 'alpha', key: 'clone', json: { name: 'Clone', redirectTo: 'zeta/par2', reason: 'SameAsDifferentBrand' } },
    ],
  });

  it('renamed redirects are skipped, other-brand redirects get the target modes', () => {
    expect(db.fixtures.map((f) => f[2])).toEqual(['Clone', 'PAR 9', 'PAR 10']);
    expect(fixtureAt(db, 0)).toEqual({ id: 'alpha/clone', manufacturer: 'alpha', name: 'Clone', modes: [{ name: '2ch', channels: ['Dimmer', 'Red'] }] });
  });

  it('sorted by manufacturer, then fixture name with numeric collation (PAR 9 before PAR 10)', () => {
    expect(db.manufacturers).toEqual([['alpha', 'alpha'], ['zeta', 'Zeta']]);
    expect(fixtureAt(db, 2)!.id).toBe('zeta/par');
  });

  it('round trip through JSON and parseFixtureDatabase', () => {
    expect(parseFixtureDatabase(JSON.parse(JSON.stringify(db)))).toEqual(db);
  });

  it('parseFixtureDatabase rejects broken data', () => {
    const ok = JSON.parse(JSON.stringify(db));
    const broken = [
      null,
      { ...ok, format: 1 }, // old format with channel name table
      { ...ok, fixtures: [[5, 'k', 'n', [['m', ['Dimmer']]]]] }, // manufacturer index out of range
      { ...ok, fixtures: [[0, 'k', 'n', [['m', [1]]]]] }, // channel name not a string
      { ...ok, fixtures: [[0, 'k', 'n', []]] }, // no modes
      { ...ok, fixtures: [[0, 'k', 'n', [['m', []]]]] }, // empty mode
      { ...ok, fixtures: [[0, 'k', 'n', [['m', ['A']], ['m', ['B']]]]] }, // duplicate mode name
    ];
    for (const b of broken) expect(parseFixtureDatabase(b)).toBeUndefined();
  });
});

describe('fixture search', () => {
  const index = ['Cameo Hydrabeam 300 RGBW', 'Minuit Une IVL Carré', 'Stairville MH-X30 LED Spot', 'Cameo Zenit W600'].map(searchEntry);

  it('normalizes case, accents and punctuation', () => {
    expect(normalizeSearch('  Minuit Une – IVL Carré ')).toBe('minuit une ivl carre');
    expect(normalizeSearch('MH-x30')).toBe('mh x30');
  });

  it('every word must match, in manufacturer or name', () => {
    expect(searchFixtures(index, 'cameo')).toEqual([0, 3]);
    expect(searchFixtures(index, 'cameo zenit')).toEqual([3]);
    expect(searchFixtures(index, 'Carré')).toEqual([1]);
    expect(searchFixtures(index, 'mh-x30')).toEqual([2]);
    expect(searchFixtures(index, 'cameo xyz')).toEqual([]);
    expect(searchFixtures(index, '  ')).toEqual([]);
  });

  it('whole word before word start before inside a word', () => {
    // "30": word start of "300" in 0 (score 1), inside "x30" in 2 (score 3)
    expect(searchFixtures(index, '30')).toEqual([0, 2]);
    expect(searchFixtures(index, 'spot')).toEqual([2]);
  });

  it('without separators: "mhx30" finds "MH-X30", ranked after real word matches', () => {
    expect(searchFixtures(index, 'mhx30')).toEqual([2]);
    expect(searchFixtures(index, 'zenitw600')).toEqual([3]);
  });

  it('limit', () => {
    expect(searchFixtures(index, 'e', 2)).toHaveLength(2);
  });
});

describe('bundled public/fixtures.json', () => {
  const db = parseFixtureDatabase(JSON.parse(bundledJson));

  it('is a valid database from the MIT-licensed OFL', () => {
    expect(db).toBeDefined();
    expect(db!.source.license).toBe('MIT');
    expect(db!.fixtures.length).toBeGreaterThan(500);
  });

  it('spot check: generic/desk-channel 24 bit = Intensity, Intensity fine, Intensity fine^2', () => {
    const i = db!.fixtures.findIndex((f) => db!.manufacturers[f[0]]![0] === 'generic' && f[1] === 'desk-channel');
    const modes = fixtureAt(db!, i)!.modes;
    expect(modes.find((m) => m.name === '24 bit')!.channels).toEqual(['Intensity', 'Intensity fine', 'Intensity fine^2']);
  });

  it('search finds a real fixture: "stairville mh x30"', () => {
    const hits = searchFixtures(searchIndex(db!), 'stairville mh x30');
    expect(hits.length).toBeGreaterThan(0);
    expect(fixtureAt(db!, hits[0]!)!.id).toBe('stairville/mh-x30-led-spot');
  });

  it('ids are unique', () => {
    const ids = db!.fixtures.map((_, i) => fixtureAt(db!, i)!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
