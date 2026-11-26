# Tufani

> the storm decides.

Tufani is a lite, browser-based battle royale. Small island, short matches, one shrinking storm, last player standing. No install, no launcher — open a URL and drop in.

This is the playable prototype: authoritative movement, client-side prediction, reconnection and a 3D island rendered with Three.js.

## Stack

| Layer | Choice |
|---|---|
| Client | Three.js + Vite + TypeScript |
| Server | Colyseus 0.18 (authoritative rooms, fixed 30 Hz tick) |
| Netcode | server input buffer + client prediction + interpolation |
| Physics | flat-ground movement for now; Rapier comes with loot/collision |

The client and server share one deterministic movement step (`src/shared/movement.ts`), so prediction and authority never disagree.

## Run it

Requires Node 20.19+ (22 LTS recommended).

```bash
npm install
npm start
```

Open the URL Vite prints (usually <http://localhost:5173>). Open a second tab to see another player. The Colyseus rooms, `/playground` and `/monitor` share that port in development.

```bash
npm test        # boots a real server, connects a real client
npm run build   # client + server
npm run loadtest
```

## Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` or arrow keys |

Mouse aim, shooting, loot and the storm are next on the list.

## How a match will play

1. Open the URL, join the arena.
2. Loot a weapon, ammo, armor and medkits.
3. The storm closes in four phases; outside it you take damage.
4. Last player standing wins.

Target format: **16–32 players**, **8–10 minute matches**, **third-person**, small island with a handful of points of interest.

## Project layout

```
index.html                     HUD, canvas mount, controls
src/app.config.ts              server definition (rooms, routes, dev tools)
src/rooms/ArenaRoom.ts         room lifecycle, input buffer, fixed tick
src/rooms/schema/ArenaState.ts synchronized state + input schema
src/shared/movement.ts         the one step both sides run
src/shared/constants.ts        tick rate, island size, speed
src/client/index.ts            Three.js scene, prediction, camera
test/ArenaRoom.test.ts         integration test against a real server
```

## Roadmap

- [x] Authoritative movement at 30 Hz with client prediction
- [x] Reconnection window and deterministic spawns
- [x] 3D island, third-person camera, HUD
- [ ] Storm phases and damage outside the ring
- [ ] Hitscan weapons and server-validated hit registration
- [ ] Loot: ammo, armor, medkits
- [ ] Bots to fill lobbies
- [ ] Kill feed, spectate, win screen
- [ ] Mobile controls
- [ ] Accounts and leaderboard (keep this in Ruby/Rails)

## Name

**Tufani** is Kiswahili for *storm*. The storm is the clock, the pressure and the reason matches end.

## License

MIT
