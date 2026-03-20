import * as THREE from 'three';
import { Player } from './Player.js';
import { Level } from './Level.js';
import { Interaction } from './Interaction.js';
import { AudioManager } from './Audio.js';
import { PostFX } from './PostFX.js';

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
};

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
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080a0e);
scene.fog = new THREE.FogExp2(0x080a0e, 0.012);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.5;
if ("outputColorSpace" in renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
document.body.appendChild(renderer.domElement);

// Post-processing pipeline
const postFX = new PostFX(renderer, scene, camera, window.innerWidth, window.innerHeight);

const audioManager = new AudioManager(camera, scene);
const level = new Level(scene);
const player = new Player(camera, document.body, scene, level.walls, audioManager, ui, gameState);
const interaction = new Interaction(camera, scene, player, audioManager, level, gameState, ui, refreshUi);

// Flashlight
const flashlight = new THREE.PointLight(0xf4fbff, 20.0, 30, 1.5);
flashlight.position.set(0, 1.6, -0.5);
scene.add(flashlight);

const fillLight = new THREE.PointLight(0xcde7ff, 2.0, 25, 2);
fillLight.position.set(0, 1.7, 0);
scene.add(fillLight);

let flashlightFlickerTimer = 0;
let flashlightBaseIntensity = 20.0;
let lastFrameTime = performance.now();
let simulationTime = 0;

// Auto-start
setTimeout(() => {
  player.controls.lock();
  audioManager.init();
  ui.instructions.style.display = "none";
  ui.crosshair.style.display = "block";
}, 100);

const introOverlay = document.getElementById("intro-overlay");
if (introOverlay) {
  introOverlay.style.display = "flex";
  setTimeout(() => {
    introOverlay.style.opacity = "0";
    introOverlay.style.transition = "opacity 1s";
    setTimeout(() => { introOverlay.style.display = "none"; }, 1000);
  }, 4000);
}

window.addEventListener("resize", onWindowResize, false);
document.addEventListener("keydown", onGlobalKeyDown, true);
ui.closeNote.addEventListener("click", () => interaction.closeNote());
ui.restartButton.addEventListener("click", restartGame);

player.controls.addEventListener("lock", () => {
  ui.instructions.style.display = "none";
  ui.crosshair.style.display = "block";
});

player.controls.addEventListener("unlock", () => {
  if (gameState.mode === "note" || gameState.mode === "won") {
    ui.crosshair.style.display = "none";
    return;
  }
  if (gameState.mode === "playing") {
    gameState.mode = "paused";
  }
  setTimeout(() => {
    if (gameState.mode === "paused") {
      gameState.mode = "playing";
      player.controls.lock();
    }
  }, 50);
});

refreshUi();
requestAnimationFrame(frame);

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postFX.setSize(window.innerWidth, window.innerHeight);
}

function onGlobalKeyDown(event) {
  if (event.code === "KeyF") { event.preventDefault(); toggleFullscreen(); return; }
  if (event.code === "KeyM") {
    event.preventDefault();
    const muted = audioManager.toggleMute();
    showNotification(muted ? "Sound aus" : "Sound an");
    return;
  }
  if (event.code === "Escape") {
    if (ui.noteOverlay.style.display === "flex") { event.preventDefault(); event.stopImmediatePropagation(); interaction.closeNote(); return; }
    if (document.fullscreenElement) { event.preventDefault(); document.exitFullscreen().catch(() => {}); return; }
  }
  if ((event.code === "KeyE" || event.code === "Enter" || event.code === "Space") && gameState.mode === "playing") {
    event.preventDefault(); interaction.interact(); return;
  }
  if (event.code === "KeyR" && gameState.win) { event.preventDefault(); restartGame(); }
}

function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  document.documentElement.requestFullscreen?.().catch(() => {});
}

function restartGame() { window.location.reload(); }

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

function triggerKeyFlash() {
  const flash = document.createElement("div");
  flash.className = "key-flash";
  document.getElementById("ui").appendChild(flash);
  setTimeout(() => flash.remove(), 600);
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 300);
}

// Jumpscare system
function triggerJumpscare() {
  gameState.jumpscareCount++;
  const overlay = document.createElement("div");
  overlay.className = "jumpscare-overlay";
  document.body.appendChild(overlay);
  const face = document.createElement("div");
  face.className = "jumpscare-face";
  face.innerHTML = "👁👀";
  overlay.appendChild(face);
  document.body.classList.add("shake-hard");
  audioManager.playScare();
  const originalExposure = renderer.toneMappingExposure;
  renderer.toneMappingExposure = 0.1;
  setTimeout(() => {
    renderer.toneMappingExposure = originalExposure;
    overlay.remove();
    document.body.classList.remove("shake-hard");
  }, 400);
  gameState.jumpscareTimer = 20 + Math.random() * 20;
}

window.triggerKeyFlash = triggerKeyFlash;
window.showNotification = showNotification;

function refreshUi() {
  ui.objectiveText.textContent = describeObjective();
  ui.statusText.textContent = describeStatus();
  ui.winMessage.textContent = gameState.message;
  window._gameElapsed = gameState.elapsed;
  window._gameMode = gameState.mode;
  window._keysCollected = level.keys ? level.keys.map(k => k.userData.collected) : [];
  updateCompass();
}

function describeObjective() {
  if (gameState.win) return "Du bist entkommen!";
  if (gameState.objective === "escape") return "Zum Ausgang rennen";
  const total = level.keys ? level.keys.length : 2;
  const collected = gameState.keysCollected ? gameState.keysCollected.length : 0;
  return "Schluessel finden (" + collected + "/" + total + ")";
}

function describeStatus() {
  const total = level.keys ? level.keys.length : 2;
  const collected = gameState.keysCollected ? gameState.keysCollected.length : 0;
  const keyStatus = collected >= total ? "Alle Schluessel" : collected + "/" + total + " Schluessel";
  const exitStatus = level.exitDoor?.userData?.isOpen ? "Ausgang offen" : level.exitDoor?.userData?.locked ? "Ausgang zu" : "Ausgang entriegelt";
  return gameState.message + " | " + keyStatus + " | " + exitStatus;
}

function updateCompass() {
  let targetX, targetZ, label;
  if (gameState.win) { window._compassAngle = 0; window._compassLabel = "✓"; return; }
  if (level.keys && !gameState.hasKey) {
    const next = level.keys.find(k => !k.userData.collected);
    if (next) {
      targetX = next.position.x; targetZ = next.position.z;
      label = next.userData.name + " (" + Math.round(Math.sqrt((targetX-camera.position.x)**2 + (targetZ-camera.position.z)**2)) + "m)";
    }
  }
  if (gameState.hasKey && level.exitDoor) {
    targetX = level.exitDoor.position.x; targetZ = level.exitDoor.position.z;
    label = "Ausgang (" + Math.round(Math.sqrt((targetX-camera.position.x)**2 + (targetZ-camera.position.z)**2)) + "m)";
  }
  if (targetX != null) {
    const dx = targetX - camera.position.x, dz = targetZ - camera.position.z;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0; forward.normalize();
    const toTarget = new THREE.Vector3(dx, 0, dz).normalize();
    window._compassAngle = Math.atan2(forward.x * toTarget.z - forward.z * toTarget.x, forward.x * toTarget.x + forward.z * toTarget.z);
    window._compassLabel = label;
  }
}

function stepSimulation(deltaSeconds) {
  simulationTime += deltaSeconds;
  gameState.elapsed += deltaSeconds;

  if (gameState.mode === "playing") {
    player.update(deltaSeconds);
    interaction.update();

    // Update flashlight position to follow camera
    flashlight.position.copy(camera.position);
    flashlight.position.y -= 0.1;
    fillLight.position.copy(camera.position);
    fillLight.position.y += 0.1;

    // Flashlight flicker
    flashlightFlickerTimer -= deltaSeconds;
    if (flashlightFlickerTimer <= 0) flashlightFlickerTimer = 2 + Math.random() * 6;
    flashlight.intensity = flashlightFlickerTimer < 0.15
      ? flashlightBaseIntensity * (0.3 + Math.random() * 0.4)
      : flashlightBaseIntensity + Math.sin(simulationTime * 3) * 0.5;

    // Jumpscare timer
    gameState.jumpscareTimer -= deltaSeconds;
    if (gameState.jumpscareTimer <= 0 && !gameState.win) {
      triggerJumpscare();
    }
  }

  level.update(deltaSeconds, simulationTime);
  refreshUi();
}

function renderFrame() {
  postFX.render(1/60);
}

function frame(now) {
  const deltaSeconds = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  stepSimulation(deltaSeconds);
  renderFrame();
  requestAnimationFrame(frame);
}

// Playtesting
window.advanceTime = (ms) => { for (let i = 0; i < Math.max(1, Math.round(ms / 16)); i++) stepSimulation(16 / 1000); renderFrame(); };
window.render_game_to_text = () => {
  const r = v => Math.round(v * 1000) / 1000;
  return JSON.stringify({
    mode: gameState.mode, objective: gameState.objective, message: gameState.message,
    hasKey: gameState.hasKey, keysCollected: gameState.keysCollected,
    exitUnlocked: gameState.exitUnlocked, exitOpen: gameState.exitOpen, win: gameState.win,
    elapsed: gameState.elapsed, notesRead: gameState.notesRead,
    jumpscareCount: gameState.jumpscareCount,
    player: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z) },
    keys: level.keys ? level.keys.map(k => ({ id: k.userData.id, name: k.userData.name, collected: k.userData.collected, x: r(k.position.x), z: r(k.position.z) })) : [],
    exitDoor: level.exitDoor ? { locked: !!level.exitDoor.userData.locked, open: !!level.exitDoor.userData.isOpen } : null,
  });
};
