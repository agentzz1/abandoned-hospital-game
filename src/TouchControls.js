// On-screen controls for phones and tablets: a floating joystick on the left half (pushed to the
// edge it sprints), drag-to-look on the right half, and buttons for use/hide, flashlight, crouch
// and pause. Built on Pointer Events, which iOS Safari 13+ and Android browsers support.

const JOYSTICK_RADIUS = 56;
const SPRINT_THRESHOLD = 0.92;
const LOOK_SENSITIVITY = 0.0055;

export class TouchControls {
  constructor({ player, gameState, onUse, onFlashlight, onPause }) {
    this.player = player;
    this.gameState = gameState;
    this.onUse = onUse;
    this.onFlashlight = onFlashlight;
    this.onPause = onPause;
    this.enabled = false;
    this.joyPointer = null;
    this.lookPointer = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.lookLast = { x: 0, y: 0 };
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('touch');
    this._build();
    // Stop Safari's pinch-zoom gesture from fighting the look controls.
    document.addEventListener('gesturestart', e => e.preventDefault());
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch-controls';
    root.innerHTML = `
      <div id="touch-look-zone"></div>
      <div id="touch-joy-zone"></div>
      <div id="touch-joy-base"><div id="touch-joy-knob"></div></div>
      <button type="button" id="touch-pause" aria-label="Pause">II</button>
      <div id="touch-buttons">
        <button type="button" id="touch-crouch">Ducken</button>
        <button type="button" id="touch-light">Lampe</button>
        <button type="button" id="touch-use">Benutzen</button>
      </div>`;
    // First in #ui so the note, pause and win overlays stack above the controls.
    const ui = document.getElementById('ui');
    ui.insertBefore(root, ui.firstChild);
    this.root = root;
    this.base = root.querySelector('#touch-joy-base');
    this.knob = root.querySelector('#touch-joy-knob');
    this.useBtn = root.querySelector('#touch-use');
    this.lightBtn = root.querySelector('#touch-light');
    this.crouchBtn = root.querySelector('#touch-crouch');

    const joyZone = root.querySelector('#touch-joy-zone');
    const lookZone = root.querySelector('#touch-look-zone');
    joyZone.addEventListener('pointerdown', e => this._joyStart(e));
    lookZone.addEventListener('pointerdown', e => this._lookStart(e));
    window.addEventListener('pointermove', e => this._move(e), { passive: false });
    window.addEventListener('pointerup', e => this._end(e));
    window.addEventListener('pointercancel', e => this._end(e));

    this._tap(this.useBtn, () => this.onUse());
    this._tap(this.lightBtn, () => this.onFlashlight());
    this._tap(this.crouchBtn, () => {
      if (this.gameState.mode === 'playing') this.player.isCrouched = !this.player.isCrouched;
    });
    this._tap(root.querySelector('#touch-pause'), () => this.onPause());
  }

  _tap(el, fn) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
  }

  _joyStart(e) {
    if (this.joyPointer !== null) return;
    e.preventDefault();
    this.joyPointer = e.pointerId;
    this.joyOrigin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.classList.add('active');
    this._setKnob(0, 0);
  }

  _lookStart(e) {
    if (this.lookPointer !== null) return;
    e.preventDefault();
    this.lookPointer = e.pointerId;
    this.lookLast = { x: e.clientX, y: e.clientY };
  }

  _move(e) {
    if (e.pointerId === this.joyPointer) {
      e.preventDefault();
      let dx = e.clientX - this.joyOrigin.x, dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOYSTICK_RADIUS) { dx *= JOYSTICK_RADIUS / len; dy *= JOYSTICK_RADIUS / len; }
      this._setKnob(dx, dy);
      const mag = Math.min(1, len / JOYSTICK_RADIUS);
      this.player.analog.x = dx / JOYSTICK_RADIUS;
      this.player.analog.y = -dy / JOYSTICK_RADIUS;
      this.player.isSprinting = mag >= SPRINT_THRESHOLD;
    } else if (e.pointerId === this.lookPointer) {
      e.preventDefault();
      const dx = e.clientX - this.lookLast.x, dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.player.applyLookDelta(dx * LOOK_SENSITIVITY, dy * LOOK_SENSITIVITY);
    }
  }

  _end(e) {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.player.analog.x = 0;
      this.player.analog.y = 0;
      this.player.isSprinting = false;
      this.base.classList.remove('active');
      // Back to the resting spot so the idle stick never floats mid-screen.
      this.base.style.left = '';
      this.base.style.top = '';
      this._setKnob(0, 0);
    } else if (e.pointerId === this.lookPointer) {
      this.lookPointer = null;
    }
  }

  _setKnob(dx, dy) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Called every frame to mirror game state on the buttons.
  update({ canUse }) {
    if (!this.enabled) return;
    this.root.classList.toggle('inactive', this.gameState.mode !== 'playing');
    this.useBtn.classList.toggle('ready', !!canUse);
    this.lightBtn.classList.toggle('on', !!this.gameState.flashlightOn);
    this.crouchBtn.classList.toggle('on', !!this.player.isCrouched);
    // Drop any held stick when an overlay takes over, so the player does not keep walking after it.
    if (this.gameState.mode !== 'playing' && this.joyPointer !== null) {
      this._end({ pointerId: this.joyPointer });
    }
  }
}
