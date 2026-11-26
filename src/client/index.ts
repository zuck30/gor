import * as THREE from "three";
import { ColyseusSDK, Callbacks } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import type { default as server } from "../app.config.js";
import type { MoveInput } from "../rooms/schema/ArenaState.js";
import { stepEntity } from "../shared/movement.js";
import { ARENA_WIDTH, ARENA_HEIGHT } from "../shared/constants.js";

const statusEl = document.getElementById("status")!;
const appEl = document.getElementById("app")!;

const toWorldX = (x: number) => x - ARENA_WIDTH / 2;
const toWorldZ = (y: number) => y - ARENA_HEIGHT / 2;

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f0d);
scene.fog = new THREE.Fog(0x0b0f0d, 120, 320);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  600
);
camera.position.set(0, 12, 18);

// ---------------------------------------------------------------- lighting
scene.add(new THREE.HemisphereLight(0xa8c8ff, 0x24382c, 1.4));

const sun = new THREE.DirectionalLight(0xfff0cc, 2.1);
sun.position.set(70, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.far = 400;
scene.add(sun);

// ---------------------------------------------------------------- island
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_HEIGHT),
  new THREE.MeshStandardMaterial({ color: 0x1d3126, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(ARENA_WIDTH, 50, 0x4a6b58, 0x2a4034);
grid.position.y = 0.02;
const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
for (const material of gridMaterials) {
  material.transparent = true;
  material.opacity = 0.55;
}
scene.add(grid);

// A plaza at the centre gives players a landmark while the map is still flat.
const plaza = new THREE.Mesh(
  new THREE.CircleGeometry(45, 48),
  new THREE.MeshStandardMaterial({ color: 0x263c30, roughness: 1 })
);
plaza.rotation.x = -Math.PI / 2;
plaza.position.y = 0.01;
plaza.receiveShadow = true;
scene.add(plaza);

const plazaRing = new THREE.Mesh(
  new THREE.RingGeometry(45, 47, 64),
  new THREE.MeshBasicMaterial({
    color: 0xd6b84a,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
  })
);
plazaRing.rotation.x = -Math.PI / 2;
plazaRing.position.y = 0.03;
scene.add(plazaRing);

// Decorative boundary walls, aligned with the server's clamping.
const wallMaterial = new THREE.MeshStandardMaterial({
  color: 0x223129,
  roughness: 0.9,
});
const wallHeight = 4;
const wallThickness = 4;
const walls: Array<[number, number, number, number]> = [
  [0, -ARENA_HEIGHT / 2, ARENA_WIDTH, wallThickness],
  [0, ARENA_HEIGHT / 2, ARENA_WIDTH, wallThickness],
  [-ARENA_WIDTH / 2, 0, wallThickness, ARENA_HEIGHT],
  [ARENA_WIDTH / 2, 0, wallThickness, ARENA_HEIGHT],
];
for (const [x, z, w, d] of walls) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w, wallHeight, d),
    wallMaterial
  );
  wall.position.set(x, wallHeight / 2, z);
  wall.receiveShadow = true;
  scene.add(wall);
}

// ---------------------------------------------------------------- players
const bodyGeometry = new THREE.CapsuleGeometry(0.9, 1.5, 6, 12);
const selfMaterial = new THREE.MeshStandardMaterial({
  color: 0xd6b84a,
  roughness: 0.45,
  metalness: 0.1,
});
const otherMaterial = new THREE.MeshStandardMaterial({
  color: 0x7f8c8d,
  roughness: 0.6,
});

function createPlayerMesh(isSelf: boolean): THREE.Group {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    bodyGeometry,
    isSelf ? selfMaterial : otherMaterial
  );
  body.position.y = 1.7;
  body.castShadow = true;
  group.add(body);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.45, 28),
    new THREE.MeshBasicMaterial({
      color: isSelf ? 0xd6b84a : 0x5a6b64,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  group.add(ring);

  return group;
}

// ---------------------------------------------------------------- input
const held = new Set<string>();
addEventListener("keydown", (e) => held.add(e.key.toLowerCase()));
addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));

/** Opposite keys cancel out, so the axis is always exactly -1, 0 or 1. */
function axis(negative: string[], positive: string[]): -1 | 0 | 1 {
  const back = negative.some((k) => held.has(k));
  const forward = positive.some((k) => held.has(k));
  if (back === forward) {
    return 0;
  }
  return back ? -1 : 1;
}

// ---------------------------------------------------------------- game
const client = new ColyseusSDK<typeof server>(
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`
);

async function main() {
  const room = await client.joinOrCreate("arena");
  const predict = Predict.get(room);

  predict.attachAll("players", {
    mode: "lerp",
    fields: ["x", "y"],
    smoothMs: 65,
  });

  const input = room.input<MoveInput>({ mode: "reliable" });

  await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
  const self = room.state.players.get(room.sessionId);

  predict.reconciler(self, {
    input,
    fields: ["x", "y", "vx", "vy"],
    step: (ctx, predicted, command) => stepEntity(predicted, command, ctx.dt),
  });

  const meshes = new Map<string, THREE.Group>();
  const callbacks = Callbacks.get(room);

  function updateStatus() {
    statusEl.textContent = `connected · ${room.state.players.size} in the storm`;
  }

  callbacks.onAdd("players", (_player, sessionId) => {
    const mesh = createPlayerMesh(sessionId === room.sessionId);
    mesh.position.set(0, 0, 0);
    scene.add(mesh);
    meshes.set(sessionId, mesh);
    updateStatus();
  });

  callbacks.onRemove("players", (_player, sessionId) => {
    const mesh = meshes.get(sessionId);
    if (mesh) {
      scene.remove(mesh);
      meshes.delete(sessionId);
    }
    updateStatus();
  });

  room.onLeave(() => {
    statusEl.textContent = "disconnected";
  });

  updateStatus();

  const startX = toWorldX(self.x);
  const startZ = toWorldZ(self.y);
  camera.position.set(startX, 17, startZ + 24);
  camera.lookAt(startX, 1.5, startZ);

  const clock = new THREE.Clock();
  const cameraTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();

  function frame(now: number) {
    const steps = predict.tick(now);

    for (let i = 0; i < steps; i++) {
      input.data.moveX = axis(["a", "arrowleft"], ["d", "arrowright"]);
      input.data.moveY = axis(["w", "arrowup"], ["s", "arrowdown"]);
      input.send();
    }

    for (const [sessionId, player] of room.state.players) {
      const mesh = meshes.get(sessionId);
      if (!mesh) {
        continue;
      }
      mesh.position.x = toWorldX(predict.value(player, "x"));
      mesh.position.z = toWorldZ(predict.value(player, "y"));
    }

    const dt = Math.min(clock.getDelta(), 0.1);
    const px = toWorldX(predict.value(self, "x"));
    const pz = toWorldZ(predict.value(self, "y"));

    cameraTarget.set(px, 1.5, pz);
    desiredCamera.set(px, 17, pz + 24);
    camera.position.lerp(desiredCamera, 1 - Math.exp(-12 * dt));
    camera.lookAt(cameraTarget);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((error) => {
  console.error(error);
  statusEl.textContent = "could not connect";
});

addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
