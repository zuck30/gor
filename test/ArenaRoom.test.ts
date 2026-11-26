import assert from "assert";
import { ColyseusTestServer, boot } from "@colyseus/testing";

import appConfig from "../src/app.config.js";
import {
  ArenaState,
  MATCH_STATE,
  type MoveInput,
} from "../src/rooms/schema/ArenaState.js";
import {
  MAX_HEALTH,
  PLAYER_SPEED,
  STORM_START_RADIUS,
  TICK_RATE,
} from "../src/shared/constants.js";

describe("testing your Colyseus app", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;

  before(async () => colyseus = await boot(appConfig));
  after(async () => colyseus.shutdown());

  beforeEach(async () => {
    await colyseus.cleanup();
  });

  it("advances a player from its buffered input", async () => {
    const room = await colyseus.createRoom<ArenaState>("arena", {});
    const client1 = await colyseus.connectTo(room);

    const player = room.state.players.get(client1.sessionId);
    assert.ok(player, "a Player is created on join");
    const startX = player.x;

    const input = client1.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 1;
    input.data.moveY = 0;
    input.send();

    await room.waitForNextMessage();  // the input reaches the server
    await room.waitForNextTimestep(); // the step that consumes it runs

    assert.ok(player.x > startX, "the buffered input advanced the player");
  });

  it("clamps input that is out of range", async () => {
    const room = await colyseus.createRoom<ArenaState>("arena", {});
    const client1 = await colyseus.connectTo(room);

    const player = room.state.players.get(client1.sessionId);
    const startX = player.x;

    // A modified client claiming a huge axis value: sanitize clamps it to 1.
    const input = client1.input<MoveInput>({ mode: "reliable" });
    input.data.moveX = 100 as any;
    input.send();

    await room.waitForNextMessage();
    await room.waitForNextTimestep();

    // The room steps once per received input, so one input is exactly one step
    // of travel - at moveX clamped to 1, not the 100 the client asked for.
    assert.strictEqual(player.x, startX + PLAYER_SPEED * (1 / TICK_RATE));
  });

  it("starts a duel when two warriors share the room", async () => {
    const room = await colyseus.createRoom<ArenaState>("duel", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });

    assert.strictEqual(room.state.mode, 1);
    assert.strictEqual(room.state.matchState, MATCH_STATE.live);
    assert.strictEqual(room.state.round, 1);
    assert.strictEqual(room.state.players.size, 2);
    assert.strictEqual(room.state.players.get(client1.sessionId)?.alive, true);
    assert.strictEqual(room.state.players.get(client2.sessionId)?.alive, true);
  });

  it("lets duel opponents damage each other", async () => {
    const room = await colyseus.createRoom<ArenaState>("duel", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });
    await room.waitForNextTimestep();

    const player1 = room.state.players.get(client1.sessionId)!;
    const player2 = room.state.players.get(client2.sessionId)!;
    player2.x = player1.x + 8;
    player2.y = player1.y;
    player1.weapon = 0;
    (room as any).invulnerable.set(client2.sessionId, 0);

    (room as any).swingWeapon(client1.sessionId, player1);

    assert.ok(player2.health < MAX_HEALTH, "friendly fire hurts a duel opponent");
  });

  it("heals a duelist who reaches the health rune", async () => {
    const room = await colyseus.createRoom<ArenaState>("duel", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    await colyseus.connectTo(room, { name: "Beta" });
    await room.waitForNextTimestep();

    const player1 = room.state.players.get(client1.sessionId)!;
    player1.health = 40;
    player1.x = room.state.pickupX;
    player1.y = room.state.pickupY;
    (room as any).tickDuel(0.1);

    assert.ok(player1.health > 40, "the rune restores health");
    assert.strictEqual(room.state.pickupActive, false);
  });

  it("ends a duel round when only one warrior stands", async () => {
    const room = await colyseus.createRoom<ArenaState>("duel", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });
    await room.waitForNextTimestep();

    const player2 = room.state.players.get(client2.sessionId)!;
    (room as any).defeatPlayer(client2.sessionId, player2);
    await room.waitForNextTimestep();

    assert.strictEqual(room.state.matchState, MATCH_STATE.roundOver);
    assert.strictEqual(room.state.roundWinner, "Alpha");
    assert.strictEqual(room.state.players.get(client1.sessionId)?.wins, 1);
  });

  it("splits siege players into opposing tribes and charges the altar", async () => {
    const room = await colyseus.createRoom<ArenaState>("siege", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });
    await room.waitForNextTimestep();

    const player1 = room.state.players.get(client1.sessionId)!;
    const player2 = room.state.players.get(client2.sessionId)!;
    assert.strictEqual(room.state.mode, 2);
    assert.notStrictEqual(player1.team, player2.team);

    player1.x = 500;
    player1.y = 500;
    player2.x = 100;
    player2.y = 100;
    for (let i = 0; i < 10; i += 1) {
      (room as any).tickSiege(0.5);
    }

    assert.ok(room.state.altar > 0, "the team alone on the altar charges it");
  });

  it("downs and revives a co-op warrior beside an ally", async () => {
    const room = await colyseus.createRoom<ArenaState>("coop", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });
    client1.send("ready");
    await room.waitForNextTimestep();

    const player1 = room.state.players.get(client1.sessionId)!;
    const player2 = room.state.players.get(client2.sessionId)!;
    player2.x = player1.x + 4;
    player2.y = player1.y;

    (room as any).downPlayer(client1.sessionId, player1);
    await room.waitForNextTimestep();
    assert.strictEqual(player1.downed, true);
    assert.strictEqual(player1.alive, false);

    for (let i = 0; i < 100 && player1.downed; i += 1) {
      await room.waitForNextTimestep();
    }

    assert.strictEqual(player1.downed, false);
    assert.strictEqual(player1.alive, true);
    assert.ok(player1.health > 0);
  });

  it("ends the co-op run when every warrior is down", async () => {
    const room = await colyseus.createRoom<ArenaState>("coop", {});
    const client1 = await colyseus.connectTo(room, { name: "Alpha" });
    const client2 = await colyseus.connectTo(room, { name: "Beta" });
    client1.send("ready");
    await room.waitForNextTimestep();

    const player1 = room.state.players.get(client1.sessionId)!;
    const player2 = room.state.players.get(client2.sessionId)!;
    (room as any).downPlayer(client1.sessionId, player1);
    (room as any).downPlayer(client2.sessionId, player2);
    await room.waitForNextTimestep();

    assert.strictEqual(room.state.matchState, MATCH_STATE.matchOver);
  });

  it("scales co-op enemies with the number of warriors", async () => {
    const solo = await colyseus.createRoom<ArenaState>("coop", {});
    const soloClient = await colyseus.connectTo(solo, { name: "Solo" });
    soloClient.send("ready");
    await solo.waitForNextTimestep();
    (solo as any).startWave();
    const soloDraugr = [...solo.state.enemies.values()].find((enemy) => enemy.kind === 0);
    assert.ok(soloDraugr, "the wave spawned a draugr");

    const duo = await colyseus.createRoom<ArenaState>("coop", {});
    const duoClient1 = await colyseus.connectTo(duo, { name: "Alpha" });
    await colyseus.connectTo(duo, { name: "Beta" });
    duoClient1.send("ready");
    await duo.waitForNextTimestep();
    (duo as any).startWave();
    const duoDraugr = [...duo.state.enemies.values()].find((enemy) => enemy.kind === 0);
    assert.ok(duoDraugr, "the duo wave spawned a draugr");

    assert.ok(
      duoDraugr.maxHealth > soloDraugr.maxHealth,
      "a second warrior makes draugr tougher"
    );
  });

  it("spawns a full-health player inside the opening storm", async () => {
    const room = await colyseus.createRoom<ArenaState>("arena", {});
    const client1 = await colyseus.connectTo(room);

    const player = room.state.players.get(client1.sessionId);
    assert.ok(player, "a Player is created on join");
    assert.strictEqual(player.health, MAX_HEALTH);
    assert.strictEqual(player.alive, true);

    assert.strictEqual(room.state.stormMode, 0, "the first phase holds");
    assert.strictEqual(room.state.stormPhase, 0);
    assert.strictEqual(room.state.stormRadius, STORM_START_RADIUS);
    assert.ok(room.state.stormTimer > 0 && room.state.stormTimer <= 30);
  });
});
