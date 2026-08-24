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
    // Realistic PBR Materials
    const wall = createPBRMaterial("wall", { repeat: [3, 1.5], seed: 42 });
    const metal = createPBRMaterial("metal", { seed: 100 });
    const wood = createPBRMaterial("wood", { repeat: [2, 2], seed: 200 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.95, side: THREE.DoubleSide });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x5a7a6a, roughness: 0.92 });
    const pipe = createPBRMaterial("metal", { seed: 300 });
    const floorMat = createPBRMaterial("concrete", { repeat: [6, 6], seed: 500, baseR: 80, baseG: 82, baseB: 85 });
    const ceilMat = createPBRMaterial("ceiling", { repeat: [4, 4], seed: 600 });
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

    // Western corridor wall (z=5 to z=12) with doorway into the file room (z=8.0 to z=9.4)
    this._glassWindow(wall, metal, 'z', 0.3, 3.0, H, -3, 6.5);
    this._w(wall, 0.3, H, 2.6, -3, H/2, 10.7);
    this._doorFrame(-3, 8.0, 9.4);

    // Eastern corridor wall with doorway into the OP room
    this._glassWindow(wall, metal, 'z', 0.3, 3.0, H, 3, 6.5);
    this._w(wall, 0.3, H, 2.6, 3, H/2, 10.7);
    this._doorFrame(3, 8.0, 9.4);

    // ========== ROOMS ==========

    // --- WAITING ROOM (left, bottom) ---
    this._w(wall, 0.3, H, 10, -10, H/2, 0);
    this._w(wall, 7, H, 0.3, -6.5, H/2, -5);
    // North wall shared with the file room above it (line ~84) - glazed there instead of built twice.
    this._b(wood, 2.5, 0.8, 1, -7, 0.4, -1, true);
    for (let i = 0; i < 3; i++) this._b(fabric, 0.5, 0.5, 0.5, -5.5, 0.25, 1 + i * 1.2, true);

    // --- STORAGE (right, bottom) ---
    this._w(wall, 0.3, H, 10, 10, H/2, 0);
    this._w(wall, 7, H, 0.3, 6.5, H/2, -5);
    // North wall shared with the OP room above it (line ~91) - glazed there instead of built twice.
    this._b(metal, 1.2, 1.8, 0.5, 8.5, 0.9, -1, true);
    this._b(metal, 1.2, 1.8, 0.5, 8.5, 0.9, 1, true);
    this._b(wood, 0.6, 0.6, 0.6, 5.5, 0.3, 2, true);

    // --- FILE ROOM (left, top) ---
    this._w(wall, 0.3, H, 7, -10, H/2, 8.5);
    // Shared wall with the waiting room below - windowed so its glow (and the blue key) is visible from the corridor.
    this._glassWindow(wall, wood, 'x', 0.3, 7, H, -6.5, 5);
    this._w(wall, 7, H, 0.3, -6.5, H/2, 12);
    for (let i = 0; i < 3; i++) this._b(wood, 0.5, 1.8, 0.4, -8.5 + i * 1.3, 0.9, 11, true);
    this._b(wood, 1.5, 0.8, 0.8, -6, 0.4, 8, true);

    // --- OP ROOM (right, top) ---
    this._w(wall, 0.3, H, 7, 10, H/2, 8.5);
    // Shared wall with the storage room below - windowed so its glow (and the orange key) is visible from the corridor.
    this._glassWindow(wall, metal, 'x', 0.3, 7, H, 6.5, 5);
    this._w(wall, 7, H, 0.3, 6.5, H/2, 12);
    this._b(metal, 2, 0.9, 0.8, 7, 0.45, 8.5, true);
    this._b(metal, 0.15, 1.5, 0.15, 5.5, 0.75, 7, true);

    // ========== EXIT CORRIDOR ==========
    this._w(wall, 0.3, H, 4, -1, H/2, 14);
    this._w(wall, 0.3, H, 4, 1, H/2, 14);

    // Exit door
    this._exitDoor(1.6, 2.6, 0.15, 0, 1.3, 16);

    // ========== KEYS ==========
    // Distinct silhouettes + glyphs on top of color so colorblind players can tell keys apart.
    this._key(0x44aaff, -6, 1.2, 9, "key1", "Bluer Schluessel", "I", "ring");
    this._key(0xff8844, 6, 1.2, -2, "key2", "Oranger Schluessel", "II", "cross");

    // ========== NOTE ==========
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 1, side: THREE.DoubleSide, emissive: 0x1a1510, emissiveIntensity: 0.1 })
    );
    note.position.set(0, 1.5, -6.83); note.rotation.y = 0; note.receiveShadow = true;
    this.notePosition = note.position;
    note.userData = { type: "note", prompt: "Notiz lesen",
      text: "Hinweis:\n\n2 Schluessel versteckt.\nBLAU = linker Raum oben (Aktenraum)\nORANGE = rechter Raum unten (Lager)\n\nAusgang = Norden (Gang hoch)\n\nWASD laufen, Maus/Pfeiltasten schauen\nShift rennen, C ducken, E benutzen\nM = Sound aus"
    };
    this.scene.add(note);

    // Second, optional note: staff duty log in the storage room, away from the orange key's pickup radius.
    const dutyLog = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 1, side: THREE.DoubleSide, emissive: 0x1a1510, emissiveIntensity: 0.1 })
    );
    dutyLog.position.set(8, 1.5, -4.83); dutyLog.rotation.y = 0; dutyLog.receiveShadow = true;
    dutyLog.userData = { type: "note", id: "note_dienstbuch", prompt: "Dienstbuch lesen",
      text: "Dienstbuch - Station 3\n\n03.11: Inventur abgeschlossen, Bestand OK.\n05.11: Ungewoehnliche Geraeusche aus Zimmer 4 gemeldet, niemand dort.\n06.11: Patient in Akte 12 seit zwei Tagen nicht gesehen.\n07.11: Habe das Licht im Lager noch einmal kontrolliert, es fl"
    };
    this.scene.add(dutyLog);

    // Corridor props
    this._b(wood, 1.5, 0.45, 0.5, -1.9, 0.225, -2, true);
    this._b(metal, 0.3, 0.7, 0.3, 2, 0.35, 3, true);
    for (let i = 0; i < 8; i++) {
      const p = this._b(paper, 0.15, 0.01, 0.2, (Math.random()-.5)*4, 0.01, -3+Math.random()*10, false);
      p.rotation.y = Math.random() * Math.PI;
    }
    this._b(pipe, 0.06, 0.06, 15, -2.8, 2.9, 2, false);
    this._b(pipe, 0.06, 0.06, 15, 2.8, 2.9, 2, false);

    // ========== LIGHTING ==========

    // Ambient - low for realism
    this.scene.add(new THREE.AmbientLight(0xb8c0d0, 0.3));
    this.scene.add(new THREE.HemisphereLight(0x8899bb, 0x222211, 0.4));

    // Moonlight / window light
    const sunLight = new THREE.DirectionalLight(0x8899cc, 1.2);
    sunLight.position.set(-5, 8, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
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

    // Interior point lights - realistic warm tones
    this._light(0, 2.7, 0, 0xffeedd, 4.0, 18, 0, true);
    this._light(0, 2.7, 10, 0xffeedd, 4.0, 18, 0.5, true);
    this._light(-6.5, 2.6, 0, 0xffddaa, 2.5, 12, 1, false);
    this._light(6.5, 2.6, 0, 0xddccaa, 2.0, 12, 1.5, false);
    this._light(-6.5, 2.6, 8.5, 0xeeddcc, 2.5, 12, 2, false);
    this._light(6.5, 2.6, 8.5, 0xbbddee, 3.0, 14, 2.5, false);
    this._light(0, 2.7, 14, 0xaaffcc, 3.0, 12, 0.8, false);

    // Lamps
    this._lamp(0, 2.95, 0);
    this._lamp(0, 2.95, 10);

    // Volumetric light rays
    this._volumetricRay(-2, 2.95, -4, 0.8, 4, 0xddeeff, 0.025);
    this._volumetricRay(2, 2.95, 6, 0.6, 3.5, 0xffeedd, 0.02);
    this._volumetricRay(0, 2.95, 10, 0.5, 3, 0xffeedd, 0.015);

    // Dust particles
    this._dust();
  }

  // Visual frame around a doorway in a wall running along Z at a given x
  _doorFrame(x, z0, z1) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.8, metalness: 0.1 });
    const h = 2.2;
    for (const z of [z0, z1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.36, h, 0.12), mat);
      post.position.set(x, h / 2, z);
      post.userData = { blocksMovement: false };
      this.scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, z1 - z0 + 0.12), mat);
    lintel.position.set(x, h, (z0 + z1) / 2);
    lintel.userData = { blocksMovement: false };
    this.scene.add(lintel);
  }

  // Cuts a rectangular window opening into a solid wall panel and fills it with non-colliding glass.
  // axis 'x' = wall runs along X (thickness along Z); axis 'z' = wall runs along Z (thickness along X).
  _glassWindow(wallMat, frameMat, axis, thickness, length, h, cx, cz, gw = 0.9, gh = 1.1, wcy = 1.5) {
    const bottomH = wcy - gh / 2;
    const topH = h - (wcy + gh / 2);
    const flankLen = (length - gw) / 2;
    const half = length / 2;
    const wOf = (len) => axis === 'x' ? len : thickness;
    const dOf = (len) => axis === 'x' ? thickness : len;

    this._w(wallMat, wOf(length), bottomH, dOf(length), cx, bottomH / 2, cz);
    this._w(wallMat, wOf(length), topH, dOf(length), cx, h - topH / 2, cz);
    if (axis === 'x') {
      this._w(wallMat, flankLen, gh, thickness, cx - half + flankLen / 2, wcy, cz);
      this._w(wallMat, flankLen, gh, thickness, cx + half - flankLen / 2, wcy, cz);
    } else {
      this._w(wallMat, thickness, gh, flankLen, cx, wcy, cz - half + flankLen / 2);
      this._w(wallMat, thickness, gh, flankLen, cx, wcy, cz + half - flankLen / 2);
    }

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x8899a0, transparent: true, opacity: 0.24, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide });
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(gw * 0.92, gh * 0.92), glassMat);
    glassPane.position.set(cx, wcy, cz);
    if (axis === 'z') glassPane.rotation.y = Math.PI / 2;
    glassPane.userData = { blocksMovement: false };
    this.scene.add(glassPane);

    const frameThick = 0.06;
    if (axis === 'x') {
      this._b(frameMat, gw + frameThick * 2, frameThick, thickness, cx, wcy + gh / 2, cz, false);
      this._b(frameMat, gw + frameThick * 2, frameThick, thickness, cx, wcy - gh / 2, cz, false);
      this._b(frameMat, frameThick, gh, thickness, cx - gw / 2, wcy, cz, false);
      this._b(frameMat, frameThick, gh, thickness, cx + gw / 2, wcy, cz, false);
    } else {
      this._b(frameMat, thickness, frameThick, gw + frameThick * 2, cx, wcy + gh / 2, cz, false);
      this._b(frameMat, thickness, frameThick, gw + frameThick * 2, cx, wcy - gh / 2, cz, false);
      this._b(frameMat, thickness, gh, frameThick, cx, wcy, cz - gw / 2, false);
      this._b(frameMat, thickness, gh, frameThick, cx, wcy, cz + gw / 2, false);
    }
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
      closedPosition: { x, y, z }, openPosition: { x: x-w/2, y, z: z-w/2 }, prompt: "Ausgang verschlossen" };
    this.exitDoor = door; this.scene.add(door); this.walls.push(door);
  }

  _key(color, x, y, z, id, name, glyph, shape) {
    const key = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.9, emissive: color, emissiveIntensity: 1.5 });
    if (shape === "cross") {
      // Plus-shaped bow (distinct silhouette from the round ring bow of the other key)
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.05), mat); bar1.position.x = -0.12; key.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.05), mat); bar2.position.x = -0.12; key.add(bar2);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 12, 24), mat); ring.rotation.y = Math.PI/2; ring.position.x = -0.12; key.add(ring);
      // Diamond accent inside the ring bow, unique to this key's silhouette
      const diamond = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 4), mat);
      diamond.rotation.x = Math.PI/2; diamond.rotation.z = Math.PI/4; diamond.position.x = -0.12; key.add(diamond);
    }
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.06), mat); shaft.position.x = 0.1; key.add(shaft);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), mat); t1.position.set(0.28, -0.025, 0); key.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.05), mat); t2.position.set(0.36, 0.025, 0); key.add(t2);
    key.position.set(x, y, z); key.scale.setScalar(2); key.castShadow = true;
    const light = new THREE.PointLight(color, 3.0, 8); light.position.set(0, 0.3, 0); key.add(light);
    const label = this._glyphSprite(glyph);
    label.position.set(0, 0.55, 0);
    key.add(label);
    key.userData = { type: "key", id, name, glyph, prompt: name + " aufheben", collected: false, basePosition: { x, y, z } };
    this.scene.add(key); this.keys.push(key); if (!this.key) this.key = key;
  }

  _glyphSprite(glyph) {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(10,8,14,0.55)";
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 68px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(glyph, 64, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(0.22, 0.22, 1);
    return sprite;
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
    const n = 600;
    const mat = new THREE.PointsMaterial({
      color: 0xccccbb,
      size: 0.025,
      transparent: true,
      opacity: 0.2,
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
    d.locked = false; d.prompt = "Ausgang oeffnen";
    if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0x17201a);
    if (!this.exitLight) {
      this.exitLight = new THREE.PointLight(0x66ffaa, 2.5, 7);
      this.exitLight.position.copy(this.exitDoor.position);
      this.exitLight.position.y += 0.4;
      this.scene.add(this.exitLight);
    }
  }

  openExitDoor() {
    if (!this.exitDoor || this.exitDoor.userData.locked) return false;
    const d = this.exitDoor.userData;
    d.isOpen = true; d.blocksMovement = false;
    this.exitDoor.position.set(d.openPosition.x, d.openPosition.y, d.openPosition.z);
    this.exitDoor.rotation.y = Math.PI/2;
    d.prompt = "Ausgang offen";
    if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0x23301d);
    return true;
  }

  // Brief door swing implying an unseen occupant - purely cosmetic, never touches
  // locked/isOpen/collision state, so it can't interfere with the exit logic.
  startDoorPresence() {
    if (!this.exitDoor || this.exitDoor.userData.isOpen || this._doorPresence) return false;
    this._doorPresence = {
      elapsed: 0,
      duration: 1.2 + Math.random() * 0.8,
      baseY: this.exitDoor.rotation.y,
      amplitude: (0.05 + Math.random() * 0.05) * (Math.random() < 0.5 ? -1 : 1),
    };
    return true;
  }

  // Briefly drops one of the interior point lights to near-zero and restores it.
  startLightDip(idx) {
    if (!this.lights.length || this._lightDip) return false;
    const i = idx != null ? idx : Math.floor(Math.random() * this.lights.length);
    if (!this.lights[i]) return false;
    this._lightDip = { idx: i, elapsed: 0, duration: 0.3 + Math.random() * 0.4 };
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
      d.prompt = "Ausgang verschlossen";
      this.exitDoor.position.set(d.closedPosition.x, d.closedPosition.y, d.closedPosition.z);
      this.exitDoor.rotation.y = 0;
      if (this.exitDoor.material.emissive) this.exitDoor.material.emissive.setHex(0);
    }
    if (this.exitLight) {
      this.scene.remove(this.exitLight);
      this.exitLight = null;
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

    // "Presence" light dip overrides the flicker above for its short duration.
    if (this._lightDip) {
      const ld = this._lightDip;
      ld.elapsed += delta;
      if (ld.elapsed < ld.duration) {
        this.lights[ld.idx].light.intensity = 0.03;
      } else {
        this._lightDip = null;
      }
    }

    // "Presence" door swing - eases out to a small angle and back to its settled rotation.
    if (this._doorPresence) {
      const dp = this._doorPresence;
      dp.elapsed += delta;
      const t = Math.min(1, dp.elapsed / dp.duration);
      this.exitDoor.rotation.y = dp.baseY + dp.amplitude * Math.sin(Math.PI * t);
      if (t >= 1) {
        this.exitDoor.rotation.y = dp.baseY;
        this._doorPresence = null;
      }
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
