import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * One input frame, consumed by `Room.defineInput()`. Flat primitives only, and
 * deliberately minimal:
 *   - no `seq`  — the engine's input counter is the sequence
 *   - no `dt`   — fixed timestep: one input advances exactly one step
 *   - no time   — the SDK stamps lag-comp timing on the wire envelope
 *
 * `int8<-1 | 0 | 1>` narrows the type for your code; the room's `sanitize`
 * clamp is what actually enforces it against a modified client.
 */
export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>(),
  moveY: t.int8<-1 | 0 | 1>(),
});
export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema({
  x: t.number(),
  y: t.number(),
  vx: t.number(),
  vy: t.number(),
  /** 0..MAX_HEALTH. Float on the wire; the client rounds for display. */
  health: t.number(),
  /** False once health hits zero; dead players stop moving and stop rendering. */
  alive: t.boolean(),
});
export type Player = SchemaType<typeof Player>;

/**
 * The storm is part of the synchronised state, not a server-only secret: the
 * client draws the same circle the server uses for damage.
 *
 * `stormMode`: 0 = holding, 1 = shrinking, 2 = final (all phases done).
 */
export const ArenaState = schema({

  players: t.map(Player),

  stormX: t.number(),
  stormY: t.number(),
  stormRadius: t.number(),
  stormPhase: t.uint8(),
  stormMode: t.uint8(),
  /** Seconds left in the current hold or shrink. */
  stormTimer: t.number(),
  /** Damage per second outside the circle during the current phase. */
  stormDps: t.number(),

});
export type ArenaState = SchemaType<typeof ArenaState>;
