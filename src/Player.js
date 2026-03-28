import * as THREE from 'three';

export class Player {
  constructor(camera, domElement, scene, walls, audioManager, ui, gameState) {
    this.camera = camera;
    this.domElement = domElement;
    this.walls = walls;
    this.audioManager = audioManager;
    this.ui = ui;
    this.gameState = gameState;
    this.footstepTimer = 0;
    this.headBobTimer = 0;
    this.breathTimer = 0;
    this.footstepShake = 0;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.moveSpeed = 4.0;
    this.sprintMultiplier = 1.6;
    this.isCrouched = false;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isSprinting = false;

    this._yaw = 0;
    this._pitch = 0;
    this._sensitivity = 0.002;
    this._isLocked = false;

    this._setupInput();
    this._setupMouseLook();
    this.camera.position.set(0, 1.6, 0);
    this._baseY = 1.6;
    this._baseRoll = 0;
    this._headBobX = 0;
  }

  get isLockedOrDragging() {
    return this._isLocked || this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
  }

  _setupMouseLook() {
    const canvas = document.querySelector('canvas');
    const lockTarget = canvas || this.domElement;

    // Click canvas to lock mouse
    lockTarget.addEventListener('click', () => {
      if (!this._isLocked && document.pointerLockElement !== lockTarget) {
        lockTarget.requestPointerLock?.();
      }
    });

    // Also allow any click on body when not locked
    document.addEventListener('click', () => {
      if (!this._isLocked && document.pointerLockElement !== lockTarget) {
        lockTarget.requestPointerLock?.();
      }
    });

    const clickToPlay = document.getElementById('click-to-play');

    document.addEventListener('pointerlockchange', () => {
      this._isLocked = document.pointerLockElement === lockTarget;
      if (clickToPlay) {
        clickToPlay.style.display = this._isLocked ? 'none' : 'block';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this._isLocked) return;
      if (document.pointerLockElement !== lockTarget) return;

      const dx = e.movementX || 0;
      const dy = e.movementY || 0;

      this._yaw -= dx * this._sensitivity;
      this._pitch -= dy * this._sensitivity;
      this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
      this._clampYaw();
      this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
    });

    // ESC to release pointer lock
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this._isLocked) {
        document.exitPointerLock?.();
      }
    });
  }

  _setupInput() {
    this._lookStep = 0.04; // radians per keypress (~2.3 degrees)

    const onKeyDown = (event) => {
      switch (event.code) {
        case "KeyW": this.moveForward = true; break;
        case "KeyA": this.moveLeft = true; break;
        case "KeyS": this.moveBackward = true; break;
        case "KeyD": this.moveRight = true; break;
        // Arrow keys for looking (works without mouse lock)
        case "ArrowLeft":
          this._yaw += this._lookStep;
          this._clampYaw();
          this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
          event.preventDefault();
          break;
        case "ArrowRight":
          this._yaw -= this._lookStep;
          this._clampYaw();
          this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
          event.preventDefault();
          break;
        case "ArrowUp":
          this._pitch += this._lookStep;
          this._pitch = Math.min(this._pitch, Math.PI / 2 - 0.01);
          this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
          event.preventDefault();
          break;
        case "ArrowDown":
          this._pitch -= this._lookStep;
          this._pitch = Math.max(this._pitch, -Math.PI / 2 + 0.01);
          this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
          event.preventDefault();
          break;
        case "ShiftLeft": case "ShiftRight": this.isSprinting = true; break;
        case "ControlLeft": case "KeyC":
          this.isCrouched = true;
          this._baseY = 1.0;
          break;
      }
    };

    const onKeyUp = (event) => {
      switch (event.code) {
        case "KeyW": this.moveForward = false; break;
        case "KeyA": this.moveLeft = false; break;
        case "KeyS": this.moveBackward = false; break;
        case "KeyD": this.moveRight = false; break;
        case "ShiftLeft": case "ShiftRight": this.isSprinting = false; break;
        case "ControlLeft": case "KeyC":
          this.isCrouched = false;
          this._baseY = 1.6;
          break;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
  }

  _clampYaw() {
    while (this._yaw > Math.PI) this._yaw -= Math.PI * 2;
    while (this._yaw < -Math.PI) this._yaw += Math.PI * 2;
  }

  update(delta) {
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    const speedMultiplier = (this.isSprinting ? this.sprintMultiplier : 1.0) * (this.isCrouched ? 0.5 : 1.0);
    const moveSpeed = this.moveSpeed * speedMultiplier;
    const moving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;

    if (moving) {
      const acceleration = moveSpeed * 12.0;
      if (this.moveForward || this.moveBackward) {
        this.velocity.z -= this.direction.z * acceleration * delta;
      }
      if (this.moveLeft || this.moveRight) {
        this.velocity.x -= this.direction.x * acceleration * delta;
      }

      this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -moveSpeed, moveSpeed);
      this.velocity.z = THREE.MathUtils.clamp(this.velocity.z, -moveSpeed, moveSpeed);

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

      const targetRoll = this.direction.x * 0.015 * (this.isSprinting ? 1.3 : 1.0);
      this._baseRoll += (targetRoll - this._baseRoll) * 5 * delta;

      this.camera.position.y = this._baseY + bobY + shakeY;
      this._headBobX = bobX + shakeX;
      this.camera.rotation.z = this._baseRoll;
    } else {
      this.footstepTimer = 0;
      this.footstepShake = 0;

      this.breathTimer += delta * 1.2;
      const breathY = Math.sin(this.breathTimer) * 0.008;

      this.camera.position.y += (this._baseY + breathY - this.camera.position.y) * 8 * delta;
      this._headBobX += (0 - this._headBobX) * 8 * delta;
      this._baseRoll += (0 - this._baseRoll) * 8 * delta;
      this.camera.rotation.z = this._baseRoll;
    }

    // Movement with collision
    const prevPos = this.camera.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0; right.normalize();
    this.camera.position.addScaledVector(right, -this.velocity.x * delta);
    this.camera.position.addScaledVector(forward, -this.velocity.z * delta);

    // Head bob offset
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(rightAxis, this._headBobX);

    const collided = this._resolveCollision(prevPos);
    if (collided) {
      this.velocity.x *= 0.3;
      this.velocity.z *= 0.3;
    }
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.direction.set(0, 0, 0);
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
    this.camera.rotation.z = 0;
  }

  _resolveCollision(prevPos) {
    const px = this.camera.position.x;
    const pz = this.camera.position.z;
    const padding = 0.35;

    for (let i = 0, len = this.walls.length; i < len; i++) {
      const wall = this.walls[i];
      if (wall.userData && wall.userData.blocksMovement === false) continue;

      const dx = px - wall.position.x;
      const dz = pz - wall.position.z;
      if (dx * dx + dz * dz > 100) continue;

      if (!wall.geometry.boundingBox) wall.geometry.computeBoundingBox();
      const bb = wall.geometry.boundingBox;
      const hw = (bb.max.x - bb.min.x) * 0.5;
      const hd = (bb.max.z - bb.min.z) * 0.5;
      const wx = wall.position.x;
      const wz = wall.position.z;

      if (px + padding > wx - hw && px - padding < wx + hw &&
          pz + padding > wz - hd && pz - padding < wz + hd) {
        this.camera.position.copy(prevPos);
        return true;
      }
    }
    return false;
  }
}
