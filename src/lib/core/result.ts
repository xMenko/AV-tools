/** Calculation result: either a value or a typed error code (shown as a message by the UI). */
export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
export const err = <E extends string>(error: E): { ok: false; error: E } => ({ ok: false, error });

export const isFiniteNumber = (x: number): boolean => Number.isFinite(x);
