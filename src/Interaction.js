import * as THREE from 'three';

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
    this.center = new THREE.Vector2(0, 0);
    this.currentInteractable = null;
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

    this.raycaster.setFromCamera(this.center, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactables, true);

    let hovered = null;
    if (intersects.length > 0 && intersects[0].distance < 3.5) {
      hovered = this._getInteractableRoot(intersects[0].object);
    }

    if (hovered) {
      if (this.currentInteractable !== hovered) {
        this.currentInteractable = hovered;
        if (this.ui.prompt) this.ui.prompt.style.display = 'block';
      }
      if (this.ui.prompt) this.ui.prompt.textContent = `E - ${hovered.userData.prompt}`;
    } else if (this.currentInteractable) {
      this.currentInteractable = null;
      if (this.ui.prompt) this.ui.prompt.style.display = 'none';
    }

    // Auto-collect nearby keys
    if (this.level.keys) {
      const px = this.camera.position.x;
      const py = this.camera.position.y;
      const pz = this.camera.position.z;
      for (const key of this.level.keys) {
        if (!key.userData.collected) {
          const dx = px - key.position.x;
          const dy = py - key.position.y;
          const dz = pz - key.position.z;
          if (dx * dx + dy * dy + dz * dz <= 64) { // 8.0 units radius
            this._collectKey(key.userData.id);
          }
        }
      }
    }
  }

  interact() {
    if (this.gameState.mode !== 'playing' || !this.currentInteractable) return;

    const data = this.currentInteractable.userData;

    if (data.type === 'note') {
      this.openNote(data.text);
      return;
    }

    if (data.type === 'key') {
      this._collectKey(data.id);
      return;
    }

    if (data.type === 'exitDoor') {
      if (data.locked) {
        const collected = this.level.keys ? this.level.keys.filter(k => k.userData.collected).length : 0;
        const total = this.level.keys ? this.level.keys.length : 0;
        this.gameState.message = collected < total
          ? `Noch ${total - collected} Schluessel fehlen.`
          : 'Der Ausgang ist verschlossen.';
        this.refreshUi();
        return;
      }

      if (!data.isOpen && this.level.openExitDoor()) {
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
    document.exitPointerLock();
    this.refreshUi();
  }

  closeNote() {
    if (this.gameState.mode !== 'note') return;
    this.audioManager.playRustle();
    if (this.ui.noteOverlay) this.ui.noteOverlay.style.display = 'none';
    this.gameState.mode = 'playing';
    this.player.lock();
    this.refreshUi();
  }

  winGame() {
    this.gameState.mode = 'won';
    this.gameState.win = true;
    if (this.ui.winOverlay) this.ui.winOverlay.style.display = 'flex';
    if (this.ui.instructions) this.ui.instructions.style.display = 'none';
    if (this.ui.crosshair) this.ui.crosshair.style.display = 'none';

    // Update win stats
    const elapsed = this.gameState.elapsed || 0;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    const statTime = document.getElementById('stat-time');
    const statNotes = document.getElementById('stat-notes');
    if (statTime) statTime.textContent = `${mins}:${secs}`;
    if (statNotes) statNotes.textContent = this.gameState.notesRead || 0;

    document.exitPointerLock();
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

    this.audioManager.playDoorCreek();
    this.ui.prompt.textContent = `E - ${data.prompt}`;
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
