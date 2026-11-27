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
  CHAIN_COMBO,
  RESPAWN_SECONDS,
  DOWNED,
  DUEL,
  MATCH_STATE,
  SIEGE,
  type EnemyKind,
} from "./schema/ArenaState.js";
import { stepEntity } from "../shared/movement.js";
import {
  PLAYER_COLORS,
  sanitizeColor,
  sanitizeName,
} from "../shared/profile.js";
import {
  TICK_RATE,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_HALF,
  MAX_HEALTH,
  STORM_PHASES,
  STORM_START_RADIUS,
  type StormPhase,
} from "../shared/constants.js";
import { MODE_CODE, TEAM_NAMES, modeForRoom, type GameMode } from "../shared/modes.js";
import { CHAT_COOLDOWN_MS, sanitizeChat, type ChatMessage } from "../shared/chat.js";
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

/** Duel rounds are short: the ring becomes the round timer. */
const DUEL_STORM_PHASES: readonly StormPhase[] = [
  { hold: 14, shrink: 14, radius: 310, dps: 4 },
  { hold: 9, shrink: 10, radius: 160, dps: 7 },
  { hold: 6, shrink: 8, radius: 64, dps: 11 },
];

/** Siege rings close around the altar, so both tribes must fight for it. */
const SIEGE_STORM_PHASES: readonly StormPhase[] = [
  { hold: 22, shrink: 16, radius: 330, dps: 3 },
  { hold: 14, shrink: 15, radius: 180, dps: 6 },
  { hold: 9, shrink: 12, radius: 96, dps: 9 },
  { hold: 8, shrink: 10, radius: 58, dps: 13 },
];

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
  private cinematicRemaining = 0;
  private storm!: StormRuntime;
  private stormPhases: readonly StormPhase[] = STORM_PHASES;
  private nextEnemyId = 0;
  private waveActive = false;
  private mode: GameMode = "coop";
  private altarCharge = 0;
  private matchOverTimer = 0;
  /**
   * A PvP room with a single warrior runs a co-op-style hunt until a rival
   * arrives. The room keeps its mode so matchmaking still lands in the right
   * rules, and the practice run is dropped the moment a second warrior joins.
   */
  private soloPractice = false;

  private attackCooldown = new Map<string, number>();
  private rageTimer = new Map<string, number>();
  private invulnerable = new Map<string, number>();
  private enemyCooldown = new Map<string, number>();
  private comboTimer = new Map<string, number>();
  /** Last chat timestamp per session, so one client cannot flood the room. */
  private chatCooldown = new Map<string, number>();

  messages = {
    // movement arrives through the input buffer above - register handlers here
    // only for things that are not inputs (chat, emotes, …).
  };

  onCreate(options: any) {
    this.mode = modeForRoom(this.roomName, options?.mode);
    this.stormPhases = this.mode === "duel"
      ? DUEL_STORM_PHASES
      : this.mode === "siege"
        ? SIEGE_STORM_PHASES
        : STORM_PHASES;

    this.state.mode = MODE_CODE[this.mode];
    this.state.matchState = MATCH_STATE.waiting;
    this.state.round = 0;
    this.state.roundTimer = 0;
    this.state.scoreRed = 0;
    this.state.scoreBlue = 0;
    this.state.altar = 0;
    this.state.winnerTeam = 255;
    this.state.winnerName = "";
    this.state.roundWinner = "";
    this.state.pickupX = ARENA_WIDTH / 2;
    this.state.pickupY = ARENA_HEIGHT / 2;
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;

    this.resetStorm();
    this.state.started = false;
    this.state.paused = false;
    this.state.wave = 0;
    this.state.waveTimer = 3;

    this.onMessage("ready", () => {
      if (this.started) { return; }
      // Every mode can start with a single warrior. PvP modes run a solo hunt
      // until a rival arrives instead of leaving the player stuck in the lobby.
      this.startMatch();
    });

    this.onMessage("restart", () => {
      if (this.state.matchState !== MATCH_STATE.matchOver) { return; }
      this.restartMatch();
    });

    this.onMessage("togglePause", () => {
      if (!this.started) { return; }
      // Solo runs may pause. In a shared arena only an already-paused room
      // may be resumed, so one player can never freeze everyone else.
      if (this.state.players.size > 1 && !this.state.paused) { return; }
      this.state.paused = !this.state.paused;
    });

    this.onMessage("rageCinematic", () => {
      if (!this.started || this.state.paused) { return; }
      // The slow-motion finale freezes the arena, so it is solo only.
      if (this.state.players.size > 1) { return; }
      this.cinematicRemaining = 4.8;
    });

    this.onMessage("chat", (client, text) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) { return; }

      const message = sanitizeChat(text);
      if (!message) { return; }

      const now = Date.now();
      const last = this.chatCooldown.get(client.sessionId) ?? 0;
      if (now - last < CHAT_COOLDOWN_MS) { return; }
      this.chatCooldown.set(client.sessionId, now);

      const payload: ChatMessage = {
        sessionId: client.sessionId,
        name: sanitizeName(player.name) || "Wanderer",
        color: player.color,
        text: message,
      };
      this.broadcast("chat", payload);
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

  private chooseTeam(): 0 | 1 {
    let red = 0;
    let blue = 0;
    for (const [, player] of this.state.players) {
      if (player.team === 0) { red += 1; } else { blue += 1; }
    }
    return red <= blue ? 0 : 1;
  }

  private spawnFor(slot: number, team: 0 | 1): { x: number; y: number } {
    if (this.mode === "duel") {
      const angle = -Math.PI / 2 + (slot % 8) * ((Math.PI * 2) / 8);
      const radius = 130;
      return {
        x: clamp(ARENA_WIDTH / 2 + Math.cos(angle) * radius, PLAYER_HALF, ARENA_WIDTH - PLAYER_HALF),
        y: clamp(ARENA_HEIGHT / 2 + Math.sin(angle) * radius, PLAYER_HALF, ARENA_HEIGHT - PLAYER_HALF),
      };
    }
    if (this.mode === "siege") {
      const side = team === 0 ? 1 : -1;
      const lane = (slot % 8) - 3.5;
      return {
        x: clamp(ARENA_WIDTH / 2 + lane * 24, PLAYER_HALF, ARENA_WIDTH - PLAYER_HALF),
        y: clamp(ARENA_HEIGHT / 2 + side * 150, PLAYER_HALF, ARENA_HEIGHT - PLAYER_HALF),
      };
    }
    // Everyone drops onto the southern approach, spread across a shallow arc.
    // The chase camera faces north, so the ruined plaza is in view from the
    // first frame and nobody spawns on top of anybody else.
    const angle = Math.PI / 2 + ((slot % 9) - 4) * 0.11;
    const radius = 160 + Math.floor(slot / 9) * 34;
    return {
      x: clamp(ARENA_WIDTH / 2 + Math.cos(angle) * radius, PLAYER_HALF, ARENA_WIDTH - PLAYER_HALF),
      y: clamp(ARENA_HEIGHT / 2 + Math.sin(angle) * radius, PLAYER_HALF, ARENA_HEIGHT - PLAYER_HALF),
    };
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");

    const slot = this.joinCount++;
    const team = this.mode === "siege" ? this.chooseTeam() : 0;
    const spawn = this.spawnFor(slot, team);
    const name = sanitizeName(options?.name) || `Wanderer ${slot + 1}`;
    const color = sanitizeColor(options?.color) ?? PLAYER_COLORS[slot % PLAYER_COLORS.length].value;

    // A duelist who arrives after the round began sits out until the next one.
    const waitingForDuel = this.mode === "duel"
      && this.state.matchState !== MATCH_STATE.waiting;

    this.state.players.set(client.sessionId, new Player({
      name,
      color,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      health: waitingForDuel ? 0 : MAX_HEALTH,
      alive: !waitingForDuel,
      kills: 0,
      weapon: 2,
      comboStep: 0,
      throwSeq: 0,
      throwX: 0,
      throwY: 0,
      rage: 0,
      raging: false,
      respawnTimer: 0,
      team,
      downed: false,
      out: waitingForDuel,
      reviveProgress: 0,
      wins: 0,
      revives: 0,
    }));

    // A solo player may have paused. A new arrival resumes the hunt.
    if (this.state.paused) {
      this.state.paused = false;
    }

    this.attackCooldown.set(client.sessionId, 0);
    this.invulnerable.set(client.sessionId, 2);

    // PvP modes begin as soon as two warriors share the arena.
    if (this.mode !== "coop") {
      if (this.started && this.soloPractice && this.state.players.size >= 2) {
        // A rival arrived. Drop the practice hunt and start the real contest.
        this.beginVersusMatch();
      } else if (!this.started && this.state.players.size >= 2) {
        this.startMatch();
      }
    }
  }

  onLeave(client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
    this.state.players.delete(client.sessionId);
    this.attackCooldown.delete(client.sessionId);
    this.rageTimer.delete(client.sessionId);
    this.invulnerable.delete(client.sessionId);
    this.comboTimer.delete(client.sessionId);
    this.chatCooldown.delete(client.sessionId);

    if (this.state.players.size === 0) {
      this.resetToWaiting();
      return;
    }

    if (this.mode === "coop") {
      this.checkCoopEnd();
      return;
    }

    if (this.state.matchState !== MATCH_STATE.live) { return; }

    if (this.mode === "duel") {
      const alive: Player[] = [];
      for (const [, player] of this.state.players) {
        if (player.alive) { alive.push(player); }
      }
      if (alive.length <= 1) {
        this.endDuelRound(alive[0] ?? null);
      } else if (this.state.players.size < 2) {
        this.resetToWaiting();
      }
      return;
    }

    // Siege: an empty tribe cannot hold the altar.
    const red = this.countTeam(0);
    const blue = this.countTeam(1);
    if (red === 0) {
      this.finishMatch(TEAM_NAMES[1], 1);
    } else if (blue === 0) {
      this.finishMatch(TEAM_NAMES[0], 0);
    }
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
  private resetStorm() {
    const centre: Circle = {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      radius: STORM_START_RADIUS,
    };
    const first = this.stormPhases[0] ?? STORM_PHASES[0];

    this.storm = {
      mode: "hold",
      phase: 0,
      remaining: first.hold,
      duration: first.hold,
      from: centre,
      to: centre,
      dps: first.dps,
    };

    this.writeStormCircle(centre);
    this.state.stormPhase = 0;
    this.state.stormMode = STORM_MODE.hold;
    this.state.stormTimer = first.hold;
    this.state.stormDps = first.dps;
  }

  private countTeam(team: number): number {
    let count = 0;
    for (const [, player] of this.state.players) {
      if (player.team === team) { count += 1; }
    }
    return count;
  }

  private findPlayerByName(name: string): Player | null {
    if (!name) { return null; }
    for (const [, player] of this.state.players) {
      if (player.name === name) { return player; }
    }
    return null;
  }

  private clearEnemies() {
    for (const id of this.state.enemies.keys()) {
      this.state.enemies.delete(id);
      this.enemyCooldown.delete(id);
    }
  }

  private placePlayers(mode: GameMode) {
    let index = 0;
    for (const [sessionId, player] of this.state.players) {
      const team = mode === "siege" ? (player.team as 0 | 1) : 0;
      const spawn = this.spawnFor(index, team);
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      player.health = MAX_HEALTH;
      player.alive = true;
      player.downed = false;
      player.out = false;
      player.reviveProgress = 0;
      player.respawnTimer = 0;
      player.rage = 0;
      player.raging = false;
      player.comboStep = 0;
      player.weapon = 2;
      this.attackCooldown.set(sessionId, 0);
      this.invulnerable.set(sessionId, 2);
      this.rageTimer.delete(sessionId);
      this.comboTimer.set(sessionId, 0);
      index += 1;
    }
  }

  private startMatch() {
    if (this.started) { return; }
    if (this.state.players.size < 1) { return; }

    this.started = true;
    this.soloPractice = false;
    this.state.started = true;
    this.state.paused = false;
    this.state.matchState = MATCH_STATE.live;
    this.state.round = 0;
    this.state.roundTimer = 0;
    this.state.scoreRed = 0;
    this.state.scoreBlue = 0;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.state.winnerTeam = 255;
    this.state.winnerName = "";
    this.state.roundWinner = "";
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;
    this.state.wave = 0;
    this.waveActive = false;

    for (const [, player] of this.state.players) {
      player.wins = 0;
      player.kills = 0;
      player.revives = 0;
    }

    if (this.mode === "coop") {
      this.clearEnemies();
      this.resetStorm();
      this.placePlayers("coop");
      this.state.waveTimer = 2.5;
    } else if (this.state.players.size < 2) {
      // No rival yet. Hunt the storm alone; a join switches to the real mode.
      this.beginSoloPractice();
    } else if (this.mode === "duel") {
      this.beginDuelRound();
    } else {
      this.beginSiegeRound();
    }
  }

  /** The shared setup for a lone warrior in a PvP room. */
  private beginSoloPractice() {
    this.soloPractice = true;
    this.state.matchState = MATCH_STATE.live;
    this.state.round = 0;
    this.state.roundTimer = 0;
    this.state.wave = 0;
    this.state.waveTimer = 2.5;
    this.waveActive = false;
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.clearEnemies();
    this.resetStorm();
    this.placePlayers(this.mode);
  }

  /** A rival arrived: replace the practice hunt with the real contest. */
  private beginVersusMatch() {
    this.soloPractice = false;
    this.state.matchState = MATCH_STATE.live;
    this.state.round = 0;
    this.state.roundTimer = 0;
    this.state.scoreRed = 0;
    this.state.scoreBlue = 0;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.state.winnerTeam = 255;
    this.state.winnerName = "";
    this.state.roundWinner = "";
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;
    this.state.wave = 0;
    this.state.waveTimer = 0;
    this.waveActive = false;

    for (const [, player] of this.state.players) {
      player.kills = 0;
      player.revives = 0;
    }

    if (this.mode === "duel") {
      this.beginDuelRound();
    } else {
      this.beginSiegeRound();
    }
  }

  private restartMatch() {
    this.state.paused = false;
    this.cinematicRemaining = 0;
    this.state.wave = 0;
    this.state.waveTimer = 3;
    this.waveActive = false;
    this.state.scoreRed = 0;
    this.state.scoreBlue = 0;
    this.state.round = 0;
    this.state.roundTimer = 0;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.state.winnerTeam = 255;
    this.state.winnerName = "";
    this.state.roundWinner = "";
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;
    this.started = false;
    this.state.started = false;
    this.state.matchState = MATCH_STATE.waiting;
    this.idleTime = 0;
    this.clearEnemies();
    this.resetStorm();

    for (const [, player] of this.state.players) {
      player.wins = 0;
      player.kills = 0;
      player.revives = 0;
    }
    this.placePlayers(this.mode);

    // Anyone still here can start again. A lone warrior gets a practice hunt.
    if (this.state.players.size >= 1) {
      this.startMatch();
    }
  }

  private resetToWaiting() {
    this.started = false;
    this.soloPractice = false;
    this.state.started = false;
    this.state.matchState = MATCH_STATE.waiting;
    this.state.roundTimer = 0;
    this.state.round = 0;
    this.state.scoreRed = 0;
    this.state.scoreBlue = 0;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.state.winnerTeam = 255;
    this.state.winnerName = "";
    this.state.roundWinner = "";
    this.state.pickupActive = false;
    this.state.pickupTimer = 0;
    this.state.wave = 0;
    this.state.waveTimer = 3;
    this.waveActive = false;
    this.clearEnemies();
    this.resetStorm();
    if (this.state.players.size > 0) {
      this.placePlayers(this.mode);
    }
  }

  private spawnPickup() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 70;
    this.state.pickupX = ARENA_WIDTH / 2 + Math.cos(angle) * distance;
    this.state.pickupY = ARENA_HEIGHT / 2 + Math.sin(angle) * distance;
    this.state.pickupActive = true;
    this.state.pickupTimer = 0;
  }

  private beginDuelRound() {
    this.soloPractice = false;
    this.state.round = Math.min(255, this.state.round + 1);
    this.state.matchState = MATCH_STATE.live;
    this.state.roundTimer = DUEL.roundSeconds;
    this.state.roundWinner = "";
    this.state.winnerName = "";
    this.state.winnerTeam = 255;
    this.state.wave = 0;
    this.state.waveTimer = 0;
    this.waveActive = false;
    this.resetStorm();
    this.clearEnemies();
    this.spawnPickup();
    this.placePlayers("duel");
  }

  private beginSiegeRound() {
    this.soloPractice = false;
    this.state.round = Math.min(255, this.state.round + 1);
    this.state.matchState = MATCH_STATE.live;
    this.state.roundTimer = SIEGE.roundSeconds;
    this.state.altar = 0;
    this.altarCharge = 0;
    this.state.roundWinner = "";
    this.state.wave = 0;
    this.state.waveTimer = 10;
    this.waveActive = false;
    this.resetStorm();
    this.clearEnemies();
    this.placePlayers("siege");
  }

  private endDuelRound(winner: Player | null) {
    if (this.state.matchState !== MATCH_STATE.live) { return; }
    if (winner) {
      winner.wins = Math.min(255, winner.wins + 1);
      this.state.roundWinner = winner.name;
    } else {
      this.state.roundWinner = "Draw";
    }
    this.state.matchState = MATCH_STATE.roundOver;
    this.state.roundTimer = DUEL.resetDelay;
  }

  private endSiegeRound(team: number) {
    if (this.state.matchState !== MATCH_STATE.live) { return; }
    if (team === 0) {
      this.state.scoreRed = Math.min(255, this.state.scoreRed + 1);
      this.state.roundWinner = TEAM_NAMES[0];
      this.state.winnerTeam = 0;
    } else if (team === 1) {
      this.state.scoreBlue = Math.min(255, this.state.scoreBlue + 1);
      this.state.roundWinner = TEAM_NAMES[1];
      this.state.winnerTeam = 1;
    } else {
      this.state.roundWinner = "Draw";
      this.state.winnerTeam = 255;
    }
    this.state.matchState = MATCH_STATE.roundOver;
    this.state.roundTimer = SIEGE.resetDelay;
  }

  private finishMatch(winnerName: string, winnerTeam: number) {
    this.state.matchState = MATCH_STATE.matchOver;
    this.state.winnerName = winnerName;
    this.state.winnerTeam = winnerTeam;
    this.state.roundTimer = 0;
    this.matchOverTimer = 20;
  }

  private advanceRoundOver(dt: number) {
    this.state.roundTimer = Math.max(0, this.state.roundTimer - dt);
    if (this.state.roundTimer > 0) { return; }

    if (this.mode === "duel") {
      const winner = this.findPlayerByName(this.state.roundWinner);
      if (winner && winner.wins >= DUEL.roundsToWin) {
        this.finishMatch(winner.name, 255);
      } else if (this.state.players.size >= 2) {
        this.beginDuelRound();
      } else {
        // The only warrior left keeps playing instead of waiting in the lobby.
        this.resetToWaiting();
        this.startMatch();
      }
      return;
    }

    if (this.mode === "siege") {
      if (this.state.scoreRed >= SIEGE.capturesToWin) {
        this.finishMatch(TEAM_NAMES[0], 0);
      } else if (this.state.scoreBlue >= SIEGE.capturesToWin) {
        this.finishMatch(TEAM_NAMES[1], 1);
      } else if (this.state.players.size >= 2) {
        this.beginSiegeRound();
      } else {
        this.resetToWaiting();
        this.startMatch();
      }
    }
  }

  private advanceStorm(dt: number) {
    const storm = this.storm;
    storm.remaining -= dt;

    if (storm.mode === "hold" && storm.remaining <= 0) {
      const phase = this.stormPhases[storm.phase];

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

        const next = this.stormPhases[storm.phase];
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

  private stopPlayer(sessionId: string, player: Player) {
    player.alive = false;
    player.health = 0;
    player.vx = 0;
    player.vy = 0;
    player.raging = false;
    player.rage = 0;
    player.comboStep = 0;
    this.rageTimer.delete(sessionId);
    this.comboTimer.delete(sessionId);
    this.invulnerable.set(sessionId, 1.5);
  }

  /** Co-op solo and siege: the storm brings the warrior back after a delay. */
  private killPlayer(sessionId: string, player: Player) {
    this.stopPlayer(sessionId, player);
    player.downed = false;
    player.out = false;
    player.reviveProgress = 0;
    player.respawnTimer = RESPAWN_SECONDS;
  }

  /** Co-op with allies: stay down and let a friend pull you back up. */
  private downPlayer(sessionId: string, player: Player) {
    this.stopPlayer(sessionId, player);
    player.downed = true;
    player.out = false;
    player.reviveProgress = 0;
    player.respawnTimer = DOWNED.bleedoutSeconds;
  }

  /** Duel: no respawn inside a round. */
  private defeatPlayer(sessionId: string, player: Player) {
    this.stopPlayer(sessionId, player);
    player.downed = false;
    player.out = true;
    player.reviveProgress = 0;
    player.respawnTimer = 0;
  }

  private reviveDowned(sessionId: string, player: Player) {
    player.health = DOWNED.reviveHealth;
    player.alive = true;
    player.downed = false;
    player.out = false;
    player.respawnTimer = 0;
    player.reviveProgress = 0;
    player.vx = 0;
    player.vy = 0;
    player.revives = Math.min(65535, player.revives + 1);
    this.invulnerable.set(sessionId, 2.5);
    this.attackCooldown.set(sessionId, 0);
  }

  private tickDowned(dt: number) {
    if (this.mode !== "coop") { return; }

    for (const [sessionId, player] of this.state.players) {
      if (!player.downed) { continue; }

      player.respawnTimer = Math.max(0, player.respawnTimer - dt);

      let helpers = 0;
      let helperId: string | null = null;
      for (const [otherId, other] of this.state.players) {
        if (otherId === sessionId || !other.alive) { continue; }
        if (Math.hypot(other.x - player.x, other.y - player.y) <= DOWNED.reviveRadius) {
          helpers += 1;
          if (!helperId) { helperId = otherId; }
        }
      }

      if (helpers > 0) {
        const speed = 1 + (helpers - 1) * 0.5;
        player.reviveProgress = Math.min(
          1,
          player.reviveProgress + (dt * speed) / DOWNED.reviveSeconds
        );
        if (player.reviveProgress >= 1) {
          this.reviveDowned(sessionId, player);
          if (helperId) {
            const helper = this.state.players.get(helperId);
            if (helper) {
              helper.revives = Math.min(65535, helper.revives + 1);
            }
          }
          continue;
        }
      } else {
        player.reviveProgress = Math.max(0, player.reviveProgress - dt * 0.25);
      }

      if (player.respawnTimer <= 0 && player.downed) {
        player.downed = false;
        player.out = true;
        player.reviveProgress = 0;
      }
    }

    this.checkCoopEnd();
  }

  private checkCoopEnd() {
    if (this.mode !== "coop" || !this.started) { return; }
    if (this.state.players.size < 2 || this.state.matchState !== MATCH_STATE.live) { return; }

    for (const [, player] of this.state.players) {
      if (player.alive) { return; }
    }
    this.finishMatch("", 255);
  }

  private reviveOutPlayers() {
    if (this.mode !== "coop") { return; }

    let anyAlive = false;
    for (const [, player] of this.state.players) {
      if (player.alive) { anyAlive = true; break; }
    }
    if (!anyAlive) { return; }

    for (const [sessionId, player] of this.state.players) {
      if (player.alive || !player.out) { continue; }
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
      player.health = DOWNED.reviveHealth;
      player.alive = true;
      player.downed = false;
      player.out = false;
      player.respawnTimer = 0;
      player.reviveProgress = 0;
      this.invulnerable.set(sessionId, 2.5);
      this.attackCooldown.set(sessionId, 0);
    }
  }

  private respawnPlayer(sessionId: string, player: Player) {
    if (this.mode === "siege") {
      const spawn = this.spawnFor(
        Math.abs(Math.floor(Math.random() * 8)),
        (player.team as 0 | 1)
      );
      player.x = spawn.x;
      player.y = spawn.y;
    } else {
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
    }
    player.health = MAX_HEALTH;
    player.alive = true;
    player.downed = false;
    player.out = false;
    player.respawnTimer = 0;
    player.reviveProgress = 0;
    player.vx = 0;
    player.vy = 0;
    this.invulnerable.set(sessionId, 2.5);
    this.attackCooldown.set(sessionId, 0);
    player.comboStep = 0;
    this.comboTimer.set(sessionId, 0);
  }

  private canHarmPlayer(attacker: Player, target: Player): boolean {
    if (attacker === target || !target.alive || target.downed) { return false; }
    const targetId = this.playerId(target);
    if (targetId && (this.invulnerable.get(targetId) ?? 0) > 0) { return false; }
    if (this.mode === "duel") { return true; }
    if (this.mode === "siege") { return attacker.team !== target.team; }
    return false;
  }

  /**
   * PvP damage. Returns true when the target fell, so the caller can award
   * the kill and rage.
   */
  private damagePlayer(
    attacker: Player,
    targetId: string,
    target: Player,
    amount: number,
    knockback: number
  ): boolean {
    target.health = Math.max(0, target.health - amount);
    if (!target.raging) {
      target.rage = Math.min(PLAYER_RAGE.max, target.rage + Math.min(12, amount * 0.15));
    }

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy) || 1;
    target.x = clamp(target.x + (dx / distance) * knockback, PLAYER_HALF, ARENA_WIDTH - PLAYER_HALF);
    target.y = clamp(target.y + (dy / distance) * knockback, PLAYER_HALF, ARENA_HEIGHT - PLAYER_HALF);

    if (target.health <= 0) {
      if (this.mode === "duel") {
        this.defeatPlayer(targetId, target);
      } else {
        this.killPlayer(targetId, target);
      }
      return true;
    }
    return false;
  }

  private handleAttack(sessionId: string, player: Player) {
    if (player.weapon !== 2) {
      this.swingWeapon(sessionId, player);
      player.comboStep = 0;
      this.comboTimer.set(sessionId, 0);
      return;
    }

    if ((this.comboTimer.get(sessionId) ?? 0) <= 0) {
      player.comboStep = 0;
    }

    if (player.comboStep >= 2) {
      if (this.throwChainBlades(sessionId, player)) {
        player.comboStep = 0;
        this.comboTimer.set(sessionId, 0);
        return;
      }
      // No target in chain range. Fall through to a normal swing and keep the
      // finisher armed so the next press can throw when a foe is close enough.
    }

    this.swingWeapon(sessionId, player);
    player.comboStep = Math.min(2, player.comboStep + 1);
    this.comboTimer.set(sessionId, CHAIN_COMBO.window);
  }

  private throwChainBlades(sessionId: string, player: Player): boolean {
    type ChainTarget =
      | { type: "enemy"; enemy: Enemy }
      | { type: "player"; id: string; target: Player };

    let primary: ChainTarget | null = null;
    let bestDistance: number = CHAIN_COMBO.range;

    if (this.mode !== "duel" || this.soloPractice) {
      for (const [, enemy] of this.state.enemies) {
        if (!enemy.alive) { continue; }
        const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        if (distance <= bestDistance) {
          bestDistance = distance;
          primary = { type: "enemy", enemy };
        }
      }
    }

    if (this.mode !== "coop") {
      for (const [id, other] of this.state.players) {
        if (!this.canHarmPlayer(player, other)) { continue; }
        const distance = Math.hypot(other.x - player.x, other.y - player.y);
        if (distance <= bestDistance) {
          bestDistance = distance;
          primary = { type: "player", id, target: other };
        }
      }
    }

    if (!primary) {
      return false;
    }

    const multiplier = player.raging ? PLAYER_ATTACK.rageDamage : 1;
    const impactX = primary.type === "enemy" ? primary.enemy.x : primary.target.x;
    const impactY = primary.type === "enemy" ? primary.enemy.y : primary.target.y;

    if (primary.type === "enemy") {
      const enemy = primary.enemy;
      const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
      const stats = ENEMY_STATS[kind];
      enemy.health = Math.max(0, enemy.health - CHAIN_COMBO.damage * multiplier);
      enemy.hitFlash = 1;

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      enemy.x = clamp(enemy.x + (dx / distance) * CHAIN_COMBO.knockback, 12, ARENA_WIDTH - 12);
      enemy.y = clamp(enemy.y + (dy / distance) * CHAIN_COMBO.knockback, 12, ARENA_HEIGHT - 12);

      if (enemy.health <= 0) {
        enemy.alive = false;
        enemy.vx = 0;
        enemy.vy = 0;
        player.kills = Math.min(65535, player.kills + 1);
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + stats.rage);
      } else {
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + 20);
      }
    } else {
      const fell = this.damagePlayer(
        player,
        primary.id,
        primary.target,
        CHAIN_COMBO.damage * multiplier,
        CHAIN_COMBO.knockback
      );
      player.rage = Math.min(PLAYER_RAGE.max, player.rage + 20);
      if (fell) {
        player.kills = Math.min(65535, player.kills + 1);
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + 20);
      }
    }

    // The returning blades lash everything around the impact point.
    if (this.mode !== "duel" || this.soloPractice) {
      for (const [, enemy] of this.state.enemies) {
        if (!enemy.alive || (primary.type === "enemy" && enemy === primary.enemy)) { continue; }
        if (Math.hypot(enemy.x - impactX, enemy.y - impactY) > CHAIN_COMBO.splashRadius) {
          continue;
        }
        enemy.health = Math.max(0, enemy.health - CHAIN_COMBO.splashDamage * multiplier);
        enemy.hitFlash = 1;
        if (enemy.health <= 0) {
          const splashKind = ENEMY_KINDS[enemy.kind] ?? "draugr";
          enemy.alive = false;
          enemy.vx = 0;
          enemy.vy = 0;
          player.kills = Math.min(65535, player.kills + 1);
          player.rage = Math.min(PLAYER_RAGE.max, player.rage + ENEMY_STATS[splashKind].rage);
        }
      }
    }

    if (this.mode !== "coop") {
      for (const [id, other] of this.state.players) {
        if (!this.canHarmPlayer(player, other)) { continue; }
        if (primary.type === "player" && id === primary.id) { continue; }
        if (Math.hypot(other.x - impactX, other.y - impactY) > CHAIN_COMBO.splashRadius) {
          continue;
        }
        const fell = this.damagePlayer(
          player,
          id,
          other,
          CHAIN_COMBO.splashDamage * multiplier,
          CHAIN_COMBO.knockback * 0.6
        );
        if (fell) {
          player.kills = Math.min(65535, player.kills + 1);
          player.rage = Math.min(PLAYER_RAGE.max, player.rage + 20);
        }
      }
    }

    player.throwSeq = (player.throwSeq + 1) % 65536;
    player.throwX = impactX;
    player.throwY = impactY;
    this.attackCooldown.set(sessionId, CHAIN_COMBO.cooldown);
    return true;
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

    type SwingTarget =
      | { type: "enemy"; enemy: Enemy; distance: number; dx: number; dy: number; radius: number }
      | { type: "player"; id: string; target: Player; distance: number; dx: number; dy: number; radius: number };

    const inRange: SwingTarget[] = [];

    if (this.mode !== "duel" || this.soloPractice) {
      for (const [, enemy] of this.state.enemies) {
        if (!enemy.alive) { continue; }
        const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
        const stats = ENEMY_STATS[kind];
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= weapon.range + stats.radius) {
          inRange.push({ type: "enemy", enemy, distance, dx, dy, radius: stats.radius });
        }
      }
    }

    if (this.mode !== "coop") {
      for (const [id, other] of this.state.players) {
        if (!this.canHarmPlayer(player, other)) { continue; }
        const dx = other.x - player.x;
        const dy = other.y - player.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= weapon.range + PLAYER_HALF) {
          inRange.push({
            type: "player",
            id,
            target: other,
            distance,
            dx,
            dy,
            radius: PLAYER_HALF,
          });
        }
      }
    }

    const targets = weapon.cleave
      ? inRange
      : inRange.sort((a, b) => a.distance - b.distance).slice(0, 1);

    for (const target of targets) {
      connected = true;

      if (target.type === "enemy") {
        const enemy = target.enemy;
        const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
        const stats = ENEMY_STATS[kind];
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
        continue;
      }

      const fell = this.damagePlayer(
        player,
        target.id,
        target.target,
        damage,
        PLAYER_ATTACK.knockback
      );

      if (weapon.healOnHit > 0) {
        player.health = Math.min(MAX_HEALTH, player.health + weapon.healOnHit);
      }
      player.rage = Math.min(PLAYER_RAGE.max, player.rage + weapon.ragePerHit);
      if (fell) {
        player.kills = Math.min(65535, player.kills + 1);
        player.rage = Math.min(PLAYER_RAGE.max, player.rage + 20);
        if (weapon.healOnKill > 0) {
          player.health = Math.min(MAX_HEALTH, player.health + weapon.healOnKill);
        }
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
    // More warriors means more foes. The hunt should not get easier in a group.
    const extra = Math.min(8, Math.max(0, this.state.players.size - 1) * 2);

    if (wave % 5 === 0) {
      const draugr = Math.min(9, 2 + Math.floor(wave / 5) + Math.ceil(extra / 2));
      return ["colossus", ...Array<EnemyKind>(draugr).fill("draugr")];
    }
    const list: EnemyKind[] = [];
    const draugr = Math.min(14, 3 + Math.floor(wave / 2) + extra);
    for (let i = 0; i < draugr; i++) { list.push("draugr"); }
    if (wave >= 2) { list.push("troll"); }
    if (wave >= 3) { list.push("god"); }
    if (wave >= 6) { list.push("god"); }
    if (wave >= 8) { list.push("troll"); }
    if (this.state.players.size >= 4 && wave >= 4) { list.push("troll"); }
    return list;
  }

  /** Siege waves are small interference packs, not the main objective. */
  private siegeComposition(wave: number): EnemyKind[] {
    const list: EnemyKind[] = ["draugr", "draugr"];
    if (this.state.players.size >= 3) { list.push("draugr"); }
    if (wave % 3 === 0) { list.push("troll"); }
    if (wave % 5 === 0) { list.push("god"); }
    return list;
  }

  private spawnEnemy(kind: EnemyKind, wave: number) {
    const stats = ENEMY_STATS[kind];
    const scale = 1 + Math.max(0, wave - 1) * 0.09;
    const groupScale = 1 + Math.max(0, this.state.players.size - 1) * 0.4;
    const health = Math.round(stats.health * scale * groupScale);

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
    // A real duel has no monsters. A lone duelist hunts waves instead.
    if (this.mode === "duel" && !this.soloPractice) { return; }

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

    const composition = this.mode === "siege"
      ? this.siegeComposition(this.state.wave)
      : this.waveComposition(this.state.wave);
    for (const kind of composition) {
      this.spawnEnemy(kind, this.state.wave);
    }
  }

  private tickWaves(dt: number) {
    if (!this.started || (this.mode === "duel" && !this.soloPractice)) {
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
      this.state.waveTimer = this.mode === "siege" ? 12 : 4.5;
      if (this.mode === "coop") {
        this.reviveOutPlayers();
      }
    }
  }

  private tickDuel(dt: number) {
    if (this.mode !== "duel" || this.state.matchState !== MATCH_STATE.live) { return; }

    this.state.roundTimer = Math.max(0, this.state.roundTimer - dt);

    let alive: Player | null = null;
    let aliveCount = 0;
    for (const [, player] of this.state.players) {
      if (!player.alive) { continue; }
      aliveCount += 1;
      alive = player;
    }

    if (aliveCount <= 1) {
      this.endDuelRound(alive);
      return;
    }

    if (this.state.pickupActive) {
      for (const [, player] of this.state.players) {
        if (!player.alive) { continue; }
        if (Math.hypot(player.x - this.state.pickupX, player.y - this.state.pickupY) > DUEL.pickupRadius) {
          continue;
        }
        player.health = Math.min(MAX_HEALTH, player.health + DUEL.pickupHeal);
        this.state.pickupActive = false;
        this.state.pickupTimer = DUEL.pickupRespawn;
        break;
      }
    } else {
      this.state.pickupTimer = Math.max(0, this.state.pickupTimer - dt);
      if (this.state.pickupTimer <= 0) {
        this.spawnPickup();
      }
    }

    if (this.state.roundTimer <= 0) {
      // Time is up. The healthiest warrior takes the round.
      let best: Player | null = null;
      for (const [, player] of this.state.players) {
        if (!player.alive) { continue; }
        if (!best || player.health > best.health) { best = player; }
      }
      this.endDuelRound(best);
    }
  }

  private tickSiege(dt: number) {
    if (this.mode !== "siege" || this.state.matchState !== MATCH_STATE.live) { return; }

    this.state.roundTimer = Math.max(0, this.state.roundTimer - dt);

    let red = 0;
    let blue = 0;
    const centreX = ARENA_WIDTH / 2;
    const centreY = ARENA_HEIGHT / 2;
    for (const [, player] of this.state.players) {
      if (!player.alive) { continue; }
      if (Math.hypot(player.x - centreX, player.y - centreY) > SIEGE.altarRadius) {
        continue;
      }
      if (player.team === 0) { red += 1; } else { blue += 1; }
    }

    if (red > 0 && blue === 0) {
      this.altarCharge += SIEGE.chargePerSecond * dt;
    } else if (blue > 0 && red === 0) {
      this.altarCharge -= SIEGE.chargePerSecond * dt;
    } else {
      const decay = SIEGE.decayPerSecond * dt;
      if (this.altarCharge > 0) {
        this.altarCharge = Math.max(0, this.altarCharge - decay);
      } else if (this.altarCharge < 0) {
        this.altarCharge = Math.min(0, this.altarCharge + decay);
      }
    }

    this.altarCharge = clamp(this.altarCharge, -100, 100);
    this.state.altar = Math.round(this.altarCharge * 10) / 10;

    if (this.altarCharge >= 100) {
      this.endSiegeRound(0);
      return;
    }
    if (this.altarCharge <= -100) {
      this.endSiegeRound(1);
      return;
    }

    if (this.state.roundTimer <= 0) {
      this.endSiegeRound(Math.abs(this.altarCharge) < 2 ? -1 : this.altarCharge > 0 ? 0 : 1);
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
            const damageScale = 1 + Math.max(0, this.state.players.size - 1) * 0.12;
            target.health = Math.max(0, target.health - stats.damage * damageScale);
            if (target.health <= 0) {
              const sessionId = this.playerId(target);
              if (sessionId) {
                if (this.mode === "coop" && this.state.players.size > 1) {
                  this.downPlayer(sessionId, target);
                } else {
                  this.killPlayer(sessionId, target);
                }
              }
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

    if (this.state.paused) {
      return;
    }

    if (this.cinematicRemaining > 0) {
      this.cinematicRemaining = Math.max(0, this.cinematicRemaining - dt);
      return;
    }

    if (this.state.matchState === MATCH_STATE.matchOver) {
      this.matchOverTimer = Math.max(0, this.matchOverTimer - dt);
      if (this.matchOverTimer <= 0) {
        this.restartMatch();
      }
      return;
    }

    if (this.state.matchState === MATCH_STATE.roundOver) {
      this.advanceRoundOver(dt);
      return;
    }

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
      // Nobody pressed ready. Do not leave a lone warrior in an empty lobby.
      if (this.idleTime >= 20) {
        this.startMatch();
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

      if (player.downed) {
        continue;
      }

      if (!player.alive) {
        // Solo co-op and solo PvP keep the old six second return. A siege
        // always respawns. A multiplayer co-op warrior is out until the wave
        // is cleared, and a fallen duelist waits for the next round.
        if (
          this.soloPractice
          || this.mode === "siege"
          || (this.mode === "coop" && this.state.players.size === 1)
        ) {
          player.respawnTimer = Math.max(0, player.respawnTimer - dt);
          if (player.respawnTimer <= 0) {
            this.respawnPlayer(sessionId, player);
          }
        }
        continue;
      }

      this.attackCooldown.set(
        sessionId,
        Math.max(0, (this.attackCooldown.get(sessionId) ?? 0) - dt)
      );

      const comboTimer = Math.max(0, (this.comboTimer.get(sessionId) ?? 0) - dt);
      this.comboTimer.set(sessionId, comboTimer);
      if (comboTimer <= 0 && player.comboStep > 0) {
        player.comboStep = 0;
      }

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
            player.comboStep = 0;
            this.comboTimer.set(sessionId, 0);
            this.attackCooldown.set(sessionId, Math.max(0.2, this.attackCooldown.get(sessionId) ?? 0));
          }
          if (input.special) {
            this.tryRage(sessionId, player);
          }
          if (input.attack && (this.attackCooldown.get(sessionId) ?? 0) <= 0) {
            this.handleAttack(sessionId, player);
          }
        }
      }

      const damage = stormDamage(circle, player.x, player.y, this.storm.dps, dt);
      if (damage > 0) {
        player.health = applyDamage(player.health, damage);
        if (player.health <= 0) {
          if (this.mode === "duel" && !this.soloPractice) {
            this.defeatPlayer(sessionId, player);
          } else if (this.mode === "coop" && this.state.players.size > 1) {
            this.downPlayer(sessionId, player);
          } else {
            this.killPlayer(sessionId, player);
          }
        }
      }
    }

    if (this.mode === "coop") {
      this.tickDowned(dt);
      if (this.state.matchState !== MATCH_STATE.live) { return; }
      this.tickEnemies(dt);
      this.tickWaves(dt);
      this.checkCoopEnd();
      return;
    }

    if (this.soloPractice) {
      // A lone warrior hunts the storm instead of fighting a phantom rival.
      this.tickEnemies(dt);
      this.tickWaves(dt);
      return;
    }

    if (this.mode === "siege") {
      this.tickEnemies(dt);
      this.tickWaves(dt);
      this.tickSiege(dt);
      return;
    }

    this.tickDuel(dt);
  }
}
