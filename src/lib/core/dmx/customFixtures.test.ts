import { describe, expect, it } from 'vitest';
import {
  channelNamesFromText,
  countNameLines,
  exportCustomFixtures,
  mergeCustomFixtures,
  parseFixtureExport,
  validateCustomFixture,
} from './customFixtures';
import type { Fixture } from './fixtureDb';

const fixture = (o: Partial<Fixture> = {}): Fixture => ({
  id: 'custom/a',
  manufacturer: 'Robe',
  name: 'Spiider',
  modes: [{ name: 'Mode 1', channels: ['Pan', 'Tilt'] }],
  ...o,
});

describe('channel names from pasted text', () => {
  it('one name per line, missing names → "Kanal n", extra lines ignored', () => {
    expect(channelNamesFromText(3, 'Dimmer\n\nRot\n')).toEqual(['Dimmer', 'Kanal 2', 'Rot']);
    expect(channelNamesFromText(2, ' Pan \r\nTilt\nZoom')).toEqual(['Pan', 'Tilt']);
    expect(channelNamesFromText(2, '')).toEqual(['Kanal 1', 'Kanal 2']);
  });
  it('counts non-empty lines', () => {
    expect(countNameLines('Pan\nTilt\n\n Zoom \n')).toBe(3);
    expect(countNameLines('')).toBe(0);
  });
});

describe('validate custom fixture', () => {
  it('trims texts', () => {
    const r = validateCustomFixture(fixture({ manufacturer: ' Robe ', name: ' Spiider ', modes: [{ name: ' 1 ', channels: [' Pan '] }] }));
    expect(r).toEqual({ ok: true, value: fixture({ modes: [{ name: '1', channels: ['Pan'] }] }) });
  });
  it('rejects missing name, no modes, empty or duplicate mode names (case-insensitive), 0 or 513 channels', () => {
    expect(validateCustomFixture(fixture({ name: ' ' }))).toEqual({ ok: false, error: 'missingName' });
    expect(validateCustomFixture(fixture({ modes: [] }))).toEqual({ ok: false, error: 'noModes' });
    expect(validateCustomFixture(fixture({ modes: [{ name: '', channels: ['a'] }] }))).toEqual({ ok: false, error: 'missingModeName' });
    expect(
      validateCustomFixture(fixture({ modes: [{ name: 'Std', channels: ['a'] }, { name: 'std', channels: ['b'] }] })),
    ).toEqual({ ok: false, error: 'duplicateModeName' });
    expect(validateCustomFixture(fixture({ modes: [{ name: 'm', channels: [] }] }))).toEqual({ ok: false, error: 'invalidChannelCount' });
    expect(validateCustomFixture(fixture({ modes: [{ name: 'm', channels: new Array(513).fill('x') }] }))).toEqual({
      ok: false,
      error: 'invalidChannelCount',
    });
    expect(validateCustomFixture(fixture({ modes: [{ name: 'm', channels: new Array(512).fill('x') }] })).ok).toBe(true);
  });
  it('manufacturer may be empty', () => {
    expect(validateCustomFixture(fixture({ manufacturer: '' })).ok).toBe(true);
  });
});

describe('export / import', () => {
  const date = new Date('2026-10-10T12:00:00Z');

  it('round trip', () => {
    const list = [fixture(), fixture({ id: 'custom/b', name: 'Other' })];
    const text = JSON.stringify(exportCustomFixtures(list, date));
    expect(JSON.parse(text).exported).toBe('2026-10-10');
    expect(parseFixtureExport(text)).toEqual({ ok: true, value: list });
  });

  it('ids outside the custom namespace are moved into it (cannot shadow database fixtures)', () => {
    const text = JSON.stringify(exportCustomFixtures([fixture({ id: 'robe/spiider' })], date));
    const r = parseFixtureExport(text);
    expect(r.ok && r.value[0]!.id).toBe('custom/robe/spiider');
  });

  it('rejects other files', () => {
    expect(parseFixtureExport('kein json')).toEqual({ ok: false, error: 'notJson' });
    expect(parseFixtureExport('{"format":"x","fixtures":[]}')).toEqual({ ok: false, error: 'wrongFormat' });
    expect(parseFixtureExport('{"format":"av-tools-fixtures","version":2,"fixtures":[]}')).toEqual({ ok: false, error: 'newerVersion' });
    const bad = { format: 'av-tools-fixtures', version: 1, exported: '', fixtures: [{ id: 'x', name: 'N', manufacturer: 'M', modes: [{ name: 'm', channels: [1] }] }] };
    expect(parseFixtureExport(JSON.stringify(bad))).toEqual({ ok: false, error: 'invalidFixture' });
    const empty = { ...bad, fixtures: [{ id: 'x', name: '', manufacturer: 'M', modes: [{ name: 'm', channels: ['a'] }] }] };
    expect(parseFixtureExport(JSON.stringify(empty))).toEqual({ ok: false, error: 'invalidFixture' });
  });

  it('merge: new ids are added, existing ids replaced', () => {
    const a = fixture();
    const b = fixture({ id: 'custom/b' });
    const a2 = fixture({ name: 'Spiider neu' });
    const r = mergeCustomFixtures([a, b], [a2, fixture({ id: 'custom/c' })]);
    expect(r.added).toBe(1);
    expect(r.updated).toBe(1);
    expect(r.fixtures.map((f) => f.name)).toEqual(['Spiider neu', 'Spiider', 'Spiider']);
  });
});
