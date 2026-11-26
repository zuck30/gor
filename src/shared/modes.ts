/** The three ways to play The God of Rage. */
export const GAME_MODES = ["coop", "duel", "siege"] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Wire codes for `ArenaState.mode`. */
export const MODE_CODE: Record<GameMode, number> = {
  coop: 0,
  duel: 1,
  siege: 2,
};

/** Each mode has its own room, so matchmaking never mixes the rules. */
export const MODE_ROOM: Record<GameMode, string> = {
  coop: "coop",
  duel: "duel",
  siege: "siege",
};

export const MODE_LABEL: Record<GameMode, string> = {
  coop: "Storm Co-op",
  duel: "Storm Duel",
  siege: "Altar Siege",
};

export const MODE_TAGLINE: Record<GameMode, string> = {
  coop: "Fight the storm together. Revive fallen allies.",
  duel: "Every warrior for themselves. Last one standing wins the round.",
  siege: "Two tribes. One altar. Hold it longer than the enemy.",
};

export const MODE_RULES: Record<GameMode, readonly string[]> = {
  coop: [
    "Clear each wave together. Every fifth wave raises a colossus.",
    "A fallen warrior can be revived by an ally standing close.",
    "If every warrior is down at once, the hunt ends.",
  ],
  duel: [
    "First warrior to win three rounds takes the duel.",
    "Friendly fire is on. Weapons, rage, and the storm all hurt.",
    "When you fall, you wait for the next round.",
  ],
  siege: [
    "Stand inside the centre altar to charge it for your tribe.",
    "First tribe to three altar captures wins the siege.",
    "Monsters and the storm push both tribes at the same time.",
  ],
};

export const TEAM_NAMES = ["Red", "Blue"] as const;
export const TEAM_COLORS = ["#d24a3a", "#4a86d8"] as const;

/** Defaults to co-op so old profiles and old arena rooms keep working. */
export function sanitizeMode(value: unknown): GameMode {
  return typeof value === "string" && (GAME_MODES as readonly string[]).includes(value)
    ? (value as GameMode)
    : "coop";
}

/** The room name wins when it is one of the dedicated mode rooms. */
export function modeForRoom(roomName: string, requested: unknown): GameMode {
  if (roomName === "coop") { return "coop"; }
  if (roomName === "duel") { return "duel"; }
  if (roomName === "siege") { return "siege"; }
  return sanitizeMode(requested);
}
