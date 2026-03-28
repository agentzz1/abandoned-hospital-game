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
    this.velocity = new THREE.Vector3();
    this.moveSpeed = 5.0;
    this.sprintMultiplier = 1.6;
    this.isCrouched = false;

    // Input flags
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;

    // Mouse look - euler angles, no quaternion weirdness
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.sensitivity = 0.002; // radians per pixel
    this.pointerLocked = false;

    // Animation timers
    this.footstepTimer = 0;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.footstepShake = 0;
    this._baseY = 1.6;
    this._baseRoll = 0;
    this._headBobX = 0;

    // Init
    this.camera.position.set(0, 1.6, 0);
    this.euler.set(0, 0, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    this._setupKeyboard();
    this._setupMouse();
  }

  get isLockedOrDragging() {
    return this.pointerLocked || this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
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

    // Click anywhere to lock
    const tryLock = () => {
      if (!this.pointerLocked) {
        (canvas || document.body).requestPointerLock();
      }
    };

    canvas?.addEventListener('click', tryLock);
    document.addEventListener('click', (e) => {
      // Don't lock if clicking on UI overlays
      if (e.target.closest('#note-overlay, #win-overlay, #intro-overlay, button')) return;
      tryLock();
    });

    // Pointer lock change
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === (canvas || document.body);
      if (hint) hint.style.display = this.pointerLocked ? 'none' : 'block';
      document.body.style.cursor = this.pointerLocked ? 'none' : '';
    });

    // Mouse move - DIRECT rotation, no smoothing
    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;

      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      // Yaw (left/right) - subtract so right movement = look right
      this.euler.y -= dx * this.sensitivity;

      // Pitch (up/down) - subtract so upward movement = look up
      this.euler.x -= dy * this.sensitivity;

      // Clamp pitch to prevent flipping
      this.euler.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.euler.x));

      // Apply directly
      this.camera.quaternion.setFromEuler(this.euler);
    });

    // ESC releases pointer lock
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.pointerLocked) {
        document.exitPointerLock();
      }
    });
  }

  // ─── COLLISION ──────────────────────────────────────────────
  _resolveCollision(prevPos) {
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
      const hd = (bb.max.z - bb.min.z) * 0.5;

      if (px + pad > wall.position.x - hw && px - pad < wall.position.x + hw &&
          pz + pad > wall.position.z - hd && pz - pad < wall.position.z + hd) {
        this.camera.position.copy(prevPos);
        return true;
      }
    }
    return false;
  }

  // ─── UPDATE ─────────────────────────────────────────────────
  update(delta) {
    // Damping
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    // Input direction
    const inputZ = Number(this.moveForward) - Number(this.moveBackward);
    const inputX = Number(this.moveRight) - Number(this.moveLeft);

    const speedMul = (this.isSprinting ? this.sprintMultiplier : 1.0) * (this.isCrouched ? 0.5 : 1.0);
    const speed = this.moveSpeed * speedMul;
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;

    if (moving) {
      const accel = speed * 12.0;
      if (inputZ !== 0) this.velocity.z -= inputZ * accel * delta;
      if (inputX !== 0) this.velocity.x -= inputX * accel * delta;

      this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -speed, speed);
      this.velocity.z = THREE.MathUtils.clamp(this.velocity.z, -speed, speed);

      // Head bob
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

      const targetRoll = inputX * 0.015 * (this.isSprinting ? 1.3 : 1.0);
      this._baseRoll += (targetRoll - this._baseRoll) * 5 * delta;

      this.camera.position.y = this._baseY + bobY + shakeY;
      this._headBobX = bobX + shakeX;
      this.camera.rotation.z = this._baseRoll;
    } else {
      this.footstepTimer = 0;
      this.footstepShake = 0;

      // Breathing
      this.breathTimer += delta * 1.2;
      const breathY = Math.sin(this.breathTimer) * 0.008;

      this.camera.position.y += (this._baseY + breathY - this.camera.position.y) * 8 * delta;
      this._headBobX += (0 - this._headBobX) * 8 * delta;
      this._baseRoll += (0 - this._baseRoll) * 8 * delta;
      this.camera.rotation.z = this._baseRoll;
    }

    // Movement vectors from camera rotation
    const prevPos = this.camera.position.clone();

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();

    // Apply velocity
    this.camera.position.addScaledVector(right, -this.velocity.x * delta);
    this.camera.position.addScaledVector(forward, -this.velocity.z * delta);

    // Head bob offset (local X)
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(rightAxis, this._headBobX);

    // Collision
    const collided = this._resolveCollision(prevPos);
    if (collided) {
      this.velocity.x *= 0.3;
      this.velocity.z *= 0.3;
    }

    // IMPORTANT: re-apply euler after all position changes
    // (camera.rotation.z for head bob can mess with quaternion)
    this.camera.quaternion.setFromEuler(this.euler);
    // Then re-apply roll on top
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this._baseRoll);
    this.camera.quaternion.multiply(rollQuat);
  }

  reset() {
    this.velocity.set(0, 0, 0);
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
    this.camera.position.set(0, 1.6, 0);
    this.euler.set(0, 0, 0);
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.rotation.z = 0;
  }
}
