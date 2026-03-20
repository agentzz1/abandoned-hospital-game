import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
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
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // SSAO - Ambient Occlusion for realistic shadows
    this.ssaoPass = new SSAOPass(scene, camera, width >> 1, height >> 1);
    this.ssaoPass.kernelRadius = 0.5;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.3;
    this.ssaoPass.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(this.ssaoPass);

    // Bloom - light glow
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.5,   // intensity
      0.7,   // radius
      0.6    // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Bokeh DOF - depth of field
    this.bokehPass = new BokehPass(scene, camera, {
      focus: 6.0,
      aperture: 0.00015,
      maxblur: 0.006,
    });
    this.composer.addPass(this.bokehPass);

    // Chromatic Aberration
    this.chromaticPass = new ShaderPass(ChromaticAberrationShader);
    this.composer.addPass(this.chromaticPass);

    // Film Grain
    this.filmPass = new FilmPass(0.25, false);
    this.composer.addPass(this.filmPass);

    // Vignette
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 1.0;
    vignettePass.uniforms["darkness"].value = 1.1;
    this.composer.addPass(vignettePass);

    // Output Pass
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.dofEnabled = true;
    this.time = 0;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.ssaoPass.setSize(width >> 1, height >> 1);
    this.bloomPass.setSize(width, height);
  }

  render(delta) {
    this.time += delta;
    this.filmPass.uniforms["time"].value = this.time;

    // Subtle DOF breathing
    if (this.bokehPass && this.dofEnabled) {
      this.bokehPass.uniforms["focus"].value = 6.0 + Math.sin(this.time * 0.2) * 1.5;
    }

    // Subtle chromatic aberration pulse
    this.chromaticPass.uniforms["amount"].value = 0.002 + Math.sin(this.time * 0.5) * 0.001;

    this.composer.render();
  }
}
