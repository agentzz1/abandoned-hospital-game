import * as THREE from 'three';

// Occupancy and line-of-sight grids over the hospital floor, plus A* pathfinding.
export class NavGrid {
  constructor(level, { minX = -10, maxX = 10, minZ = -7, maxZ = 16, cell = 0.25, agentRadius = 0.35 } = {}) {
    this.level = level;
    this.minX = minX; this.minZ = minZ;
    this.cell = cell;
    this.agentRadius = agentRadius;
    this.cols = Math.ceil((maxX - minX) / cell);
    this.rows = Math.ceil((maxZ - minZ) / cell);
    this.walk = new Uint8Array(this.cols * this.rows);
    this.sight = new Uint8Array(this.cols * this.rows);
    this.build();
  }

  build() {
    const boxes = [];
    const box = new THREE.Box3();
    for (const w of this.level.walls) {
      if (w.userData?.blocksMovement === false || !w.geometry) continue;
      w.updateWorldMatrix(true, false);
      box.setFromObject(w);
      if (!box.isEmpty()) boxes.push(box.clone());
    }
    const r = this.agentRadius;
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = this.minX + (col + 0.5) * this.cell;
        const z = this.minZ + (row + 0.5) * this.cell;
        let walkBlocked = 0, sightBlocked = 0;
        for (const b of boxes) {
          // Things the Orderly would collide with: anything above ankle height.
          if (b.max.y > 0.35 && b.min.y < 1.9 &&
              x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) walkBlocked = 1;
          // Things that block a line of sight at eye height (window openings stay clear).
          if (b.min.y <= 1.5 && b.max.y >= 1.5 &&
              x > b.min.x - 0.05 && x < b.max.x + 0.05 && z > b.min.z - 0.05 && z < b.max.z + 0.05) sightBlocked = 1;
          if (walkBlocked && sightBlocked) break;
        }
        const i = row * this.cols + col;
        this.walk[i] = walkBlocked;
        this.sight[i] = sightBlocked;
      }
    }
  }

  _col(x) { return Math.floor((x - this.minX) / this.cell); }
  _row(z) { return Math.floor((z - this.minZ) / this.cell); }
  _inside(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  _cx(col) { return this.minX + (col + 0.5) * this.cell; }
  _cz(row) { return this.minZ + (row + 0.5) * this.cell; }

  isWalkable(x, z) {
    const col = this._col(x), row = this._row(z);
    return this._inside(col, row) && !this.walk[row * this.cols + col];
  }

  _sightClear(x, z) {
    const col = this._col(x), row = this._row(z);
    return this._inside(col, row) && !this.sight[row * this.cols + col];
  }

  hasLineOfSight(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const dist = Math.hypot(dx, dz);
    const steps = Math.ceil(dist / 0.1);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (!this._sightClear(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  canWalkStraight(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const steps = Math.ceil(Math.hypot(dx, dz) / 0.1);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable(x0 + dx * t, z0 + dz * t)) return false;
    }
    return true;
  }

  // Closest walkable cell centre to (x, z), searching outward ring by ring.
  nearestWalkable(x, z) {
    const c0 = Math.min(this.cols - 1, Math.max(0, this._col(x)));
    const r0 = Math.min(this.rows - 1, Math.max(0, this._row(z)));
    if (!this.walk[r0 * this.cols + c0]) return { x: this._cx(c0), z: this._cz(r0) };
    for (let ring = 1; ring < 24; ring++) {
      let best = null, bestD = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc, r = r0 + dr;
          if (!this._inside(c, r) || this.walk[r * this.cols + c]) continue;
          const d = (this._cx(c) - x) ** 2 + (this._cz(r) - z) ** 2;
          if (d < bestD) { bestD = d; best = { x: this._cx(c), z: this._cz(r) }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  findPath(sx, sz, tx, tz) {
    const start = this.nearestWalkable(sx, sz);
    const goal = this.nearestWalkable(tx, tz);
    if (!start || !goal) return null;
    const cols = this.cols;
    const sc = this._col(start.x), sr = this._row(start.z);
    const gc = this._col(goal.x), gr = this._row(goal.z);
    const startI = sr * cols + sc, goalI = gr * cols + gc;
    const n = this.walk.length;
    const g = new Float32Array(n).fill(Infinity);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    const h = (c, r) => {
      const dx = Math.abs(c - gc), dr = Math.abs(r - gr);
      return (dx + dr) + (Math.SQRT2 - 2) * Math.min(dx, dr);
    };
    g[startI] = 0;
    heap.push(startI, h(sc, sr));
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goalI) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const c = cur % cols, r = (cur - c) / cols;
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc, nr = r + dr;
        if (!this._inside(nc, nr)) continue;
        const ni = nr * cols + nc;
        if (this.walk[ni] || closed[ni]) continue;
        // No cutting corners past a blocked cell.
        if (dc && dr && (this.walk[r * cols + nc] || this.walk[nr * cols + c])) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(nc, nr));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goalI; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const pts = cells.map(i => { const c = i % cols; return { x: this._cx(c), z: this._cz((i - c) / cols) }; });
    return this._smooth(pts);
  }

  _smooth(pts) {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.canWalkStraight(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  randomWalkableNear(x, z, radius) {
    for (let tries = 0; tries < 30; tries++) {
      const a = Math.random() * Math.PI * 2, d = radius * (0.3 + Math.random() * 0.7);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isWalkable(px, pz) && this.canWalkStraight(x, z, px, pz)) return { x: px, z: pz };
    }
    return this.nearestWalkable(x, z);
  }
}

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    a.push(item); k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastA = a.pop(), lastK = k.pop();
    if (a.length) {
      a[0] = lastA; k[0] = lastK;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

// Points the Orderly walks between. Each is snapped to the nav grid at startup.
export const PATROL_POINTS = [
  { x: 0, z: -3, name: 'Eingangshalle' },
  { x: -6.5, z: 2.5, name: 'Wartezimmer' },
  { x: -7, z: -6, name: 'Suedflur West' },
  { x: 6.5, z: -3, name: 'Lager' },
  { x: 7, z: -6, name: 'Suedflur Ost' },
  { x: 0, z: 4, name: 'Mittelgang' },
  { x: -7.5, z: 9.6, name: 'Aktenraum' },
  { x: 7, z: 10.5, name: 'OP' },
  { x: 0, z: 9, name: 'Nordgang' },
  { x: 0, z: 14.2, name: 'Ausgang' },
];

export const SPEED = { patrol: 1.3, investigate: 2.0, search: 1.5, hunt: 4.1 };

const VISION_RANGE_LIT = 14;
const VISION_RANGE_DARK = 6.5;
const CROUCH_VISIBILITY = 0.65;
const VISION_COS = Math.cos(55 * Math.PI / 180);
const INSTANT_DETECT_DIST = 2.5;
const CATCH_DIST = 1.0;
const LOSE_TRACK_AFTER = 5;

export class Orderly {
  constructor(scene, nav) {
    this.scene = scene;
    this.nav = nav;
    this.points = PATROL_POINTS.map(p => ({ ...nav.nearestWalkable(p.x, p.z), name: p.name }));
    this.state = 'dormant';
    this.awareness = 0;
    this.lastKnown = null;
    this.lostSightTime = 0;
    this.searchLeft = 0;
    this.immuneTime = 0;
    this.catches = 0;
    this.repathTimer = 0;
    this.canSeePlayer = false;
    this.onCatch = null;
    this.onHuntStart = null;
    this.onInspectArrive = null;
    this.onStep = null;
    this.inspectTarget = null;
    this.position = new THREE.Vector3();
    this.heading = 0;
    this.path = null;
    this.pathIdx = 0;
    this.waitTimer = 0;
    this.targetPointIdx = -1;
    this.recentPoints = [];
    this.speed = SPEED.patrol;
    this.moving = false;
    this._animTime = 0;
    this._headTurn = 0;

    this.mesh = this._buildFigure();
    this.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.mesh);
    const start = this.points[7];
    this.teleport(start.x, start.z);
  }

  _buildFigure() {
    const root = new THREE.Group();
    const coat = new THREE.MeshStandardMaterial({ color: 0x9c978a, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9bfae, roughness: 0.8 });
    const stain = new THREE.MeshStandardMaterial({ color: 0x3a1210, roughness: 1 });
    const eyes = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 3 });

    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.95, 8), dark);
    const legR = legL.clone();
    legL.position.set(-0.11, 0.475, 0); legR.position.set(0.11, 0.475, 0);
    legL.geometry.translate(0, -0.475, 0); legL.position.y = 0.95; legR.position.y = 0.95;

    const torso = new THREE.Group();
    torso.position.y = 0.92;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.3, 1.0, 12), coat);
    body.position.y = 0.5;
    const blood = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.27, 0.35, 12, 1, true, 0.3, 1.4), stain);
    blood.position.y = 0.28;
    torso.add(body, blood);
    torso.rotation.x = 0.18;

    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.26), coat);
    shoulders.position.y = 0.98;
    torso.add(shoulders);

    const armGeo = new THREE.CylinderGeometry(0.045, 0.04, 1.05, 8);
    armGeo.translate(0, -0.525, 0);
    const armL = new THREE.Mesh(armGeo, coat);
    const armR = new THREE.Mesh(armGeo, coat);
    armL.position.set(-0.36, 0.98, 0.04); armR.position.set(0.36, 0.98, 0.04);
    armL.rotation.z = -0.1; armR.rotation.z = 0.1;
    const handGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const handL = new THREE.Mesh(handGeo, skin); handL.position.y = -1.08; armL.add(handL);
    const handR = new THREE.Mesh(handGeo, skin); handR.position.y = -1.08; armR.add(handR);
    torso.add(armL, armR);

    const head = new THREE.Group();
    head.position.set(0, 1.18, 0.06);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10), skin);
    skull.scale.set(0.95, 1.12, 1);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.06), new THREE.MeshStandardMaterial({ color: 0x6f8580, roughness: 1 }));
    mask.position.set(0, -0.06, 0.115);
    const eyeGeo = new THREE.SphereGeometry(0.018, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyes); eyeL.position.set(-0.045, 0.03, 0.125);
    const eyeR = new THREE.Mesh(eyeGeo, eyes); eyeR.position.set(0.045, 0.03, 0.125);
    head.add(skull, mask, eyeL, eyeR);
    torso.add(head);

    root.add(legL, legR, torso);
    // Model faces +Z; heading 0 means facing +Z.
    this._parts = { legL, legR, armL, armR, torso, head, eyes };
    return root;
  }

  teleport(x, z) {
    const p = this.nav.nearestWalkable(x, z) || { x, z };
    this.position.set(p.x, 0, p.z);
    this.mesh.position.copy(this.position);
    this.path = null;
  }

  // Forward direction on the floor plane.
  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  setDestination(x, z) {
    const path = this.nav.findPath(this.position.x, this.position.z, x, z);
    this.path = path;
    this.pathIdx = path && path.length > 1 ? 1 : 0;
    return !!path;
  }

  get atDestination() {
    return !this.path || this.pathIdx >= this.path.length;
  }

  // Next patrol point: often one near the player, so the threat keeps circling back.
  pickPatrolPoint(playerPos) {
    const candidates = this.points
      .map((p, i) => ({ p, i, d: Math.hypot(p.x - this.position.x, p.z - this.position.z) }))
      .filter(c => c.d > 2.5 && !this.recentPoints.includes(c.i));
    let pool = candidates;
    if (playerPos && Math.random() < 0.55) {
      const near = candidates.filter(c => Math.hypot(c.p.x - playerPos.x, c.p.z - playerPos.z) < 11);
      if (near.length) pool = near;
    }
    const choice = pool[Math.floor(Math.random() * pool.length)] || candidates[0];
    if (!choice) return null;
    this.recentPoints.push(choice.i);
    if (this.recentPoints.length > 3) this.recentPoints.shift();
    this.targetPointIdx = choice.i;
    return choice.p;
  }

  // Follows the current path; returns true while still walking.
  move(dt) {
    this.moving = false;
    if (this.atDestination) return false;
    const target = this.path[this.pathIdx];
    const dx = target.x - this.position.x, dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const step = this.speed * dt;
    if (dist <= step) {
      this.position.x = target.x; this.position.z = target.z;
      this.pathIdx++;
    } else {
      this.position.x += (dx / dist) * step;
      this.position.z += (dz / dist) * step;
    }
    if (dist > 0.01) this.turnToward(Math.atan2(dx, dz), dt, this.state === 'hunt' ? 10 : 5);
    this.moving = true;
    return true;
  }

  turnToward(targetHeading, dt, rate = 5) {
    let d = targetHeading - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.heading += d * Math.min(1, rate * dt);
  }

  updatePatrol(dt, playerPos) {
    if (this.waitTimer > 0) {
      this.waitTimer -= dt;
      this._headTurn = Math.sin(this._animTime * 1.3) * 0.7;
      return;
    }
    this._headTurn *= 0.9;
    if (!this.move(dt)) {
      if (this.path) {
        // Arrived: stand and look around before moving on.
        this.path = null;
        this.waitTimer = 1.5 + Math.random() * 2;
        return;
      }
      const next = this.pickPatrolPoint(playerPos);
      if (next) this.setDestination(next.x, next.z);
    }
  }

  animate(dt) {
    const { legL, legR, armL, armR, torso, head } = this._parts;
    const pace = this.moving ? this.speed : 0;
    this._animTime += dt * (this.moving ? 2.2 + pace * 1.3 : 1);
    const phase = Math.sin(this._animTime);
    if (this.moving && Math.sign(phase) !== Math.sign(this._lastPhase || 0)) this.onStep?.();
    this._lastPhase = phase;
    const swing = this.moving ? phase * Math.min(0.55, 0.22 + pace * 0.08) : 0;
    legL.rotation.x = swing; legR.rotation.x = -swing;
    // Arms hang forward and reach out further while hunting.
    const reach = this.state === 'hunt' ? 0.7 : 0.18;
    armL.rotation.x = -swing * 0.6 - reach; armR.rotation.x = swing * 0.6 - reach;
    // An uneven, dragging gait: one side dips more than the other.
    torso.position.y = 0.92 + (this.moving ? Math.abs(Math.sin(this._animTime)) * 0.04 - (Math.sin(this._animTime) > 0 ? 0.03 : 0) : 0);
    torso.rotation.x = this.state === 'hunt' ? 0.38 : 0.18;
    torso.rotation.z = this.moving ? Math.sin(this._animTime * 0.5) * 0.05 : 0;
    head.rotation.y = this._headTurn;
    head.rotation.z = Math.sin(this._animTime * 0.37) * 0.12 + 0.1;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  // Perception and state decisions, run at a fixed 10 Hz from the game loop.
  think(dt, ctx) {
    const dx = ctx.x - this.position.x, dz = ctx.z - this.position.z;
    const dist = Math.hypot(dx, dz);

    if (this.state === 'dormant') {
      if (ctx.wake || dist < 4) this.wake();
      return;
    }

    if (this.immuneTime > 0) {
      this.immuneTime -= dt;
      this.canSeePlayer = false;
      return;
    }

    const seen = this.canSee(ctx, dx, dz, dist);
    this.canSeePlayer = seen;
    const los = seen || (!ctx.hidden && this.nav.hasLineOfSight(this.position.x, this.position.z, ctx.x, ctx.z));
    const heard = !ctx.hidden && ctx.noiseRadius > 0 && dist < ctx.noiseRadius * (los ? 1 : 0.6);

    if (seen) {
      const range = this.visionRange(ctx);
      // Roughly 1.4s to full alert at 8 m with the light on, 2.7s at 12 m.
      this.awareness += dist < INSTANT_DETECT_DIST ? 1 : (1.2 * (1 - dist / range) + 0.2) * dt;
    } else {
      this.awareness -= (this.state === 'hunt' ? 0.08 : 0.25) * dt;
    }
    this.awareness = Math.max(0, Math.min(1, this.awareness));

    if (this.state === 'hunt') {
      if (seen || heard) {
        this.lastKnown = { x: ctx.x, z: ctx.z };
        if (seen) this.lostSightTime = 0;
      }
      if (!seen) this.lostSightTime += dt;
      if (dist < CATCH_DIST && !ctx.hidden) {
        this.onCatch?.();
        return;
      }
      if (this.lostSightTime > LOSE_TRACK_AFTER && this.atDestination) {
        this.enterSearch(this.lastKnown || { x: this.position.x, z: this.position.z });
        this.awareness = 0.5;
        return;
      }
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 && this.lastKnown) {
        this.repathTimer = 0.25;
        if (this.nav.canWalkStraight(this.position.x, this.position.z, this.lastKnown.x, this.lastKnown.z)) {
          this.path = [this.lastKnown];
          this.pathIdx = 0;
        } else {
          this.setDestination(this.lastKnown.x, this.lastKnown.z);
        }
      }
      return;
    }

    if (this.awareness >= 1) {
      this.enterHunt({ x: ctx.x, z: ctx.z });
      return;
    }
    if ((seen && this.awareness > 0.25) || heard) {
      const t = { x: ctx.x, z: ctx.z };
      const far = !this.lastKnown || Math.hypot(t.x - this.lastKnown.x, t.z - this.lastKnown.z) > 1.5;
      if (this.state !== 'investigate' || far) this.enterInvestigate(t);
    }
  }

  visionRange(ctx) {
    return (ctx.flashlightOn ? VISION_RANGE_LIT : VISION_RANGE_DARK) * (ctx.crouched ? CROUCH_VISIBILITY : 1);
  }

  canSee(ctx, dx, dz, dist) {
    if (ctx.hidden) return false;
    if (dist > this.visionRange(ctx)) return false;
    if (dist > 2) {
      const f = this.forward;
      if ((f.x * dx + f.z * dz) / dist < VISION_COS) return false;
    }
    return this.nav.hasLineOfSight(this.position.x, this.position.z, ctx.x, ctx.z);
  }

  // Saw the player slip into a locker: walk up, stand there, rattle it, then give up.
  inspectLocker(front, inside) {
    this.state = 'inspect';
    this.inspectTarget = { front, inside };
    this.inspectArrived = false;
    this.waitTimer = 0;
    this.awareness = 0.6;
    this.setDestination(front.x, front.z);
  }

  wake() {
    if (this.state !== 'dormant') return;
    this.state = 'patrol';
    this.waitTimer = 0.8;
  }

  enterHunt(target) {
    const wasHunting = this.state === 'hunt';
    this.state = 'hunt';
    this.awareness = 1;
    this.lastKnown = target;
    this.lostSightTime = 0;
    this.repathTimer = 0;
    this.waitTimer = 0;
    if (!wasHunting) this.onHuntStart?.();
  }

  enterInvestigate(target) {
    // Coming out of a calm patrol, he freezes for a beat as if listening.
    this.waitTimer = this.state === 'patrol' ? 0.6 : 0;
    this.state = 'investigate';
    this.lastKnown = target;
    this.setDestination(target.x, target.z);
  }

  enterSearch(around) {
    this.state = 'search';
    this.searchCenter = around;
    this.searchLeft = 2;
    this.waitTimer = 1.5;
    this.path = null;
  }

  // After a catch: reset to an unaware patrol at the point furthest from where the player respawns.
  resetAfterCatch(spawn) {
    let best = this.points[0], bestD = -1;
    for (const p of this.points) {
      if (p.name === 'Ausgang') continue;
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      if (d > bestD) { bestD = d; best = p; }
    }
    this.teleport(best.x, best.z);
    this.catches++;
    this.state = 'patrol';
    this.awareness = 0;
    this.lastKnown = null;
    this.waitTimer = 2;
    this.immuneTime = 4;
  }

  update(dt, playerPos) {
    const pity = Math.max(0.78, 1 - 0.08 * this.catches);
    switch (this.state) {
      case 'patrol':
        this.speed = SPEED.patrol;
        this.updatePatrol(dt, playerPos);
        break;
      case 'investigate':
        this.speed = SPEED.investigate;
        if (this.waitTimer > 0) { this.waitTimer -= dt; break; }
        if (!this.move(dt)) this.enterSearch(this.lastKnown || { x: this.position.x, z: this.position.z });
        break;
      case 'search':
        this.speed = SPEED.search;
        if (this.waitTimer > 0) {
          this.waitTimer -= dt;
          this._headTurn = Math.sin(this._animTime * 1.6) * 0.9;
          break;
        }
        if (!this.move(dt)) {
          if (this.path) { this.path = null; this.waitTimer = 1.2 + Math.random(); break; }
          if (this.searchLeft-- > 0) {
            const p = this.nav.randomWalkableNear(this.searchCenter.x, this.searchCenter.z, 3);
            if (p) this.setDestination(p.x, p.z);
          } else {
            this.state = 'patrol';
            this.lastKnown = null;
            this.waitTimer = 0.5;
          }
        }
        break;
      case 'inspect': {
        this.speed = SPEED.investigate;
        const t = this.inspectTarget;
        if (this.inspectArrived) {
          this.waitTimer -= dt;
          this.turnToward(Math.atan2(t.inside.x - this.position.x, t.inside.z - this.position.z), dt, 6);
          this._headTurn = Math.sin(this._animTime * 0.7) * 0.25;
          if (this.waitTimer <= 0) {
            this.state = 'patrol';
            this.awareness = 0.2;
            this.lastKnown = null;
            this.path = null;
            this.waitTimer = 0.4;
          }
        } else if (!this.move(dt)) {
          this.inspectArrived = true;
          this.waitTimer = 3.5;
          this.onInspectArrive?.();
        }
        break;
      }
      case 'hunt':
        this.speed = SPEED.hunt * pity;
        this._headTurn *= 0.8;
        this.move(dt);
        if (playerPos && this.canSeePlayer) {
          this.turnToward(Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z), dt, 8);
        }
        break;
      default:
        this.moving = false;
    }
    this.animate(dt);
  }
}
