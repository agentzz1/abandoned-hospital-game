import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldBoxUV, scalePlaneUV } from './Materials.js';

const H = 3;
const WAINSCOT_H = 0.9;

export class Level {
  constructor(scene, materials) {
    this.scene = scene;
    this.mats = materials;
    // Real-world size (metres) one texture repeat covers, per material.
    this._tiles = new Map([
      [materials.wall, 2.4], [materials.wood, 1.2], [materials.metal, 1.0], [materials.locker, 1.0],
    ]);
    this._wallSpans = [];
    this.walls = [];
    this.lights = [];
    this.key = null;
    this.keys = [];
    this.exitDoor = null;
    this.volumetricMeshes = [];
    this._build();
  }

  _build() {
    const { wall, metal, wood, locker } = this.mats;
    const paper = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.95, side: THREE.DoubleSide });
    const fabric = new THREE.MeshStandardMaterial({ color: 0x46564e, roughness: 0.95 });

    // Floor: 0.5 m tiles (the texture holds 4x4 tiles per 2 m)
    const floor = new THREE.Mesh(scalePlaneUV(new THREE.PlaneGeometry(40, 40), 40, 40, 2), this.mats.floor);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);

    // Ceiling
    const ceil = new THREE.Mesh(scalePlaneUV(new THREE.PlaneGeometry(40, 40), 40, 40, 3), this.mats.ceiling);
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
    this._w(wall, 7, H, 0.3, -6.5, H/2, -5);
    // North wall shared with the file room above it (line ~84) - glazed there instead of built twice.
    this._b(wood, 2.5, 0.8, 1, -7, 0.4, -1, true);
    for (let i = 0; i < 3; i++) this._b(fabric, 0.5, 0.5, 0.5, -5.5, 0.25, 1 + i * 1.2, true);

    // --- STORAGE (right, bottom) ---
    this._w(wall, 7, H, 0.3, 6.5, H/2, -5);
    // North wall shared with the OP room above it (line ~91) - glazed there instead of built twice.
    this._b(locker, 1.2, 1.8, 0.5, 8.5, 0.9, -1, true);
    this._b(locker, 1.2, 1.8, 0.5, 8.5, 0.9, 1, true);
    this._b(wood, 0.6, 0.6, 0.6, 5.5, 0.3, 2, true);

    // --- FILE ROOM (left, top) ---
    // Shared wall with the waiting room below - windowed so its glow (and the blue key) is visible from the corridor.
    this._glassWindow(wall, wood, 'x', 0.3, 7, H, -6.5, 5);
    this._w(wall, 7, H, 0.3, -6.5, H/2, 12);
    // Painted steel filing cabinets
    for (let i = 0; i < 3; i++) this._b(locker, 0.5, 1.8, 0.4, -8.5 + i * 1.3, 0.9, 11, true);
    this._b(wood, 1.5, 0.8, 0.8, -6, 0.4, 8, true);

    // --- OP ROOM (right, top) ---
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

    // ========== LOCKERS ==========
    // Hiding spots, each against a wall with its door facing into the room.
    this.lockers = [];
    this._locker(-9.575, 3.2, Math.PI / 2);   // waiting room, west wall
    this._locker(9.575, 3.5, -Math.PI / 2);   // storage, east wall
    this._locker(-9.575, 6.9, Math.PI / 2);   // file room, west wall
    this._locker(9.575, 6.6, -Math.PI / 2);   // OP room, east wall
    this._locker(-4.6, -6.575, 0);            // south hall, south wall

    // ========== BATTERIES ==========
    // Each one is a detour off the key routes: waiting-room bench, OP table, far corner of the south hall.
    this.batteries = [];
    this._battery(-7, 0.86, -1);
    this._battery(7, 0.96, 8.5);
    this._battery(8.6, 0.06, -6.3);

    // ========== NOTE ==========
    const note = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xe8e4d5, roughness: 1, side: THREE.DoubleSide, emissive: 0x1a1510, emissiveIntensity: 0.1 })
    );
    note.position.set(0, 1.5, -6.83); note.rotation.y = 0; note.receiveShadow = true;
    this.notePosition = note.position;
    note.userData = { type: "note", prompt: "Notiz lesen",
      text: "Wer das findet:\n\nDer Waerter macht noch immer seine Runden.\nEr hoert dich, wenn du rennst.\nEr sieht dein Licht von weitem. Mach es aus, wenn er nah ist.\nSieht er dich: lauf, brich den Blickkontakt, versteck dich in einem Spind.\n\nBLAU = Aktenraum (oben links)\nORANGE = Lager (unten rechts)\nAusgang = Norden, den Gang hoch\n\nF Lampe   C ducken   E Spind"
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
    this._b(metal, 0.06, 0.06, 15, -2.8, 2.9, 2, false);
    this._b(metal, 0.06, 0.06, 15, 2.8, 2.9, 2, false);

    // ========== LIGHTING ==========

    // Ambient - low for realism
    this.scene.add(new THREE.AmbientLight(0xb8c0d0, 0.3));
    this.scene.add(new THREE.HemisphereLight(0x8899bb, 0x222211, 0.4));

    // Moonlight / window light
    const sunLight = new THREE.DirectionalLight(0x8899cc, 1.2);
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

    // Interior point lights - realistic warm tones
    this._light(0, 2.7, 0, 0xffeedd, 4.0, 18, 0);
    this._light(0, 2.7, 10, 0xffeedd, 4.0, 18, 0.5);
    this._light(-6.5, 2.6, 0, 0xffddaa, 2.5, 12, 1);
    this._light(6.5, 2.6, 0, 0xddccaa, 2.0, 12, 1.5);
    this._light(-6.5, 2.6, 8.5, 0xeeddcc, 2.5, 12, 2);
    this._light(6.5, 2.6, 8.5, 0xbbddee, 3.0, 14, 2.5);
    this._light(0, 2.7, 14, 0xaaffcc, 3.0, 12, 0.8);


    // Volumetric light rays
    this._volumetricRay(-2, 2.95, -4, 0.8, 4, 0xddeeff, 0.025);
    this._volumetricRay(2, 2.95, 6, 0.6, 3.5, 0xffeedd, 0.02);
    this._volumetricRay(0, 2.95, 10, 0.5, 3, 0xffeedd, 0.015);

    // Dust particles
    this._dust();

    this._wallDetails();
    this._ceilingGrid();
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
    this._wallSpans.push({ w: wOf(length), d: dOf(length), x: cx, z: cz });

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

  _box(mat, w, h, d, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const tile = this._tiles.get(mat);
    if (tile) worldBoxUV(geo, w, h, d, x, y, z, tile);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  _w(mat, w, h, d, x, y, z) {
    const m = this._box(mat, w, h, d, x, y, z);
    if (h >= H - 0.01) this._wallSpans.push({ w, d, x, z });
    this.walls.push(m); return m;
  }

  _b(mat, w, h, d, x, y, z, block) {
    const m = this._box(mat, w, h, d, x, y, z);
    if (block) this.walls.push(m); return m;
  }

  // Lower-wall paint, bumper rail and skirting on every full-height wall, plus a soft dark band where
  // walls meet the floor. Each layer is merged into one mesh so the detail costs a few draw calls.
  _wallDetails() {
    const paint = [], rail = [], skirt = [], grime = [];
    for (const { w, d, x, z } of this._wallSpans) {
      const add = (list, ex, h, y, tile) => {
        const g = new THREE.BoxGeometry(w + ex, h, d + ex);
        if (tile) worldBoxUV(g, w + ex, h, d + ex, x, y, z, tile);
        g.translate(x, y, z);
        list.push(g);
      };
      add(paint, 0.02, WAINSCOT_H, WAINSCOT_H / 2, 3.2);
      add(rail, 0.06, 0.07, WAINSCOT_H + 0.02);
      add(skirt, 0.04, 0.1, 0.05);
      const alongX = w >= d;
      const len = alongX ? w : d;
      for (const side of [-1, 1]) grime.push(this._grimeStrip(x, z, alongX, len, (alongX ? d : w) / 2 + 0.02, side));
    }
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3b3f3a, roughness: 0.55, metalness: 0.3 });
    const skirtMat = new THREE.MeshStandardMaterial({ color: 0x1d1f1e, roughness: 0.8 });
    const grad = document.createElement('canvas');
    grad.width = 64; grad.height = 1;
    const gctx = grad.getContext('2d');
    const gr = gctx.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#777'); gr.addColorStop(1, '#000');
    gctx.fillStyle = gr; gctx.fillRect(0, 0, 64, 1);
    const grimeMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.6, alphaMap: new THREE.CanvasTexture(grad),
      depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const layers = [[paint, this.mats.wainscot, true], [rail, railMat, true], [skirt, skirtMat, false], [grime, grimeMat, false]];
    for (const [list, mat, cast] of layers) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.receiveShadow = mat !== grimeMat; m.castShadow = cast;
      this.scene.add(m);
    }
  }

  // A floor quad from a wall face outwards, u = 0 at the wall (dark) to 1 (clear).
  _grimeStrip(x, z, alongX, len, offset, side) {
    const depth = 0.45, y = 0.004;
    const a = offset * side, b = (offset + depth) * side;
    const p = alongX
      ? [x - len / 2, y, z + a, x + len / 2, y, z + a, x - len / 2, y, z + b, x + len / 2, y, z + b]
      : [x + a, y, z - len / 2, x + a, y, z + len / 2, x + b, y, z - len / 2, x + b, y, z + len / 2];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 1], 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    return g;
  }

  // Suspended ceiling: a 0.6 m T-bar grid with a few missing tiles and one hanging loose.
  _ceilingGrid() {
    const bars = [];
    const y = H - 0.015;
    for (let x = -10; x <= 10.001; x += 0.6) {
      const g = new THREE.BoxGeometry(0.025, 0.02, 23); g.translate(x, y, 4.5); bars.push(g);
    }
    for (let z = -7; z <= 16.001; z += 0.6) {
      const g = new THREE.BoxGeometry(20, 0.02, 0.025); g.translate(0, y, z); bars.push(g);
    }
    const grid = new THREE.Mesh(mergeGeometries(bars), new THREE.MeshStandardMaterial({ color: 0x8e8c84, roughness: 0.7, metalness: 0.1 }));
    this.scene.add(grid);

    const holes = [];
    for (const [cx, cz] of [[-6.1, 1.7], [-7.3, 2.3], [5.9, -3.1], [0.5, 6.5], [-0.1, 11.3], [7.7, 10.7], [-8.5, -6.1]]) {
      const g = new THREE.PlaneGeometry(0.58, 0.58); g.rotateX(Math.PI / 2); g.translate(cx, H - 0.006, cz); holes.push(g);
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(holes), new THREE.MeshBasicMaterial({ color: 0x020203, side: THREE.DoubleSide })));
    const loose = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.015, 0.58), this.mats.ceiling);
    loose.position.set(-6.1 + 0.18, H - 0.32, 1.7);
    loose.rotation.z = 0.9; loose.rotation.x = 0.15;
    loose.castShadow = true;
    this.scene.add(loose);
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
    const mat = this.mats.wood.clone();
    mat.color.setHex(0x8a7868);
    const door = new THREE.Mesh(worldBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 0, 0, 0, 1.2), mat);
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

  // facing: rotation.y so that the door (local +Z) points into the room.
  _locker(x, z, facing) {
    const g = new THREE.Group();
    const steel = this.mats.locker;
    const slit = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 });
    const body = new THREE.Mesh(worldBoxUV(new THREE.BoxGeometry(0.8, 2.0, 0.55), 0.8, 2.0, 0.55, x, 1, z, 1.0), steel);
    body.position.y = 1.0;
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.01), slit);
      v.position.set(0, 1.42 + i * 0.06, 0.281);
      g.add(v);
    }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.9, 0.01), slit);
    seam.position.set(0.39, 1.0, 0.281);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.04), new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.3, metalness: 0.9 }));
    handle.position.set(0.3, 1.05, 0.3);
    g.add(seam, handle);
    g.position.set(x, 0, z);
    g.rotation.y = facing;
    const out = { x: Math.sin(facing), z: Math.cos(facing) };
    g.userData = {
      type: "locker",
      prompt: "Im Spind verstecken",
      inside: { x: x + out.x * 0.02, z: z + out.z * 0.02 },
      front: { x: x + out.x * 0.85, z: z + out.z * 0.85 },
      facing,
    };
    this.scene.add(g);
    this.walls.push(body);
    this.lockers.push(g);
  }

  _battery(x, y, z) {
    const g = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({ color: 0x23272d, roughness: 0.45, metalness: 0.7 });
    const band = new THREE.MeshStandardMaterial({ color: 0xffc23a, emissive: 0xffb020, emissiveIntensity: 1.1, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 14), shell);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.08, 14), band);
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10), shell);
    nub.position.y = 0.112;
    g.add(body, label, nub);
    g.rotation.z = Math.PI / 2;
    g.rotation.y = 0.6;
    g.position.set(x, y, z);
    g.userData = { type: "battery", prompt: "Batterie aufheben", collected: false };
    this.scene.add(g);
    this.batteries.push(g);
  }

  collectBattery(battery) {
    if (!battery || battery.userData.collected) return false;
    battery.userData.collected = true;
    battery.visible = false;
    return true;
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

  _light(x, y, z, color, intensity, distance, seed) {
    // Point-light shadows render the scene six times each per frame; the moonlight carries the shadows.
    const l = new THREE.PointLight(color, intensity, distance); l.position.set(x, y, z);
    this.scene.add(l);
    const tube = this._lamp(x, H - 0.03, z);
    this.lights.push({ light: l, baseIntensity: intensity, seed, tube });
  }

  // Fluorescent fitting under the ceiling; returns the tube material so it can flicker with its light.
  _lamp(x, y, z) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.5, metalness: 0.5 }));
    housing.position.set(x, y, z);
    this.scene.add(housing);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: 0xfff2dc, emissiveIntensity: 1.6 });
    for (const dz of [-0.07, 0.07]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8), tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(x, y - 0.05, z + dz);
      this.scene.add(tube);
    }
    return tubeMat;
  }

  // A soft shaft of light: brightest at the source and in the middle of the beam, fading out at its
  // silhouette edges and towards the floor, so it reads as lit dust rather than a solid cone.
  _volumetricRay(x, y, z, radius, height, color, opacity) {
    const geo = new THREE.ConeGeometry(radius, height, 24, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity * 3.5 } },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vView; varying float vH;
        void main() {
          vH = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity;
        varying vec3 vNormal; varying vec3 vView; varying float vH;
        void main() {
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float a = uOpacity * pow(facing, 2.0) * smoothstep(0.0, 0.7, vH) * vH;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cone = new THREE.Mesh(geo, mat);
    cone.position.set(x, y - height / 2, z);
    cone.userData.baseOpacity = opacity * 3.5;
    this.scene.add(cone);
    this.volumetricMeshes.push(cone);
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
    this.shadowsDirty = true;
    this.navDirty = true;
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
      this.shadowsDirty = true;
      this.navDirty = true;
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
      if (e.tube) e.tube.emissiveIntensity = 1.6 * (e.light.intensity / e.baseIntensity);
    }

    // "Presence" light dip overrides the flicker above for its short duration.
    if (this._lightDip) {
      const ld = this._lightDip;
      ld.elapsed += delta;
      if (ld.elapsed < ld.duration) {
        this.lights[ld.idx].light.intensity = 0.03;
        if (this.lights[ld.idx].tube) this.lights[ld.idx].tube.emissiveIntensity = 0.05;
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
      m.material.uniforms.uOpacity.value = m.userData.baseOpacity * (0.8 + Math.sin(time * 0.5 + i * 2) * 0.15 + Math.sin(time * 2.3 + i) * 0.05);
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
