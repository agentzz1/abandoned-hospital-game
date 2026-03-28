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

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouched = false;

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

  _buildWallBoxes() {
    this._wallBoxes = [];
    for (const w of this.walls) {
      if (w.userData?.blocksMovement === false) continue;
      if (!w.geometry) continue;
      if (!w.geometry.boundingBox) w.geometry.computeBoundingBox();
      const bb = w.geometry.boundingBox;
      if (!bb) continue;
      this._wallBoxes.push({
        minX: w.position.x + bb.min.x,
        maxX: w.position.x + bb.max.x,
        minZ: w.position.z + bb.min.z,
        maxZ: w.position.z + bb.max.z,
      });
    }
  }

  get isLockedOrDragging() {
    return this.locked || this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
  }

  get euler() {
    const self = this;
    return {
      get x() { return self.pitch; },
      set x(v) { self.pitch = v; self._setCamRot(); },
      get y() { return self.yaw; },
      set y(v) { self.yaw = v; self._setCamRot(); },
      z: 0
    };
  }

  get velocity() {
    return { x: 0, z: 0, set() {} };
  }

  _setCamRot() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  _bindKeys() {
    const map = {
      'KeyW': 'moveForward', 'KeyS': 'moveBackward',
      'KeyA': 'moveLeft', 'KeyD': 'moveRight',
      'ShiftLeft': 'isSprinting', 'ShiftRight': 'isSprinting',
      'ControlLeft': 'isCrouched', 'KeyC': 'isCrouched'
    };
    document.addEventListener('keydown', e => { if (map[e.code]) this[map[e.code]] = true; });
    document.addEventListener('keyup', e => { if (map[e.code]) this[map[e.code]] = false; });
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
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      this._setCamRot();
    });
  }

  _collides(px, pz) {
    const r = 0.3;
    for (let i = 0; i < this._wallBoxes.length; i++) {
      const b = this._wallBoxes[i];
      if (px + r > b.minX && px - r < b.maxX &&
          pz + r > b.minZ && pz - r < b.maxZ) {
        return true;
      }
    }
    return false;
  }

  update(dt) {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    const fwdX = -sin, fwdZ = -cos;
    const rightX = cos, rightZ = -sin;

    let spd = this.speed;
    if (this.isSprinting) spd *= 1.6;
    if (this.isCrouched) spd *= 0.5;

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

    // Try full movement
    if (!this._collides(curX + mx, curZ + mz)) {
      this.camera.position.x = curX + mx;
      this.camera.position.z = curZ + mz;
    }
    // Try X only
    else if (!this._collides(curX + mx, curZ)) {
      this.camera.position.x = curX + mx;
    }
    // Try Z only
    else if (!this._collides(curX, curZ + mz)) {
      this.camera.position.z = curZ + mz;
    }
    // else blocked completely

    // Head bob
    const moving = len > 0.001;
    if (moving) {
      this._bobTimer += dt * 9;
      this.camera.position.y = 1.6 + Math.abs(Math.sin(this._bobTimer)) * 0.035;
      this._footstepTimer += dt;
      if (this._footstepTimer > 0.5) {
        this.audioManager?.playFootstep(false);
        this._footstepTimer = 0;
      }
    } else {
      this._footstepTimer = 0;
      this.camera.position.y += (1.6 - this.camera.position.y) * 5 * dt;
    }

    this._setCamRot();
  }

  reset() {
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;
    this.isCrouched = false;
    this.yaw = 0;
    this.pitch = 0;
    this._bobTimer = 0;
    this._footstepTimer = 0;
    this.camera.position.set(0, 1.6, 0);
    this._setCamRot();
  }
}
