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
  constructor(renderer, scene, camera, width, height) {
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
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.pixelRatio = this.maxPixelRatio;
    this.minPixelRatio = 0.5;
    this._frameSamples = 0;
    this._frameTimeSum = 0;
    this._applyPixelRatio();
  }

  _applyPixelRatio() {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.composer.setPixelRatio(this.pixelRatio);
  }

  _adapt(delta) {
    if (delta <= 0) return;
    this._frameTimeSum += delta;
    this._frameSamples++;
    if (this._frameSamples < 40) return;
    const avg = this._frameTimeSum / this._frameSamples;
    this._frameSamples = 0;
    this._frameTimeSum = 0;
    let next = this.pixelRatio;
    if (avg > 1 / 45) next = Math.max(this.minPixelRatio, this.pixelRatio - 0.25);
    else if (avg < 1 / 58) next = Math.min(this.maxPixelRatio, this.pixelRatio + 0.125);
    if (next !== this.pixelRatio) {
      this.pixelRatio = next;
      this._applyPixelRatio();
    }
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  render(delta) {
    this.time += delta;
    this.filmPass.uniforms["time"].value = this.time;
    this.chromaticPass.uniforms["amount"].value = 0.002 + Math.sin(this.time * 0.5) * 0.001;
    this._adapt(delta);
    this.composer.render();
  }
}
