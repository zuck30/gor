import * as THREE from "three";
import { ColyseusSDK, Callbacks } from "@colyseus/sdk";
import { Predict } from "@colyseus/sdk/predict";
import type { default as server } from "../app.config.js";
import {
  ENEMY_KINDS,
  ENEMY_STATS,
  MATCH_STATE,
  type MoveInput,
} from "../rooms/schema/ArenaState.js";
import { stepEntity } from "../shared/movement.js";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  STORM_PHASES,
  STORM_START_RADIUS,
} from "../shared/constants.js";
import { createSky } from "./world/sky.js";
import { createIsland, createBoundaryStones } from "./world/terrain.js";
import { createWater } from "./world/water.js";
import { createProps } from "./world/props.js";
import { createAtmosphere } from "./world/atmosphere.js";
import { createStorm } from "./world/storm.js";
import { createCharacter, type CharacterRig } from "./world/character.js";
import { createEnemy, type EnemyRig } from "./world/enemy.js";
import { createCombatFX } from "./world/effects.js";
import { createPostFX } from "./world/postfx.js";
import { makeGlowTexture } from "./world/textures.js";
import { VoicePlayer } from "./audio.js";
import { TRIUMPHS, TriumphBoard, type Triumph } from "./triumphs.js";
import {
  PLAYER_COLORS,
  PROFILE_STORAGE_KEY,
  sanitizeColor,
  sanitizeName,
  type PlayerProfile,
} from "../shared/profile.js";
import {
  GAME_MODES,
  MODE_CODE,
  MODE_LABEL,
  MODE_ROOM,
  MODE_RULES,
  MODE_TAGLINE,
  TEAM_COLORS,
  TEAM_NAMES,
  sanitizeMode,
  type GameMode,
} from "../shared/modes.js";
import { sanitizeChat, type ChatMessage } from "../shared/chat.js";

const statusEl = document.getElementById("status")!;
const appEl = document.getElementById("app")!;
const healthFill = document.getElementById("health-fill") as HTMLElement;
const healthValue = document.getElementById("health-value")!;
const rageFill = document.getElementById("rage-fill") as HTMLElement;
const rageValue = document.getElementById("rage-value")!;
const rageRow = rageFill.closest(".rage") as HTMLElement;
const stormStatusEl = document.getElementById("storm-status")!;
const warningEl = document.getElementById("warning")!;
const loadingEl = document.getElementById("loading") as HTMLElement | null;
const minimap = document.getElementById("minimap") as HTMLCanvasElement;
const minimapCtx = minimap.getContext("2d")!;
const waveBanner = document.getElementById("wave-banner")!;
const waveBannerText = document.getElementById("wave-banner-text")!;
const bossBar = document.getElementById("boss-bar")!;
const bossName = document.getElementById("boss-name")!;
const bossFill = document.getElementById("boss-fill") as HTMLElement;
const deathScreen = document.getElementById("death-screen")!;
const respawnValue = document.getElementById("respawn-value")!;
const deathKills = document.getElementById("death-kills")!;
const deathWaveEl = document.getElementById("death-wave")!;
const deathWaveLabel = document.getElementById("death-wave-label")!;
const deathTriumphsEl = document.getElementById("death-triumphs")!;
const weaponNameEl = document.getElementById("weapon-name")!;
const briefEl = document.getElementById("brief")!;
const briefAction = document.getElementById("brief-action") as HTMLButtonElement;
const helpToggle = document.getElementById("help-toggle") as HTMLButtonElement;
const triumphListEl = document.getElementById("triumph-list") as HTMLUListElement;
const briefTriumphCount = document.getElementById("brief-triumph-count")!;
const triumphToast = document.getElementById("triumph-toast")!;
const triumphNameEl = document.getElementById("triumph-name")!;
const triumphDescEl = document.getElementById("triumph-desc")!;
const pauseToggle = document.getElementById("pause-toggle") as HTMLButtonElement;
const pauseScreen = document.getElementById("pause-screen")!;
const pauseResume = document.getElementById("pause-resume") as HTMLButtonElement;
const comboPips = document.getElementById("combo-pips")!;
const comboPipItems = Array.from(comboPips.querySelectorAll("i"));
const cinematicEl = document.getElementById("cinematic")!;
const thunderFlashEl = document.getElementById("thunder-flash") as HTMLElement;
const rotateScreen = document.getElementById("rotate-screen") as HTMLElement | null;
const rotateGo = document.getElementById("rotate-go") as HTMLButtonElement | null;
const rotateAnyway = document.getElementById("rotate-anyway") as HTMLButtonElement | null;
const touchStick = document.getElementById("touch-stick") as HTMLElement | null;
const touchKnob = document.getElementById("touch-knob") as HTMLElement | null;
const touchAttack = document.getElementById("touch-attack") as HTMLButtonElement | null;
const touchRage = document.getElementById("touch-rage") as HTMLButtonElement | null;
const touchSwap = document.getElementById("touch-swap") as HTMLButtonElement | null;
const heroNameEl = document.getElementById("hero-name")!;
const profileScreen = document.getElementById("profile-screen")!;
const profileForm = document.getElementById("profile-form") as HTMLFormElement;
const profileNameInput = document.getElementById("profile-name") as HTMLInputElement;
const profileColorsEl = document.getElementById("profile-colors")!;
const profileModesEl = document.getElementById("profile-modes")!;
const modeBar = document.getElementById("mode-bar")!;
const modeName = document.getElementById("mode-name")!;
const modeScore = document.getElementById("mode-score")!;
const modeTimer = document.getElementById("mode-timer")!;
const teamBadge = document.getElementById("team-badge")!;
const objectiveBar = document.getElementById("objective-bar")!;
const objectiveFill = document.getElementById("objective-fill") as HTMLElement;
const objectiveLabel = document.getElementById("objective-label")!;
const objectiveValue = document.getElementById("objective-value")!;
const deathTitle = document.getElementById("death-title")!;
const deathSubText = document.getElementById("death-sub-text")!;
const respawnValueWrap = document.getElementById("respawn-value")!;
const matchOverEl = document.getElementById("match-over")!;
const matchOverKicker = document.getElementById("match-over-kicker")!;
const matchOverTitle = document.getElementById("match-over-title")!;
const matchOverSub = document.getElementById("match-over-sub")!;
const matchOverButton = document.getElementById("match-over-button") as HTMLButtonElement;
const briefKicker = document.getElementById("brief-kicker")!;
const briefTitle = document.getElementById("brief-title")!;
const briefLead = document.getElementById("brief-lead")!;
const briefRules = document.getElementById("brief-rules") as HTMLOListElement;
const briefFoes = document.getElementById("brief-foes")!;
const chatEl = document.getElementById("chat")!;
const chatToggle = document.getElementById("chat-toggle") as HTMLButtonElement;
const chatClose = document.getElementById("chat-close") as HTMLButtonElement;
const chatLog = document.getElementById("chat-log")!;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;
const chatUnread = document.getElementById("chat-unread")!;

const toWorldX = (x: number) => x - ARENA_WIDTH / 2;
const toWorldZ = (y: number) => y - ARENA_HEIGHT / 2;

const voices = new VoicePlayer();

function flashScreen(strength = 1) {
  thunderFlashEl.style.transition = "none";
  thunderFlashEl.style.opacity = String(Math.min(1, strength));
  void thunderFlashEl.offsetWidth;
  thunderFlashEl.style.transition = "opacity 0.6s ease-out";
  thunderFlashEl.style.opacity = "0";
}

let toastTimer = 0;

function showTriumphToast(triumph: Triumph) {
  triumphNameEl.textContent = triumph.name;
  triumphDescEl.textContent = triumph.desc;
  triumphToast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    triumphToast.classList.remove("is-visible");
  }, 4200);
}

function renderTriumphs() {
  triumphListEl.innerHTML = "";
  for (const triumph of TRIUMPHS) {
    const item = document.createElement("li");
    if (board.has(triumph.id)) {
      item.classList.add("is-earned");
    }
    const text = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = triumph.name;
    const desc = document.createElement("span");
    desc.textContent = triumph.desc;
    text.append(name, desc);
    item.append(text);
    triumphListEl.append(item);
  }
  briefTriumphCount.textContent = `${board.count()} / ${TRIUMPHS.length}`;
  deathTriumphsEl.textContent = String(board.count());
}

const board = new TriumphBoard((triumph) => {
  renderTriumphs();
  showTriumphToast(triumph);
});

renderTriumphs();

const touchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
if (touchDevice) {
  document.body.classList.add("touch-device");
}

let rotateDismissed = false;

function refreshOrientation() {
  if (!touchDevice || !rotateScreen) { return; }
  const portrait = window.innerHeight > window.innerWidth;
  rotateScreen.classList.toggle("is-visible", portrait && !rotateDismissed);
}

async function requestLandscape() {
  if (!touchDevice) { return; }
  try {
    await document.documentElement.requestFullscreen?.();
  } catch {
    // iOS and some browsers refuse fullscreen here.
  }
  try {
    await (screen.orientation as any)?.lock?.("landscape");
  } catch {
    // Orientation lock is best effort. The player can rotate by hand.
  }
  window.setTimeout(refreshOrientation, 700);
}

rotateAnyway?.addEventListener("click", () => {
  rotateDismissed = true;
  refreshOrientation();
});
rotateGo?.addEventListener("click", () => {
  void requestLandscape();
});
addEventListener("resize", refreshOrientation);
addEventListener("orientationchange", refreshOrientation);
refreshOrientation();

const renderPixelRatio = Math.min(window.devicePixelRatio, touchDevice ? 1.5 : 2);

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const DAY_FOG = new THREE.Color(0x6f5268);
const STORM_FOG = new THREE.Color(0x231a33);
const FOG_NEAR = 320;
const FOG_FAR = 1500;
scene.fog = new THREE.Fog(DAY_FOG.clone(), FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(
  56,
  window.innerWidth / window.innerHeight,
  0.5,
  7000
);

// ---------------------------------------------------------------- lighting
const hemisphere = new THREE.HemisphereLight(0x8a9ee0, 0x2a3527, 0.9);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xffb078, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(touchDevice ? 1024 : 2048, touchDevice ? 1024 : 2048);
sun.shadow.camera.left = -120;
sun.shadow.camera.right = 120;
sun.shadow.camera.top = 120;
sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 520;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.35;
scene.add(sun);
scene.add(sun.target);

const rim = new THREE.DirectionalLight(0x7f9de0, 0.65);
rim.position.set(-120, 90, -160);
scene.add(rim);

const flashLight = new THREE.PointLight(0xbfe4ff, 0, 3200, 2);
flashLight.position.set(0, 220, 0);
scene.add(flashLight);

const rageLight = new THREE.PointLight(0xff4a1e, 0, 110, 2);
scene.add(rageLight);

// ------------------------------------------------------------------- world
const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const sky = createSky(anisotropy);
scene.add(sky.group);

const island = createIsland(anisotropy);
scene.add(island);
scene.add(createBoundaryStones());

const water = createWater(sky.sunDirection);
scene.add(water.mesh);

const props = createProps(anisotropy);
scene.add(props.group);

const atmosphere = createAtmosphere(props.brazierPositions);
scene.add(atmosphere.group);

const storm = createStorm(STORM_START_RADIUS);
scene.add(storm.group);

const fx = createCombatFX();
scene.add(fx.group);

const pickupGroup = new THREE.Group();
const pickupSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0x7dffb0,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
pickupSprite.scale.setScalar(6);
pickupGroup.add(pickupSprite);
const pickupRing = new THREE.Mesh(
  new THREE.RingGeometry(1.8, 2.2, 40),
  new THREE.MeshBasicMaterial({
    color: 0x9dffc2,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
);
pickupRing.rotation.x = -Math.PI / 2;
pickupGroup.add(pickupRing);
pickupGroup.add(new THREE.PointLight(0x7dffb0, 55, 55, 2));
pickupGroup.visible = false;
scene.add(pickupGroup);

const postfx = createPostFX(renderer, scene, camera, renderPixelRatio);

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  (window as any).__godofrage = { scene, camera, renderer, island, water, sky, storm, props, fx, pickupGroup };
}

// ---------------------------------------------------------------- input
const held = new Set<string>();
let attackQueued = false;
let specialQueued = false;
let mouseHeld = false;
let lastMouseAttack = -1e9;
let switchQueued = false;
let touchAxisX: -1 | 0 | 1 = 0;
let touchAxisY: -1 | 0 | 1 = 0;
let touchActive = false;
let touchStickId: number | null = null;
const TOUCH_RADIUS = 42;

/** Typing in chat must never move the warrior or swing a weapon. */
function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element?.closest?.("input, textarea, select, [contenteditable='true']");
}

function updateTouchStick(dx: number, dy: number) {
  const length = Math.hypot(dx, dy);
  const scale = length > TOUCH_RADIUS ? TOUCH_RADIUS / length : 1;
  const kx = dx * scale;
  const ky = dy * scale;
  if (touchKnob) {
    touchKnob.style.transform = `translate(-50%, -50%) translate(${kx}px, ${ky}px)`;
  }
  const dead = 9;
  touchAxisX = length < dead ? 0 : dx > dead ? 1 : dx < -dead ? -1 : 0;
  touchAxisY = length < dead ? 0 : dy > dead ? 1 : dy < -dead ? -1 : 0;
  touchActive = touchAxisX !== 0 || touchAxisY !== 0;
}

function releaseTouchStick() {
  touchStickId = null;
  touchAxisX = 0;
  touchAxisY = 0;
  touchActive = false;
  if (touchKnob) {
    touchKnob.style.transform = "translate(-50%, -50%)";
  }
}

touchStick?.addEventListener("touchstart", (event) => {
  if (touchStickId !== null) { return; }
  event.preventDefault();
  const touch = event.changedTouches[0];
  touchStickId = touch.identifier;
  const rect = touchStick.getBoundingClientRect();
  updateTouchStick(
    touch.clientX - (rect.left + rect.width / 2),
    touch.clientY - (rect.top + rect.height / 2)
  );
}, { passive: false });

touchStick?.addEventListener("touchmove", (event) => {
  if (touchStickId === null) { return; }
  event.preventDefault();
  const touch = Array.from(event.touches).find((t) => t.identifier === touchStickId);
  if (!touch) { return; }
  const rect = touchStick.getBoundingClientRect();
  updateTouchStick(
    touch.clientX - (rect.left + rect.width / 2),
    touch.clientY - (rect.top + rect.height / 2)
  );
}, { passive: false });

const endTouchStick = (event: TouchEvent) => {
  if (touchStickId === null) { return; }
  const ended = Array.from(event.changedTouches).some((t) => t.identifier === touchStickId);
  if (ended) { releaseTouchStick(); }
};
touchStick?.addEventListener("touchend", endTouchStick);
touchStick?.addEventListener("touchcancel", endTouchStick);

touchAttack?.addEventListener("touchstart", (event) => {
  event.preventDefault();
  attackQueued = true;
  mouseHeld = true;
  lastMouseAttack = performance.now();
}, { passive: false });
const releaseTouchAttack = () => { mouseHeld = false; };
touchAttack?.addEventListener("touchend", releaseTouchAttack);
touchAttack?.addEventListener("touchcancel", releaseTouchAttack);

touchRage?.addEventListener("touchstart", (event) => {
  event.preventDefault();
  specialQueued = true;
}, { passive: false });

touchSwap?.addEventListener("touchstart", (event) => {
  event.preventDefault();
  switchQueued = true;
}, { passive: false });

addEventListener("keydown", (e) => {
  if (isTextEntry(e.target)) { return; }
  const key = e.key.toLowerCase();
  held.add(key);
  if (e.code === "Space") {
    attackQueued = true;
    e.preventDefault();
  }
  if (key === "q") {
    specialQueued = true;
  }
  if (key === "e") {
    switchQueued = true;
  }
});
addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
addEventListener("mousedown", (e) => {
  if (e.button !== 0) { return; }
  if ((e.target as HTMLElement | null)?.closest?.("#sound-toggle, #help-toggle, #pause-toggle, #pause-screen, #brief, #chat, .brief-button")) { return; }
  mouseHeld = true;
  attackQueued = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) { mouseHeld = false; }
});
addEventListener("blur", () => { mouseHeld = false; });
addEventListener("contextmenu", (e) => e.preventDefault());

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

/**
 * On Vercel the client is static, so the room server lives elsewhere. Set
 * VITE_SERVER_URL at build time (for example https://gor-arena.onrender.com).
 * Local development falls back to the Vite host, which also runs Colyseus.
 */
function serverEndpoint(): string {
  const configured = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (!configured) {
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  }
  try {
    const url = new URL(configured, location.origin);
    const protocol = url.protocol === "https:" || url.protocol === "wss:" ? "wss" : "ws";
    const path = url.pathname.replace(/\/$/, "");
    return `${protocol}://${url.host}${path}`;
  } catch {
    return configured;
  }
}

const client = new ColyseusSDK<typeof server>(serverEndpoint());

interface PlayerRig {
  rig: CharacterRig;
  label: string;
  color: string;
  lastHealth: number;
  lastAlive: boolean;
  downedMarker: THREE.Mesh;
}

interface EnemyEntry {
  rig: EnemyRig;
  kind: number;
  lastHealth: number;
  lastAlive: boolean;
  attackCooldown: number;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

async function main(profile: PlayerProfile) {
  const roomName = MODE_ROOM[profile.mode] as "coop" | "duel" | "siege";
  const room = await client.joinOrCreate(roomName, profile);
  const predict = Predict.get(room);

  predict.attachAll("players", {
    mode: "lerp",
    fields: ["x", "y"],
    smoothMs: 65,
  });

  const input = room.input<MoveInput>({ mode: "reliable" });

  await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
  const self = room.state.players.get(room.sessionId);

  let briefOpen = false;
  let initialBrief = false;

  // ---- room chat ---------------------------------------------------------
  const CHAT_HISTORY_LIMIT = 40;
  let chatOpen = false;
  let chatUnreadCount = 0;

  function setChatOpen(open: boolean) {
    chatOpen = open;
    chatEl.classList.toggle("is-open", open);
    if (open) {
      chatUnreadCount = 0;
      chatUnread.hidden = true;
      chatInput.focus();
      chatLog.scrollTop = chatLog.scrollHeight;
    } else {
      chatInput.blur();
    }
  }

  function appendChat(message: ChatMessage) {
    chatLog.querySelector(".chat-empty")?.remove();

    const pinned = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 24;
    const line = document.createElement("p");
    line.className = message.sessionId === room.sessionId ? "chat-line is-self" : "chat-line";

    const who = document.createElement("b");
    who.textContent = message.name;
    who.style.color = message.color;

    const text = document.createElement("span");
    text.textContent = message.text;

    line.append(who, text);
    chatLog.append(line);

    while (chatLog.childElementCount > CHAT_HISTORY_LIMIT) {
      chatLog.firstElementChild?.remove();
    }

    if (chatOpen) {
      if (pinned) { chatLog.scrollTop = chatLog.scrollHeight; }
      return;
    }

    chatUnreadCount = Math.min(99, chatUnreadCount + 1);
    chatUnread.textContent = String(chatUnreadCount);
    chatUnread.hidden = false;
  }

  chatToggle.addEventListener("click", () => setChatOpen(true));
  chatClose.addEventListener("click", () => setChatOpen(false));

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = sanitizeChat(chatInput.value);
    chatInput.value = "";
    if (text) { room.send("chat", text); }
    chatInput.focus();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") { return; }
    event.preventDefault();
    event.stopPropagation();
    setChatOpen(false);
  });

  room.onMessage("chat", (message: ChatMessage) => appendChat(message));
  // -------------------------------------------------------------------------

  function updateBriefForMode() {
    const rules = MODE_RULES[profile.mode];
    briefKicker.textContent = profile.mode === "duel"
      ? "the duel"
      : profile.mode === "siege"
        ? "the siege"
        : "the hunt";
    briefTitle.textContent = profile.mode === "duel"
      ? "Only one leaves the ring."
      : profile.mode === "siege"
        ? "Hold the altar. Break the other tribe."
        : "Survive the storm. Slay the gods.";
    briefLead.textContent = profile.mode === "coop"
      ? "You are Mwanafyale, the God of Rage. The ring is the clock. Clear each wave. Every fifth wave, a colossus rises."
      : room.state.players.size <= 1
        ? `${MODE_TAGLINE[profile.mode]} No rival is here yet: hunt the storm alone until one arrives.`
        : MODE_TAGLINE[profile.mode];
    briefRules.innerHTML = "";
    for (const rule of rules) {
      const item = document.createElement("li");
      item.textContent = rule;
      briefRules.append(item);
    }
    briefFoes.style.display = profile.mode === "duel" ? "none" : "";
  }

  function setBrief(open: boolean) {
    briefOpen = open;
    document.body.classList.toggle("is-brief", open);
    briefEl.classList.toggle("is-visible", open);
    if (open) {
      setChatOpen(false);
      briefAction.textContent = room.state.started
        ? "Return to the fight"
        : profile.mode === "coop"
          ? "Begin the hunt"
          : room.state.players.size <= 1
            ? "Hunt alone"
            : "Enter the arena";
      renderTriumphs();
    }
  }

  function beginOrClose() {
    if (!room.state.started) {
      initialBrief = false;
      room.send("ready");
    }
    setBrief(false);
  }

  briefAction.addEventListener("click", beginOrClose);
  helpToggle.addEventListener("click", () => setBrief(true));

  function togglePause() {
    if (!room.state.started) { return; }
    if (document.body.classList.contains("is-cinematic")) { return; }
    if (room.state.players.size > 1 && !room.state.paused) {
      announce("Pause is solo only", 1600);
      return;
    }
    room.send("togglePause");
  }

  pauseToggle.addEventListener("click", togglePause);
  pauseResume.addEventListener("click", togglePause);
  matchOverButton.addEventListener("click", () => room.send("restart"));

  addEventListener("keydown", (e) => {
    if (isTextEntry(e.target)) { return; }
    const key = e.key.toLowerCase();
    if (key === "h") {
      e.preventDefault();
      if (briefOpen) {
        beginOrClose();
      } else {
        setBrief(true);
      }
    } else if (e.key === "Enter" && briefOpen) {
      e.preventDefault();
      beginOrClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (chatOpen) {
        chatInput.focus();
      } else {
        setChatOpen(true);
      }
    } else if (e.key === "Escape") {
      if (chatOpen) {
        e.preventDefault();
        setChatOpen(false);
      } else if (briefOpen && room.state.started) {
        e.preventDefault();
        setBrief(false);
      }
    } else if (key === "p" && !briefOpen && !chatOpen) {
      e.preventDefault();
      togglePause();
    }
  });

  predict.reconciler(self, {
    input,
    fields: ["x", "y", "vx", "vy"],
    step: (ctx, predicted, command) => stepEntity(predicted, command, ctx.dt),
  });

  const characters = new Map<string, PlayerRig>();
  const enemies = new Map<string, EnemyEntry>();
  let selfRig: PlayerRig | null = null;

  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    const debug = (window as any).__godofrage;
    debug.room = room;
    debug.self = self;
    debug.characters = characters;
    debug.enemies = enemies;
  }

  const callbacks = Callbacks.get(room);

  /**
   * A stable colour for a warrior whose chosen colour has not arrived yet.
   * Allies must never borrow the local player's colour, or every fighter
   * looks like a clone of the hero.
   */
  function fallbackColorFor(sessionId: string): string {
    let hash = 0;
    for (let i = 0; i < sessionId.length; i += 1) {
      hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
    }
    return PLAYER_COLORS[hash % PLAYER_COLORS.length].value;
  }

  function characterIdentity(
    sessionId: string,
    fallbackName?: string,
    fallbackColor?: string
  ): { label: string; color: string } {
    const isSelf = sessionId === room.sessionId;
    const player = room.state.players.get(sessionId);
    const label = sanitizeName(player?.name)
      || sanitizeName(fallbackName)
      || (isSelf ? sanitizeName(profile.name) : "")
      || `ALLY ${sessionId.slice(0, 4).toUpperCase()}`;
    const color = sanitizeColor(player?.color)
      ?? sanitizeColor(fallbackColor)
      ?? (isSelf ? sanitizeColor(profile.color) : null)
      ?? fallbackColorFor(sessionId);
    return { label, color };
  }

  function ensureCharacter(
    sessionId: string,
    fallbackName?: string,
    fallbackColor?: string
  ): PlayerRig {
    const existing = characters.get(sessionId);
    if (existing) {
      return existing;
    }
    const isSelf = sessionId === room.sessionId;
    const { label, color } = characterIdentity(sessionId, fallbackName, fallbackColor);
    const rig = createCharacter({ isSelf, sessionId, label, color });
    const downedMarker = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.3, 36),
      new THREE.MeshBasicMaterial({
        color: 0xff6a4a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    downedMarker.rotation.x = -Math.PI / 2;
    downedMarker.position.y = 0.09;
    downedMarker.visible = false;
    rig.group.add(downedMarker);
    scene.add(rig.group);
    const entry = {
      rig,
      label,
      color,
      lastHealth: room.state.players.get(sessionId)?.health ?? 100,
      lastAlive: room.state.players.get(sessionId)?.alive ?? true,
      downedMarker,
    };
    characters.set(sessionId, entry);
    if (isSelf) {
      selfRig = entry;
      heroNameEl.textContent = label;
    }
    return entry;
  }

  /**
   * Names and colours arrive from the server a frame or two after a player is
   * added. Rebuild the rig once the real identity lands so allies show their
   * own name and colour instead of a placeholder.
   */
  function syncCharacterIdentity(
    sessionId: string,
    fallbackName?: string,
    fallbackColor?: string
  ): PlayerRig {
    const entry = characters.get(sessionId);
    if (!entry) {
      return ensureCharacter(sessionId, fallbackName, fallbackColor);
    }
    const next = characterIdentity(sessionId, fallbackName, fallbackColor);
    if (next.label === entry.label && next.color === entry.color) {
      return entry;
    }
    const previous = entry.rig.group.position.clone();
    scene.remove(entry.rig.group);
    characters.delete(sessionId);
    if (entry === selfRig) {
      selfRig = null;
    }
    const fresh = ensureCharacter(sessionId, fallbackName, fallbackColor);
    fresh.rig.group.position.copy(previous);
    return fresh;
  }

  function ensureEnemy(id: string, enemy: { kind: number; health: number }): EnemyEntry {
    const existing = enemies.get(id);
    if (existing) {
      return existing;
    }
    const rig = createEnemy(enemy.kind, hashSeed(id));
    scene.add(rig.group);
    const entry: EnemyEntry = {
      rig,
      kind: enemy.kind,
      lastHealth: enemy.health,
      lastAlive: true,
      attackCooldown: 0.4 + Math.random(),
    };
    enemies.set(id, entry);
    return entry;
  }

  ensureCharacter(room.sessionId, self.name, self.color);
  for (const [sessionId, player] of room.state.players) {
    ensureCharacter(sessionId, player.name, player.color);
  }
  for (const [id, enemy] of room.state.enemies) {
    ensureEnemy(id, enemy);
  }

  function syncStorm() {
    const radius = room.state.stormRadius;
    const x = toWorldX(room.state.stormX);
    const z = toWorldZ(room.state.stormY);

    const stormLevel = THREE.MathUtils.clamp(
      (STORM_START_RADIUS - radius) / (STORM_START_RADIUS - 60),
      0,
      1
    );
    const closing = room.state.stormMode === 1;
    const flash = storm.update(stormDt, x, z, radius, closing, 1.0);

    sky.update(stormDt, camera, stormLevel, flash);
    water.update(stormDt, stormLevel, flash);
    water.uniforms.uFogColor.value.copy(scene.fog.color);
    water.uniforms.uFogNear.value = FOG_NEAR;
    water.uniforms.uFogFar.value = FOG_FAR;

    scene.fog.color.copy(DAY_FOG).lerp(STORM_FOG, stormLevel);
    hemisphere.intensity = THREE.MathUtils.lerp(0.9, 0.45, stormLevel);
    sun.intensity = THREE.MathUtils.lerp(2.4, 0.9, stormLevel);
    flashLight.intensity = flash * 2600;
  }

  let stormDt = 0;

  let bannerTimer = 0;
  function announce(text: string, ms = 2600) {
    waveBannerText.textContent = text;
    waveBanner.classList.add("is-visible");
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => {
      waveBanner.classList.remove("is-visible");
    }, ms);
  }

  function updateHud() {
    const hp = Math.max(0, Math.round(self.health));
    healthFill.style.width = `${hp}%`;
    healthFill.classList.toggle("low", hp <= 30);
    healthValue.textContent = String(hp);

    const rage = Math.min(100, Math.round(self.rage));
    rageFill.style.width = `${rage}%`;
    rageValue.textContent = String(rage);
    rageRow.classList.toggle("is-full", rage >= 100 || self.raging);
    rageFill.classList.toggle("is-full", rage >= 100 || self.raging);

    weaponNameEl.textContent = self.weapon === 1
      ? "sword of god"
      : self.weapon === 2
        ? "chain blades"
        : "axe of the storm";

    const comboStep = self.weapon === 2 ? Math.min(2, self.comboStep ?? 0) : 0;
    comboPips.classList.toggle("is-hidden", self.weapon !== 2);
    comboPips.classList.toggle("is-ready", comboStep >= 2);
    comboPipItems.forEach((pip, index) => {
      pip.classList.toggle("is-lit", index < comboStep);
    });

    const gameMode = room.state.mode;
    const coop = gameMode === MODE_CODE.coop;
    const duel = gameMode === MODE_CODE.duel;
    const siege = gameMode === MODE_CODE.siege;
    const solo = room.state.players.size <= 1;
    const practice = solo && !coop;
    const paused = room.state.paused === true;
    const matchOver = room.state.matchState === MATCH_STATE.matchOver;
    const roundOver = room.state.matchState === MATCH_STATE.roundOver;

    pauseToggle.classList.toggle("is-paused", paused);
    pauseToggle.setAttribute("aria-label", paused ? "Resume" : "Pause");
    pauseToggle.title = paused ? "Resume" : "Pause";
    pauseScreen.classList.toggle("is-visible", paused);

    const stormMode = room.state.stormMode;
    const seconds = Math.ceil(room.state.stormTimer);
    const stormText =
      stormMode === 0 ? `storm closes in ${seconds}s`
      : stormMode === 1 ? `storm closing: ${seconds}s`
      : "final storm";
    if (stormText !== stormStatusEl.textContent) {
      stormStatusEl.textContent = stormText;
      stormStatusEl.classList.toggle("is-closing", stormMode === 1);
    }

    let foes = 0;
    let aliveCount = 0;
    let bossHealth = 0;
    let bossMax = 0;
    let bestOpponentName = "";
    let bestOpponentWins = -1;
    for (const [sessionId, enemy] of room.state.enemies) {
      void sessionId;
      if (!enemy.alive) { continue; }
      foes += 1;
      if (enemy.kind === 3) {
        bossHealth = enemy.health;
        bossMax = enemy.maxHealth;
      }
    }
    for (const [sessionId, player] of room.state.players) {
      if (player.alive) { aliveCount += 1; }
      if (sessionId !== room.sessionId && player.wins > bestOpponentWins) {
        bestOpponentWins = player.wins;
        bestOpponentName = player.name;
      }
    }

    modeBar.classList.toggle("is-visible", duel || siege);
    objectiveBar.classList.toggle("is-visible", siege && !practice);
    teamBadge.classList.toggle("is-visible", siege && !practice);

    if (practice) {
      // No rival is here yet: show the practice hunt, not an empty scoreline.
      modeName.textContent = MODE_LABEL[profile.mode];
      modeScore.textContent = room.state.started ? `solo hunt. ${foes} foes` : "no rival yet";
      modeTimer.textContent = room.state.started
        ? `wave ${Math.max(1, room.state.wave)}`
        : "hunt alone";
    } else if (duel) {
      modeName.textContent = MODE_LABEL.duel;
      modeScore.textContent = room.state.players.size > 1
        ? `you ${self.wins} - ${Math.max(0, bestOpponentWins)} ${bestOpponentName || "rival"}`
        : "waiting for a rival";
      modeTimer.textContent = roundOver
        ? "round over"
        : `round ${Math.max(1, room.state.round)}`;
    } else if (siege) {
      modeName.textContent = MODE_LABEL.siege;
      modeScore.textContent = `red ${room.state.scoreRed} - ${room.state.scoreBlue} blue`;
      modeTimer.textContent = roundOver
        ? "capture over"
        : `${Math.max(0, Math.ceil(room.state.roundTimer))}s`;
      teamBadge.textContent = `${TEAM_NAMES[self.team] ?? "Red"} team`;
      teamBadge.classList.toggle("is-blue", self.team === 1);

      const altar = room.state.altar;
      const width = Math.min(50, Math.abs(altar) / 2);
      objectiveFill.style.width = `${width}%`;
      objectiveFill.style.left = altar < 0 ? `${50 + altar / 2}%` : "50%";
      objectiveFill.classList.toggle("is-blue", altar < 0);
      objectiveLabel.textContent = altar > 2
        ? "red holds the altar"
        : altar < -2
          ? "blue holds the altar"
          : "altar contested";
      objectiveValue.textContent = `${Math.min(100, Math.round(Math.abs(altar)))}%`;
    }

    let statusText: string;
    if (!room.state.started) {
      statusText = coop
        ? "the hunt awaits"
        : practice
          ? "no rivals yet. hunt alone."
          : "the storm gathers";
    } else if (matchOver) {
      statusText = room.state.winnerName
        ? `${room.state.winnerName} wins`
        : "the match is over";
    } else if (roundOver) {
      statusText = room.state.roundWinner
        ? `${room.state.roundWinner} takes the round`
        : "the round is over";
    } else if (!self.alive) {
      if (coop && self.downed) {
        statusText = self.reviveProgress > 0
          ? `down. ally revive ${Math.round(self.reviveProgress * 100)}%.`
          : `down. bleeding out in ${Math.max(0, Math.ceil(self.respawnTimer))}s.`;
      } else if (coop) {
        statusText = "out until the wave clears";
      } else if (practice) {
        statusText = `fallen. returning in ${Math.max(0, Math.ceil(self.respawnTimer))}s.`;
      } else if (duel) {
        statusText = "fallen. waiting for the next round.";
      } else {
        statusText = `fallen. returning in ${Math.max(0, Math.ceil(self.respawnTimer))}s.`;
      }
    } else if (practice) {
      statusText = foes === 0 && room.state.waveTimer > 0
        ? `solo hunt. next wave in ${Math.ceil(room.state.waveTimer)}s.`
        : `solo hunt. wave ${Math.max(1, room.state.wave)}. ${self.kills} slain. ${foes} foes.`;
    } else if (duel) {
      statusText = `round ${Math.max(1, room.state.round)}. ${self.wins} wins. ${aliveCount} standing.`;
    } else if (siege) {
      statusText = `hold the altar. ${self.kills} slain. ${foes} monsters.`;
    } else if (foes === 0 && room.state.waveTimer > 0) {
      statusText = `wave cleared. next wave in ${Math.ceil(room.state.waveTimer)}s.`;
    } else {
      statusText = `wave ${Math.max(1, room.state.wave)}. ${self.kills} slain. ${foes} foes.`;
    }
    if (paused) {
      statusText = "the hunt is paused";
    } else if (coop && self.alive) {
      for (const [sessionId, player] of room.state.players) {
        if (sessionId !== room.sessionId && player.downed) {
          statusText = `${player.name} is down. Stand close to revive.`;
          break;
        }
      }
    }
    if (statusText !== statusEl.textContent) {
      statusEl.textContent = statusText;
    }

    if (bossMax > 0 && (!duel || practice)) {
      bossBar.classList.add("is-visible");
      bossName.textContent = "COLOSSUS OF THE STORM";
      bossFill.style.width = `${Math.max(0, (bossHealth / bossMax) * 100)}%`;
    } else {
      bossBar.classList.remove("is-visible");
    }

    const showDeath = !self.alive && !matchOver;
    deathScreen.classList.toggle("is-visible", showDeath);
    if (showDeath) {
      let title = "You died";
      let sub = "The storm will return you in";
      let showCountdown = false;

      if (coop && self.downed) {
        title = "You are down";
        sub = self.reviveProgress > 0
          ? `An ally is reviving you: ${Math.round(self.reviveProgress * 100)}%`
          : `Bleeding out in ${Math.max(0, Math.ceil(self.respawnTimer))}s. Stay close to an ally.`;
      } else if (coop && self.out) {
        title = "You are out";
        sub = "Your allies fight on. You return when the wave is cleared.";
      } else if (practice) {
        showCountdown = true;
      } else if (duel && roundOver) {
        title = "Round over";
        sub = room.state.roundWinner
          ? `${room.state.roundWinner} takes the round.`
          : "The round is a draw.";
      } else if (duel) {
        title = "You fell";
        sub = "You wait for the next round.";
      } else if (siege && roundOver) {
        title = "Capture over";
        sub = room.state.roundWinner
          ? `${room.state.roundWinner} takes the altar.`
          : "The altar is contested.";
      } else {
        showCountdown = true;
      }

      deathTitle.textContent = title;
      deathSubText.textContent = sub;
      respawnValueWrap.style.display = showCountdown ? "" : "none";
      if (showCountdown) {
        respawnValue.textContent = String(Math.max(0, Math.ceil(self.respawnTimer)));
      }
      deathKills.textContent = String(self.kills);
      deathWaveLabel.textContent = coop || practice ? "wave" : "round";
      deathWaveEl.textContent = String(coop || practice ? Math.max(1, room.state.wave) : Math.max(1, room.state.round));
      deathTriumphsEl.textContent = String(board.count());
    }

    matchOverEl.classList.toggle("is-visible", matchOver);
    if (matchOver) {
      matchOverKicker.textContent = "the god of rage";
      if (coop) {
        let teamKills = 0;
        let teamRevives = 0;
        for (const [, player] of room.state.players) {
          teamKills += player.kills;
          teamRevives += player.revives;
        }
        matchOverTitle.textContent = "The hunt ends";
        matchOverSub.textContent = `The storm took every warrior at wave ${Math.max(1, room.state.wave)}. ${teamKills} foes slain, ${teamRevives} allies revived.`;
      } else if (duel) {
        const won = room.state.winnerName === self.name;
        matchOverTitle.textContent = won ? "Victory" : "Defeat";
        matchOverSub.textContent = room.state.winnerName
          ? `${room.state.winnerName} wins the duel.`
          : "The duel ends without a champion.";
      } else {
        const won = room.state.winnerTeam === self.team;
        matchOverTitle.textContent = won ? "Victory" : "Defeat";
        matchOverSub.textContent = room.state.winnerName
          ? `${room.state.winnerName} takes the altar, ${room.state.scoreRed} to ${room.state.scoreBlue}.`
          : "The siege ends with no victor.";
      }
      matchOverButton.textContent = coop ? "Rise again" : "New match";
    }

    if (initialBrief && room.state.started) {
      initialBrief = false;
      setBrief(false);
    }

    const soloPause = room.state.players.size <= 1;
    pauseToggle.classList.toggle("is-solo-only", !soloPause && !paused);
    pauseToggle.title = !soloPause && !paused
      ? "Pause is solo only"
      : paused
        ? "Resume"
        : "Pause";
    if (briefOpen) {
      briefAction.textContent = room.state.started
        ? "Return to the fight"
        : profile.mode === "coop"
          ? "Begin the hunt"
          : soloPause
            ? "Hunt alone"
            : "Enter the arena";
    }
  }

  function drawMinimap() {
    const size = minimap.width;
    const ctx = minimapCtx;
    const range = 840;
    const scale = size / (range * 2);
    const cx = size / 2;
    const cz = size / 2;
    const mapX = (worldX: number) => cx + worldX * scale;
    const mapZ = (worldZ: number) => cz + worldZ * scale;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "#0c241c";
    ctx.fillRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(cx, cz, 778 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#2f5c3a";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cz, 800 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,210,154,0.5)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(226,214,168,0.18)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mapX(-494), mapZ(-494), 988 * scale, 988 * scale);

    ctx.beginPath();
    ctx.arc(cx, cz, 84 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,180,80,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const sx = toWorldX(room.state.stormX);
    const sz = toWorldZ(room.state.stormY);
    const sr = room.state.stormRadius;
    ctx.beginPath();
    ctx.arc(mapX(sx), mapZ(sz), sr * scale, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(107,86,255,0.14)";
    ctx.fill();
    ctx.strokeStyle = room.state.stormMode === 1 ? "#ff9a7a" : "#9c86ff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Foes.
    for (const [, enemy] of room.state.enemies) {
      if (!enemy.alive) { continue; }
      const emx = mapX(toWorldX(enemy.x));
      const emz = mapZ(toWorldZ(enemy.y));
      const boss = enemy.kind === 3;
      ctx.beginPath();
      ctx.arc(emx, emz, boss ? 7 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = boss ? "#ff4a2a" : "#e2705a";
      ctx.fill();
      if (boss) {
        ctx.strokeStyle = "#ffd0a0";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (room.state.mode === MODE_CODE.siege) {
      const altar = room.state.altar;
      ctx.beginPath();
      ctx.arc(cx, cz, 70 * scale, 0, Math.PI * 2);
      ctx.fillStyle = altar > 0
        ? "rgba(210,74,58,0.35)"
        : altar < 0
          ? "rgba(74,134,216,0.35)"
          : "rgba(240,233,208,0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(240,233,208,0.65)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (room.state.mode === MODE_CODE.duel && room.state.pickupActive) {
      ctx.beginPath();
      ctx.arc(
        mapX(toWorldX(room.state.pickupX)),
        mapZ(toWorldZ(room.state.pickupY)),
        4.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "#7dffb0";
      ctx.fill();
    }

    // Heroes.
    for (const [sessionId, player] of room.state.players) {
      if (!player.alive) { continue; }
      const pmx = mapX(toWorldX(player.x));
      const pmz = mapZ(toWorldZ(player.y));
      const isSelf = sessionId === room.sessionId;
      ctx.beginPath();
      ctx.arc(pmx, pmz, isSelf ? 5.5 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = isSelf
        ? "#ffd166"
        : room.state.mode === MODE_CODE.siege
          ? TEAM_COLORS[player.team] ?? "#9ad8c0"
          : "#9ad8c0";
      ctx.fill();
      if (isSelf) {
        ctx.strokeStyle = "#211a0b";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.fillStyle = "rgba(240,233,208,0.75)";
    ctx.font = "700 20px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, 24);

    if (selfRig) {
      const px = mapX(toWorldX(playerX()));
      const pz = mapZ(toWorldZ(playerY()));
      const yaw = selfRig.rig.group.rotation.y;
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-yaw);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fillStyle = "#ffd166";
      ctx.fill();
      ctx.restore();
    }
  }

  function playerX() {
    return predict.value(self, "x");
  }
  function playerY() {
    return predict.value(self, "y");
  }

  callbacks.onAdd("players", (player, sessionId) => {
    ensureCharacter(sessionId, player.name, player.color);
  });
  callbacks.onRemove("players", (_player, sessionId) => {
    const entry = characters.get(sessionId);
    if (entry) {
      scene.remove(entry.rig.group);
      characters.delete(sessionId);
      if (entry === selfRig) { selfRig = null; }
    }
  });

  callbacks.onAdd("enemies", (enemy, id) => {
    ensureEnemy(id, enemy);
  });
  callbacks.onRemove("enemies", (_enemy, id) => {
    const entry = enemies.get(id);
    if (entry) {
      scene.remove(entry.rig.group);
      enemies.delete(id);
    }
  });

  room.onLeave(() => {
    statusEl.textContent = "disconnected";
  });

  const startX = toWorldX(playerX());
  const startZ = toWorldZ(playerY());
  camera.position.set(startX, 12, startZ + 23);
  camera.lookAt(startX, 5.2, startZ);

  loadingEl?.classList.add("is-hidden");
  window.setTimeout(() => loadingEl?.remove(), 900);
  window.setTimeout(() => voices.play("intro"), 1000);
  updateBriefForMode();
  document.body.classList.add(`mode-${profile.mode}`);
  initialBrief = !room.state.started;
  setBrief(initialBrief);

  let lastPhase = room.state.stormPhase;
  let lastMode = room.state.stormMode;
  let lastWave = room.state.wave;
  let lastRound = 0;
  let lastMatchState = room.state.matchState;
  let lastKills = self.kills;
  let lastCountdownPhase = -1;
  let lastOutside = -100;
  let lastKillCall = -100;
  let lastHitVoice = -100;
  let lastThunderAt = -100;
  let lastThrowSeq = self.throwSeq ?? 0;
  let rageSpokenAt = -100;
  let defeatTimer = 0;
  let lastRage = false;
  let deaths = 0;
  let stormwalk = 0;
  let lowHealthWarned = false;
  let wasAlive = self.alive;
  const aliveByPlayer = new Map<string, boolean>();
  for (const [sessionId, player] of room.state.players) {
    aliveByPlayer.set(sessionId, player.alive);
  }

  let lastTime = performance.now();
  let elapsed = 0;
  let worldElapsed = 0;
  let damage = 0;
  let hurt = 0;
  let lastSelfHealth = self.health;
  let intro = 4.2;
  let cinematicTime = 0;
  let cinematicActive = false;
  const CINEMATIC_SECONDS = 4.6;
  const cameraTarget = new THREE.Vector3();
  const chaseTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const introCamera = new THREE.Vector3();
  const introTarget = new THREE.Vector3(0, 11, 0);
  const cinematicCamera = new THREE.Vector3();
  const cinematicTarget = new THREE.Vector3();
  const sunOffset = new THREE.Vector3();

  function startRageCinematic(px: number, pz: number) {
    if (cinematicActive) { return; }
    if (room.state.players.size > 1) {
      // Do not freeze allies for a personal glory shot in a shared arena.
      fx.thunder(px, pz, 2.2);
      fx.kick(0.6);
      flashScreen(0.8);
      voices.playSfx("thunder", 0.8, 2000);
      return;
    }
    cinematicActive = true;
    cinematicTime = CINEMATIC_SECONDS;
    intro = 0;
    document.body.classList.add("is-cinematic");
    cinematicEl.classList.add("is-visible");
    room.send("rageCinematic");
    fx.thunder(px, pz, 2.8);
    fx.kick(1.05);
    flashScreen(1);
    voices.playSfx("thunder", 1, 4700);
  }

  function endRageCinematic() {
    cinematicActive = false;
    cinematicTime = 0;
    document.body.classList.remove("is-cinematic");
    cinematicEl.classList.remove("is-visible");
  }

  function frame(now: number) {
    const steps = predict.tick(now);

    for (let i = 0; i < steps; i++) {
      if (
        room.state.paused
        || cinematicTime > 0
        || room.state.matchState === MATCH_STATE.roundOver
        || room.state.matchState === MATCH_STATE.matchOver
      ) {
        input.data.moveX = 0;
        input.data.moveY = 0;
        input.data.attack = 0;
        input.data.special = 0;
        input.data.switchWeapon = 0;
        input.send();
        continue;
      }

      if (briefOpen && !room.state.started) {
        input.data.moveX = 0;
        input.data.moveY = 0;
        input.data.attack = 0;
        input.data.special = 0;
        input.data.switchWeapon = 0;
        input.send();
        continue;
      }

      const keyboardX = axis(["a", "arrowleft"], ["d", "arrowright"]);
      const keyboardY = axis(["w", "arrowup"], ["s", "arrowdown"]);
      input.data.moveX = touchActive ? touchAxisX : keyboardX;
      input.data.moveY = touchActive ? touchAxisY : keyboardY;
      input.data.attack = 0;
      input.data.special = 0;
      input.data.switchWeapon = 0;

      if (i === 0 && switchQueued) {
        input.data.switchWeapon = 1;
        switchQueued = false;
      }

      if (i === 0 && mouseHeld && now - lastMouseAttack > 500) {
        lastMouseAttack = now;
        attackQueued = true;
      }

      if (i === 0 && attackQueued) {
        input.data.attack = 1;
        attackQueued = false;
        selfRig?.rig.attack(
          self.weapon === 1 ? 0.32 : self.weapon === 2 ? 0.4 : 0.48
        );
        if (self.weapon !== 0) {
          voices.playSfx("sword");
        }
        fx.swing(toWorldX(self.x), toWorldZ(self.y));
      }
      if (i === 0 && specialQueued) {
        input.data.special = 1;
        specialQueued = false;
        if (self.rage >= 100 && !self.raging) {
          voices.play("rage");
          rageSpokenAt = elapsed;
        }
      }

      input.send();
    }

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += dt;

    const cinematic = cinematicTime > 0;
    const worldDt = cinematic ? dt * 0.22 : dt;
    worldElapsed += worldDt;
    stormDt = worldDt;
    if (cinematicTime > 0) {
      cinematicTime = Math.max(0, cinematicTime - dt);
      if (cinematicTime === 0) {
        endRageCinematic();
      }
    }

    for (const [sessionId, player] of room.state.players) {
      const entry = syncCharacterIdentity(sessionId, player.name, player.color);
      const mesh = entry.rig.group;
      mesh.position.x = toWorldX(predict.value(player, "x"));
      mesh.position.z = toWorldZ(predict.value(player, "y"));
      mesh.visible = player.alive || player.downed;
      entry.downedMarker.visible = player.downed;
      if (player.downed) {
        entry.downedMarker.scale.setScalar(1 + Math.sin(elapsed * 4.2) * 0.12);
      }

      entry.rig.setWeapon(player.weapon ?? 0);
      const vx = predict.value(player, "vx") ?? player.vx;
      const vy = predict.value(player, "vy") ?? player.vy;

      if (sessionId !== room.sessionId) {
        if (player.alive && player.health < entry.lastHealth - 0.5) {
          fx.hit(mesh.position.x, 3.2, mesh.position.z, 0);
          voices.playSfx("cry");
          if (self.raging && elapsed - lastThunderAt > 0.4) {
            lastThunderAt = elapsed;
            fx.thunder(mesh.position.x, mesh.position.z, 1.15);
            flashScreen(0.32);
            fx.kick(0.3);
            voices.playSfx("thunder", 0.35, 650);
          }
        } else if (!player.alive && entry.lastAlive) {
          fx.kill(mesh.position.x, 3.2, mesh.position.z, 0);
          voices.playSfx("gone");
        }
      }
      entry.lastHealth = player.health;
      entry.lastAlive = player.alive;

      entry.rig.update(worldDt, worldElapsed, vx, vy, player.health, camera, player.raging);
    }

    const pickupVisible = room.state.mode === MODE_CODE.duel && room.state.pickupActive;
    pickupGroup.visible = pickupVisible;
    if (pickupVisible) {
      pickupGroup.position.set(
        toWorldX(room.state.pickupX),
        3 + Math.sin(elapsed * 2.4) * 0.55,
        toWorldZ(room.state.pickupY)
      );
      pickupGroup.rotation.y += dt * 0.8;
      pickupRing.rotation.z += dt * 1.4;
    }

    const selfEntry = characters.get(room.sessionId);
    const px = toWorldX(playerX());
    const pz = toWorldZ(playerY());
    const vx = predict.value(self, "vx") ?? self.vx;
    const vy = predict.value(self, "vy") ?? self.vy;

    if (self.throwSeq !== lastThrowSeq) {
      lastThrowSeq = self.throwSeq;
      const throwX = toWorldX(self.throwX);
      const throwZ = toWorldZ(self.throwY);
      fx.chainThrow(px, pz, throwX, throwZ);
      selfRig?.rig.throwChain();
      voices.playSfx("sword");
      fx.kick(0.55);
    }

    // Foes: drive their rigs, detect axe hits, and let nearby ones swing.
    for (const [id, enemy] of room.state.enemies) {
      const entry = enemies.get(id) ?? ensureEnemy(id, enemy);
      const ex = toWorldX(enemy.x);
      const ez = toWorldZ(enemy.y);
      const kind = ENEMY_KINDS[enemy.kind] ?? "draugr";
      const stats = ENEMY_STATS[kind];

      entry.rig.group.position.x = ex;
      entry.rig.group.position.z = ez;
      entry.rig.update(
        worldDt,
        worldElapsed,
        enemy.vx,
        enemy.vy,
        enemy.health,
        enemy.maxHealth,
        camera,
        enemy.alive,
        enemy.hitFlash
      );

      if (enemy.alive) {
        if (enemy.health < entry.lastHealth - 0.5) {
          fx.hit(ex, 3.2 * stats.scale, ez, enemy.kind);
          voices.playSfx("cry");
          if (self.raging && elapsed - lastThunderAt > 0.4) {
            lastThunderAt = elapsed;
            fx.thunder(ex, ez, 1.15);
            flashScreen(0.32);
            fx.kick(0.3);
            voices.playSfx("thunder", 0.35, 650);
          }
        }
        const distance = Math.hypot(ex - px, ez - pz);
        entry.attackCooldown -= worldDt;
        if (distance < (stats.range + stats.radius) * 1.4 + 8 && entry.attackCooldown <= 0) {
          entry.rig.attack();
          entry.attackCooldown = stats.cooldown;
        }
      } else if (entry.lastAlive) {
        fx.kill(ex, 3.5 * stats.scale, ez, enemy.kind);
        voices.playSfx("gone");
        if (Math.hypot(ex - px, ez - pz) < 110) {
          if (enemy.kind === 1) { board.award("giantsBane"); }
          if (enemy.kind === 2) { board.award("godslayer"); }
          if (enemy.kind === 3) { board.award("colossus"); }
        }
      }

      entry.lastHealth = enemy.health;
      entry.lastAlive = enemy.alive;
    }

    // Struck: kick the camera and flare the screen edge.
    if (self.alive && self.health < lastSelfHealth - 0.05) {
      hurt = Math.min(0.75, hurt + 0.48);
      fx.kick(0.3);
      if (elapsed - lastHitVoice > 1.15) {
        lastHitVoice = elapsed;
        voices.play("hit1");
      }
    }
    lastSelfHealth = self.health;

    rageLight.position.set(px, 4.5, pz);
    if (self.raging) {
      rageLight.intensity = 220 + Math.sin(elapsed * 12) * 90;
    } else {
      rageLight.intensity = Math.max(0, rageLight.intensity - dt * 900);
    }

    // Third-person chase camera with a little speed lead.
    if (!(window as any).__freezeCamera) {
      chaseTarget.set(px + vx * 0.18, 5.2, pz + vy * 0.18);
      desiredCamera.set(px + vx * 0.06, 11, pz + 20 + vy * 0.06);

      if (cinematicTime > 0) {
        const progress = 1 - cinematicTime / CINEMATIC_SECONDS;
        const ease = progress * progress * (3 - 2 * progress);
        const angle = 0.55 + ease * 1.25;
        const radius = 27 - ease * 4;
        cinematicCamera.set(
          px + Math.cos(angle) * radius,
          7.5 + Math.sin(ease * Math.PI) * 10,
          pz + Math.sin(angle) * radius
        );
        cinematicTarget.set(px, 6 + ease * 12, pz);
        const returnBlend = Math.max(0, (progress - 0.84) / 0.16);
        camera.position.copy(cinematicCamera);
        cameraTarget.copy(cinematicTarget);
        if (returnBlend > 0) {
          camera.position.lerp(desiredCamera, returnBlend);
          cameraTarget.lerp(chaseTarget, returnBlend);
        }
      } else {
        const follow = 1 - Math.exp(-6 * dt);
        camera.position.lerp(desiredCamera, follow);
        cameraTarget.copy(chaseTarget);

        if (intro > 0) {
          intro = Math.max(0, intro - dt);
          const raw = 1 - intro / 4.2;
          const ease = raw * raw * (3 - 2 * raw);
          const length = Math.hypot(px, pz);
          const nx = length > 1 ? -px / length : 0;
          const nz = length > 1 ? -pz / length : 1;
          introCamera.set(px - nx * 34, 19, pz - nz * 34);
          camera.position.lerpVectors(introCamera, desiredCamera, ease);
          cameraTarget.lerpVectors(introTarget, chaseTarget, ease);
        }
      }

      camera.lookAt(cameraTarget);
      if (fx.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * fx.shake * 1.4;
        camera.position.y += (Math.random() - 0.5) * fx.shake * 0.9;
        camera.position.z += (Math.random() - 0.5) * fx.shake * 1.4;
      }
    }

    sun.target.position.set(px, 0, pz);
    sunOffset.copy(sky.sunDirection).multiplyScalar(190);
    sun.position.set(px + sunOffset.x, sunOffset.y, pz + sunOffset.z);
    sun.target.updateMatrixWorld();
    rim.position.set(px - 140, 110, pz - 180);

    // Storm + world.
    syncStorm();
    props.update(worldDt, worldElapsed);
    atmosphere.update(worldDt, worldElapsed);
    fx.update(worldDt);

    const stormX = toWorldX(room.state.stormX);
    const stormZ = toWorldZ(room.state.stormY);
    const outside = Math.hypot(px - stormX, pz - stormZ) > room.state.stormRadius;
    const pulse = 0.5 + Math.sin(elapsed * 6) * 0.5;
    hurt = Math.max(0, hurt - dt * 2.2);
    const stormBurn = self.alive && outside ? 0.26 + pulse * 0.18 : 0;
    const targetDamage = Math.max(stormBurn, hurt);
    damage += (targetDamage - damage) * Math.min(1, dt * 8);

    const warning = self.alive && outside;
    warningEl.classList.toggle("is-visible", warning);

    // Voice and banner cues.
    const mode = room.state.stormMode;
    const phase = room.state.stormPhase;

    if (mode === 1 && lastMode !== 1) {
      const key = (["phase1", "phase2", "phase3", "phase4"] as const)[phase];
      if (key) {
        voices.play(key);
      }
      lastPhase = phase;
    }
    if (mode === 2 && lastMode !== 2) {
      voices.play("final");
    }
    lastMode = mode;

    if (mode !== 2 && phase !== lastCountdownPhase && room.state.stormTimer <= 10) {
      lastCountdownPhase = phase;
      voices.play("countTen");
    }

    if (room.state.mode === MODE_CODE.coop && room.state.wave > lastWave) {
      lastWave = room.state.wave;
      const boss = lastWave % 5 === 0;
      announce(
        lastWave === 1
          ? "The hunt begins"
          : boss
            ? "A colossus rises"
            : `Wave ${lastWave}`
      );
      if (lastWave > 1) {
        voices.play(boss ? "boss" : "wave");
      }
    }

    if (room.state.mode !== MODE_CODE.coop) {
      if (room.state.round > lastRound) {
        lastRound = room.state.round;
        const label = room.state.mode === MODE_CODE.duel ? "Duel" : "Siege";
        announce(`${label} round ${lastRound}`, 1800);
        voices.play("wave");
      }
      if (room.state.matchState !== lastMatchState) {
        lastMatchState = room.state.matchState;
        if (room.state.matchState === MATCH_STATE.roundOver) {
          announce(
            room.state.roundWinner
              ? `${room.state.roundWinner} takes the round`
              : "The round is a draw",
            2200
          );
          voices.play("kill");
        } else if (room.state.matchState === MATCH_STATE.matchOver) {
          announce(
            room.state.winnerName
              ? `${room.state.winnerName} wins`
              : "The match is over",
            2600
          );
          voices.play("rage");
        }
      }
    }

    if (self.kills > lastKills) {
      lastKills = self.kills;
      if (elapsed - lastKillCall > 2.4) {
        lastKillCall = elapsed;
        voices.play("kill");
      }
      if (self.kills >= 1) { board.award("firstBlood"); }
      if (self.kills >= 10) { board.award("slayer"); }
      if (self.kills >= 50) { board.award("godofrage"); }
    }

    if (self.raging && !lastRage) {
      announce("Rage of the storm", 1800);
      if (elapsed - rageSpokenAt > 0.8) {
        voices.play("rage");
      }
      board.award("rage");
    } else if (lastRage && !self.raging && self.alive && !room.state.paused) {
      startRageCinematic(px, pz);
    }
    lastRage = self.raging;

    let aliveCount = 0;
    for (const [sessionId, player] of room.state.players) {
      if (player.alive) { aliveCount += 1; }
      const wasAliveBefore = aliveByPlayer.get(sessionId);
      if (wasAliveBefore === true && !player.alive) {
        fx.kick(0.3);
      }
      aliveByPlayer.set(sessionId, player.alive);
    }

    if (wasAlive && !self.alive) {
      deaths += 1;
      voices.play("survivorDeath");
      window.clearTimeout(defeatTimer);
      defeatTimer = window.setTimeout(() => voices.play("defeat"), 2100);
      announce(
        profile.mode === "coop" && self.downed
          ? "You are down"
          : profile.mode === "duel" && room.state.players.size > 1
            ? "You fell"
            : "You died",
        2400
      );
    } else if (!wasAlive && self.alive) {
      window.clearTimeout(defeatTimer);
      voices.play("revive");
      hurt = 0;
      lastSelfHealth = self.health;
    }
    wasAlive = self.alive;

    if (self.alive && self.health <= 30 && !lowHealthWarned) {
      lowHealthWarned = true;
      voices.play("lowHealth");
    } else if (self.health > 50) {
      lowHealthWarned = false;
    }

    if (self.alive && outside) {
      stormwalk += dt;
      if (stormwalk >= 10) { board.award("stormwalker"); }
    }

    if (room.state.started && room.state.wave >= 5 && deaths === 0 && self.alive) {
      board.award("unbroken");
    }

    if (warning && elapsed - lastOutside > 24) {
      lastOutside = elapsed;
      voices.play("outside");
    }

    void aliveCount;
    updateHud();
    drawMinimap();

    postfx.render(dt, elapsed, damage);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) { return null; }
    const parsed = JSON.parse(raw) as { name?: unknown; color?: unknown; mode?: unknown };
    const name = sanitizeName(parsed?.name);
    const color = sanitizeColor(parsed?.color);
    const mode = sanitizeMode(parsed?.mode);
    return name && color ? { name, color, mode } : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: PlayerProfile) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // A private window simply forgets the profile.
  }
}

let gameStarted = false;

function startGame(profile: PlayerProfile) {
  if (gameStarted) { return; }
  gameStarted = true;
  main(profile).catch((error) => {
    console.error(error);
    statusEl.textContent = "could not connect";
    if (loadingEl) {
      const message = document.createElement("p");
      message.textContent = "The storm could not reach this arena. Is the server running?";
      loadingEl.appendChild(message);
      if (!(import.meta as any).env?.VITE_SERVER_URL && location.hostname !== "localhost") {
        const hint = document.createElement("p");
        hint.textContent = "Static deployment: set VITE_SERVER_URL to the public Colyseus server.";
        loadingEl.appendChild(hint);
      }
      loadingEl.classList.add("has-error");
    }
  });
}

function setupProfile() {
  const stored = loadProfile();
  let selectedColor = stored?.color ?? PLAYER_COLORS[0].value;
  let selectedMode: GameMode = stored?.mode ?? "coop";
  profileNameInput.value = stored?.name ?? "";

  const modeButtons: HTMLButtonElement[] = [];
  GAME_MODES.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-mode";
    const title = document.createElement("b");
    title.textContent = MODE_LABEL[mode];
    const description = document.createElement("span");
    description.textContent = MODE_TAGLINE[mode];
    button.append(title, description);
    button.addEventListener("click", () => {
      selectedMode = mode;
      paintModes();
    });
    modeButtons.push(button);
    profileModesEl.append(button);
  });

  function paintModes() {
    modeButtons.forEach((button, index) => {
      const selected = GAME_MODES[index] === selectedMode;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }
  paintModes();

  const swatches: HTMLButtonElement[] = [];
  PLAYER_COLORS.forEach((entry) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "profile-swatch";
    swatch.style.setProperty("--swatch", entry.value);
    swatch.title = entry.name;
    swatch.setAttribute("aria-label", entry.name);
    swatch.addEventListener("click", () => {
      selectedColor = entry.value;
      paint();
    });
    swatches.push(swatch);
    profileColorsEl.append(swatch);
  });

  function paint() {
    swatches.forEach((swatch, index) => {
      swatch.classList.toggle("is-selected", PLAYER_COLORS[index].value === selectedColor);
    });
  }
  paint();

  profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = sanitizeName(profileNameInput.value) || "Wanderer";
    const color = sanitizeColor(selectedColor) ?? PLAYER_COLORS[0].value;
    const profile = { name, color, mode: selectedMode };
    saveProfile(profile);
    profileScreen.classList.add("is-hidden");
    startGame(profile);
  });

  if (!stored) {
    window.setTimeout(() => profileNameInput.focus(), 300);
  }
}

setupProfile();

addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.resize(window.innerWidth, window.innerHeight);
});
