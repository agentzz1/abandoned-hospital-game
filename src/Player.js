import * as THREE from 'three';

export class Player {
  constructor(camera, domElement, scene, walls, audioManager, ui, gameState) {
    this.camera = camera;
    this.domElement = domElement;
    this.walls = walls;
    this.audioManager = audioManager;
    this.ui = ui;
    this.gameState = gameState;

    // Movement
    this.moveSpeed = 5.0;
    this.sprintMultiplier = 1.6;
    this.isCrouched = false;

    // Input
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;

    // Look - just yaw and pitch as plain numbers
    this.yaw = 0;   // radians, 0 = forward (-Z), positive = right
    this.pitch = 0; // radians, positive = up
    this.sensitivity = 0.002;
    this.pointerLocked = false;

    // Velocity for smooth movement
    this.velX = 0;
    this.velZ = 0;

    // Animation
    this.footstepTimer = 0;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.footstepShake = 0;
    this._baseY = 1.6;
    this._baseRoll = 0;
    this._headBobX = 0;

    // Init
    this.camera.position.set(0, 1.6, 0);
    this._applyRotation();

    this._setupKeyboard();
    this._setupMouse();
  }

  get isLockedOrDragging() {
    return this.pointerLocked || this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
  }

  // Expose euler for compatibility with sim.look/lookAt
  get euler() {
    return { x: this.pitch, y: this.yaw, z: 0 };
  }

  set euler(val) {
    this.pitch = val.x;
    this.yaw = val.y;
    this._applyRotation();
  }

  _applyRotation() {
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  // ─── KEYBOARD ───────────────────────────────────────────────
  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyD': this.moveRight = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = true; break;
        case 'ControlLeft': case 'KeyC':
          this.isCrouched = true;
          this._baseY = 1.0;
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyD': this.moveRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.isSprinting = false; break;
        case 'ControlLeft': case 'KeyC':
          this.isCrouched = false;
          this._baseY = 1.6;
          break;
      }
    });
  }

  // ─── MOUSE ──────────────────────────────────────────────────
  _setupMouse() {
    const canvas = document.querySelector('canvas');
    const hint = document.getElementById('click-to-play');

    const tryLock = () => {
      if (!this.pointerLocked) {
        (canvas || document.body).requestPointerLock();
      }
    };

    canvas?.addEventListener('click', tryLock);
    document.addEventListener('click', (e) => {
      if (e.target.closest('#note-overlay, #win-overlay, #intro-overlay, button')) return;
      tryLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === (canvas || document.body);
      if (hint) hint.style.display = this.pointerLocked ? 'none' : 'block';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;

      this.yaw -= (e.movementX || 0) * this.sensitivity;
      this.pitch -= (e.movementY || 0) * this.sensitivity;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

      this._applyRotation();
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.pointerLocked) {
        document.exitPointerLock();
      }
    });
  }

  // ─── COLLISION ──────────────────────────────────────────────
  _resolveCollision(prevX, prevZ) {
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const pad = 0.35;

    for (let i = 0; i < this.walls.length; i++) {
      const wall = this.walls[i];
      if (wall.userData?.blocksMovement === false) continue;

      const dx = px - wall.position.x;
      const dz = pz - wall.position.z;
      if (dx * dx + dz * dz > 100) continue;

      if (!wall.geometry.boundingBox) wall.geometry.computeBoundingBox();
      const bb = wall.geometry.boundingBox;
      const hw = (bb.max.x - bb.min.x) * 0.5;
      const hd = (bb.max.z - bb.max.z) * 0.5;

      if (px + pad > wall.position.x - hw && px - pad < wall.position.x + hw &&
          pz + pad > wall.position.z - hd && pz - pad < wall.position.z + hd) {
        this.camera.position.x = prevX;
        this.camera.position.z = prevZ;
        return true;
      }
    }
    return false;
  }

  // ─── UPDATE ─────────────────────────────────────────────────
  update(delta) {
    const speedMul = (this.isSprinting ? this.sprintMultiplier : 1.0) * (this.isCrouched ? 0.5 : 1.0);
    const speed = this.moveSpeed * speedMul;
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;

    // ── Calculate direction vectors from YAW ONLY (no quaternion) ──
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // Forward: when yaw=0, forward = (0, 0, -1). When yaw=PI/2, forward = (1, 0, 0)
    const fwdX = sinY;
    const fwdZ = -cosY;

    // Right: when yaw=0, right = (1, 0, 0). When yaw=PI/2, right = (0, 0, 1)
    const rgtX = cosY;
    const rgtZ = sinY;

    // ── Get input ──
    const inputFwd = (this.moveForward ? 1 : 0) - (this.moveBackward ? 1 : 0);
    const inputRgt = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);

    // ── Target velocity ──
    let targetVelX = 0;
    let targetVelZ = 0;

    if (inputFwd !== 0) {
      targetVelX += fwdX * inputFwd * speed;
      targetVelZ += fwdZ * inputFwd * speed;
    }
    if (inputRgt !== 0) {
      targetVelX += rgtX * inputRgt * speed;
      targetVelZ += rgtZ * inputRgt * speed;
    }

    // Smooth velocity
    const lerpFactor = moving ? 12.0 : 10.0;
    this.velX += (targetVelX - this.velX) * lerpFactor * delta;
    this.velZ += (targetVelZ - this.velZ) * lerpFactor * delta;

    // ── Apply movement ──
    const prevX = this.camera.position.x;
    const prevZ = this.camera.position.z;

    this.camera.position.x += this.velX * delta;
    this.camera.position.z += this.velZ * delta;

    // ── Head bob & animation ──
    if (moving) {
      this.footstepTimer += delta;
      this.headBobTimer += delta * (this.isSprinting ? 14 : 9);

      const stepInterval = this.isSprinting ? 0.30 : 0.50;
      if (this.footstepTimer > stepInterval) {
        this.audioManager.playFootstep(this.isSprinting);
        this.footstepShake = 1.0;
        this.footstepTimer = 0;
      }

      const bobX = Math.sin(this.headBobTimer) * (this.isSprinting ? 0.025 : 0.015);
      const bobY = Math.abs(Math.sin(this.headBobTimer * 2)) * (this.isSprinting ? 0.06 : 0.035);

      this.footstepShake *= Math.pow(0.01, delta);
      const shakeX = (Math.random() - 0.5) * this.footstepShake * 0.008;
      const shakeY = (Math.random() - 0.5) * this.footstepShake * 0.005;

      const targetRoll = inputRgt * 0.015 * (this.isSprinting ? 1.3 : 1.0);
      this._baseRoll += (targetRoll - this._baseRoll) * 5 * delta;

      this.camera.position.y = this._baseY + bobY + shakeY;
      this._headBobX = bobX + shakeX;
    } else {
      this.footstepTimer = 0;
      this.footstepShake = 0;

      this.breathTimer += delta * 1.2;
      const breathY = Math.sin(this.breathTimer) * 0.008;

      this.camera.position.y += (this._baseY + breathY - this.camera.position.y) * 8 * delta;
      this._headBobX += (0 - this._headBobX) * 8 * delta;
      this._baseRoll += (0 - this._baseRoll) * 8 * delta;
    }

    // ── Collision ──
    if (this._resolveCollision(prevX, prevZ)) {
      this.velX *= 0.3;
      this.velZ *= 0.3;
    }

    // ── Head bob offset on local X ──
    this.camera.position.x += rgtX * this._headBobX;
    this.camera.position.z += rgtZ * this._headBobX;

    // ── Final rotation: yaw + pitch, then roll ──
    this._applyRotation();
    if (Math.abs(this._baseRoll) > 0.0001) {
      const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this._baseRoll);
      this.camera.quaternion.multiply(rollQ);
    }
  }

  reset() {
    this.velX = 0;
    this.velZ = 0;
    this.footstepTimer = 0;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.footstepShake = 0;
    this._baseRoll = 0;
    this._headBobX = 0;
    this.isCrouched = false;
    this.isSprinting = false;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this._baseY = 1.6;
    this.yaw = 0;
    this.pitch = 0;
    this.camera.position.set(0, 1.6, 0);
    this._applyRotation();
  }
}
