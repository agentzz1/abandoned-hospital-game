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

function uiSet(el, prop, val) { if (el) el[prop] = val; }

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
scene.background = new THREE.Color(0x0a0c10);
scene.fog = new THREE.FogExp2(0x0a0c10, 0.018);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", stencil: false, depth: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
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

// Flashlight - realistic warm white
const flashlight = new THREE.SpotLight(0xfff5e0, 18.0, 30, Math.PI / 5, 0.4, 1.5);
flashlight.position.set(0, 0, 0);
flashlight.target.position.set(0, 0, -1);
camera.add(flashlight);
camera.add(flashlight.target);

const fillLight = new THREE.PointLight(0xdde8ff, 1.5, 20, 2);
fillLight.position.set(0, 0.1, 0);
camera.add(fillLight);

let flashlightFlickerTimer = 0;
let flashlightBaseIntensity = 18.0;
let lastFrameTime = performance.now();
let simulationTime = 0;

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
  }, 4000);
}

window.addEventListener("resize", onWindowResize, false);
document.addEventListener("keydown", onGlobalKeyDown, true);
ui.closeNote?.addEventListener("click", () => interaction.closeNote());
ui.restartButton?.addEventListener("click", restartGame);

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

// Fun sparkle effect on key pickup
function triggerKeyFlash() {
  const flash = document.createElement("div");
  flash.className = "key-flash";
  document.getElementById("ui").appendChild(flash);
  setTimeout(() => flash.remove(), 600);
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

refreshUi();

function stepSimulation(deltaSeconds) {
  simulationTime += deltaSeconds;
  gameState.elapsed += deltaSeconds;

  if (gameState.mode === "playing") {
    player.update(deltaSeconds);
    interaction.update();

    // Flashlight flicker
    flashlightFlickerTimer -= deltaSeconds;
    if (flashlightFlickerTimer <= 0) flashlightFlickerTimer = 3 + Math.random() * 8;
    flashlight.intensity = flashlightFlickerTimer < 0.12
      ? flashlightBaseIntensity * (0.4 + Math.random() * 0.3)
      : flashlightBaseIntensity + Math.sin(simulationTime * 2.5) * 0.4;
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
      if (dist < 1.5) break;
      // Set yaw to face target
      player.euler.y = Math.atan2(dx, -dz);
      camera.quaternion.setFromEuler(player.euler);
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
    player.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.euler.x));
    camera.quaternion.setFromEuler(player.euler);
    renderFrame();
  },

  // Look toward a world coordinate
  lookAt(x, z) {
    const dx = x - camera.position.x;
    const dz = z - camera.position.z;
    player.euler.y = Math.atan2(dx, -dz);
    player.euler.x = 0;
    camera.quaternion.setFromEuler(player.euler);
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

window.render_game_to_text = () => {
  const r = v => Math.round(v * 1000) / 1000;
  return JSON.stringify({
    mode: gameState.mode, objective: gameState.objective, message: gameState.message,
    hasKey: gameState.hasKey, keysCollected: gameState.keysCollected,
    exitUnlocked: gameState.exitUnlocked, exitOpen: gameState.exitOpen, win: gameState.win,
    elapsed: gameState.elapsed, notesRead: gameState.notesRead,
    jumpscareCount: gameState.jumpscareCount,
    player: { x: r(camera.position.x), y: r(camera.position.y), z: r(camera.position.z), yaw: r(player.euler.y), pitch: r(player.euler.x) },
    keys: level.keys ? level.keys.map(k => ({ id: k.userData.id, name: k.userData.name, collected: k.userData.collected, x: r(k.position.x), z: r(k.position.z) })) : [],
    exitDoor: level.exitDoor ? { locked: !!level.exitDoor.userData.locked, open: !!level.exitDoor.userData.isOpen } : null,
    prompt: ui.prompt?.style?.display || 'none',
    promptText: ui.prompt?.textContent || '',
  });
};
