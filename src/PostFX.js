import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostFX {
  constructor(renderer, scene, camera, width, height) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // SSAO - Ambient Occlusion
    this.ssaoPass = new SSAOPass(scene, camera, width >> 1, height >> 1);
    this.ssaoPass.kernelRadius = 0.3;
    this.ssaoPass.minDistance = 0.001;
    this.ssaoPass.maxDistance = 0.5;
    this.ssaoPass.output = SSAOPass.OUTPUT.Default;
    this.composer.addPass(this.ssaoPass);

    // Bloom - Lichtbluten
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.6,   // intensity
      0.8,   // radius
      0.5    // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Bokeh DOF - Depth of Field
    this.bokehPass = new BokehPass(scene, camera, {
      focus: 8.0,
      aperture: 0.00008,
      maxblur: 0.004,
    });
    this.composer.addPass(this.bokehPass);

    // Film Grain
    this.filmPass = new FilmPass(0.35, false);
    this.composer.addPass(this.filmPass);

    // Vignette (GPU-based)
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms["offset"].value = 0.95;
    vignettePass.uniforms["darkness"].value = 1.4;
    this.composer.addPass(vignettePass);

    // SMAA Anti-Aliasing
    this.smaaPass = new SMAAPass(width, height);
    this.composer.addPass(this.smaaPass);

    // Output Pass (color space correction)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.dofEnabled = true;
    this.time = 0;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.ssaoPass.setSize(width >> 1, height >> 1);
    this.bloomPass.setSize(width, height);
    if (this.smaaPass) this.smaaPass.setSize(width, height);
  }

  render(delta) {
    this.time += delta;

    // Animate film grain
    this.filmPass.uniforms["time"].value = this.time;

    // Gentle DOF breathing effect
    if (this.bokehPass && this.dofEnabled) {
      this.bokehPass.uniforms["focus"].value = 8.0 + Math.sin(this.time * 0.3) * 2.0;
    }

    this.composer.render();
  }
}
