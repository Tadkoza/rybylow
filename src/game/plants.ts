import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { World, LC, BIT_ROAD_DIRT, BIT_ROAD_PAVED } from "./world";
import { fbm, hash2, smoothstep, vnoise } from "./noise";
import { patchMaterial } from "./materials";
import { mergeParts } from "./geoutil";
import { rockGeometry, makeStoneMaterial } from "./bedassets";

export interface Item {
  y: number;
  rot: number;
  sx: number;
  sy: number;
  c: THREE.Color;
  /** nachylenie terenu (dh/dx, dh/dz) – obiekt układa się równo ze zboczem */
  slope?: [number, number];
}

export type Rule = (x: number, z: number, r1: number, r2: number, r3: number) => Item | null;

/** warstwa rozproszonych obiektów podążająca za graczem */
export class ScatterLayer {
  mesh: THREE.InstancedMesh;
  private lastX = 1e9;
  private lastZ = 1e9;
  constructor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    private max: number,
    private radius: number,
    private spacing: number,
    private seed: number,
    private rule: Rule,
    private refresh: number
  ) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.matrixAutoUpdate = false;
  }

  update(cx: number, cz: number, force = false) {
    if (!force && Math.hypot(cx - this.lastX, cz - this.lastZ) < this.refresh) return;
    this.lastX = cx;
    this.lastZ = cz;
    const R = this.radius, s = this.spacing;
    const m = this.mesh.instanceMatrix.array as Float32Array;
    const col = this.mesh.instanceColor!.array as Float32Array;
    let n = 0;
    const i0 = Math.floor((cx - R) / s), i1 = Math.ceil((cx + R) / s), j0 = Math.floor((cz - R) / s), j1 = Math.ceil((cz + R) / s);
    for (let j = j0; j <= j1 && n < this.max; j++)
      for (let i = i0; i <= i1; i++) {
        const x = (i + hash2(i, j, this.seed)) * s, z = (j + hash2(i, j, this.seed + 1)) * s;
        const dx = x - cx, dz = z - cz;
        const dd = Math.hypot(dx, dz);
        if (dd > R) continue;
        const item = this.rule(x, z, hash2(i, j, this.seed + 2), hash2(i, j, this.seed + 3), hash2(i, j, this.seed + 4));
        if (!item) continue;
        const fade = 1 - smoothstep(R * 0.7, R, dd);
        if (fade <= 0.02) continue;
        const c = Math.cos(item.rot), sn = Math.sin(item.rot);
        const sx = item.sx * (0.35 + 0.65 * fade), sy = item.sy * (0.2 + 0.8 * fade);
        const o = n * 16;
        if (item.slope) {
          let nx = -item.slope[0], ny = 1, nz = -item.slope[1];
          const nl = Math.hypot(nx, ny, nz);
          nx /= nl;
          ny /= nl;
          nz /= nl;
          const ax = c, az = -sn;
          const dp = ax * nx + az * nz;
          let xx = ax - nx * dp, xy = -ny * dp, xz = az - nz * dp;
          const xl = Math.hypot(xx, xy, xz) || 1;
          xx /= xl;
          xy /= xl;
          xz /= xl;
          const zx = xy * nz - xz * ny, zy = xz * nx - xx * nz, zz = xx * ny - xy * nx;
          m[o] = xx * sx;
          m[o + 1] = xy * sx;
          m[o + 2] = xz * sx;
          m[o + 3] = 0;
          m[o + 4] = nx * sy;
          m[o + 5] = ny * sy;
          m[o + 6] = nz * sy;
          m[o + 7] = 0;
          m[o + 8] = zx * sx;
          m[o + 9] = zy * sx;
          m[o + 10] = zz * sx;
          m[o + 11] = 0;
        } else {
          m[o] = c * sx;
          m[o + 1] = 0;
          m[o + 2] = -sn * sx;
          m[o + 3] = 0;
          m[o + 4] = 0;
          m[o + 5] = sy;
          m[o + 6] = 0;
          m[o + 7] = 0;
          m[o + 8] = sn * sx;
          m[o + 9] = 0;
          m[o + 10] = c * sx;
          m[o + 11] = 0;
        }
        m[o + 12] = x;
        m[o + 13] = item.y;
        m[o + 14] = z;
        m[o + 15] = 1;
        col[n * 3] = item.c.r;
        col[n * 3 + 1] = item.c.g;
        col[n * 3 + 2] = item.c.b;
        n++;
        if (n >= this.max) break;
      }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

// ----------------------------------------------------------------- geometrie
function grassGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const blades = 9;
  const push = (x: number, y: number, z: number, t: number) => {
    pos.push(x, y, z);
    nor.push(0, 1, 0);
    col.push(t, t, t);
  };
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + hash2(k, 1, 1) * 0.7;
    const r = 0.03 + hash2(k, 2, 1) * 0.1;
    const h = 0.22 + hash2(k, 3, 1) * 0.2;
    const w = 0.014 + hash2(k, 4, 1) * 0.01;
    const lean = 0.2 + hash2(k, 5, 1) * 0.4;
    const cx = Math.cos(a), sz = Math.sin(a);
    const bx = cx * r, bz = sz * r;
    const tx = -sz, tz = cx;
    // dolna część (czworokąt) + czubek
    const mx = bx + cx * lean * h * 0.5, mz = bz + sz * lean * h * 0.5;
    push(bx - tx * w, 0, bz - tz * w, 0.62);
    push(bx + tx * w, 0, bz + tz * w, 0.62);
    push(mx + tx * w * 0.55, h * 0.6, mz + tz * w * 0.55, 0.9);
    push(bx - tx * w, 0, bz - tz * w, 0.62);
    push(mx + tx * w * 0.55, h * 0.6, mz + tz * w * 0.55, 0.9);
    push(mx - tx * w * 0.55, h * 0.6, mz - tz * w * 0.55, 0.9);
    push(mx - tx * w * 0.55, h * 0.6, mz - tz * w * 0.55, 0.9);
    push(mx + tx * w * 0.55, h * 0.6, mz + tz * w * 0.55, 0.9);
    push(bx + cx * lean * h, h, bz + sz * lean * h, 1.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function reedGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const blades = 11;
  const base = new THREE.Color("#7f8a3a"), mid = new THREE.Color("#a3a34a"), tip = new THREE.Color("#8c6e3d"), head = new THREE.Color("#5e4a30");
  const c = new THREE.Color();
  for (let k = 0; k < blades; k++) {
    const a = (k / blades) * Math.PI * 2 + hash2(k, 9, 2);
    const r = hash2(k, 1, 2) * 0.28;
    const h = 1.8 + hash2(k, 2, 2) * 1.3;
    const w = 0.035 + hash2(k, 3, 2) * 0.02;
    const lean = 0.1 + hash2(k, 4, 2) * 0.28;
    const dx = Math.cos(a), dz = Math.sin(a);
    const bx = Math.cos(a + 1.3) * r, bz = Math.sin(a + 1.3) * r;
    const tx = -dz, tz = dx;
    const seg = 3;
    const rings: { p: [number, number, number]; w: number; t: number }[] = [];
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const bend = lean * h * t * t;
      rings.push({ p: [bx + dx * bend, h * t, bz + dz * bend], w: w * (1 - t * 0.85) , t });
    }
    const colorAt = (t: number) => {
      c.copy(base).lerp(mid, smoothstep(0, 0.7, t)).lerp(tip, smoothstep(0.6, 1, t));
      if (t > 0.88) c.lerp(head, 0.7);
      return c;
    };
    for (let s = 0; s < seg; s++) {
      const A = rings[s], B = rings[s + 1];
      const l0 = [A.p[0] - tx * A.w, A.p[1], A.p[2] - tz * A.w], r0 = [A.p[0] + tx * A.w, A.p[1], A.p[2] + tz * A.w];
      const l1 = [B.p[0] - tx * B.w, B.p[1], B.p[2] - tz * B.w], r1 = [B.p[0] + tx * B.w, B.p[1], B.p[2] + tz * B.w];
      const cA = colorAt(A.t).clone(), cB = colorAt(B.t).clone();
      const addV = (v: number[], cc: THREE.Color) => {
        pos.push(v[0], v[1], v[2]);
        nor.push(0, 1, 0);
        col.push(cc.r, cc.g, cc.b);
      };
      addV(l0, cA);
      addV(r0, cA);
      addV(r1, cB);
      addV(l0, cA);
      addV(r1, cB);
      addV(l1, cB);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function cattailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.Color("#7d8f3e"), tip = new THREE.Color("#a3a54e"), leafLo = new THREE.Color("#4f7a2a"), leafHi = new THREE.Color("#7fa044");
  const c = new THREE.Color();
  const strip = (bx: number, bz: number, h: number, w: number, dx: number, dz: number, lean: number, c0: THREE.Color, c1: THREE.Color) => {
    const pos: number[] = [], nor: number[] = [], col: number[] = [];
    const tx = -dz, tz = dx;
    const seg = 4;
    const ring = (s: number) => {
      const t = s / seg;
      const bend = lean * h * t * t;
      const ww = w * (1 - t * 0.9);
      const cx = bx + dx * bend, cz = bz + dz * bend, y = h * t;
      return { l: [cx - tx * ww, y, cz - tz * ww], r: [cx + tx * ww, y, cz + tz * ww], t };
    };
    for (let s = 0; s < seg; s++) {
      const A = ring(s), B = ring(s + 1);
      for (const [v, t] of [[A.l, A.t], [A.r, A.t], [B.r, B.t], [A.l, A.t], [B.r, B.t], [B.l, B.t]] as [number[], number][]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(0, 1, 0);
        c.copy(c0).lerp(c1, t);
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + hash2(k, 3, 7);
    const r = hash2(k, 1, 7) * 0.25;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const h = 1.5 + hash2(k, 2, 7) * 0.8;
    const dx = Math.cos(a + 0.7), dz = Math.sin(a + 0.7);
    const lean = 0.06 + hash2(k, 4, 7) * 0.14;
    parts.push(strip(bx, bz, h, 0.012, dx, dz, lean, stem, tip));
    // kolba
    const hg = new THREE.CylinderGeometry(0.02, 0.02, 0.18, 9, 1);
    hg.deleteAttribute("uv");
    const bend = lean * h * 0.85 * 0.85;
    hg.translate(bx + dx * bend, h * 0.86 + 0.0, bz + dz * bend);
    const cols = new Float32Array(hg.attributes.position.count * 3);
    const bc = new THREE.Color("#8a5a32");
    for (let i = 0; i < cols.length; i += 3) {
      cols[i] = bc.r;
      cols[i + 1] = bc.g;
      cols[i + 2] = bc.b;
    }
    hg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    parts.push(hg);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    parts.push(strip(Math.cos(a) * 0.1, Math.sin(a) * 0.1, 1.2 + hash2(k, 6, 7) * 0.7, 0.04, Math.cos(a), Math.sin(a), 0.35, leafLo, leafHi));
  }
  return mergeParts(parts)!;
}

function blobGeometry(detail: number, jit: number, seed: number, squash: number, palette: string[]): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + jit * (hash2(i, seed, 3) * 2 - 1);
    p.setXYZ(i, p.getX(i) * k, Math.max(p.getY(i) * k * squash, -0.15 * squash), p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const cols = palette.map((h) => new THREE.Color(h));
  const out = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = hash2(i, seed, 8);
    c.copy(cols[0]).lerp(cols[1], t).lerp(cols[2], Math.max(0, g.attributes.normal.getY(i)) * hash2(i, seed, 9));
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return g;
}

// ------------------------------------------------------------------- system
export interface PlantQuality {
  grassRadius: number;
  grassMax: number;
  reedRadius: number;
  detail: boolean;
}

export class Plants {
  group = new THREE.Group();
  grass: ScatterLayer;
  reeds: ScatterLayer;
  cattails: ScatterLayer;
  rocks: ScatterLayer;
  bushes: ScatterLayer;
  private mats: THREE.Material[] = [];

  constructor(world: World, q: PlantQuality) {
    const w = world;
    const A = world.info;
    const c = new THREE.Color();

    // --- trawa
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    patchMaterial(grassMat, { sway: 0.1, swayHeight: 0.6, detail: 0, noFlip: true });
    this.mats.push(grassMat);
    const grassRule: Rule = (x, z, r1, r2, r3) => {
      const raw = w.landRaw(x, z);
      if (raw & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) return null;
      const d = w.sdfAt(x, z);
      if (d < 0.5) return null;
      let code = raw & 15;
      if (code === 0) code = LC.MEADOW;
      let dens = 1, hm = 1;
      switch (code) {
        case LC.FOREST_MIX:
        case LC.FOREST_CONIF:
        case LC.FOREST_BROAD:
          dens = 0.3;
          hm = 0.8;
          break;
        case LC.MEADOW:
          dens = 1;
          hm = 1.15 + 0.35 * vnoise(x / 9, z / 9, 5);
          break;
        case LC.FARM:
          dens = 0.85;
          hm = 1.3;
          break;
        case LC.RESID:
        case LC.PARK:
        case LC.ORCHARD:
          dens = 0.8;
          hm = 0.55;
          break;
        case LC.WET:
          dens = 1;
          hm = 1.7;
          break;
        case LC.SCRUB:
          dens = 0.8;
          hm = 1.2;
          break;
        case LC.BEACH:
          dens = d > 6 ? 0.06 : 0;
          hm = 0.9;
          break;
        default:
          dens = 0;
      }
      if (code !== LC.BEACH) {
        const beachy = smoothstep(0.5, 0.72, fbm(x / 90, z / 90, 2, 41));
        if (d < beachy * 7 + 0.8) dens *= beachy > 0.2 ? 0.0 : 0.5;
      }
      if (r1 > dens) return null;
      const h = w.heightAt(x, z);
      if (w.pierDeckAt(x, z) > h) return null;
      // kolor zgodny z gruntem
      const n1 = fbm(x / 55, z / 55, 2, 21);
      const v = 0.85 + 0.35 * r2;
      if (code === LC.FARM) {
        const rr = hash2(Math.floor(x / 80), Math.floor(z / 80), 77);
        c.set(rr < 0.28 ? "#c9b45a" : rr < 0.5 ? "#79a540" : rr < 0.64 ? "#a9a944" : rr < 0.82 ? "#7e7a45" : "#b9aa6e");
      } else if (code >= 1 && code <= 3) c.set("#3d6a2c").lerp(new THREE.Color("#5c7d33"), n1);
      else if (code === LC.RESID || code === LC.PARK || code === LC.ORCHARD) c.set("#5fa337").lerp(new THREE.Color("#6faa3c"), n1);
      else c.set("#69a03a").lerp(new THREE.Color("#a3ab55"), smoothstep(0.35, 0.7, n1));
      c.multiplyScalar(v);
      // kwiaty łąkowe
      if ((code === LC.MEADOW || code === LC.SCRUB) && r3 > 0.93) c.set(r3 > 0.97 ? "#e8e2c4" : "#d8c24a");
      return { y: h - 0.02, rot: r2 * 6.28, sx: hm * (0.8 + r3 * 0.5), sy: hm * (0.75 + r1 * 0.5), c: c.clone() };
    };
    this.grass = new ScatterLayer(grassGeometry(), grassMat, q.grassMax, q.grassRadius, 0.5, 11, grassRule, 4);

    // --- trzciny
    const reedMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    patchMaterial(reedMat, { sway: 0.28, swayHeight: 2.2, detail: 0, noFlip: true });
    this.mats.push(reedMat);
    const reedAmt = A.reedAmount;
    const sp = world.spawn;
    const reedRule: Rule = (x, z, r1, r2, r3) => {
      const d = w.sdfAt(x, z);
      if (d < -9 || d > 2.0) return null;
      if (Math.hypot(x - sp.x, z - sp.z) < 50) return null;
      const raw = w.landRaw(x, z);
      if ((raw & 15) === LC.BEACH) return null;
      const beachy = smoothstep(0.5, 0.72, fbm(x / 90, z / 90, 2, 41));
      if (beachy > 0.2) return null;
      const m = fbm(x / 36, z / 36, 3, 81);
      const thr = 0.72 - reedAmt * 0.5;
      if (m < thr) return null;
      const dens = smoothstep(thr, thr + 0.12, m);
      if (r1 > dens * 0.9) return null;
      const h = w.heightAt(x, z);
      if (h < -1.7 || h > 0.5) return null;
      if (w.pierDeckAt(x, z) > -1e8) return null;
      const s = 0.8 + 0.5 * r2;
      c.setRGB(0.9 + 0.2 * r3, 0.9 + 0.1 * r3, 0.85 + 0.15 * r2);
      return { y: h - 0.1, rot: r3 * 6.28, sx: s, sy: s * (0.8 + 0.5 * vnoise(x / 15, z / 15, 4)), c: c.clone() };
    };
    this.reeds = new ScatterLayer(reedGeometry(), reedMat, 15000, q.reedRadius, 0.8, 31, reedRule, 12);
    const cattailRule: Rule = (x, z, r1, r2, r3) => {
      const it = reedRule(x, z, r1, r2, r3);
      if (!it || r2 < 0.45 || fbm(x / 22, z / 22, 2, 191) < 0.5) return null;
      return it;
    };
    this.cattails = new ScatterLayer(cattailGeometry(), reedMat, 5000, q.reedRadius, 1.3, 37, cattailRule, 12);

    // --- głazy
    const rockMat = makeStoneMaterial();
    this.mats.push(rockMat);
    const rockRule: Rule = (x, z, r1, r2, r3) => {
      const d = w.sdfAt(x, z);
      const raw = w.landRaw(x, z);
      if (raw & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) return null;
      const code = raw & 15;
      let p = 0.012;
      if (d > -2 && d < 8) p = 0.1;
      if (code === LC.PAVED || code === LC.RESID) p = 0.003;
      if (r1 > p) return null;
      if (d < -3) return null;
      if (w.pierDeckAt(x, z) > -1e8) return null;
      const h = w.heightAt(x, z);
      const s = 0.25 + Math.pow(r2, 2.5) * 1.5;
      c.setRGB(0.8 + 0.3 * r3, 0.78 + 0.3 * r3, 0.74 + 0.3 * r3 - 0.12 * r2);
      return { y: h - 0.2 * s, rot: r3 * 6.28, sx: s * (0.8 + 0.6 * r3), sy: s * (0.8 + 0.5 * r2), c: c.clone() };
    };
    this.rocks = new ScatterLayer(rockGeometry(17, 4, { round: 10, flat: 0.78, elong: 0.3, rough: 0.12 }), rockMat, 600, 170, 9, 51, rockRule, 20);

    // --- krzewy
    const bushMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    patchMaterial(bushMat, { sway: 0.06, swayHeight: 1.5, detail: 0.8, detailScale: 2.5, detailFar: 50 });
    this.mats.push(bushMat);
    const bushRule: Rule = (x, z, r1, r2, r3) => {
      const d = w.sdfAt(x, z);
      if (d < 1.2) return null;
      const raw = w.landRaw(x, z);
      if (raw & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) return null;
      let code = raw & 15;
      if (code === 0) code = LC.MEADOW;
      let p = 0.01;
      if (code >= 1 && code <= 3) p = 0.14 * smoothstep(0.3, 0.5, fbm(x / 20, z / 20, 2, 91));
      else if (code === LC.SCRUB) p = 0.4;
      else if (code === LC.WET) p = 0.2;
      else if (code === LC.PARK || code === LC.RESID) p = 0.03;
      else if (code === LC.BEACH || code === LC.PAVED) p = 0;
      if (d < 12) p += 0.04;
      if (r1 > p) return null;
      if (w.landRaw(x, z) & 128 && code !== LC.SCRUB) return null;
      const h = w.heightAt(x, z);
      const s = 0.6 + r2 * 1.1;
      c.setRGB(0.85 + 0.3 * r3, 0.9 + 0.2 * r3, 0.8 + 0.2 * r2);
      return { y: h - 0.05, rot: r3 * 6.28, sx: s, sy: s * (0.8 + 0.4 * r3), c: c.clone() };
    };
    this.bushes = new ScatterLayer(blobGeometry(1, 0.28, 29, 0.85, ["#2d4a22", "#46702c", "#5b8434"]), bushMat, 1500, 90, 2.8, 71, bushRule, 10);

    for (const l of [this.grass, this.reeds, this.cattails, this.rocks, this.bushes]) this.group.add(l.mesh);
    this.rocks.mesh.castShadow = q.detail;
    this.rocks.mesh.receiveShadow = q.detail;
    this.bushes.mesh.castShadow = false;
    this.bushes.mesh.receiveShadow = q.detail;
    this.grass.mesh.receiveShadow = false;
  }

  update(cx: number, cz: number, force = false) {
    this.grass.update(cx, cz, force);
    this.reeds.update(cx, cz, force);
    this.cattails.update(cx, cz, force);
    this.rocks.update(cx, cz, force);
    this.bushes.update(cx, cz, force);
  }

  /** podczas renderu odbicia ukrywamy drobiazgi */
  setReflectionMode(on: boolean) {
    this.grass.mesh.visible = !on;
    this.rocks.mesh.visible = !on;
    this.bushes.mesh.visible = !on;
  }

  dispose() {
    for (const l of [this.grass, this.reeds, this.cattails, this.rocks, this.bushes]) {
      l.mesh.geometry.dispose();
      l.mesh.dispose();
    }
    for (const m of this.mats) m.dispose();
  }
}
