import { type Result, ok, err } from '../result';

/**
 * Art-Net 4 Port-Address (15 bit): Net (bits 14–8, 0–127) · Sub-Net (bits 7–4, 0–15) · Universe (bits 3–0, 0–15).
 * Source: Art-Net 4 Protocol Specification (Artistic Licence), "Port-Address".
 */
export interface ArtNetAddress {
  readonly net: number;
  readonly subnet: number;
  readonly universe: number;
  /** 0–32767 */
  readonly portAddress: number;
}

/** Which Art-Net Port-Address DMX universe 1 maps to – consoles differ (e.g. 0:0:0 or 0:0:1). */
export type ArtNetBase = 0 | 1;

export const MAX_PORT_ADDRESS = 32767;

/** Highest 1-based DMX universe that still has an Art-Net address for the given base. */
export const maxUniverse = (base: ArtNetBase = 0): number => MAX_PORT_ADDRESS + 1 - base;

/** DMX universe (1-based) → Art-Net address. */
export function artNetAddress(universe: number, base: ArtNetBase = 0): Result<ArtNetAddress, 'outOfRange'> {
  if (!Number.isInteger(universe) || universe < 1) return err('outOfRange');
  const portAddress = universe - 1 + base;
  if (portAddress > MAX_PORT_ADDRESS) return err('outOfRange');
  return ok({ net: portAddress >> 8, subnet: (portAddress >> 4) & 0xf, universe: portAddress & 0xf, portAddress });
}
