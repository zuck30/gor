import { Room, Client, CloseCode, type StepContext } from "colyseus";
import {
  ArenaState,
  Player,
  Enemy,
  MoveInput,
  ENEMY_KINDS,
  ENEMY_STATS,
  PLAYER_ATTACK,
  PLAYER_RAGE,
  WEAPONS,
  RESPAWN_SECONDS,
  type EnemyKind,
} from "./schema/ArenaState.js";
import { stepEntity } from "../shared/movement.js";
import {
  TICK_RATE,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_HALF,
  MAX_HEALTH,
  STORM_PHASES,
  STORM_START_RADIUS,
} from "../shared/constants.js";
import {
  applyDamage,
  lerpCircle,
  nextCircle,
  stormDamage,
  type Circle,
} from "../shared/storm.js";

/** Wire codes for `stormMode`: the client only needs to know what to draw. */
type StormMode = "hold" | "shrink" | "final";
const STORM_MODE: Record<StormMode, number> = { hold: 0, shrink: 1, final: 2 };

interface StormRuntime {
  mode: StormMode;
  phase: number;
  /** Seconds left in the current hold or shrink. */
  remaining: number;
  /** Length of the current shrink, used to interpolate the radius. */
  duration: number;
  from: Circle;
  to: Circle;
  dps: number;
}

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

export class ArenaRoom extends Room<{ state: ArenaState, input: MoveInput }> {
  maxClients = 16;
  state = new ArenaState();

  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: {
      moveX: [-1, 1],
      moveY: [-1, 1],
      attack: [0, 1],
      special: [0, 1],
      switchWeapon: [0, 1],
    },
  });

  private joinCount = 0;
  private started = false;
  private idleTime = 0;
  private storm!: StormRuntime;
  private nextEnemyId = 0;
  private waveActive = false;

  private attackCooldown = new Map<string, number>();
  private rageTimer = new Map<string, number>();
  private invulnerable = new Map<string, number>();
  private enemyCooldown = new Map<string, number>();

  messages = {
    // movement arrives through the input buffer above - register handlers here
    // only for things that are not inputs (chat, emotes, …).
  };

  onCreate(options: any) {
    const centre: Circle = {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      radius: STORM_START_RADIUS,
    };

    this.storm = {
      mode: "hold",
      phase: 0,
      remaining: STORM_PHASES[0].hold,
      duration: STORM_PHASES[0].hold,
      from: centre,
      to: centre,
      dps: STORM_PHASES[0].dps,
    };

    this.writeStormCircle(centre);
    this.state.stormPhase = 0;
    this.state.stormMode = STORM_MODE.hold;
    this.state.stormTimer = STORM_PHASES[0].hold;
    this.state.stormDps = STORM_PHASES[0].dps;

    this.state.started = false;
    this.state.wave = 0;
    this.state.waveTimer = 3;

    this.onMessage("ready", () => {
      if (this.started) { return; }
      this.started = true;
      this.state.started = true;
      this.state.waveTimer = 2.5;
    });

    if (process.env.NODE_ENV !== "production") {
      this.onMessage("spawnBoss", () => {
        this.spawnEnemy("colossus", Math.max(1, this.state.wave));
      });
      this.onMessage("spawnFoe", (_client, kind: string) => {
        if (typeof kind === "string" && (ENEMY_KINDS as readonly string[]).includes(kind)) {
          this.spawnEnemy(kind as EnemyKind, Math.max(1, this.state.wave));
        }
      });
      this.onMessage("cheatRage", (client) => {
        const player = this.state.players.get(client.sessionId);
        if (player) {
          player.rage = PLAYER_RAGE.max;
        }
      });
    }

    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");

    // Everyone drops onto the southern approach, spread across a shallow arc.
    // The chase camera faces north, so the ruined plaza is in view from the
    // first frame and nobody spawns on top of anybody else.
    const slot = this.joinCount++;
    const angle = Math.PI / 2 + ((slot % 9) - 4) * 0.11;
    const radius = 160 + Math.floor(slot / 9) * 34;
    this.state.players.set(client.sessionId, new Player({
      x: ARENA_WIDTH / 2 + Math.cos(angle) * radius,
      y: ARENA_HEIGHT / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      health: MAX_HEALTH,
      alive: true,
      kills: 0,
      weapon: 2,
      rage: 0,
      raging: false,
      respawnTimer: 0,
    }));

    this.attackCooldown.set(client.sessionId, 0);
    this.invulnerable.set(client.sessionId, 2);
  }

  onLeave(client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
    this.state.players.delete(client.sessionId);
    this.attackCooldown.delete(client.sessionId);
    this.rageTimer.delete(client.sessionId);
    this.invulnerable.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  /**
   * Called on any disconnection the client did not ask for - a network blip, a
   * suspended tab, a tunnel change. Holding the seat lets the SDK retry into the
   * same session, so the player keeps their entity and their place in the room.
   */
  onDrop(client: Client, code: CloseCode) {
    // Deliberately not awaited: the framework routes the outcome to onReconnect()
    // or onLeave() by itself. The catch is only here because the promise also
    // rejects when the room is already disposing (server shutdown), which would
    // otherwise surface as an unhandled rejection.
    this.allowReconnection(client, 30).catch(() => {});
  }

  onReconnect(client: Client) {
    console.log(client.sessionId, "reconnected!");
  }

  /** Hold → shrink → hold … until the phases run out, then hold forever. */
  private advanceStorm(dt: number) {
    const storm = this.storm;
    storm.remaining -= dt;

    if (storm.mode === "hold" && storm.remaining <= 0) {
      const phase = STORM_PHASES[storm.phase];

      if (phase) {
        storm.from = {
          x: this.state.stormX,
          y: this.state.stormY,
          radius: this.state.stormRadius,
        };
        storm.to = nextCircle(storm.from, phase.radius);
        storm.mode = "shrink";
        storm.duration = phase.shrink;
        storm.remaining = phase.shrink;
        storm.dps = phase.dps;
      } else {
        storm.mode = "final";
        storm.remaining = 0;
      }
    } else if (storm.mode === "shrink") {
      if (storm.remaining <= 0) {
        // Land exactly on the target before the next hold begins.
        storm.from = storm.to;
        this.writeStormCircle(storm.to);
        storm.phase += 1;

        const next = STORM_PHASES[storm.phase];
        if (next) {
          storm.mode = "hold";
          storm.remaining = next.hold;
          storm.duration = next.hold;
          storm.dps = next.dps;
        } else {
          storm.mode = "final";
          storm.remaining = 0;
        }
      } else {
        const t = 1 - storm.remaining / storm.duration;
        this.writeStormCircle(lerpCircle(storm.from, storm.to, t));
      }
    }

    this.state.stormMode = STORM_MODE[storm.mode];
    this.state.stormPhase = storm.phase;
    this.state.stormTimer = Math.max(0, storm.remaining);
    this.state.stormDps = storm.dps;
  }

  private writeStormCircle(circle: Circle) {
    this.state.stormX = circle.x;
    this.state.stormY = circle.y;
    this.state.stormRadius = circle.radius;
  }

  // ------------------------------------------------------------------ combat

  private nearestPlayer(x: number, y: number): Player | null {
    let best: Player | null = null;
    let bestDistance = Infinity;
    for (const [, player] of this.state.players) {
      if (!player.alive) { continue; }
      const distance = Math.hypot(player.x - x, player.y - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    return best;
  }

  private killPlayer(sessionId: string, player: Player) {
    player.alive = false;
    player.health = 0;
    player.vx = 0;
    player.vy = 0;
    player.raging = false;
    player.rage = 0;
    player.respawnTimer = RESPAWN_SECONDS;
    this.rageTimer.delete(sessionId);
    this.invulnerable.set(sessionId, 1.5);
  }

  private respawnPlayer(sessionId: string, player: Player) {
    player.x = clamp(
      this.state.stormX + (Math.random() - 0.5) * 24,
      PLAYER_HALF,
      ARENA_WIDTH - PLAYER_HALF
    );
    player.y = clamp(
      this.state.stormY + (Math.random() - 0.5) * 24,
      PLAYER_HALF,
      ARENA_HEIGHT - PLAYER_HALF
    );
    player.health = MAX_HEALTH;
    player.alive = true;
    player.respawnTimer = 0;
    player.vx = 0;
    player.vy = 0;
    this.invulnerable.set(sessionId, 2.5);
    this.attackCooldown.set(sessionId, 0);
  }

  private swingWeapon(sessionId: string, player: Player) {
    const weapon = player.weapon === 1
      ? WEAPONS.sword
      : player.weapon === 2
        ? WEAPONS.chain
        : WEAPONS.axe;
    const multiplier = player.raging ? PLAYER_ATTACK.rageDamage : 1;
    const damage = weapon.damage * multiplier;
    let connected = false;

    const inRange: Array<{ enemy: Enemy; distance: number; dx: number; dy: number }> = [];
    for (const [, enemy] of this.state.enemies) {
      if (!enemy.alive) { continue; }
      const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
      const stats = ENEMY_STATS[kind];
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= weapon.range + stats.radius) {
        inRange.push({ enemy, distance, dx, dy });
      }
    }

    const targets = weapon.cleave
      ? inRange
      : inRange.sort((a, b) => a.distance - b.distance).slice(0, 1);

    for (const target of targets) {
      const enemy = target.enemy;
      const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
      const stats = ENEMY_STATS[kind];
      connected = true;
      enemy.health = Math.max(0, enemy.health - damage);
      enemy.hitFlash = 1;

      const nx = target.distance > 0.001 ? target.dx / target.distance : 1;
      const ny = target.distance > 0.001 ? target.dy / target.distance : 0;
      enemy.x = clamp(enemy.x + nx * PLAYER_ATTACK.knockback, 12, ARENA_WIDTH - 12);
      enemy.y = clamp(enemy.y + ny * PLAYER_ATTACK.knockback, 12, ARENA_HEIGHT - 12);

      if (weapon.healOnHit > 0) {
        player.health = Math.min(MAX_HEALTH, player.health + weapon.healOnHit);
      }

      if (enemy.health <= 0) {
        enemy.alive = false;
        enemy.vx = 0;
        enemy.vy = 0;
        player.kills = Math.min(65535, player.kills + 1);
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + stats.rage + weapon.ragePerHit);
        if (weapon.healOnKill > 0) {
          player.health = Math.min(MAX_HEALTH, player.health + weapon.healOnKill);
        }
      } else {
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + weapon.ragePerHit);
      }
    }

    this.attackCooldown.set(
      sessionId,
      connected ? weapon.cooldown : weapon.cooldown * 0.7
    );
  }

  private tryRage(sessionId: string, player: Player) {
    if (player.raging || player.rage < PLAYER_RAGE.max) { return; }
    player.raging = true;
    player.rage = 0;
    this.rageTimer.set(sessionId, PLAYER_RAGE.duration);
  }

  // ------------------------------------------------------------------- waves

  private waveComposition(wave: number): EnemyKind[] {
    if (wave % 5 === 0) {
      const draugr = Math.min(6, 2 + Math.floor(wave / 5));
      return ["colossus", ...Array<EnemyKind>(draugr).fill("draugr")];
    }
    const list: EnemyKind[] = [];
    const draugr = Math.min(8, 3 + Math.floor(wave / 2));
    for (let i = 0; i < draugr; i++) { list.push("draugr"); }
    if (wave >= 2) { list.push("troll"); }
    if (wave >= 3) { list.push("god"); }
    if (wave >= 6) { list.push("god"); }
    if (wave >= 8) { list.push("troll"); }
    return list;
  }

  private spawnEnemy(kind: EnemyKind, wave: number) {
    const stats = ENEMY_STATS[kind];
    const scale = 1 + Math.max(0, wave - 1) * 0.09;
    const health = Math.round(stats.health * scale);

    const players: Player[] = [];
    for (const [, player] of this.state.players) {
      if (player.alive) { players.push(player); }
    }
    const anchor = players.length > 0
      ? players[(Math.random() * players.length) | 0]
      : { x: this.state.stormX, y: this.state.stormY };

    const angle = Math.random() * Math.PI * 2;
    const distance = 105 + Math.random() * 70;
    let x = anchor.x + Math.cos(angle) * distance;
    let y = anchor.y + Math.sin(angle) * distance;

    // Keep the spawn inside the ring that is actually playable.
    const dx = x - this.state.stormX;
    const dy = y - this.state.stormY;
    const ringDistance = Math.hypot(dx, dy);
    const maxRadius = Math.max(40, this.state.stormRadius * 0.82);
    if (ringDistance > maxRadius) {
      x = this.state.stormX + (dx / ringDistance) * maxRadius;
      y = this.state.stormY + (dy / ringDistance) * maxRadius;
    }

    x = clamp(x, 18, ARENA_WIDTH - 18);
    y = clamp(y, 18, ARENA_HEIGHT - 18);

    const id = `e${this.nextEnemyId++}`;
    this.state.enemies.set(id, new Enemy({
      x,
      y,
      vx: 0,
      vy: 0,
      health,
      maxHealth: health,
      alive: true,
      kind: ENEMY_KINDS.indexOf(kind),
      hitFlash: 0,
    }));
    this.enemyCooldown.set(id, 0.5 + Math.random() * 0.7);
  }

  private startWave() {
    // Clear the previous wave's dead so the schema map never grows forever.
    for (const [id, enemy] of this.state.enemies) {
      if (!enemy.alive) {
        this.state.enemies.delete(id);
        this.enemyCooldown.delete(id);
      }
    }

    this.state.wave = Math.min(255, this.state.wave + 1);
    this.waveActive = true;
    this.state.waveTimer = 0;

    const composition = this.waveComposition(this.state.wave);
    for (const kind of composition) {
      this.spawnEnemy(kind, this.state.wave);
    }
  }

  private tickWaves(dt: number) {
    if (!this.started) {
      return;
    }
    if (this.state.waveTimer > 0) {
      this.state.waveTimer = Math.max(0, this.state.waveTimer - dt);
      if (this.state.waveTimer === 0 && !this.waveActive) {
        this.startWave();
      }
      return;
    }

    if (!this.waveActive) {
      return;
    }

    let living = 0;
    for (const [, enemy] of this.state.enemies) {
      if (enemy.alive) { living += 1; }
    }
    if (living === 0) {
      this.waveActive = false;
      this.state.waveTimer = 4.5;
    }
  }

  private tickEnemies(dt: number) {
    for (const [id, enemy] of this.state.enemies) {
      if (!enemy.alive) { continue; }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 3.5);

      const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
      const stats = ENEMY_STATS[kind];
      const target = this.nearestPlayer(enemy.x, enemy.y);

      if (!target) {
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const distance = Math.hypot(dx, dy);
      const reach = stats.range + stats.radius;

      if (distance > reach) {
        const speed = stats.speed;
        enemy.vx = distance > 0.001 ? (dx / distance) * speed : 0;
        enemy.vy = distance > 0.001 ? (dy / distance) * speed : 0;
        enemy.x = clamp(enemy.x + enemy.vx * dt, 12, ARENA_WIDTH - 12);
        enemy.y = clamp(enemy.y + enemy.vy * dt, 12, ARENA_HEIGHT - 12);
      } else {
        enemy.vx = 0;
        enemy.vy = 0;

        const cooldown = (this.enemyCooldown.get(id) ?? 0) - dt;
        if (cooldown <= 0) {
          const targetId = this.playerId(target);
          const shielded = targetId
            ? (this.invulnerable.get(targetId) ?? 0) > 0
            : false;

          if (!shielded) {
            target.health = Math.max(0, target.health - stats.damage);
            if (target.health <= 0) {
              const sessionId = this.playerId(target);
              if (sessionId) { this.killPlayer(sessionId, target); }
            }
          }
          this.enemyCooldown.set(id, stats.cooldown);
        } else {
          this.enemyCooldown.set(id, cooldown);
        }
      }
    }
  }

  private playerId(target: Player): string | null {
    for (const [sessionId, player] of this.state.players) {
      if (player === target) { return sessionId; }
    }
    return null;
  }

  // -------------------------------------------------------------------- step

  /**
   * One fixed step: the storm advances every tick, movement only advances per
   * received input, and damage is charged against the circle as it stands after
   * that movement.
   */
  private step(ctx: StepContext) {
    const dt = ctx.dt;

    // The briefing holds the hunt. Movement still works so a client can walk
    // around the drop zone; the storm, waves and enemies wait for "ready".
    if (!this.started) {
      this.idleTime += dt;
      for (const [sessionId, player] of this.state.players) {
        if (!player.alive) { continue; }
        const channel = this.inputs.get(sessionId);
        if (!channel) { continue; }
        for (const input of channel) {
          stepEntity(player, input, dt);
        }
      }
      if (this.idleTime >= 20) {
        this.started = true;
        this.state.started = true;
        this.state.waveTimer = 2.5;
      }
      return;
    }

    this.advanceStorm(dt);

    const circle: Circle = {
      x: this.state.stormX,
      y: this.state.stormY,
      radius: this.state.stormRadius,
    };

    for (const [sessionId, player] of this.state.players) {
      const invulnerable = Math.max(0, (this.invulnerable.get(sessionId) ?? 0) - dt);
      this.invulnerable.set(sessionId, invulnerable);

      if (!player.alive) {
        player.respawnTimer = Math.max(0, player.respawnTimer - dt);
        if (player.respawnTimer <= 0) {
          this.respawnPlayer(sessionId, player);
        }
        continue;
      }

      this.attackCooldown.set(
        sessionId,
        Math.max(0, (this.attackCooldown.get(sessionId) ?? 0) - dt)
      );

      if (player.raging) {
        const remaining = Math.max(0, (this.rageTimer.get(sessionId) ?? 0) - dt);
        this.rageTimer.set(sessionId, remaining);
        if (remaining <= 0) {
          player.raging = false;
        }
      }

      const channel = this.inputs.get(sessionId);
      if (channel) {
        for (const input of channel) {
          stepEntity(player, input, dt);

          if (input.switchWeapon) {
            player.weapon = (player.weapon + 1) % 3;
            this.attackCooldown.set(sessionId, Math.max(0.2, this.attackCooldown.get(sessionId) ?? 0));
          }
          if (input.special) {
            this.tryRage(sessionId, player);
          }
          if (input.attack && (this.attackCooldown.get(sessionId) ?? 0) <= 0) {
            this.swingWeapon(sessionId, player);
          }
        }
      }

      const damage = stormDamage(circle, player.x, player.y, this.storm.dps, dt);
      if (damage > 0) {
        player.health = applyDamage(player.health, damage);
        if (player.health <= 0) {
          this.killPlayer(sessionId, player);
        }
      }
    }

    this.tickEnemies(dt);
    this.tickWaves(dt);
  }
}
