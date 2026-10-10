import { type Result, ok, err } from '../result';

/** Device convention for DMX address DIP switches. */
export interface DipProfile {
  /** false: switch 1 = 1 (LSB) … switch 9 = 256; true: switch 1 = 256 … switch 9 = 1 */
  readonly msbFirst: boolean;
  /** true: a switch in position ON means bit = 0 */
  readonly inverted: boolean;
  /** address = sum of switch values + offset */
  readonly offset: 0 | 1;
  /** 9 address switches; with 10 the last one is a function switch and not part of the address */
  readonly switches: 9 | 10;
}

/** Spec 2.4: switch 1 = 1, ON = 1, address = sum, 10 switches (switch 10 not part of the address). */
export const DEFAULT_DIP_PROFILE: DipProfile = { msbFirst: false, inverted: false, offset: 0, switches: 10 };

export const ADDRESS_SWITCHES = 9;
const MAX_SUM = 2 ** ADDRESS_SWITCHES - 1; // 511

export type DipError = 'outOfRange';

/** Lowest and highest address the profile can represent (DMX addresses are 1–512). */
export function dipRange(profile: DipProfile): { min: number; max: number } {
  return { min: 1, max: Math.min(512, MAX_SUM + profile.offset) };
}

/** Value of a switch (1-based switch number) when its bit is set. */
export function switchValue(switchNumber: number, profile: DipProfile): number {
  if (switchNumber < 1 || switchNumber > ADDRESS_SWITCHES) return 0;
  return 2 ** (profile.msbFirst ? ADDRESS_SWITCHES - switchNumber : switchNumber - 1);
}

/** Address → physical switch positions (index 0 = switch 1, true = ON). A function switch 10 stays OFF. */
export function addressToDip(address: number, profile: DipProfile): Result<boolean[], DipError> {
  const { min, max } = dipRange(profile);
  if (!Number.isInteger(address) || address < min || address > max) return err('outOfRange');
  return ok(dipPositions(address, profile)!);
}

/**
 * Like addressToDip, but also for addresses the switches can show although they are no valid DMX
 * address (0 with offset 0 = all bits off). Undefined if the switches cannot represent the address.
 */
export function dipPositions(address: number, profile: DipProfile): boolean[] | undefined {
  const sum = address - profile.offset;
  if (!Number.isInteger(sum) || sum < 0 || sum > MAX_SUM) return undefined;
  const positions: boolean[] = [];
  for (let n = 1; n <= profile.switches; n++) {
    if (n > ADDRESS_SWITCHES) {
      positions.push(false);
      continue;
    }
    const bit = (sum & switchValue(n, profile)) !== 0;
    positions.push(profile.inverted ? !bit : bit);
  }
  return positions;
}

/** Physical switch positions → address. May return 0 (not a valid DMX address – the UI warns). */
export function dipToAddress(positions: readonly boolean[], profile: DipProfile): number {
  let sum = 0;
  for (let n = 1; n <= ADDRESS_SWITCHES; n++) {
    const on = positions[n - 1] ?? false;
    if (profile.inverted ? !on : on) sum += switchValue(n, profile);
  }
  return sum + profile.offset;
}

/** Short form for tables: numbers of the switches that are physically ON (address switches only). */
export function dipOnSwitches(address: number, profile: DipProfile): Result<number[], DipError> {
  const r = addressToDip(address, profile);
  if (!r.ok) return r;
  return ok(r.value.slice(0, ADDRESS_SWITCHES).flatMap((on, i) => (on ? [i + 1] : [])));
}
