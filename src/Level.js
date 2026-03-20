import * as THREE from 'three';
import { createPBRMaterial } from './TextureGen.js';

export class Level {
  constructor(scene) {
    this.scene = scene;
    this.walls = [];
    this.lights = [];
    this.key = null;
    this.keys = [];
    this.exitDoor = null;
    this.volumetricMeshes = [];
    this._build();
  }

  _build() {
    // Bright, colorful PBR Materials
    const wall = createPBRMaterial("wall", { repeat: [3, 1.5], seed: 42, baseR: 160, baseG: 170, baseB: 185 });
    const metal = createPBRMaterial("metal", { seed: 100, baseR: 140, baseG: 155, baseB: 170 });
    const wood = createPBRMaterial("wood", { repeat: [2, 2], seed: 200, baseR: 140, baseG: 100, baseB: 65 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xf0e8d0, roughness: 1, side: THREE.DoubleSide });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x6a8a7a, roughness: 0.95 });
    const pipe = createPBRMaterial("metal", { seed: 300, baseR: 130, baseG: 145, baseB: 160 });
    const floorMat = createPBRMaterial("concrete", { repeat: [6, 6], seed: 500, baseR: 100, baseG: 105, baseB: 115 });
    const ceilMat = createPBRMaterial("ceiling", { repeat: [4, 4], seed: 600, baseR: 180, baseG: 185, baseB: 195 });
    const tileMat = createPBRMaterial("tile", { repeat: [8, 8], seed: 700 });

    const H = 3;

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), ceilMat);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; this.scene.add(ceil);

    // ========== OUTER WALLS ==========

    // North wall (gap for exit x=-1 to x=1)
    this._w(wall, 9, H, 0.3, -5, H/2, 16);
    this._w(wall, 9, H, 0.3, 5, H/2, 16);

    // South wall
    this._w(wall, 20, H, 0.3, 0, H/2, -7);

    // West wall
    this._w(wall, 0.3, H, 23, -10, H/2, 4.5);

    // East wall
    this._w(wall, 0.3, H, 23, 10, H/2, 4.5);

    // ========== CORRIDOR WALLS ==========

    // Western corridor wall (z=5 to z=12)
    this._w(wall, 0.3, H, 7, -3, H/2, 8.5);

    // Eastern corridor wall
    this._w(wall, 0.3, H, 7, 3, H/2, 8.5);

    // ========== ROOMS ==========

    // --- WAITING ROOM (left, bottom) ---
    this._w(wall, 0.3, H, 10, -10, H/2, 0);
    this._w(wall, 7, H, 0.3, -6.5, H/2, -5);
    this._w(wall, 7, H, 0.3, -6.5, H/2, 5);
    this._b(wood, 2.5, 0.8, 1, -7, 0.4, -1, true);
    for (let i = 0; i < 3; i++) this._b(fabric, 0.5, 0.5, 0.5, -5.5, 0.25, 1 + i * 1.2, true);

    // --- STORAGE (right, bottom) ---
    this._w(wall, 0.3, H, 10, 10, H/2, 0);
    this._w(wall, 7, H, 0.3, 6.5, H/2, -5);
    this._w(wall, 7, H, 0.3, 6.5, H/2, 5);
    this._b(metal, 1.2, 1.8, 0.5, 8.5, 0.9, -1, true);
    this._b(metal, 1.2, 1.8, 0.5, 8.5, 0.9, 1, true);
    this._b(wood, 0.6, 0.6, 0.6, 5.5, 0.3, 2, true);

    // --- FILE ROOM (left, top) ---
    this._w(wall, 0.3, H, 7, -10, H/2, 8.5);
    this._w(wall, 7, H, 0.3, -6.5, H/2, 5);
    this._w(wall, 7, H, 0.3, -6.5, H/2, 12);
    for (let i = 0; i < 3; i++) this._b(wood, 0.5, 1.8, 0.4, -8.5 + i * 1.3, 0.9, 11, true);
    this._b(wood, 1.5, 0.8, 0.8, -6, 0.4, 8, true);

    // --- OP ROOM (right, top) ---
    this._w(wall, 0.3, H, 7, 10, H/2, 8.5);
    this._w(wall, 7, H, 0.3, 6.5, H/2, 5);
    this._w(wall, 7, H, 0.3, 6.5, H/2, 12);
    this._b(metal, 2, 0.9, 0.8, 7, 0.45, 8.5, true);
    this._b(metal, 0.15, 1.5, 0.15, 5.5, 0.75, 7, true);

    // ========== EXIT CORRIDOR ==========
    this._w(wall, 0.3, H, 4, -1, H/2, 14);
    this._w(wall, 0.3, H, 4, 1, H/2, 14);

    // Exit door
    this._exitDoor(1.6, 2.6, 0.15, 0, 1.3, 16);

    // ========== KEYS ==========
    this._key(0x44aaff, -6, 1.2, 9, "key1", "Bluer Schluessel");
    this._key(0xff8844, 6, 1.2, -2, "key2", "Oranger Schluessel");

    // ========== NOTE ==========
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 1, side: THREE.DoubleSide, emissive: 0x1a1510, emissiveIntensity: 0.1 })
    );
    note.position.set(-2.85, 1.5, -3); note.rotation.y = Math.PI / 2; note.receiveShadow = true;
    note.userData = { type: "note", prompt: "Notiz lesen",
      text: "Tipp:\n\n2 Schluessel versteckt!\nBLAU = linker Raum oben\nORANGE = rechter Raum unten\n\nDie magische Tuere ist im Norden!\n\nM = Sound aus"
    };
    this.scene.add(note);

    // Corridor props
    this._b(wood, 1.5, 0.45, 0.5, 0, 0.225, -2, true);
    this._b(metal, 0.3, 0.7, 0.3, 2, 0.35, 3, true);
    for (let i = 0; i < 8; i++) {
      const p = this._b(paper, 0.15, 0.01, 0.2, (Math.random()-.5)*4, 0.01, -3+Math.random()*10, false);
      p.rotation.y = Math.random() * Math.PI;
    }
    this._b(pipe, 0.06, 0.06, 15, -2.8, 2.9, 2, false);
    this._b(pipe, 0.06, 0.06, 15, 2.8, 2.9, 2, false);

    // ========== LIGHTING ==========

    // Ambient - bright and warm
    this.scene.add(new THREE.AmbientLight(0xffeedd, 1.2));
    this.scene.add(new THREE.HemisphereLight(0xaabbff, 0x554433, 0.8));

    // Warm sunlight from windows
    const sunLight = new THREE.DirectionalLight(0xffddaa, 1.5);
    sunLight.position.set(-5, 8, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 30;
    sunLight.shadow.camera.left = -15;
    sunLight.shadow.camera.right = 15;
    sunLight.shadow.camera.top = 15;
    sunLight.shadow.camera.bottom = -15;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    this.scene.add(sunLight);
    this.sunLight = sunLight;

    // Interior point lights - warm and colorful
    this._light(0, 2.7, 0, 0xffeecc, 5.0, 20, 0, true);
    this._light(0, 2.7, 10, 0xffeecc, 5.0, 20, 0.5, true);
    this._light(-6.5, 2.6, 0, 0xffddaa, 3.0, 14, 1, false);
    this._light(6.5, 2.6, 0, 0xccddaa, 2.5, 14, 1.5, false);
    this._light(-6.5, 2.6, 8.5, 0xddeedd, 3.0, 14, 2, false);
    this._light(6.5, 2.6, 8.5, 0xaaddff, 4.0, 16, 2.5, false);
    this._light(0, 2.7, 14, 0xaaffcc, 4.0, 14, 0.8, false);

    // Lamps
    this._lamp(0, 2.95, 0);
    this._lamp(0, 2.95, 10);

    // Volumetric light rays - fewer for performance
    this._volumetricRay(-2, 2.95, -4, 0.8, 4, 0xddeeff, 0.025);

    // Enhanced dust particles
    this._dust();
  }

  _w(mat, w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m); this.walls.push(m); return m;
  }

  _b(mat, w, h, d, x, y, z, block) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m); if (block) this.walls.push(m); return m;
  }

  _blood(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a0a0a, roughness: 0.95, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.CircleGeometry(0.08 + Math.random() * 0.15, 12), mat);
      s.rotation.x = -Math.PI/2; s.position.set(x + (Math.random()-.5)*.5, y, z + (Math.random()-.5)*.5);
      this.scene.add(s);
    }
  }

  _exitDoor(w, h, d, x, y, z) {
    const mat = createPBRMaterial("wood", { seed: 800, baseR: 74, baseG: 58, baseB: 42 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    door.position.set(x, y, z); door.castShadow = true;
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x8a8a7a, roughness: 0.3, metalness: 0.8 }));
    handle.position.set(w/2-.1, 0, d/2+.04); door.add(handle);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x00aa00, emissive: 0x00aa00, emissiveIntensity: 0.8 }));
    sign.position.set(0, h/2+.15, 0); door.add(sign);
    door.userData = { type: "exitDoor", locked: true, isOpen: false, blocksMovement: true,
      closedPosition: { x, y, z }, openPosition: { x: x-w/2, y, z: z-w/2 }, prompt: "Magische Tuere verschlossen" };
    this.exitDoor = door; this.scene.add(door); this.walls.push(door);
  }

  _key(color, x, y, z, id, name) {
    const key = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.9, emissive: color, emissiveIntensity: 1.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 12, 24), mat); ring.rotation.y = Math.PI/2; ring.position.x = -0.12; key.add(ring);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), mat); shaft.position.x = 0.1; key.add(shaft);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), mat); t1.position.set(0.28, -0.025, 0); key.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), mat); t2.position.set(0.36, 0.025, 0); key.add(t2);
    key.position.set(x, y, z); key.scale.setScalar(2); key.castShadow = true;
    const light = new THREE.PointLight(color, 3.0, 8); light.position.set(0, 0.3, 0); key.add(light);
    key.userData = { type: "key", id, name, prompt: name + " aufheben", collected: false, basePosition: { x, y, z } };
    this.scene.add(key); this.keys.push(key); if (!this.key) this.key = key;
  }

  _light(x, y, z, color, intensity, distance, seed, shadow) {
    const l = new THREE.PointLight(color, intensity, distance); l.position.set(x, y, z);
    if (shadow) { l.castShadow = true; l.shadow.mapSize.width = 512; l.shadow.mapSize.height = 512; l.shadow.bias = -0.001; }
    this.scene.add(l); this.lights.push({ light: l, baseIntensity: intensity, seed });
  }

  _lamp(x, y, z) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.6 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0xffeedd, emissive: 0xffddaa, emissiveIntensity: 0.6 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.25), mat);
    frame.position.set(x, y, z);
    this.scene.add(frame);
    const bulbMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.12), bulb);
    bulbMesh.position.set(x, y - 0.04, z);
    this.scene.add(bulbMesh);
  }

  _volumetricRay(x, y, z, radius, height, color, opacity) {
    const geo = new THREE.ConeGeometry(radius, height, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, y - height / 2, z);
    this.scene.add(cone);
    this.volumetricMeshes.push(cone);

    // Add a point light at the ray source for extra glow
    const glowLight = new THREE.PointLight(color, 0.5, 5);
    glowLight.position.set(x, y - 0.3, z);
    this.scene.add(glowLight);
    this.lights.push({ light: glowLight, baseIntensity: 0.5, seed: Math.random() * 100 });
  }

  _dust() {
    const n = 400;
    const mat = new THREE.PointsMaterial({
      color: 0xffeebb,
      size: 0.04,
      transparent: true,
      opacity: 0.4,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3] = (Math.random()-.5) * 18;
      pos[i*3+1] = Math.random() * 2.5 + 0.2;
      pos[i*3+2] = (Math.random()-.5) * 22;
      vel[i*3] = (Math.random() - 0.5) * 0.002;
      vel[i*3+1] = (Math.random() - 0.3) * 0.001;
      vel[i*3+2] = (Math.random() - 0.5) * 0.002;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dustParticles = new THREE.Points(geo, mat);
    this.dustVelocities = vel;
    this.scene.add(this.dustParticles);
  }

  collectKey(id) {
    const k = this.keys.find(k => k.userData.id === id && !k.userData.collected);
    if (!k) return false;
    k.userData.collected = true; k.visible = false;
    if (this.keys.every(k => k.userData.collected)) this.unlockExit();
    return true;
  }

  unlockExit() {
    if (!this.exitDoor) return;
    const d = this.exitDoor.userData;
    d.locked = false; d.prompt = "Magische Tuere oeffnen";
    if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0x17201a);
  }

  openExitDoor() {
    if (!this.exitDoor || this.exitDoor.userData.locked) return false;
    const d = this.exitDoor.userData;
    d.isOpen = true; d.blocksMovement = false;
    this.exitDoor.position.set(d.openPosition.x, d.openPosition.y, d.openPosition.z);
    this.exitDoor.rotation.y = Math.PI/2;
    d.prompt = "Magische Tuere offen";
    if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0x23301d);
    return true;
  }

  reset() {
    for (const k of this.keys) {
      k.visible = true; k.userData.collected = false;
      const b = k.userData.basePosition; k.position.set(b.x, b.y, b.z);
    }
    if (this.exitDoor) {
      const d = this.exitDoor.userData;
      d.locked = true; d.isOpen = false; d.blocksMovement = true;
      d.prompt = "Magische Tuere verschlossen";
      this.exitDoor.position.set(d.closedPosition.x, d.closedPosition.y, d.closedPosition.z);
      this.exitDoor.rotation.y = 0;
      if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0);
    }
  }

  update(delta, time) {
    // Animate keys
    for (const k of this.keys) {
      if (!k.userData.collected) {
        k.rotation.y = 0.7 + time * 1.8;
        k.position.y = k.userData.basePosition.y + Math.sin(time * 2.4 + k.userData.id.charCodeAt(0)) * 0.06;
      }
    }

    // Light flickering
    const t1 = time * 18, t2 = time * 9, t3 = time * 4.5, ts = time * 0.6, td = time * 3;
    for (let i = 0; i < this.lights.length; i++) {
      const e = this.lights[i], s = e.seed;
      const f = Math.sin(t1 + s * 11) * 0.12 + Math.cos(t2 + s * 7) * 0.06 + Math.sin(t3 + s * 13) * 0.04;
      const p = 0.88 + Math.sin(ts + s) * 0.08;
      const d = Math.sin(td + s * 5) > 0.95 ? -0.5 : 0;
      e.light.intensity = Math.max(0.05, f + p * e.baseIntensity + d);
    }

    // Volumetric ray opacity pulsing
    for (let i = 0; i < this.volumetricMeshes.length; i++) {
      const m = this.volumetricMeshes[i];
      m.material.opacity = 0.015 + Math.sin(time * 0.5 + i * 2) * 0.01 + Math.sin(time * 2.3 + i) * 0.005;
    }

    // Enhanced dust particle movement
    if (this.dustParticles) {
      const pos = this.dustParticles.geometry.attributes.position.array;
      const vel = this.dustVelocities;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] += vel[i] + Math.sin(time * 0.3 + i * 0.01) * 0.001;
        pos[i+1] += vel[i+1] + Math.sin(time * 0.2 + i * 0.005) * 0.0005;
        pos[i+2] += vel[i+2] + Math.cos(time * 0.25 + i * 0.007) * 0.001;
        if (pos[i+1] > 2.8) { pos[i+1] = 0.2; vel[i+1] = Math.random() * 0.001; }
        if (pos[i+1] < 0) { pos[i+1] = 2.6; vel[i+1] = -Math.random() * 0.001; }
        if (pos[i] > 9) pos[i] = -9;
        if (pos[i] < -9) pos[i] = 9;
        if (pos[i+2] > 16) pos[i+2] = -7;
        if (pos[i+2] < -7) pos[i+2] = 16;
      }
      this.dustParticles.geometry.attributes.position.needsUpdate = true;
    }
  }
}
