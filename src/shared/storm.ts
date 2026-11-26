/**
 * The storm is a circle that holds, contracts, and holds again. These helpers
 * are pure so the server can own the simulation and the tests can exercise it
 * without booting a room.
 */

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export type Rng = () => number;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** A player is safe while their feet are on or inside the circle. */
export function isInside(circle: Circle, x: number, y: number): boolean {
  return distance(circle.x, circle.y, x, y) <= circle.radius;
}

/** Health to remove for one tick. Zero while inside the circle. */
export function stormDamage(
  circle: Circle,
  x: number,
  y: number,
  dps: number,
  dt: number
): number {
  return isInside(circle, x, y) ? 0 : dps * dt;
}

/** Move a circle linearly from `from` to `to`; `t` is clamped to [0, 1]. */
export function lerpCircle(from: Circle, to: Circle, t: number): Circle {
  const k = clamp01(t);
  return {
    x: from.x + (to.x - from.x) * k,
    y: from.y + (to.y - from.y) * k,
    radius: from.radius + (to.radius - from.radius) * k,
  };
}

/**
 * Pick the next circle entirely inside the previous one, so shrinking never
 * strands a player behind a wall that was not visible before. `sqrt(rng())`
 * spreads the centre uniformly over the available disc instead of clustering
 * it at the middle.
 */
export function nextCircle(
  previous: Circle,
  nextRadius: number,
  rng: Rng = Math.random
): Circle {
  const maxOffset = Math.max(0, previous.radius - nextRadius);
  const angle = rng() * Math.PI * 2;
  const offset = Math.sqrt(rng()) * maxOffset;

  return {
    x: previous.x + Math.cos(angle) * offset,
    y: previous.y + Math.sin(angle) * offset,
    radius: nextRadius,
  };
}

/** Health after taking storm damage, floored at zero. */
export function applyDamage(health: number, amount: number): number {
  return Math.max(0, health - amount);
}
