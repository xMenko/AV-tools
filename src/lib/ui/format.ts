const LOCALE = 'de-DE';
const cache = new Map<string, Intl.NumberFormat>();

function formatter(digits: number, minDigits: number, grouping: boolean): Intl.NumberFormat {
  const key = `${digits}/${minDigits}/${grouping}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: minDigits, useGrouping: grouping });
    cache.set(key, f);
  }
  return f;
}

/** Display format for results: fixed number of decimals, German decimal comma. */
export function fmt(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return '–';
  return formatter(digits, digits, true).format(value);
}

/** Editable format for input fields: up to `digits` decimals, no grouping. */
export function fmtInput(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '';
  return formatter(digits, 0, false).format(value);
}

/** Parses "1,5", "1.5", "-2", " 3 " → number; undefined if not a number. */
export function parseNumber(text: string): number | undefined {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.' || t === '-.') return undefined;
  if (!/^-?\d*\.?\d*$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export const ms = (seconds: number | undefined, digits = 2) => fmt(seconds === undefined ? undefined : seconds * 1000, digits);
