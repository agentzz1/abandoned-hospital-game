import * as THREE from 'three';

export class Player {
  constructor(camera, domElement, scene, walls, audioManager, ui, gameState) {
    this.camera = camera;
    this.domElement = domElement;
    this.walls = walls || [];
    this.audioManager = audioManager;
    this.ui = ui;
    this.gameState = gameState;

    this.speed = 5;
    this.sensitivity = 0.002;
    this.locked = false;

    this.standHeight = 1.6;
    this.crouchHeight = 1.0;
    this.eyeHeight = this.standHeight;
    this.radius = 0.3;
    this.stepHeight = 0.35;
    this.lookSpeed = 1.8; // arrow keys, rad/s

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouched = false;
    this.lookLeft = false;
    this.lookRight = false;
    this.lookUp = false;
    this.lookDown = false;

    this.yaw = 0;
    this.pitch = 0;

    this._footstepTimer = 0;
    this._bobTimer = 0;

    this.camera.position.set(0, 1.6, 0);
    this._setCamRot();

    this._bindKeys();
    this._bindMouse();

    // Pre-compute wall AABBs
    this._wallBoxes = [];
    this._buildWallBoxes();
  }

  // Rebuild the collision boxes. Must be called whenever a collider moves,
  // rotates or toggles blocksMovement (e.g. the exit door opening).
  _buildWallBoxes() {
    this._wallBoxes = [];
    const box = new THREE.Box3();
    for (const w of this.walls) {
      if (w.userData?.blocksMovement === false) continue;
      if (!w.geometry) continue;
      w.updateMatrixWorld(true);
      // World-space AABB: respects position, rotation and scale.
      box.setFromObject(w);
      if (box.isEmpty()) continue;
      // Anything the player can simply step over does not block movement.
      if (box.max.y <= this.stepHeight) continue;
      this._wallBoxes.push({
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
      });
    }
  }

  // Public: call after the level geometry changes.
  refreshColliders() {
    this._buildWallBoxes();
  }

  get isLockedOrDragging() {
    return this.locked || this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
  }

  // Euler-compatible view of the camera rotation. Exposes the private _x/_y/_z
  // fields too so THREE.Quaternion.setFromEuler() works on it instead of
  // producing a NaN quaternion.
  get euler() {
    const self = this;
    return {
      isEuler: true,
      order: 'YXZ',
      _order: 'YXZ',
      z: 0,
      _z: 0,
      get x() { return self.pitch; },
      set x(v) { self.pitch = v; self._setCamRot(); },
      get _x() { return self.pitch; },
      get y() { return self.yaw; },
      set y(v) { self.yaw = v; self._setCamRot(); },
      get _y() { return self.yaw; },
    };
  }

  get velocity() {
    return { x: 0, z: 0, set() {} };
  }

  _setCamRot() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  _canControl() {
    return !this.gameState || this.gameState.mode === 'playing';
  }

  clearInput() {
    this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = false;
    this.lookLeft = this.lookRight = this.lookUp = this.lookDown = false;
    this.isSprinting = false;
    this.isCrouched = false;
  }

  _bindKeys() {
    const map = {
      'KeyW': 'moveForward', 'KeyS': 'moveBackward',
      'KeyA': 'moveLeft', 'KeyD': 'moveRight',
      'ArrowLeft': 'lookLeft', 'ArrowRight': 'lookRight',
      'ArrowUp': 'lookUp', 'ArrowDown': 'lookDown',
      'ShiftLeft': 'isSprinting', 'ShiftRight': 'isSprinting',
      'ControlLeft': 'isCrouched', 'KeyC': 'isCrouched'
    };
    document.addEventListener('keydown', e => {
      if (!map[e.code]) return;
      if (!this._canControl()) return;
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this[map[e.code]] = true;
    });
    // Key-up must always be honoured, otherwise a key released while an
    // overlay is open stays "stuck" down forever.
    document.addEventListener('keyup', e => { if (map[e.code]) this[map[e.code]] = false; });
    window.addEventListener('blur', () => this.clearInput());
  }

  _bindMouse() {
    const canvas = document.querySelector('canvas');
    const hint = document.getElementById('click-to-play');
    const lock = () => { if (!this.locked) (canvas || document.body).requestPointerLock(); };
    canvas?.addEventListener('click', lock);
    document.addEventListener('click', e => {
      if (e.target.closest('#note-overlay, #win-overlay, #intro-overlay, button')) return;
      lock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === (canvas || document.body);
      if (hint) hint.style.display = this.locked ? 'none' : 'block';
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked || !this._canControl()) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      this._setCamRot();
    });
  }

  _collides(px, pz) {
    const r = this.radius;
    const feet = this.stepHeight;          // top of what we can step over
    const head = this.eyeHeight + 0.15;    // top of the player capsule
    for (let i = 0; i < this._wallBoxes.length; i++) {
      const b = this._wallBoxes[i];
      if (b.maxY <= feet || b.minY >= head) continue; // above/below the player
      if (px + r > b.minX && px - r < b.maxX &&
          pz + r > b.minZ && pz - r < b.maxZ) {
        return true;
      }
    }
    return false;
  }

  update(dt) {
    if (!this._canControl()) {
      // Keep the eye height settled while an overlay is open.
      this.camera.position.y += (this.eyeHeight - this.camera.position.y) * 8 * dt;
      this._setCamRot();
      return;
    }

    // Arrow-key look (alternative to the mouse)
    if (this.lookLeft)  this.yaw += this.lookSpeed * dt;
    if (this.lookRight) this.yaw -= this.lookSpeed * dt;
    if (this.lookUp)    this.pitch += this.lookSpeed * dt;
    if (this.lookDown)  this.pitch -= this.lookSpeed * dt;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    const fwdX = -sin, fwdZ = -cos;
    const rightX = cos, rightZ = -sin;

    // Crouching lowers the camera and cannot be combined with sprinting.
    const targetHeight = this.isCrouched ? this.crouchHeight : this.standHeight;
    this.eyeHeight += (targetHeight - this.eyeHeight) * Math.min(1, 10 * dt);

    let spd = this.speed;
    if (this.isCrouched) spd *= 0.5;
    else if (this.isSprinting) spd *= 1.6;

    let mx = 0, mz = 0;
    if (this.moveForward)  { mx += fwdX;   mz += fwdZ; }
    if (this.moveBackward) { mx -= fwdX;   mz -= fwdZ; }
    if (this.moveRight)    { mx += rightX; mz += rightZ; }
    if (this.moveLeft)     { mx -= rightX; mz -= rightZ; }

    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0.001) {
      mx = (mx / len) * spd * dt;
      mz = (mz / len) * spd * dt;
    }

    // Try X and Z separately for wall sliding
    const curX = this.camera.position.x;
    const curZ = this.camera.position.z;

    if (!this._collides(curX + mx, curZ + mz)) {
      this.camera.position.x = curX + mx;
      this.camera.position.z = curZ + mz;
    } else if (!this._collides(curX + mx, curZ)) {
      this.camera.position.x = curX + mx;
    } else if (!this._collides(curX, curZ + mz)) {
      this.camera.position.z = curZ + mz;
    }
    // else blocked completely

    // Head bob + footsteps, both scaled with the actual movement speed
    const moving = len > 0.001;
    if (moving) {
      const rate = spd / this.speed;
      this._bobTimer += dt * 9 * rate;
      this.camera.position.y = this.eyeHeight + Math.abs(Math.sin(this._bobTimer)) * 0.035 * rate;
      this._footstepTimer += dt;
      const interval = this.isCrouched ? 0.85 : this.isSprinting ? 0.32 : 0.5;
      if (this._footstepTimer > interval) {
        this.audioManager?.playFootstep(this.isSprinting);
        this._footstepTimer = 0;
      }
    } else {
      this._footstepTimer = 0;
      this.camera.position.y += (this.eyeHeight - this.camera.position.y) * Math.min(1, 8 * dt);
    }

    this._setCamRot();
  }

  reset() {
    this.clearInput();
    this.yaw = 0;
    this.pitch = 0;
    this._bobTimer = 0;
    this._footstepTimer = 0;
    this.eyeHeight = this.standHeight;
    this.camera.position.set(0, this.standHeight, 0);
    this._setCamRot();
    this._buildWallBoxes();
  }
}
