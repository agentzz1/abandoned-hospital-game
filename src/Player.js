import * as THREE from 'three';

export class Player {
  constructor(camera, domElement, scene, walls, audioManager, ui, gameState) {
    this.camera = camera;
    this.domElement = domElement;
    this.walls = walls || [];
    this.audioManager = audioManager;
    this.ui = ui;
    this.gameState = gameState;

    // Horror pacing: walking is deliberate, sprinting is short and loud.
    this.speed = 3.4;
    this.sprintMultiplier = 1.55;
    this.stamina = 1;
    this.exhausted = false;
    this.isMoving = false;
    this.sprintingNow = false;
    this.hidden = false;
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
    this._shakeTime = 0;
    this._shakeDuration = 0;
    this._shakeIntensity = 0;

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

  // How far (metres) the player can currently be heard. Read by the Orderly.
  get noiseRadius() {
    if (this.hidden || !this.isMoving) return 0;
    if (this.isCrouched) return 1.2;
    if (this.sprintingNow) return 11;
    return 5;
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

  // Brief decaying rotational jitter on top of normal look rotation, e.g.
  // for a rejected interaction like rattling a locked door.
  shakeCamera(intensity = 0.03, duration = 0.18) {
    this._shakeIntensity = intensity;
    this._shakeDuration = duration;
    this._shakeTime = duration;
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
    // Pointer lock can be refused (embedded frames, phones); arrow keys still work then.
    const lock = () => {
      if (this.locked) return;
      try { (canvas || document.body).requestPointerLock()?.catch?.(() => {}); } catch { /* unsupported */ }
    };
    document.addEventListener('click', e => {
      if (e.target.closest('#note-overlay, #win-overlay, #pause-overlay, #settings-overlay, #intro-overlay, button')) return;
      lock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === (canvas || document.body);
      if (hint) hint.style.display = this.locked ? 'none' : 'block';
    });
    document.addEventListener('mousemove', e => {
      if (!this.locked || !this._canControl()) return;
      const settings = this.gameState.settings || {};
      const sensMul = settings.mouseSensitivity ?? 1.0;
      const invertY = settings.invertY ? -1 : 1;
      this.yaw -= e.movementX * this.sensitivity * sensMul;
      this.pitch -= e.movementY * this.sensitivity * sensMul * invertY;
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
      this.isMoving = false;
      this.sprintingNow = false;
      // Keep the eye height settled while an overlay is open.
      this.camera.position.y += (this.eyeHeight - this.camera.position.y) * 8 * dt;
      this._setCamRot();
      return;
    }

    // Arrow-key look (alternative to the mouse)
    const settings = this.gameState.settings || {};
    const lookSensMul = settings.mouseSensitivity ?? 1.0;
    const lookInvertY = settings.invertY ? -1 : 1;
    if (this.lookLeft)  this.yaw += this.lookSpeed * lookSensMul * dt;
    if (this.lookRight) this.yaw -= this.lookSpeed * lookSensMul * dt;
    if (this.lookUp)    this.pitch += this.lookSpeed * lookSensMul * lookInvertY * dt;
    if (this.lookDown)  this.pitch -= this.lookSpeed * lookSensMul * lookInvertY * dt;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    const fwdX = -sin, fwdZ = -cos;
    const rightX = cos, rightZ = -sin;

    // Crouching lowers the camera and cannot be combined with sprinting.
    const targetHeight = this.isCrouched ? this.crouchHeight : this.standHeight;
    this.eyeHeight += (targetHeight - this.eyeHeight) * Math.min(1, 10 * dt);

    let mx = 0, mz = 0;
    if (this.moveForward)  { mx += fwdX;   mz += fwdZ; }
    if (this.moveBackward) { mx -= fwdX;   mz -= fwdZ; }
    if (this.moveRight)    { mx += rightX; mz += rightZ; }
    if (this.moveLeft)     { mx -= rightX; mz -= rightZ; }

    const len = Math.sqrt(mx * mx + mz * mz);
    this.isMoving = len > 0.001;

    // Stamina: about 4.5s of sprint, and once empty you have to recover a bit before sprinting again.
    this.sprintingNow = this.isSprinting && !this.isCrouched && !this.exhausted && this.isMoving;
    if (this.sprintingNow) {
      this.stamina = Math.max(0, this.stamina - 0.22 * dt);
      if (this.stamina === 0) this.exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + (this.isMoving ? 0.12 : 0.2) * dt);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }

    let spd = this.speed;
    if (this.isCrouched) spd *= 0.5;
    else if (this.sprintingNow) spd *= this.sprintMultiplier;

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
      const interval = this.isCrouched ? 0.85 : this.sprintingNow ? 0.34 : 0.55;
      if (this._footstepTimer > interval) {
        this.audioManager?.playFootstep(this.sprintingNow);
        this._footstepTimer = 0;
      }
    } else {
      this._footstepTimer = 0;
      this.camera.position.y += (this.eyeHeight - this.camera.position.y) * Math.min(1, 8 * dt);
    }

    this._setCamRot();

    // Applied on top of the settled look rotation so it doesn't fight mouse/arrow input.
    if (this._shakeTime > 0) {
      this._shakeTime = Math.max(0, this._shakeTime - dt);
      const t = this._shakeTime / this._shakeDuration;
      const amt = this._shakeIntensity * t;
      this.camera.rotateX((Math.random() - 0.5) * amt);
      this.camera.rotateY((Math.random() - 0.5) * amt);
    }
  }

  reset() {
    this.clearInput();
    this.stamina = 1;
    this.exhausted = false;
    this.yaw = 0;
    this.pitch = 0;
    this._bobTimer = 0;
    this._footstepTimer = 0;
    this._shakeTime = 0;
    this.eyeHeight = this.standHeight;
    this.camera.position.set(0, this.standHeight, 0);
    this._setCamRot();
    this._buildWallBoxes();
  }
}
