/** Simulation rate in Hz. One input advances exactly one step at this rate. */
export const TICK_RATE = 30;

/** Island size in world units. 1000 x 1000 is roughly a 3 minute walk corner to corner. */
export const ARENA_WIDTH = 1000;
export const ARENA_HEIGHT = 1000;

/** Half-extent of a player square, used for wall clamping. */
export const PLAYER_HALF = 12;

/** Units per second at full stick. */
export const PLAYER_SPEED = 260;
