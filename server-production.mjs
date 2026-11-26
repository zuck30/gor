/**
 * Production entry for hosts such as Render, Fly.io and Railway.
 *
 * The Colyseus Vite plugin generates `dist/server/server.mjs` with the dev
 * port (2567) baked in. That is fine locally, but a managed host assigns the
 * port at runtime through PORT. This wrapper imports the built app config and
 * listens on the assigned port instead.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "dist", "server", "assets");

let asset;
try {
  asset = readdirSync(assets).find(
    (name) => name.startsWith("app.config-") && name.endsWith(".js")
  );
} catch {
  throw new Error("dist/server is missing. Run `npm run build` first.");
}

if (!asset) {
  throw new Error("No built app.config found. Run `npm run build` first.");
}

const entry = await import(pathToFileURL(join(assets, asset)).href);
const server = entry.server ?? entry.default?.server;

if (!server) {
  throw new Error("The built app config did not export a Colyseus server.");
}

const port = Number(process.env.PORT) || 2567;
await server.listen(port);
console.log(`Arena listening on 0.0.0.0:${port}`);
