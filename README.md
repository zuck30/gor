# The God of Rage

> Gods fall. The storm remains.

A mythic, browser-based action prototype on a storm-wracked island. Mwanafyale,
the God of Rage, a chain-blade warrior, and an endless hunt through draugr,
trolls, jealous gods and colossi while the storm closes in.

Built with Three.js + Colyseus: authoritative combat, client-side prediction,
procedural scenery, and a full voice pack.

## Play

Requires Node 20.19+ (22 LTS recommended).

```bash
npm install
npm start
```

Open the URL Vite prints (usually <http://localhost:5173>). Open a second tab
to bring an ally into the same hunt.

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` or arrow keys |
| Axe | Left mouse / `Space` |
| Rage | `Q` (when the rage meter is full) |
| Pause | `P` |
| Swap weapon | `E` |

The storm still shrinks. Outside the ring it eats your health. Dying returns you
at the storm's eye after a short count.

## What is in the prototype

- A Kratos-like thunder god with a rune-lit axe, shield, red war paint and a
  walk/attack animation set built entirely from procedural geometry.
- Server-authoritative wave combat: draugr packs, trolls, gods and a colossus
  boss every fifth wave.
- Chain combo: three chain-blade swings in a row hurl both blades at the
  nearest foe for heavy damage, then snap them back.
- Rage meter: every hit fills it, `Q` doubles your damage for eight seconds.
- Room-wide pause button and `P` shortcut.
- Rage thunder: hits during rage call down lightning. When rage ends, the
  arena freezes for a slow-motion cinematic thunder strike, with letterboxing
  and a dedicated thunder cue.
- Death and respawn, boss health bar, kill counter, wave banners, melee hit
  sparks, camera shake and screen burn.
- A hand-built island: ruined colonnade, braziers, banners, a floating storm
  relic, leviathan bones, watchtowers, ponds, drop pods, a forest ring, sea
  stacks, dusk sky, aurora, stars, a moon and floating islets.
- Authored voice pack in `public/voices/`, optional and subtitle-backed.
- The GODOFWAR display font for titles; Cinzel for readable UI.

## Stack

| Layer | Choice |
|---|---|
| Client | Three.js + Vite + TypeScript |
| Server | Colyseus 0.18 (authoritative rooms, fixed 30 Hz tick) |
| Netcode | input buffer + client prediction + interpolation |
| Combat | server-resolved axe cleaves, enemy steering, wave director |
| Physics | flat-ground movement; no prop collision yet |

`src/shared/movement.ts` is the one deterministic step both sides run, so
prediction and authority never disagree.

## Deploy

### Client on Vercel

The repo includes `vercel.json`, so Vercel builds the static client with:

```bash
npm run build:client
```

Output: `dist/client`. The included rewrite serves `index.html` for the app route.

A static Vercel deployment cannot host the Colyseus WebSocket room server. Set
`VITE_SERVER_URL` in the Vercel project to the public server, for example:

```text
wss://your-colyseus-server.example.com
```

Then redeploy. Without that variable the page loads but cannot join the arena.

### Room server on Render

The repo includes `render.yaml` and `server-production.mjs`. The wrapper reads
the runtime `PORT` that Render assigns, so do not start
`dist/server/server.mjs` directly on a managed host.

1. In Render, choose **New → Blueprint**.
2. Connect the `zuck30/gor` repository.
3. Apply the Blueprint. It creates the `gor-arena` web service and checks
   `/hi`.
4. Copy the service URL, for example `https://gor-arena.onrender.com`.
5. In Vercel, add `VITE_SERVER_URL` with that URL and redeploy.

The repo `.env` already points at `https://gor-arena.onrender.com` for the
production client build. A Vercel environment variable with the same name
overrides it, so make sure it matches if you set one. Local development uses
`.env.development`, which keeps the client on the local server.

Render free instances sleep when idle, so the first connection can take about
30 seconds. Retry once if the arena does not answer immediately.

For Fly.io, Railway or a VPS, run:

```bash
npm run build
PORT=2567 node server-production.mjs
```

## Scripts

```bash
npm test        # boots a real server, connects a real client
npm run build   # client + server
npm run loadtest
./scripts/generate-voices.sh   # rebuilds the voice pack (macOS + ffmpeg)
```

## Project layout

```
index.html                       HUD, loading screen, display font
public/GODOFWAR.TTF              God-of-War-style display font
public/voices/                   generated voice pack
scripts/generate-voices.sh       voice-pack generator
src/app.config.ts                server definition (rooms, routes)
src/rooms/ArenaRoom.ts           waves, enemy AI, axe resolution, respawn
src/rooms/schema/ArenaState.ts   synced state + enemy/combat constants
src/shared/movement.ts           the one step both sides run
src/shared/constants.ts          tick rate, island size, speed
src/client/index.ts              scene wiring, input, HUD, minimap
src/client/audio.ts              voice pack + subtitles
src/client/world/                sky, island, water, props, enemies,
                                 character, storm, effects, post-processing
```

## Roadmap

- [x] Authoritative movement at 30 Hz with client prediction
- [x] Melee combat, rage, waves, boss waves, respawn
- [x] Island scenery, dusk/aurora sky, floating islets
- [x] Voice pack with subtitles
- [ ] Parry, shield block and a light/heavy combo
- [ ] Loot, rune upgrades and a weapon swap
- [ ] Enemy collision and a proper navigation graph
- [ ] Named gods with unique move sets
- [ ] Win screen, leaderboard and a run summary
- [ ] Mobile controls

## Name

**Mwanafyale** is the warrior. **The God of Rage** is the name the island gives
him when he refuses to fall.

## Credits

Three.js, Colyseus, and the players who keep the storm alive. The
`GODOFWAR.TTF` display face was supplied with the project.
