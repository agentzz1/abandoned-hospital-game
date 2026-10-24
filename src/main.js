import * as THREE from 'three';
import { Player } from './Player.js';
import { Level } from './Level.js';
import { Interaction } from './Interaction.js';
import { AudioManager } from './Audio.js';
import { PostFX } from './PostFX.js';
import { NavGrid, Orderly } from './Orderly.js';
import { TouchControls } from './TouchControls.js';
import { loadMaterials } from './Materials.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Phones and tablets: touch controls, lighter textures and a lower starting resolution.
const prefersTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

const ui = {
  instructions: document.getElementById("instructions"),
  crosshair: document.getElementById("crosshair"),
  prompt: document.getElementById("interaction-prompt"),
  noteOverlay: document.getElementById("note-overlay"),
  noteText: document.getElementById("note-text"),
  closeNote: document.getElementById("close-note"),
  objectiveText: document.getElementById("objective-text"),
  statusText: document.getElementById("status-text"),
  winOverlay: document.getElementById("win-overlay"),
  winMessage: document.getElementById("win-message"),
  restartButton: document.getElementById("restart-button"),
  pauseOverlay: document.getElementById("pause-overlay"),
  resumeButton: document.getElementById("resume-button"),
  pauseRestartButton: document.getElementById("pause-restart-button"),
  settingsButton: document.getElementById("settings-button"),
  settingsOverlay: document.getElementById("settings-overlay"),
  settingsBackButton: document.getElementById("settings-back-button"),
  volumeSlider: document.getElementById("volume-slider"),
  sensitivitySlider: document.getElementById("sensitivity-slider"),
  invertYCheckbox: document.getElementById("invert-y-checkbox"),
  exploreCheckbox: document.getElementById("explore-checkbox"),
  threatEye: document.getElementById("threat-eye"),
  objPipBlue: document.getElementById("obj-pip-blue"),
  objPipOrange: document.getElementById("obj-pip-orange"),
  batteryFill: document.getElementById("battery-fill"),
  batteryPct: document.getElementById("battery-pct"),
  batteryVital: document.getElementById("vital-battery"),
  staminaFill: document.getElementById("stamina-fill"),
  staminaVital: document.getElementById("vital-stamina"),
};

// Supports a dotted path (e.g. "style.display"), not just a direct property.
function uiSet(el, prop, val) {
  if (!el) return;
  const parts = prop.split('.');
  let target = el;
  while (parts.length > 1) target = target[parts.shift()];
  target[parts[0]] = val;
}

const SETTINGS_KEY = "hospitalGame.settings";
const DEFAULT_SETTINGS = { volume: 0.5, mouseSensitivity: 1.0, invertY: false, orderlyEnabled: true };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      mouseSensitivity: typeof parsed.mouseSensitivity === "number" ? parsed.mouseSensitivity : DEFAULT_SETTINGS.mouseSensitivity,
      invertY: typeof parsed.invertY === "boolean" ? parsed.invertY : DEFAULT_SETTINGS.invertY,
      orderlyEnabled: typeof parsed.orderlyEnabled === "boolean" ? parsed.orderlyEnabled : DEFAULT_SETTINGS.orderlyEnabled,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(gameState.settings));
  } catch {
    // Private mode / storage full - settings just won't persist this session.
  }
}

const STATS_KEY = "hospitalGame.stats";
const DEFAULT_STATS = { bestTimeMs: null, totalRuns: 0, totalWins: 0 };

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    return {
      bestTimeMs: typeof parsed.bestTimeMs === "number" ? parsed.bestTimeMs : DEFAULT_STATS.bestTimeMs,
      totalRuns: typeof parsed.totalRuns === "number" ? parsed.totalRuns : DEFAULT_STATS.totalRuns,
      totalWins: typeof parsed.totalWins === "number" ? parsed.totalWins : DEFAULT_STATS.totalWins,
    };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Private mode / storage full - stats just won't persist this session.
  }
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

const gameState = {
  mode: "playing",
  objective: "find_keys",
  hasKey: false,
  keysCollected: [],
  exitUnlocked: false,
  exitOpen: false,
  win: false,
  message: "Erkunde das Krankenhaus und finde die Schluessel.",
  elapsed: 0,
  notesRead: 0,
  jumpscareTimer: 15,
  jumpscareCount: 0,
  battery: 100,
  flashlightOn: true,
  catches: 0,
  settings: loadSettings(),
};

const stats = loadStats();
stats.totalRuns += 1;
saveStats();

// Let the loading screen paint before texture generation blocks the main thread.
await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
scene.fog = new THREE.FogExp2(0x0a0c10, 0.018);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
// The flashlight and fill light are children of the camera; they only light the scene if the camera is in it.
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false, depth: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
if ("outputColorSpace" in renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
document.body.appendChild(renderer.domElement);

// Post-processing pipeline
const postFX = new PostFX(renderer, scene, camera, window.innerWidth, window.innerHeight,
  prefersTouch ? { maxPixelRatio: 1.25, startPixelRatio: 1 } : {});

// A dim, blurred room reflection gives wet floors and metal believable highlights; computed once.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;
  pmrem.dispose();
}

const audioManager = new AudioManager(camera, scene);
audioManager.setVolume(gameState.settings.volume);
const materials = await loadMaterials(renderer, { lowQuality: prefersTouch });
const level = new Level(scene, materials);
// The moonlight never moves: render its shadow map once, and again only when the exit door moves.
level.sunLight.shadow.autoUpdate = false;
level.sunLight.shadow.needsUpdate = true;
const player = new Player(camera, document.body, scene, level.walls, audioManager, ui, gameState);
const interaction = new Interaction(camera, scene, player, audioManager, level, gameState, ui, refreshUi);
const nav = new NavGrid(level);
const orderly = new Orderly(scene, nav);
orderly.onCatch = catchPlayer;
orderly.onHuntStart = () => audioManager.playSpottedStinger?.();
orderly.onInspectArrive = () => audioManager.playLockerRattle?.();
orderly.onStep = () => {
  const dx = orderly.position.x - camera.position.x, dz = orderly.position.z - camera.position.z;
  const dist = Math.hypot(dx, dz);
  // Camera right vector on the floor plane is (cos yaw, -sin yaw).
  const pan = dist > 0.01 ? (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / dist : 0;
  const muffled = !nav.hasLineOfSight(orderly.position.x, orderly.position.z, camera.position.x, camera.position.z);
  audioManager.playOrderlyStep(dist, pan * 0.85, muffled, orderly.state === "hunt");
};
const touchControls = new TouchControls({
  player, gameState,
  onUse: pressUse,
  onFlashlight: toggleFlashlight,
  onPause: togglePause,
});
function enableTouchMode() {
  if (touchControls.enabled) return;
  touchControls.enable();
  interaction.promptPrefix = "";
  uiSet(ui.prompt, 'textContent', '');
}
if (prefersTouch) enableTouchMode();
// Hybrid devices (touch laptops, iPad with keyboard) switch over on their first touch.
window.addEventListener("touchstart", enableTouchMode, { once: true, passive: true });
let heartbeatTimer = 0;
let lastEyeState = "";
interaction.onHide = (locker) => {
  if (!orderlyEnabled() || orderly.state === "dormant" || orderly.immuneTime > 0) return;
  const d = locker.userData;
  const dist = Math.hypot(orderly.position.x - d.inside.x, orderly.position.z - d.inside.z);
  const watched = orderly.canSeePlayer || (orderly.state === "hunt" && dist < 8)
    || (dist < 6 && nav.hasLineOfSight(orderly.position.x, orderly.position.z, d.front.x, d.front.z));
  if (watched) orderly.inspectLocker(d.front, d.inside);
};

const SPAWN = { x: 0, z: 0 };
const ORDERLY_TICK = 0.1;
// The Orderly wakes when the warning note is read, after this many seconds, or when approached.
const ORDERLY_WAKE_AFTER = 25;
let orderlyTickAccum = 0;
let catchTimer = 0;
const catchOverlay = document.getElementById("catch-overlay");

function orderlyEnabled() {
  return gameState.settings.orderlyEnabled !== false;
}

// Flashlight: held low and to the right of the eyes, so it throws visible, moving shadows.
const flashlight = new THREE.SpotLight(0xfff5e0, 18.0, 30, Math.PI / 5, 0.45, 1.5);
flashlight.position.set(0.22, -0.22, 0);
flashlight.target.position.set(0, 0, -8);
camera.add(flashlight);
camera.add(flashlight.target);
// Shadows and a lens pattern cost a second render of nearby geometry, so desktops only.
function setFlashlightShadows(on) {
  flashlight.castShadow = on;
  flashlight.map = on ? flashlightCookie() : null;
}
function flashlightCookie() {
  const size = 256, c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "#fff"); g.addColorStop(0.22, "#f4f4f4"); g.addColorStop(0.3, "#bdbdbd");
  g.addColorStop(0.42, "#d8d8d8"); g.addColorStop(0.62, "#7a7a7a"); g.addColorStop(0.85, "#262626"); g.addColorStop(1, "#000");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  // Faint smudges on the lens, like a cheap old torch.
  for (let i = 0; i < 14; i++) {
    const r = 8 + Math.random() * 26;
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
    ctx.beginPath(); ctx.arc(size / 2 + (Math.random() - 0.5) * size * 0.5, size / 2 + (Math.random() - 0.5) * size * 0.5, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.2;
flashlight.shadow.camera.far = 22;
flashlight.shadow.bias = -0.0006;
flashlight.shadow.normalBias = 0.03;
setFlashlightShadows(!prefersTouch);
postFX.onStruggle = () => { if (flashlight.castShadow) setFlashlightShadows(false); };

const fillLight = new THREE.PointLight(0xdde8ff, 1.5, 20, 2);
fillLight.position.set(0, 0.1, 0);
camera.add(fillLight);

let flashlightFlickerTimer = 0;
let flashlightBaseIntensity = 18.0;
// About 110s of light per full charge; each battery pickup adds 45%.
const FLASHLIGHT_DRAIN_PER_SEC = 0.9;
const FILL_LIGHT_ON = 1.5;
const FILL_LIGHT_OFF = 0.25;
let lastFrameTime = performance.now();
let simulationTime = 0;
let presenceTimer = 45 + Math.random() * 45;

// Browsers keep an AudioContext suspended until a user gesture, so unlock it on the first one.
// iOS Safari only unlocks audio on some gesture types (touchend, click), so keep trying on each
// kind of gesture until the context is actually running.
const UNLOCK_EVENTS = ["pointerdown", "pointerup", "touchend", "click", "keydown"];
const unlockAudio = () => {
  if (gameState.mode === "paused") return;
  const ctx = audioManager.context;
  const done = () => {
    if (ctx.state !== "running") return;
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlockAudio, true);
  };
  if (ctx.state === "running") { done(); return; }
  ctx.resume().then(done, () => {});
};
for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlockAudio, true);

// Auto-start
setTimeout(() => {
  audioManager.init();
  uiSet(ui.instructions, 'style.display', 'none');
  uiSet(ui.crosshair, 'style.display', 'block');
}, 100);

const introOverlay = document.getElementById("intro-overlay");
if (introOverlay) {
  introOverlay.style.display = "flex";
  setTimeout(() => {
    introOverlay.style.opacity = "0";
    introOverlay.style.transition = "opacity 1s";
    setTimeout(() => { introOverlay.style.display = "none"; }, 1000);
  }, 7000);
}

window.addEventListener("resize", onWindowResize, false);
document.addEventListener("keydown", onGlobalKeyDown, true);
ui.closeNote?.addEventListener("click", () => interaction.closeNote());
ui.restartButton?.addEventListener("click", restartGame);
ui.resumeButton?.addEventListener("click", resumeGame);
ui.pauseRestartButton?.addEventListener("click", restartGame);
ui.settingsButton?.addEventListener("click", openSettings);
ui.settingsBackButton?.addEventListener("click", closeSettings);

if (ui.volumeSlider) ui.volumeSlider.value = String(Math.round(gameState.settings.volume * 100));
if (ui.sensitivitySlider) ui.sensitivitySlider.value = String(gameState.settings.mouseSensitivity);
if (ui.invertYCheckbox) ui.invertYCheckbox.checked = gameState.settings.invertY;

ui.volumeSlider?.addEventListener("input", () => {
  gameState.settings.volume = Number(ui.volumeSlider.value) / 100;
  audioManager.setVolume(gameState.settings.volume);
  saveSettings();
});
ui.sensitivitySlider?.addEventListener("input", () => {
  gameState.settings.mouseSensitivity = Number(ui.sensitivitySlider.value);
  saveSettings();
});
ui.invertYCheckbox?.addEventListener("change", () => {
  gameState.settings.invertY = ui.invertYCheckbox.checked;
  saveSettings();
});
if (ui.exploreCheckbox) ui.exploreCheckbox.checked = !gameState.settings.orderlyEnabled;
ui.exploreCheckbox?.addEventListener("change", () => {
  gameState.settings.orderlyEnabled = !ui.exploreCheckbox.checked;
  orderly.mesh.visible = gameState.settings.orderlyEnabled;
  saveSettings();
});
orderly.mesh.visible = orderlyEnabled();

let lastBatteryShown = -1;
let lastStaminaShown = -1;
let lastPipBlueCollected = null;
let lastPipOrangeCollected = null;
let lastObjectivePipsText = null;

refreshUi();
requestAnimationFrame(frame);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postFX.setSize(window.innerWidth, window.innerHeight);
}

function onGlobalKeyDown(event) {
  if (event.code === "KeyF") { event.preventDefault(); if (!event.repeat) toggleFlashlight(); return; }
  if (event.code === "KeyO") { event.preventDefault(); toggleFullscreen(); return; }
  if (event.code === "KeyM") {
    event.preventDefault();
    const muted = audioManager.toggleMute();
    showNotification(muted ? "Sound aus" : "Sound an");
    return;
  }
  if (event.code === "Escape") {
    if (gameState.mode === "note") { event.preventDefault(); event.stopImmediatePropagation(); interaction.closeNote(); return; }
    if (ui.settingsOverlay && ui.settingsOverlay.style.display === "flex") { event.preventDefault(); closeSettings(); return; }
    if (gameState.mode === "playing") { event.preventDefault(); pauseGame(); return; }
    if (gameState.mode === "paused") { event.preventDefault(); resumeGame(); return; }
    if (document.fullscreenElement) { event.preventDefault(); toggleFullscreen(); return; }
  }
  if (event.code === "KeyE" || event.code === "Enter" || event.code === "Space") {
    if (gameState.mode === "note" || gameState.mode === "playing") { event.preventDefault(); pressUse(); return; }
  }
  if (event.code === "KeyR" && gameState.win) { event.preventDefault(); restartGame(); }
}

function toggleFlashlight() {
  if (gameState.mode !== "playing") return;
  if (!gameState.flashlightOn && gameState.battery <= 0) {
    showNotification("Batterie leer");
    return;
  }
  gameState.flashlightOn = !gameState.flashlightOn;
  audioManager.playFlashlightClick?.();
  refreshUi();
}

function updateFlashlight(dt) {
  if (gameState.flashlightOn) {
    gameState.battery = Math.max(0, gameState.battery - FLASHLIGHT_DRAIN_PER_SEC * dt);
    if (gameState.battery === 0) {
      gameState.flashlightOn = false;
      audioManager.playFlashlightClick?.();
      showNotification("Batterie leer");
    }
  }

  // A weak battery dims the beam and makes it stutter more often.
  const low = gameState.battery < 15;
  flashlightFlickerTimer -= dt;
  if (flashlightFlickerTimer <= 0) flashlightFlickerTimer = low ? 0.5 + Math.random() * 1.5 : 3 + Math.random() * 8;
  const charge = 0.55 + 0.45 * Math.min(1, gameState.battery / 30);
  const base = flashlightBaseIntensity * charge;
  const lit = flashlightFlickerTimer < (low ? 0.2 : 0.12)
    ? base * (0.25 + Math.random() * 0.35)
    : base + Math.sin(simulationTime * 2.5) * 0.4;
  flashlight.intensity = gameState.flashlightOn ? lit : 0;
  fillLight.intensity = gameState.flashlightOn ? FILL_LIGHT_ON : FILL_LIGHT_OFF;
}

function updateVitals() {
  const pct = Math.ceil(gameState.battery);
  if (pct !== lastBatteryShown) {
    lastBatteryShown = pct;
    uiSet(ui.batteryFill, 'style.width', pct + '%');
    uiSet(ui.batteryPct, 'textContent', pct + '%');
    ui.batteryVital?.classList.toggle('low', pct < 20);
  }
  ui.batteryVital?.classList.toggle('off', !gameState.flashlightOn);
  const st = Math.round(player.stamina * 100);
  if (st !== lastStaminaShown) {
    lastStaminaShown = st;
    uiSet(ui.staminaFill, 'style.width', st + '%');
  }
  ui.staminaVital?.classList.toggle('exhausted', player.exhausted);
}

// While a note is open, Use closes it again.
function pressUse() {
  if (gameState.mode === "note") interaction.closeNote();
  else if (gameState.mode === "playing") interaction.interact();
}

function togglePause() {
  if (gameState.mode === "playing") pauseGame();
  else if (gameState.mode === "paused") resumeGame();
}

// iPhone Safari has no Fullscreen API, and older Safari returns no promise, so guard both calls.
function toggleFullscreen() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen?.()?.catch?.(() => {}); return; }
    document.documentElement.requestFullscreen?.()?.catch?.(() => {});
  } catch { /* not supported */ }
}

function restartGame() { window.location.reload(); }

function pauseGame() {
  gameState.mode = "paused";
  // iOS Safari has no Pointer Lock API at all.
  if (document.pointerLockElement) document.exitPointerLock?.();
  audioManager.context.suspend().catch(() => {});
  uiSet(ui.pauseOverlay, 'style.display', 'flex');
}

function resumeGame() {
  gameState.mode = "playing";
  uiSet(ui.pauseOverlay, 'style.display', 'none');
  uiSet(ui.settingsOverlay, 'style.display', 'none');
  audioManager.context.resume().catch(() => {});
}

function openSettings() {
  uiSet(ui.pauseOverlay, 'style.display', 'none');
  uiSet(ui.settingsOverlay, 'style.display', 'flex');
}

function closeSettings() {
  uiSet(ui.settingsOverlay, 'style.display', 'none');
  uiSet(ui.pauseOverlay, 'style.display', 'flex');
}

let notifTimeout = null;
function showNotification(text) {
  const el = document.getElementById("notification");
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.opacity = "1";
  clearTimeout(notifTimeout);
  notifTimeout = setTimeout(() => {
    el.style.transition = "opacity 0.4s";
    el.style.opacity = "0";
    setTimeout(() => { el.style.display = "none"; el.style.transition = ""; }, 400);
  }, 1500);
}

// Fun sparkle effect on key pickup
function triggerKeyFlash() {
  const flash = document.createElement("div");
  flash.className = "key-flash";
  document.getElementById("ui").appendChild(flash);
  setTimeout(() => flash.remove(), 600);
}

// Red flash on the HUD slot(s) of keys still missing when the exit is tried while locked
function flashMissingKeySlots(missingIndices) {
  for (const i of missingIndices) {
    const slot = document.getElementById(`key-slot-${i + 1}`);
    if (!slot) continue;
    slot.classList.remove('locked-flash');
    // Force reflow so the animation restarts if it's still running from a previous attempt.
    void slot.offsetWidth;
    slot.classList.add('locked-flash');
    setTimeout(() => slot.classList.remove('locked-flash'), 400);
  }
}

function updateWinStats() {
  const elapsedMs = Math.max(0, gameState.elapsed || 0) * 1000;
  stats.totalWins += 1;
  const isNewRecord = stats.bestTimeMs == null || elapsedMs < stats.bestTimeMs;
  if (isNewRecord) stats.bestTimeMs = elapsedMs;
  saveStats();

  const statBest = document.getElementById("stat-best-time");
  const statRuns = document.getElementById("stat-runs");
  const recordBadge = document.getElementById("new-record-badge");
  if (statBest) statBest.textContent = stats.bestTimeMs != null ? formatTime(stats.bestTimeMs) : "noch kein Rekord";
  if (statRuns) statRuns.textContent = String(stats.totalRuns);
  const statCaught = document.getElementById("stat-caught");
  if (statCaught) statCaught.textContent = orderlyEnabled() ? String(gameState.catches) : "-";
  if (recordBadge) recordBadge.style.display = isNewRecord ? "inline-block" : "none";
}

window.triggerKeyFlash = triggerKeyFlash;
window.flashMissingKeySlots = flashMissingKeySlots;
window.showNotification = showNotification;
window.updateWinStats = updateWinStats;

function refreshUi() {
  touchControls.update({ canUse: !!interaction.currentInteractable || player.hidden || gameState.mode === "note" });
  updateObjectivePips();
  updateVitals();
  updateThreatEye();
  uiSet(ui.statusText, 'textContent', describeStatus());
  uiSet(ui.winMessage, 'textContent', gameState.message);
  window._gameElapsed = gameState.elapsed;
  window._gameMode = gameState.mode;
  window._keysCollected = level.keys ? level.keys.map(k => k.userData.collected) : [];
  const statKeys = document.getElementById("stat-keys");
  if (statKeys && level.keys) {
    statKeys.textContent = level.keys.filter(k => k.userData.collected).length + "/" + level.keys.length;
  }
  updateCompass();
}

function updateObjectivePips() {
  const blueCollected = !!(level.keys && level.keys[0] && level.keys[0].userData.collected);
  const orangeCollected = !!(level.keys && level.keys[1] && level.keys[1].userData.collected);

  if (blueCollected !== lastPipBlueCollected) {
    ui.objPipBlue?.classList.toggle('collected', blueCollected);
    lastPipBlueCollected = blueCollected;
  }
  if (orangeCollected !== lastPipOrangeCollected) {
    ui.objPipOrange?.classList.toggle('collected', orangeCollected);
    lastPipOrangeCollected = orangeCollected;
  }

  const text = describeObjective(blueCollected, orangeCollected);
  if (text !== lastObjectivePipsText) {
    uiSet(ui.objectiveText, 'textContent', text);
    lastObjectivePipsText = text;
  }
}

function describeObjective(blueCollected, orangeCollected) {
  if (gameState.win) return "Du bist entkommen!";
  if (blueCollected && orangeCollected) return "Oeffne den Ausgang im Nordkorridor";
  if (blueCollected) return "Finde den orangen Schluessel";
  if (orangeCollected) return "Finde den blauen Schluessel";
  return "Finde die Schluessel";
}

function describeStatus() {
  const total = level.keys ? level.keys.length : 2;
  const collected = gameState.keysCollected ? gameState.keysCollected.length : 0;
  const keyStatus = collected >= total ? "Alle Schluessel" : collected + "/" + total + " Schluessel";
  const exitStatus = level.exitDoor?.userData?.isOpen ? "Ausgang offen" : level.exitDoor?.userData?.locked ? "Ausgang zu" : "Ausgang entriegelt";
  return gameState.message + " | " + keyStatus + " | " + exitStatus;
}

function updateCompass() {
  let targetX, targetZ, label, phase;
  if (gameState.win) { window._compassAngle = 0; window._compassLabel = "✓"; window._compassPhase = "exit"; return; }
  if (!gameState.notesRead && level.notePosition) {
    targetX = level.notePosition.x; targetZ = level.notePosition.z;
    label = "Notiz (" + Math.round(Math.sqrt((targetX-camera.position.x)**2 + (targetZ-camera.position.z)**2)) + "m)";
    phase = "note";
  } else if (level.keys && !gameState.hasKey) {
    const next = level.keys.find(k => !k.userData.collected);
    if (next) {
      targetX = next.position.x; targetZ = next.position.z;
      label = next.userData.name + " (" + Math.round(Math.sqrt((targetX-camera.position.x)**2 + (targetZ-camera.position.z)**2)) + "m)";
      phase = next.userData.id === "key2" ? "orange" : "blue";
    }
  } else if (gameState.hasKey && level.exitDoor) {
    targetX = level.exitDoor.position.x; targetZ = level.exitDoor.position.z;
    label = "Ausgang (" + Math.round(Math.sqrt((targetX-camera.position.x)**2 + (targetZ-camera.position.z)**2)) + "m)";
    phase = "exit";
  }
  if (targetX != null) {
    const dx = targetX - camera.position.x, dz = targetZ - camera.position.z;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
    window._compassAngle = Math.atan2(forward.x * toTarget.z - forward.z * toTarget.x, forward.x * toTarget.x + forward.z * toTarget.z);
    window._compassLabel = label;
    window._compassPhase = phase;
  }
}

// True when a world position is both far from the player and outside their forward
// view cone - i.e. safe for a "presence" reaction that must never be seen happening.
function isFarAndHidden(pos, minDist = 15) {
  const dx = pos.x - camera.position.x, dz = pos.z - camera.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < minDist) return false;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
  return forward.dot(toTarget) < 0.35;
}

function triggerPresenceReaction() {
  const candidates = [];
  if (level.exitDoor && !level.exitDoor.userData.isOpen) {
    candidates.push({ type: 'door', pos: level.exitDoor.position });
  }
  if (level.lights && level.lights.length) {
    const idx = Math.floor(Math.random() * level.lights.length);
    candidates.push({ type: 'light', pos: level.lights[idx].light.position, idx });
    candidates.push({ type: 'sound', pos: level.lights[Math.floor(Math.random() * level.lights.length)].light.position });
  }

  const viable = candidates.filter(c => isFarAndHidden(c.pos));
  if (!viable.length) return;
  const chosen = viable[Math.floor(Math.random() * viable.length)];
  if (chosen.type === 'door') level.startDoorPresence();
  else if (chosen.type === 'light') level.startLightDip(chosen.idx);
  else audioManager.playDistantReaction(chosen.pos);
}

function stepSimulation(deltaSeconds) {
  simulationTime += deltaSeconds;
  if (gameState.mode !== "paused") gameState.elapsed += deltaSeconds;

  if (gameState.mode === "playing") {
    player.update(deltaSeconds);
    interaction.update();

    updateFlashlight(deltaSeconds);

    if (level.navDirty) { nav.build(); level.navDirty = false; }
    if (orderlyEnabled()) updateOrderly(deltaSeconds);

    // Random scare stings only in exploration mode: with the Orderly about, every sound should mean something.
    if (!orderlyEnabled()) gameState.jumpscareTimer -= deltaSeconds;
    if (gameState.jumpscareTimer <= 0) {
      audioManager.playScare();
      gameState.jumpscareCount++;
      gameState.jumpscareTimer = 20 + Math.random() * 25;
    }

    // "Presence" system: rare, distant environmental hints of an unseen occupant.
    // Winds down once both keys are held so it never gets in the way of the exit rush.
    const keysHeld = gameState.keysCollected ? gameState.keysCollected.length : 0;
    const totalKeys = level.keys ? level.keys.length : 2;
    if (keysHeld < totalKeys) {
      presenceTimer -= deltaSeconds;
      if (presenceTimer <= 0) {
        triggerPresenceReaction();
        const lo = keysHeld === 0 ? 40 : 55;
        const hi = keysHeld === 0 ? 70 : 90;
        presenceTimer = lo + Math.random() * (hi - lo);
      }
    }
  }

  if (gameState.mode === "caught") updateCatch(deltaSeconds);

  level.update(deltaSeconds, simulationTime);
  refreshUi();
}

function updateOrderly(dt) {
  const wasDormant = orderly.state === "dormant";
  orderlyTickAccum += dt;
  while (orderlyTickAccum >= ORDERLY_TICK && gameState.mode === "playing") {
    orderlyTickAccum -= ORDERLY_TICK;
    orderly.think(ORDERLY_TICK, {
      x: camera.position.x,
      z: camera.position.z,
      flashlightOn: gameState.flashlightOn,
      crouched: player.isCrouched,
      noiseRadius: player.noiseRadius,
      hidden: player.hidden,
      wake: gameState.notesRead > 0 || gameState.elapsed > ORDERLY_WAKE_AFTER,
    });
  }
  if (gameState.mode !== "playing") return;
  orderly.update(dt, camera.position);
  updateHeartbeat(dt);
  if (wasDormant && orderly.state !== "dormant") {
    audioManager.playDistantReaction?.(orderly.position);
    showNotification("Irgendwo faellt eine Tuer ins Schloss.");
  }
}

// 0 when he is far and calm, 1 when he is hunting you up close.
function threatLevel() {
  if (orderly.state === "dormant") return 0;
  const dist = Math.hypot(orderly.position.x - camera.position.x, orderly.position.z - camera.position.z);
  const proximity = Math.max(0, 1 - dist / 11);
  if (orderly.state === "hunt") return Math.max(0.75, proximity);
  if (orderly.state === "inspect") return Math.max(0.6, proximity);
  return proximity * (orderly.state === "patrol" ? 0.7 : 0.9);
}

function updateHeartbeat(dt) {
  const threat = threatLevel();
  heartbeatTimer -= dt;
  if (threat < 0.12 || heartbeatTimer > 0) return;
  heartbeatTimer = 1.15 - threat * 0.72;
  audioManager.playHeartbeat(0.12 + threat * 0.5);
}

function updateThreatEye() {
  if (!ui.threatEye) return;
  let state = "none";
  if (orderlyEnabled() && orderly.state !== "dormant") {
    if (orderly.state === "hunt") state = "hunt";
    else if (orderly.awareness > 0.05 || orderly.state === "investigate" || orderly.state === "inspect") state = "aware";
  }
  if (state !== lastEyeState) {
    ui.threatEye.className = state;
    lastEyeState = state;
  }
  if (state === "aware") ui.threatEye.style.setProperty("--fill", String(0.3 + orderly.awareness * 0.7));
}

function catchPlayer() {
  if (gameState.mode !== "playing") return;
  gameState.mode = "caught";
  gameState.catches++;
  catchTimer = 0;
  player.clearInput();
  audioManager.playCaught?.();
  uiSet(ui.prompt, 'style.display', 'none');
  if (catchOverlay) {
    catchOverlay.className = "grab";
    catchOverlay.hidden = false;
  }
}

// Caught: the camera is yanked toward his face, the screen goes black, then you wake at the entrance.
function updateCatch(dt) {
  catchTimer += dt;
  if (catchTimer < 0.5) {
    const dx = orderly.position.x - camera.position.x, dz = orderly.position.z - camera.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    let d = targetYaw - player.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    player.yaw += d * Math.min(1, 14 * dt);
    player.pitch += (0.25 - player.pitch) * Math.min(1, 10 * dt);
    player.euler.y = player.yaw;
    orderly.update(dt, camera.position);
  } else if (catchTimer < 2.8) {
    if (catchOverlay && catchOverlay.className !== "black") catchOverlay.className = "black";
  } else {
    respawnAfterCatch();
  }
}

function respawnAfterCatch() {
  player.reset();
  player.euler.y = Math.PI;
  orderly.resetAfterCatch(SPAWN);
  gameState.mode = "playing";
  gameState.message = "Er hat dich erwischt. Was du gefunden hast, bleibt bei dir.";
  if (catchOverlay) {
    catchOverlay.className = "fade";
    setTimeout(() => { if (catchOverlay.className === "fade") catchOverlay.hidden = true; }, 900);
  }
  refreshUi();
}

function renderFrame(deltaSeconds = 1 / 60) {
  if (level.shadowsDirty) { level.sunLight.shadow.needsUpdate = true; level.shadowsDirty = false; }
  postFX.render(deltaSeconds);
}

let loadingScreen = document.getElementById("loading");
function hideLoadingScreen() {
  if (!loadingScreen) return;
  const el = loadingScreen;
  loadingScreen = null;
  el.classList.add("done");
  setTimeout(() => el.remove(), 700);
}

function frame(now) {
  // The first rAF timestamp can predate module init (texture generation takes a
  // while), which used to feed a large negative delta into the whole simulation.
  const deltaSeconds = Math.max(0, Math.min(0.05, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  stepSimulation(deltaSeconds);
  renderFrame(deltaSeconds);
  hideLoadingScreen();
  requestAnimationFrame(frame);
}

// Playtesting & Automation hooks
window.advanceTime = (ms) => { for (let i = 0; i < Math.max(1, Math.round(ms / 16)); i++) stepSimulation(16 / 1000); renderFrame(); };

window.sim = {
  // Direct position set (bypasses physics)
  teleport(x, z) {
    camera.position.x = x;
    camera.position.z = z;
    player.velocity.set(0, 0, 0);
    renderFrame();
  },

  // Move player by simulating key hold for N seconds
  move(dir, seconds) {
    const keyMap = { w: 'moveForward', s: 'moveBackward', a: 'moveLeft', d: 'moveRight' };
    const prop = keyMap[dir.toLowerCase()];
    if (!prop) return;
    player[prop] = true;
    const frames = Math.round(seconds / 0.016);
    for (let i = 0; i < frames; i++) stepSimulation(0.016);
    player[prop] = false;
    renderFrame();
  },

  // Move directly toward a world coordinate (no physics)
  moveTo(x, z, speed = 4.0, dt = 0.016) {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) return;
    const steps = Math.min(Math.round(dist / speed / dt), 200);
    const stepDx = (dx / dist) * speed * dt;
    const stepDz = (dz / dist) * speed * dt;
    for (let i = 0; i < steps; i++) {
      camera.position.x += stepDx;
      camera.position.z += stepDz;
      stepSimulation(dt);
    }
    renderFrame();
  },

  // Walk toward coordinate with physics (proper simulation)
  walkTo(x, z, timeout = 15) {
    const maxFrames = Math.round(timeout / 0.016);
    for (let i = 0; i < maxFrames; i++) {
      const dx = x - camera.position.x;
      const dz = z - camera.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 0.6) break;
      // Set yaw to face target
      player.euler.y = Math.atan2(-dx, -dz);
      player.moveForward = true;
      stepSimulation(0.016);
    }
    player.moveForward = false;
    renderFrame();
  },

  // Look by rotating camera directly
  look(yawRad, pitchRad) {
    player.euler.y += yawRad;
    player.euler.x += pitchRad;
    player.euler.x = Math.max(-1.5, Math.min(1.5, player.euler.x));
    renderFrame();
  },

  // Look toward a world coordinate
  lookAt(x, z) {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    player.euler.y = Math.atan2(-dx, -dz);
    player.euler.x = 0;
    renderFrame();
  },

  // Interact with whatever is in front
  interact() {
    interaction.interact();
    renderFrame();
  },

  // Close note overlay
  closeNote() {
    interaction.closeNote();
    renderFrame();
  },

  // Advance the simulation without rendering (fast headless tests)
  advance(n) {
    for (let i = 0; i < n; i++) stepSimulation(0.016);
  },

  // Run multiple simulation steps
  steps(n) {
    for (let i = 0; i < n; i++) stepSimulation(0.016);
    renderFrame();
  },

  // Get pixel samples from renderer
  pixels(positions) {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return [];
    // Force render to screen and ensure default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const px = new Uint8Array(4);
    return positions.map(p => {
      gl.readPixels(p[0], p[1], 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { x: p[0], y: p[1], r: px[0], g: px[1], b: px[2], hex: '#' + [px[0], px[1], px[2]].map(c => c.toString(16).padStart(2, '0')).join('') };
    });
  },

  // Full pixel dump of center region
  dumpRegion(cx, cy, size) {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return [];
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const results = [];
    for (let y = cy - size; y <= cy + size; y += size) {
      for (let x = cx - size; x <= cx + size; x += size) {
        const px = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        results.push({ x, y, r: px[0], g: px[1], b: px[2] });
      }
    }
    return results;
  }
};

window.game = { scene, camera, renderer, player, level, interaction, gameState, audioManager, nav, orderly, catchPlayer };

window.render_game_to_text = () => {
  const r = v => Math.round(v * 1000) / 1000;
  return JSON.stringify({
    mode: gameState.mode, objective: gameState.objective, message: gameState.message,
    hasKey: gameState.hasKey, keysCollected: gameState.keysCollected,
    exitUnlocked: gameState.exitUnlocked, exitOpen: gameState.exitOpen, win: gameState.win,
    elapsed: gameState.elapsed, notesRead: gameState.notesRead,
    jumpscareCount: gameState.jumpscareCount,
    battery: Math.round(gameState.battery), flashlightOn: gameState.flashlightOn, stamina: Math.round(player.stamina * 100) / 100,
    orderly: { x: r(orderly.position.x), z: r(orderly.position.z), state: orderly.state, awareness: r(orderly.awareness), catches: gameState.catches },
    hidden: player.hidden,
    batteriesLeft: level.batteries ? level.batteries.filter(b => !b.userData.collected).length : 0,
    player: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z), yaw: r(player.euler.y), pitch: r(player.euler.x) },
    keys: level.keys ? level.keys.map(k => ({ id: k.userData.id, name: k.userData.name, collected: k.userData.collected, x: r(k.position.x), z: r(k.position.z) })) : [],
    exitDoor: level.exitDoor ? { locked: !!level.exitDoor.userData.locked, open: !!level.exitDoor.userData.isOpen } : null,
    prompt: ui.prompt?.style?.display || 'none',
    promptText: ui.prompt?.textContent || '',
  });
};
