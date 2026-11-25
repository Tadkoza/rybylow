import * as THREE from "three";
import { World } from "./world";
import { clamp, mulberry32 } from "./noise";
import { beam, boxGeo, mergeParts, paint } from "./geoutil";

const WOOD = "#b58f5c";
const SAMPLES: [number, number][] = [
  [2.1, 0],
  [1.2, 0.55],
  [1.2, -0.55],
  [0, 0.72],
  [0, -0.72],
  [-1.2, 0.52],
  [-1.2, -0.52],
  [-1.95, 0],
];

function outline(s: number, sh: THREE.Shape | THREE.Path) {
  sh.moveTo(2.15 * s, 0);
  sh.bezierCurveTo(1.7 * s, 0.5 * s, 1.0 * s, 0.7 * s, -0.4 * s, 0.7 * s);
  sh.lineTo(-1.85 * s, 0.55 * s);
  sh.lineTo(-1.95 * s, 0.0);
  sh.lineTo(-1.85 * s, -0.55 * s);
  sh.lineTo(-0.4 * s, -0.7 * s);
  sh.bezierCurveTo(1.0 * s, -0.7 * s, 1.7 * s, -0.5 * s, 2.15 * s, 0);
}

function hullGeometry(hullHex: string): THREE.BufferGeometry {
  const hull = new THREE.Shape();
  outline(1, hull);
  const hole = new THREE.Path();
  outline(0.9, hole);
  hull.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(hull, { depth: 0.5, bevelEnabled: false, curveSegments: 14 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 0.58 + 0.42 * (y / 0.5);
    p.setXYZ(i, p.getX(i) * (0.84 + 0.16 * (y / 0.5)), y, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const hc = new THREE.Color(hullHex);
  const wood = new THREE.Color(WOOD), inner = new THREE.Color("#a07f52"), seam = new THREE.Color();
  const cols = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = n.getY(i);
    if (ny > 0.7) c.copy(wood);
    else if (ny < -0.7) c.copy(hc).multiplyScalar(0.6);
    else {
      const rad = n.getX(i) * x + n.getZ(i) * z;
      if (rad < 0) c.copy(inner).multiplyScalar(0.85 + 0.15 * (y / 0.5));
      else {
        c.copy(hc);
        const f = (y / 0.5) * 4;
        if (f - Math.floor(f) < 0.09) c.multiplyScalar(0.62);
        seam.copy(c);
        c.copy(seam).multiplyScalar(0.92 + 0.08 * Math.sin(x * 5));
      }
    }
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));

  const floorShape = new THREE.Shape();
  outline(0.88, floorShape);
  const fg = new THREE.ShapeGeometry(floorShape);
  fg.rotateX(Math.PI / 2);
  fg.translate(0, 0.14, 0);
  const fp = fg.attributes.position;
  const fcols = new Float32Array(fp.count * 3);
  const fc = new THREE.Color();
  for (let i = 0; i < fp.count; i++) {
    fc.set("#8a6a44").multiplyScalar(0.85 + 0.2 * (Math.floor(fp.getX(i) * 6) % 2));
    fcols[i * 3] = fc.r;
    fcols[i * 3 + 1] = fc.g;
    fcols[i * 3 + 2] = fc.b;
  }
  fg.setAttribute("color", new THREE.BufferAttribute(fcols, 3));

  const parts: THREE.BufferGeometry[] = [
    g,
    fg,
    boxGeo(0.32, 0.045, 1.22, 0.75, 0.33, 0, WOOD),
    boxGeo(0.32, 0.045, 1.24, -0.2, 0.33, 0, WOOD),
    boxGeo(0.32, 0.045, 1.12, -1.05, 0.33, 0, WOOD),
    boxGeo(0.06, 0.18, 0.5, 1.7, 0.4, 0, "#8a6a44"),
    boxGeo(0.07, 0.07, 0.07, 2.05, 0.52, 0, "#9aa0a4"),
    boxGeo(0.045, 0.16, 0.045, 0.1, 0.58, 0.66, "#8d9399"),
    boxGeo(0.045, 0.16, 0.045, 0.1, 0.58, -0.66, "#8d9399"),
  ];
  return mergeParts(parts)!;
}

function oarGeometry(blade: string): THREE.BufferGeometry {
  return mergeParts([
    beam(2.6, 0.05, 0.05, 0, 0, 0.6, 0, 0, 1, "#cfae75"),
    boxGeo(0.15, 0.016, 0.56, 0, 0, 1.64, blade),
    boxGeo(0.045, 0.045, 0.22, 0, 0, -0.64, "#8a6a44"),
  ])!;
}

export class Boat {
  group = new THREE.Group();
  x: number;
  z: number;
  yaw: number;
  speed = 0;
  yawRate = 0;
  hasRider = false;
  readonly baseY = -0.05;
  bobY = 0;
  onStroke: (() => void) | null = null;
  private seed = Math.random() * 10;
  private phase = 0;
  private amp = 0;
  private effort = 0;
  private pivL = new THREE.Group();
  private pivR = new THREE.Group();
  private lastSin = 0;

  constructor(private world: World, x: number, z: number, yaw: number, color: string, shadows: boolean, hull: THREE.BufferGeometry, oar: THREE.BufferGeometry, mats: { hull: THREE.Material; oar: THREE.Material }) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    void color;
    const m = new THREE.Mesh(hull, mats.hull);
    m.castShadow = shadows;
    m.receiveShadow = true;
    this.group.add(m);
    this.pivR.position.set(0.1, 0.58, 0.66);
    this.pivL.position.set(0.1, 0.58, -0.66);
    const oR = new THREE.Mesh(oar, mats.oar);
    const oL = new THREE.Mesh(oar, mats.oar);
    oL.rotation.y = Math.PI;
    oR.castShadow = oL.castShadow = shadows;
    this.pivR.add(oR);
    this.pivL.add(oL);
    this.group.add(this.pivR, this.pivL);
    this.group.rotation.order = "YXZ";
    this.update(0, 0);
  }

  /** miejsce siedzenia w świecie */
  seat(): { x: number; z: number; y: number } {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: this.x - 0.2 * c, z: this.z + 0.2 * s, y: this.baseY + this.bobY + 0.95 };
  }

  private canBe(x: number, z: number, yaw: number): boolean {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const w = this.world;
    for (const [lx, lz] of SAMPLES) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (w.heightAt(px, pz) > -0.42) return false;
      if (w.pierDeckAt(px, pz) > -1e8) return false;
    }
    return true;
  }

  /** sterowanie wiosłami: f – przód/tył, r – prawo/lewo */
  drive(f: number, r: number, run: boolean, dt: number) {
    const accel = run ? 2.4 : 1.4;
    this.speed += (f > 0 ? f * accel : f * accel * 0.6) * dt;
    this.effort = Math.max(Math.abs(f), Math.abs(r) * 0.7);
    const turn = -r * 0.9 * clamp(0.4 + Math.abs(this.speed) / 1.6, 0.4, 1);
    this.yawRate += (turn - this.yawRate) * (1 - Math.exp(-3 * dt));
    this.step(dt);
  }

  private step(dt: number) {
    this.speed -= this.speed * 0.62 * dt + Math.sign(this.speed) * 0.02 * dt;
    if (Math.abs(this.speed) < 0.01) this.speed = 0;
    const nyaw = this.yaw + this.yawRate * dt;
    if (this.canBe(this.x, this.z, nyaw)) this.yaw = nyaw;
    else this.yawRate = 0;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const nx = this.x + c * this.speed * dt, nz = this.z - s * this.speed * dt;
    if (this.canBe(nx, nz, this.yaw)) {
      this.x = nx;
      this.z = nz;
    } else if (Math.abs(this.speed) > 0.05) {
      this.speed = -this.speed * 0.25;
    }
  }

  update(t: number, dt: number) {
    if (!this.hasRider) {
      this.effort = 0;
      if (dt > 0 && (Math.abs(this.speed) > 0.02 || Math.abs(this.yawRate) > 0.01)) {
        this.speed *= Math.exp(-1.0 * dt);
        this.yawRate *= Math.exp(-2.0 * dt);
        this.step(dt);
      }
    }
    this.bobY = Math.sin(t * 1.3 + this.seed) * 0.025 + Math.sin(t * 0.7 + this.seed * 2) * 0.015;
    const roll = Math.sin(t * 0.9 + this.seed) * 0.03 - this.yawRate * Math.abs(this.speed) * 0.05;
    const pitch = Math.sin(t * 1.1 + this.seed * 1.4) * 0.02 + this.speed * 0.012;
    this.group.position.set(this.x, this.baseY + this.bobY, this.z);
    this.group.rotation.set(roll, this.yaw, pitch, "YXZ");

    // wiosła
    this.amp += (this.effort - this.amp) * Math.min(1, dt * 4);
    if (this.amp > 0.03) this.phase += dt * (1.5 + Math.abs(this.speed) * 0.9);
    const sn = Math.sin(this.phase);
    if (this.amp > 0.3 && this.lastSin < 0 && sn >= 0) this.onStroke?.();
    this.lastSin = sn;
    const swing = 0.28 + (0.5 * Math.cos(this.phase) - 0.28) * this.amp;
    const dip = -0.1 + (0.1 + 0.16 * sn + 0.1) * this.amp;
    this.pivR.rotation.set(dip, swing, 0, "YXZ");
    this.pivL.rotation.set(-dip, -swing, 0, "YXZ");
  }
}

export class BoatSystem {
  group = new THREE.Group();
  boats: Boat[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(private world: World, shadows: boolean) {
    const colors = ["#f1efe6", "#2f6f93", "#3f7a52", "#b8322a", "#e8d9a8", "#f1efe6", "#2f6f93"];
    const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
    const oarMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
    this.disposables.push(hullMat, oarMat);
    const rnd = mulberry32(8);
    const sp = world.spawn;
    const piers = [...world.piers]
      .filter((p) => !p.poly && p.pts.length >= 4)
      .sort((a, b) => {
        const da = Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - sp.x, (a.bbox[1] + a.bbox[3]) / 2 - sp.z);
        const db = Math.hypot((b.bbox[0] + b.bbox[2]) / 2 - sp.x, (b.bbox[1] + b.bbox[3]) / 2 - sp.z);
        return da - db;
      });
    let pi = 0;
    for (const pier of piers) {
      if (this.boats.length >= 12) break;
      const n = pier.pts.length;
      const ax = pier.pts[0], az = pier.pts[1], bx = pier.pts[n - 2], bz = pier.pts[n - 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 7) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (const side of [1, -1]) {
        if (pi >= 2 ? rnd() < 0.45 : false) continue;
        let placed = false;
        for (const t of [0.88, 0.74, 0.6, 0.46]) {
          const off = pier.w / 2 + 1.15;
          const x = ax + dx * len * t - dz * side * off, z = az + dz * len * t + dx * side * off;
          const yaw = Math.atan2(-dz, dx) + (rnd() - 0.5) * 0.08;
          if (world.heightAt(x, z) > -0.65 || world.pierDeckAt(x, z) > -1e8) continue;
          const col = colors[Math.floor(rnd() * colors.length)];
          const hull = hullGeometry(col);
          const oar = oarGeometry(rnd() < 0.5 ? "#f1efe6" : col);
          this.disposables.push(hull, oar);
          const b = new Boat(world, x, z, yaw, col, shadows, hull, oar, { hull: hullMat, oar: oarMat });
          this.boats.push(b);
          this.group.add(b.group);
          placed = true;
          break;
        }
        void placed;
      }
      pi++;
    }
  }

  update(t: number, dt: number) {
    for (const b of this.boats) b.update(t, dt);
  }

  nearest(x: number, z: number, maxD: number): Boat | null {
    let best: Boat | null = null, bd = maxD;
    for (const b of this.boats) {
      if (b.hasRider) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** miejsce wysiadania: płytka woda / brzeg / pomost w pobliżu łódki */
  findLanding(b: Boat): { x: number; z: number } | null {
    const w = this.world;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (const r of [1.8, 2.3, 2.9, 3.5, 4.3, 5.2]) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        if (w.groundY(x, z) < -0.3) continue;
        if (w.landRaw(x, z) & 128 && w.pierDeckAt(x, z) < -1e8 && w.sdfAt(x, z) > 2) continue;
        if (r < bd) {
          bd = r;
          best = { x, z };
        }
      }
      if (best) return best;
    }
    return null;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

void paint;
