import { describe, expect, it } from 'vitest';
import { fmt, fmtInput, ms, parseNumber } from './format';

describe('format', () => {
  it('parses comma and point decimals', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('-2')).toBe(-2);
    expect(parseNumber(' 3 ')).toBe(3);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('-')).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
    expect(parseNumber('1,2,3')).toBeUndefined();
  });
  it('formats with German decimal comma', () => {
    expect(fmt(116.54515, 2)).toBe('116,55');
    expect(fmt(1234.5, 1)).toBe('1.234,5');
    expect(fmt(undefined)).toBe('–');
    expect(fmtInput(1.25, 3)).toBe('1,25');
    expect(fmtInput(40, 3)).toBe('40');
    expect(ms(0.11654515)).toBe('116,55');
  });
});
