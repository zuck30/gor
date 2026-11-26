import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * The hunt. Enemy kinds are a small enum on the wire:
 *   0 draugr   - fast, fragile, comes in packs
 *   1 troll    - slow, heavy, hits like a falling tree
 *   2 god      - the jealous ones, armed and quick
 *   3 colossus - the wave boss, a walking mountain
 */
export const ENEMY_KINDS = ["draugr", "troll", "god", "colossus"] as const;
export type EnemyKind = (typeof ENEMY_KINDS)[number];

export interface EnemyStats {
  health: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  aggro: number;
  scale: number;
  rage: number;
  radius: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  draugr: { health: 55, speed: 46, damage: 8, range: 9, cooldown: 1.1, aggro: 290, scale: 0.85, rage: 16, radius: 4 },
  troll: { health: 210, speed: 31, damage: 18, range: 15, cooldown: 1.9, aggro: 330, scale: 1.55, rage: 30, radius: 7 },
  god: { health: 150, speed: 40, damage: 13, range: 11, cooldown: 1.35, aggro: 340, scale: 1.15, rage: 24, radius: 4.5 },
  colossus: { health: 900, speed: 26, damage: 32, range: 22, cooldown: 2.4, aggro: 460, scale: 2.5, rage: 70, radius: 12 },
};

/** Player melee: a wide axe cleave, or the god sword's focused strike. */
export const PLAYER_ATTACK = {
  rageDamage: 2,
  knockback: 10,
};

export const WEAPONS = {
  axe: {
    name: "Axe of the Storm",
    damage: 58,
    range: 32,
    cooldown: 0.5,
    ragePerHit: 5,
    cleave: true,
    healOnHit: 0,
    healOnKill: 0,
  },
  sword: {
    name: "Sword of God",
    damage: 96,
    range: 40,
    cooldown: 0.36,
    ragePerHit: 7,
    cleave: false,
    healOnHit: 3,
    healOnKill: 18,
  },
  chain: {
    name: "Chain Blades",
    damage: 64,
    range: 46,
    cooldown: 0.42,
    ragePerHit: 5,
    cleave: true,
    healOnHit: 0,
    healOnKill: 0,
  },
} as const;

export type WeaponKind = keyof typeof WEAPONS;

export const PLAYER_RAGE = {
  max: 100,
  duration: 8,
};

/** Three chain-blade swings in a row hurl both blades on their chains. */
export const CHAIN_COMBO = {
  window: 1.8,
  range: 220,
  damage: 240,
  splashRadius: 34,
  splashDamage: 80,
  cooldown: 1.15,
  knockback: 34,
} as const;

export const RESPAWN_SECONDS = 6;

/** Match flow wire codes. Co-op jumps straight from waiting to live. */
export const MATCH_STATE = {
  waiting: 0,
  live: 1,
  roundOver: 2,
  matchOver: 3,
} as const;

/** Co-op downed state. Allies standing close fill the revive meter. */
export const DOWNED = {
  bleedoutSeconds: 20,
  reviveSeconds: 3,
  reviveRadius: 26,
  reviveHealth: 50,
} as const;

export const DUEL = {
  roundSeconds: 90,
  roundsToWin: 3,
  resetDelay: 4.5,
  pickupHeal: 35,
  pickupRespawn: 15,
  pickupRadius: 20,
} as const;

export const SIEGE = {
  roundSeconds: 120,
  capturesToWin: 3,
  resetDelay: 4.5,
  altarRadius: 70,
  chargePerSecond: 7,
  decayPerSecond: 4,
} as const;

export const MoveInput = schema({
  moveX: t.int8<-1 | 0 | 1>(),
  moveY: t.int8<-1 | 0 | 1>(),
  /** 1 on the tick the player swings the axe. */
  attack: t.uint8(),
  /** 1 on the tick the player unleashes rage (needs a full meter). */
  special: t.uint8(),
  /** 1 on the tick the player swaps weapon. */
  switchWeapon: t.uint8(),
});
export type MoveInput = SchemaType<typeof MoveInput>;

export const Player = schema({
  /** Chosen before joining; shown above the warrior and in the HUD. */
  name: t.string(),
  /** One of PLAYER_COLORS, chosen before joining. */
  color: t.string(),
  x: t.number(),
  y: t.number(),
  vx: t.number(),
  vy: t.number(),
  /** 0..MAX_HEALTH. Float on the wire; the client rounds for display. */
  health: t.number(),
  /** False once health hits zero; dead players respawn at the storm's eye. */
  alive: t.boolean(),
  kills: t.uint16(),
  /** 0 = Axe of the Storm, 1 = Sword of God, 2 = Chain Blades. */
  weapon: t.uint8(),
  /** Chain-blade combo progress, 0..2. The next swing throws the blades. */
  comboStep: t.uint8(),
  /** Increments whenever the chain-blades are thrown. */
  throwSeq: t.uint16(),
  throwX: t.number(),
  throwY: t.number(),
  /** 0..100, fills as the axe bites. */
  rage: t.number(),
  raging: t.boolean(),
  /** Seconds left before the storm gives the player back. */
  respawnTimer: t.number(),
  /** 0 = Red, 1 = Blue. Ignored outside Altar Siege. */
  team: t.uint8(),
  /** Co-op only: health reached zero and an ally may revive this warrior. */
  downed: t.boolean(),
  /** Co-op only: the bleedout finished. Returns when the wave is cleared. */
  out: t.boolean(),
  /** 0..1 fill of the current revive attempt. */
  reviveProgress: t.number(),
  /** Duel rounds won. */
  wins: t.uint8(),
  /** How many downed allies this warrior has pulled back up. */
  revives: t.uint16(),
});
export type Player = SchemaType<typeof Player>;

export const Enemy = schema({
  x: t.number(),
  y: t.number(),
  vx: t.number(),
  vy: t.number(),
  health: t.number(),
  maxHealth: t.number(),
  alive: t.boolean(),
  kind: t.uint8(),
  /** 0..1, decays after a hit - drives the client's flash. */
  hitFlash: t.number(),
});
export type Enemy = SchemaType<typeof Enemy>;

/**
 * The storm is part of the synchronised state, not a server-only secret: the
 * client draws the same circle the server uses for damage.
 *
 * `stormMode`: 0 = holding, 1 = shrinking, 2 = final (all phases done).
 */
export const ArenaState = schema({
  players: t.map(Player),
  enemies: t.map(Enemy),

  /** 0 = Storm Co-op, 1 = Storm Duel, 2 = Altar Siege. */
  mode: t.uint8(),
  /** See MATCH_STATE. */
  matchState: t.uint8(),
  /** Round number in duel and siege. */
  round: t.uint8(),
  /** Seconds left in a duel or siege round. */
  roundTimer: t.number(),
  /** Altar Siege captures. */
  scoreRed: t.uint8(),
  scoreBlue: t.uint8(),
  /** Signed altar charge, -100 (Blue) .. +100 (Red). */
  altar: t.number(),
  /** 0 = Red, 1 = Blue, 255 = none. */
  winnerTeam: t.uint8(),
  /** Winner of the whole match, or an empty string. */
  winnerName: t.string(),
  /** Winner of the round just played. */
  roundWinner: t.string(),

  /** Duel health rune. It always rises near the contested centre. */
  pickupX: t.number(),
  pickupY: t.number(),
  pickupActive: t.boolean(),
  pickupTimer: t.number(),

  /** False until a player opens the hunt. The storm and waves hold. */
  started: t.boolean(),
  /** The arena is paused for everyone in the room. */
  paused: t.boolean(),
  /** Wave of the hunt. Wave 5 and every fifth after it spawns a colossus. */
  wave: t.uint8(),
  /** Seconds until the next wave when the field is clear. */
  waveTimer: t.number(),

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
