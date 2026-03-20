import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class PostFX {
  constructor(renderer, scene, camera, width, height) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Bloom - magical glow
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.7,   // intensity
      0.9,   // radius
      0.35   // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Film Grain - very subtle
    this.filmPass = new FilmPass(0.1, false);
    this.composer.addPass(this.filmPass);

    // Output Pass (color space correction)
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.time = 0;
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  render(delta) {
    this.time += delta;
    this.filmPass.uniforms["time"].value = this.time;
    this.composer.render();
  }
}
