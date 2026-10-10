/**
 * A point in metres.
 * x: horizontal distance along the main axis (away from the stage)
 * y: lateral offset (sign arbitrary, must be consistent)
 * z: height above the reference floor
 */
export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const point = (x: number, z: number, y = 0): Point3D => ({ x, y, z });

export function distance(a: Point3D, b: Point3D): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function isFinitePoint(p: Point3D): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
