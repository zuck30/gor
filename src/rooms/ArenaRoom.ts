import { Room, Client, CloseCode, type StepContext } from "colyseus";
import { ArenaState, Player, MoveInput } from "./schema/ArenaState.js";
import { stepEntity } from "../shared/movement.js";
import {
  TICK_RATE,
  ARENA_WIDTH,
  ARENA_HEIGHT,
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

export class ArenaRoom extends Room<{ state: ArenaState, input: MoveInput }> {
  maxClients = 16;
  state = new ArenaState();

  /**
   * Per-client input buffer. `sanitize` clamps every field as it is decoded —
   * never trust the wire — and the buffer holds ~2s of inputs at this tick rate
   * so a burst after a stall still replays in order.
   */
  inputs = this.defineInput(MoveInput, {
    bufferMaxSize: 64,
    sanitize: { moveX: [-1, 1], moveY: [-1, 1] },
  });

  private joinCount = 0;
  private storm!: StormRuntime;

  messages = {
    // movement arrives through the input buffer above — register handlers here
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

    this.setFixedTimestep((ctx) => this.step(ctx), TICK_RATE);
  }

  onJoin(client: Client, options: any) {
    console.log(client.sessionId, "joined!");

    // Deterministic spawn ring, so two players never start on top of each other.
    const angle = this.joinCount++ * 2.399963;
    this.state.players.set(client.sessionId, new Player({
      x: ARENA_WIDTH / 2 + Math.cos(angle) * 160,
      y: ARENA_HEIGHT / 2 + Math.sin(angle) * 160,
      vx: 0,
      vy: 0,
      health: MAX_HEALTH,
      alive: true,
    }));
  }

  onLeave(client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

  /**
   * Called on any disconnection the client did not ask for — a network blip, a
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

  /**
   * One fixed step: the storm advances every tick, movement only advances per
   * received input, and damage is charged against the circle as it stands after
   * that movement. A client that sends nothing simply does not move — an empty
   * tick advances no one, but the storm still closes.
   */
  private step(ctx: StepContext) {
    this.advanceStorm(ctx.dt);

    const circle: Circle = {
      x: this.state.stormX,
      y: this.state.stormY,
      radius: this.state.stormRadius,
    };

    for (const [sessionId, player] of this.state.players) {
      if (!player.alive) { continue; }

      const channel = this.inputs.get(sessionId);
      if (channel) {
        for (const input of channel) {
          stepEntity(player, input, ctx.dt);
        }
      }

      const damage = stormDamage(circle, player.x, player.y, this.storm.dps, ctx.dt);
      if (damage > 0) {
        player.health = applyDamage(player.health, damage);
        if (player.health <= 0) {
          player.alive = false;
        }
      }
    }
  }
}
