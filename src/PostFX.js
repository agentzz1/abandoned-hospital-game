import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Custom chromatic aberration shader
const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.003 },
    angle: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float angle;
    varying vec2 vUv;
    void main() {
      vec2 offset = amount * vec2(cos(angle), sin(angle));
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);
      vec2 uvR = vUv + offset * dist;
      vec2 uvB = vUv - offset * dist;
      float r = texture2D(tDiffuse, uvR).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, uvB).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }
  `
};

export class PostFX {
  constructor(renderer, scene, camera, width, height, { maxPixelRatio = 1.5, startPixelRatio, minPixelRatio = 0.5 } = {}) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.45, 0.6, 0.6);
    this.composer.addPass(this.bloomPass);

    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chromaticPass);

    this.filmPass = new FilmPass(0.25, false);
    this.composer.addPass(this.filmPass);

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 1.0;
    vignettePass.uniforms["darkness"].value = 1.1;
    this.composer.addPass(vignettePass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.time = 0;

    // Adaptive resolution: when frames get slow, render fewer pixels instead of
    // dropping the look. Steps back up when there is headroom again.
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    this.minPixelRatio = Math.min(minPixelRatio, this.maxPixelRatio);
    this.pixelRatio = Math.max(this.minPixelRatio, Math.min(this.maxPixelRatio, startPixelRatio ?? this.maxPixelRatio));
    this._frameSamples = 0;
    this._frameTimeSum = 0;
    this._windows = 0;
    // Steps down still being judged: { from, before, steps } (ratio and average frame time before them).
    this._trial = null;
    // Lower bound learned from a step down that did not help, valid until window _floorUntil.
    this._floor = 0;
    this._floorUntil = 0;
    // Upper bound learned from a step down that did help, so it does not climb straight back.
    this._ceiling = Infinity;
    this._ceilingUntil = 0;
    this._applyPixelRatio();
  }

  _applyPixelRatio() {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
  }

  _setPixelRatio(ratio) {
    if (ratio === this.pixelRatio) return;
    this.pixelRatio = ratio;
    this._applyPixelRatio();
  }

  _resetWindow() {
    this._frameSamples = 0;
    this._frameTimeSum = 0;
  }

  // Judges the average frame time over windows of 40 frames. A frame-rate cap looks exactly like
  // an overloaded GPU (iOS Low Power Mode holds requestAnimationFrame at 30 fps however little is
  // drawn), so stepping down is a trial: if frames are not clearly faster after up to two steps
  // (vsync can hide the gain of the first one), the old resolution comes back and stays for about
  // 90 windows instead of sliding down to the floor.
  _adapt(delta) {
    if (delta <= 0) return;
    this._frameTimeSum += Math.min(delta, 0.1);
    this._frameSamples++;
    if (this._frameSamples < 40) return;
    const avg = this._frameTimeSum / this._frameSamples;
    this._resetWindow();
    this._windows++;

    if (this._windows > this._floorUntil) this._floor = 0;
    if (this._windows > this._ceilingUntil) this._ceiling = Infinity;
    const floor = Math.max(this.minPixelRatio, this._floor);

    if (this._trial) {
      const trial = this._trial;
      if (avg > trial.before * 0.85) {
        if (trial.steps < 2 && this.pixelRatio > floor + 1e-6) {
          trial.steps++;
          this._setPixelRatio(Math.max(floor, this.pixelRatio - 0.25));
          return;
        }
        this._trial = null;
        this._floor = trial.from;
        this._floorUntil = this._windows + 90;
        this._setPixelRatio(trial.from);
        return;
      }
      this._trial = null;
      this._ceiling = trial.from;
      this._ceilingUntil = this._windows + 45;
    }

    if (avg > 1 / 45) {
      if (this.pixelRatio > floor + 1e-6) {
        this._trial = { from: this.pixelRatio, before: avg, steps: 1 };
        this._setPixelRatio(Math.max(floor, this.pixelRatio - 0.25));
      } else if (this.pixelRatio <= this.minPixelRatio + 1e-6) {
        // Already at the lowest resolution and still slow: let the game drop its costliest extras.
        this.onStruggle?.();
      }
    } else if (avg < 1 / 58) {
      const top = Math.min(this.maxPixelRatio, this._ceiling - 0.125);
      if (this.pixelRatio < top - 1e-6) this._setPixelRatio(Math.min(top, this.pixelRatio + 0.125));
    }
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  // adapt = false for frames drawn at a deliberately reduced rate (menus), which say nothing about load.
  render(delta, adapt = true) {
    this.time += delta;
    this.filmPass.uniforms["time"].value = this.time;
    this.chromaticPass.uniforms["amount"].value = 0.002 + Math.sin(this.time * 0.5) * 0.001;
    if (adapt) this._adapt(delta);
    else this._resetWindow();
    this.composer.render();
  }
}
