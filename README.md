# The God of Rage

Mwanafyale, the God of Rage. A browser action game on a storm-wracked island.
Fight waves of draugr, trolls, gods, and colossi while the storm closes in.

## Run

```bash
npm install
npm start
```

Open `http://localhost:5173`.

## Controls

| Action | Input |
|---|---|
| Move | `W` `A` `S` `D` |
| Attack | Left mouse / `Space` |
| Swap weapon | `E` |
| Rage | `Q` |
| Pause | `P` |
| Rules | `H` |

Three chain-blade swings in a row hurl both blades at the nearest enemy.

## Deploy

Client: Vercel, using `vercel.json`.
Server: Render, using `render.yaml` and `server-production.mjs`.

`.env` already points at the Render arena:

```env
VITE_SERVER_URL=https://gor-arena.onrender.com
```

## License

MIT
