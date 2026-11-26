/** Simulation rate in Hz. One input advances exactly one step at this rate. */
export const TICK_RATE = 30;

/** Island size in world units. 1000 x 1000 is roughly a 3 minute walk corner to corner. */
export const ARENA_WIDTH = 1000;
export const ARENA_HEIGHT = 1000;

/** Half-extent of a player square, used for wall clamping. */
export const PLAYER_HALF = 12;

/** Units per second at full stick. */
export const PLAYER_SPEED = 260;

/** Everyone drops in with the same pool; the storm is the only damage source for now. */
export const MAX_HEALTH = 100;

/** Covers the whole island: the half-diagonal of a 1000 x 1000 square is ~707. */
export const STORM_START_RADIUS = 760;

/**
 * One shrinking phase. The circle holds still for `hold` seconds, closes to
 * `radius` over `shrink` seconds, then the next phase begins. `dps` applies
 * the moment the phase starts, including its hold.
 */
export interface StormPhase {
  hold: number;
  shrink: number;
  radius: number;
  dps: number;
}

export const STORM_PHASES: readonly StormPhase[] = [
  { hold: 30, shrink: 30, radius: 520, dps: 2 },
  { hold: 25, shrink: 25, radius: 340, dps: 3 },
  { hold: 20, shrink: 20, radius: 200, dps: 5 },
  { hold: 20, shrink: 20, radius: 100, dps: 8 },
  { hold: 15, shrink: 20, radius: 40, dps: 12 },
];
