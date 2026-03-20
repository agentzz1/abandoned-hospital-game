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

    this.isLocked = false;
    this.isDragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._yaw = 0;
    this._pitch = 0;
    this._sensitivity = 0.002;

    this._setupInput();
    this._setupPointerLock();
    this._setupDragLook();
    this.camera.position.set(0, 1.6, 0);
    this._baseY = 1.6;
    this._baseRoll = 0;
    this._headBobX = 0;
  }

  _setupPointerLock() {
    const onPointerLockChange = () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const onMouseMove = (e) => {
      if (!this.isLocked) return;
      this._yaw -= e.movementX * this._sensitivity;
      this._pitch -= e.movementY * this._sensitivity;
      this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
      this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
    };
    document.addEventListener('mousemove', onMouseMove);
  }

  _setupDragLook() {
    // Mouse drag for trackpad users
    this.domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !this.isLocked) {
        this.isDragging = true;
        this._dragStartX = e.clientX;
        this._dragStartY = e.clientY;
        this.domElement.style.cursor = 'grabbing';
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._yaw -= dx * this._sensitivity * 1.5;
      this._pitch -= dy * this._sensitivity * 1.5;
      this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
      this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        this.domElement.style.cursor = '';
      }
    });

    // Touch support for mobile/trackpad
    this.domElement.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this._dragStartX = e.touches[0].clientX;
        this._dragStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    this.domElement.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - this._dragStartX;
      const dy = e.touches[0].clientY - this._dragStartY;
      this._dragStartX = e.touches[0].clientX;
      this._dragStartY = e.touches[0].clientY;
      this._yaw -= dx * this._sensitivity * 1.5;
      this._pitch -= dy * this._sensitivity * 1.5;
      this._pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this._pitch));
      this.camera.quaternion.setFromEuler(new THREE.Euler(this._pitch, this._yaw, 0, 'YXZ'));
    }, { passive: true });

    this.domElement.addEventListener('touchend', () => {
      this.isDragging = false;
    }, { passive: true });
  }

  lock() {
    this.domElement.requestPointerLock?.();
  }

  get isLockedOrDragging() {
    return this.isLocked || this.isDragging;
  }

  _setupInput() {
    const onKeyDown = (event) => {
      switch (event.code) {
        case "ArrowUp": case "KeyW": this.moveForward = true; break;
        case "ArrowLeft": case "KeyA": this.moveLeft = true; break;
        case "ArrowDown": case "KeyS": this.moveBackward = true; break;
        case "ArrowRight": case "KeyD": this.moveRight = true; break;
        case "ShiftLeft": case "ShiftRight": this.isSprinting = true; break;
        case "ControlLeft": case "KeyC":
          this.isCrouched = true;
          this._baseY = 1.0;
          break;
      }
    };

    const onKeyUp = (event) => {
      switch (event.code) {
        case "ArrowUp": case "KeyW": this.moveForward = false; break;
        case "ArrowLeft": case "KeyA": this.moveLeft = false; break;
        case "ArrowDown": case "KeyS": this.moveBackward = false; break;
        case "ArrowRight": case "KeyD": this.moveRight = false; break;
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

  update(delta) {
    // Velocity damping
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    // Input direction
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

      // Figure-8 head bob pattern
      const bobX = Math.sin(this.headBobTimer) * (this.isSprinting ? 0.025 : 0.015);
      const bobY = Math.abs(Math.sin(this.headBobTimer * 2)) * (this.isSprinting ? 0.06 : 0.035);

      // Footstep impact vibration
      this.footstepShake *= Math.pow(0.01, delta);
      const shakeX = (Math.random() - 0.5) * this.footstepShake * 0.008;
      const shakeY = (Math.random() - 0.5) * this.footstepShake * 0.005;

      // Camera tilt on strafe
      const targetRoll = this.direction.x * 0.015 * (this.isSprinting ? 1.3 : 1.0);
      this._baseRoll += (targetRoll - this._baseRoll) * 5 * delta;

      this.camera.position.y = this._baseY + bobY + shakeY;
      this._headBobX = bobX + shakeX;
      this.camera.rotation.z = this._baseRoll;

    } else {
      this.footstepTimer = 0;
      this.footstepShake = 0;

      // Breathing animation when standing still
      this.breathTimer += delta * 1.2;
      const breathY = Math.sin(this.breathTimer) * 0.008;

      // Smooth return to base position
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

    // Apply head bob offset after movement (local X axis)
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.addScaledVector(rightAxis, this._headBobX);

    const collided = this._resolveCollision(prevPos);
    if (collided) {
      // Slide along walls instead of full stop
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
