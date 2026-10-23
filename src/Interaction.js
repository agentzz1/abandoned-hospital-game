import * as THREE from 'three';

// How close the player has to get before a key is picked up automatically.
const PICKUP_RADIUS = 1.8;
// Measured on the floor plane: batteries sit on tables and benches well below eye height.
const BATTERY_PICKUP_RADIUS = 1.8;
const BATTERY_CHARGE = 45;

const _tmpDir = new THREE.Vector3();

export class Interaction {
  constructor(camera, scene, player, audioManager, level, gameState, ui, refreshUi) {
    this.camera = camera;
    this.scene = scene;
    this.player = player;
    this.audioManager = audioManager;
    this.level = level;
    this.gameState = gameState;
    this.ui = ui;
    this.refreshUi = refreshUi;
    this.raycaster = new THREE.Raycaster();
    this._losRay = new THREE.Raycaster();
    this.center = new THREE.Vector2(0, 0);
    this.currentInteractable = null;
    // Keyboard players see "E - ..."; on touch screens the Use button is the prompt.
    this.promptPrefix = 'E - ';
    this.interactables = [];
    this._needsRefresh = true;
  }

  refreshInteractables() {
    this._needsRefresh = true;
  }

  _rebuildInteractables() {
    this.interactables.length = 0;
    this.scene.traverse((child) => {
      if (child.userData && child.userData.type && child.visible !== false) {
        this.interactables.push(child);
      }
    });
    this._needsRefresh = false;
  }

  update() {
    if (this.gameState.mode !== 'playing') {
      if (this.currentInteractable) {
        this.currentInteractable = null;
        if (this.ui.prompt) this.ui.prompt.style.display = 'none';
      }
      return;
    }

    if (this._needsRefresh) {
      this._rebuildInteractables();
    }

    if (this.player.hidden) {
      if (this.ui.prompt) {
        this.ui.prompt.style.display = 'block';
        this.ui.prompt.textContent = `${this.promptPrefix}Spind verlassen`;
      }
      return;
    }

    this.raycaster.setFromCamera(this.center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, true);

    let hovered = null;
    if (intersects.length > 0 && intersects[0].distance < 3.5) {
      const candidate = this._getInteractableRoot(intersects[0].object);
      if (candidate && this._hasLineOfSight(candidate)) {
        hovered = candidate;
      }
    }

    if (hovered) {
      if (this.currentInteractable !== hovered) {
        this.currentInteractable = hovered;
        if (this.ui.prompt) this.ui.prompt.style.display = 'block';
      }
      if (this.ui.prompt) this.ui.prompt.textContent = `${this.promptPrefix}${hovered.userData.prompt}`;
    } else if (this.currentInteractable) {
      this.currentInteractable = null;
      if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    }

    // Auto-collect keys the player walks into (arm's length, not through walls)
    if (this.level.keys) {
      const px = this.camera.position.x;
      const py = this.camera.position.y;
      const pz = this.camera.position.z;
      for (const key of this.level.keys) {
        if (key.userData.collected) continue;
        const dx = px - key.position.x;
        const dy = py - key.position.y;
        const dz = pz - key.position.z;
        if (dx * dx + dy * dy + dz * dz > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        if (!this._hasLineOfSight(key)) continue;
        this._collectKey(key.userData.id);
      }
    }

    if (this.level.batteries) {
      const p = this.camera.position;
      for (const b of this.level.batteries) {
        if (b.userData.collected) continue;
        const dx = p.x - b.position.x, dz = p.z - b.position.z;
        if (dx * dx + dz * dz > BATTERY_PICKUP_RADIUS * BATTERY_PICKUP_RADIUS) continue;
        if (!this._hasLineOfSight(b)) continue;
        this._collectBattery(b);
      }
    }
  }

  enterLocker(locker) {
    const d = locker.userData;
    this.player.enterHiding(d.inside, d.facing);
    this.gameState.hiddenIn = locker;
    this.audioManager.playLockerDoor?.();
    this.currentInteractable = null;
    document.getElementById('hide-overlay')?.removeAttribute('hidden');
    this.onHide?.(locker);
    this.refreshUi();
  }

  leaveLocker() {
    const locker = this.gameState.hiddenIn;
    if (!locker) return;
    this.player.leaveHiding(locker.userData.front, locker.userData.facing);
    this.gameState.hiddenIn = null;
    this.audioManager.playLockerDoor?.();
    document.getElementById('hide-overlay')?.setAttribute('hidden', '');
    if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    this.refreshUi();
  }

  _collectBattery(battery) {
    if (!this.level.collectBattery(battery)) return;
    this.gameState.battery = Math.min(100, (this.gameState.battery ?? 0) + BATTERY_CHARGE);
    this.audioManager.playPickup();
    this._needsRefresh = true;
    if (this.currentInteractable === battery) {
      this.currentInteractable = null;
      if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    }
    if (window.showNotification) window.showNotification(`Batterie +${BATTERY_CHARGE}%`);
    this.refreshUi();
  }

  // True when no wall sits between the camera and the target object.
  _hasLineOfSight(target) {
    const from = this.camera.position;
    const to = target.position;
    const dir = _tmpDir.subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.001) return true;
    dir.divideScalar(dist);
    this._losRay.set(from, dir);
    this._losRay.far = dist;
    // The target's own parts (a locker's body is also a wall) must not block it.
    const blockers = this.level.walls
      ? this.level.walls.filter(w => w.userData?.blocksMovement !== false && w !== target && w.parent !== target)
      : [];
    const hits = this._losRay.intersectObjects(blockers, true);
    return hits.length === 0;
  }

  interact() {
    if (this.gameState.mode !== 'playing') return;
    if (this.player.hidden) {
      this.leaveLocker();
      return;
    }
    if (!this.currentInteractable) return;

    const data = this.currentInteractable.userData;

    if (data.type === 'note') {
      this.openNote(data.text);
      return;
    }

    if (data.type === 'key') {
      this._collectKey(data.id);
      return;
    }

    if (data.type === 'battery') {
      this._collectBattery(this.currentInteractable);
      return;
    }

    if (data.type === 'locker') {
      this.enterLocker(this.currentInteractable);
      return;
    }

    if (data.type === 'exitDoor') {
      if (data.locked) {
        const collected = this.level.keys ? this.level.keys.filter(k => k.userData.collected).length : 0;
        const total = this.level.keys ? this.level.keys.length : 0;
        this.gameState.message = collected < total
          ? `Noch ${total - collected} Schluessel fehlen.`
          : 'Der Ausgang ist verschlossen.';

        this.audioManager.playLockedDoorRattle();
        this.player?.shakeCamera?.(0.03, 0.18);
        if (window.flashMissingKeySlots && this.level.keys) {
          const missing = this.level.keys
            .map((k, i) => (k.userData.collected ? -1 : i))
            .filter(i => i !== -1);
          window.flashMissingKeySlots(missing);
        }

        this.refreshUi();
        return;
      }

      if (!data.isOpen && this.level.openExitDoor()) {
        this.player?.refreshColliders?.();
        this.audioManager.playVictory();
        this.gameState.exitOpen = true;
        this.gameState.message = 'Der Ausgang ist offen. Du entkommst!';
        this.refreshUi();
        this.winGame();
      }
      return;
    }

    if (data.type === 'door') {
      this._toggleDoor(this.currentInteractable, data);
    }
  }

  openNote(text) {
    this.audioManager.playRustle();
    this.gameState.mode = 'note';
    this.gameState.notesRead = (this.gameState.notesRead || 0) + 1;
    if (this.ui.noteOverlay) this.ui.noteOverlay.style.display = 'flex';
    if (this.ui.noteText) this.ui.noteText.textContent = text;
    if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    if (this.ui.instructions) this.ui.instructions.style.display = 'none';
    if (this.ui.crosshair) this.ui.crosshair.style.display = 'none';
    this._releaseMouse();
    this.refreshUi();
  }

  // Overlays have buttons, so the mouse cursor has to come back.
  _releaseMouse() {
    this.player?.clearInput?.();
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  closeNote() {
    if (this.gameState.mode !== 'note') return;
    this.audioManager.playRustle();
    if (this.ui.noteOverlay) this.ui.noteOverlay.style.display = 'none';
    this.gameState.mode = 'playing';
    this.refreshUi();
  }

  winGame() {
    this.gameState.mode = 'won';
    this.gameState.win = true;
    if (this.ui.winOverlay) this.ui.winOverlay.style.display = 'flex';
    if (this.ui.instructions) this.ui.instructions.style.display = 'none';
    if (this.ui.crosshair) this.ui.crosshair.style.display = 'none';
    if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    this._releaseMouse();

    // Update win stats
    const elapsed = this.gameState.elapsed || 0;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    const statTime = document.getElementById('stat-time');
    const statNotes = document.getElementById('stat-notes');
    if (statTime) statTime.textContent = `${mins}:${secs}`;
    if (statNotes) statNotes.textContent = this.gameState.notesRead || 0;
    if (window.updateWinStats) window.updateWinStats();

    this.refreshUi();
  }

  _collectKey(keyId) {
    if (!this.level.collectKey(keyId)) return;

    const keyData = this.level.keys.find(k => k.userData.id === keyId);
    if (!keyData) return;

    this.audioManager.playPickup();
    this.gameState.keysCollected = this.gameState.keysCollected || [];
    this.gameState.keysCollected.push(keyId);
    this._needsRefresh = true;

    // Visual feedback
    if (window.triggerKeyFlash) window.triggerKeyFlash();
    if (window.showNotification) window.showNotification(`${keyData.userData.name} gefunden!`);

    const total = this.level.keys.length;
    const collected = this.gameState.keysCollected.length;

    if (collected >= total) {
      this.audioManager.playAllKeysFound();
      this.gameState.hasKey = true;
      this.gameState.exitUnlocked = true;
      this.gameState.objective = 'escape';
      this.gameState.message = 'Alle Schluessel gefunden! Gehe zum Ausgang.';
      if (window.showNotification) window.showNotification('Alle Schluessel! Zum Ausgang!');
    } else {
      this.gameState.message = `${keyData.userData.name} gefunden. (${collected}/${total})`;
    }

    if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    this.currentInteractable = null;
    this.refreshUi();
  }

  _toggleDoor(door, data) {
    data.isOpen = !data.isOpen;
    data.blocksMovement = !data.isOpen;

    if (data.isOpen) {
      door.position.set(data.openPosition.x, data.openPosition.y, data.openPosition.z);
      door.rotation.y = Math.PI / 2;
      data.prompt = 'Tuer schliessen';
    } else {
      door.position.set(data.closedPosition.x, data.closedPosition.y, data.closedPosition.z);
      door.rotation.y = 0;
      data.prompt = 'Tuer oeffnen';
    }

    this.player?.refreshColliders?.();
    this.audioManager.playDoorCreek();
    if (this.ui.prompt) this.ui.prompt.textContent = `${this.promptPrefix}${data.prompt}`;
    this.refreshUi();
  }

  _getInteractableRoot(object) {
    let current = object;
    while (current && (!current.userData || !current.userData.type)) {
      current = current.parent;
    }
    return current || null;
  }
}
