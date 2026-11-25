import * as THREE from "three";
import { World, LC, BIT_BLOCK } from "./world";
import { fbm, hash2, smoothstep, vnoise } from "./noise";
import { patchMaterial } from "./materials";
import { buildTreeGeometries } from "./treemodels";
import { getFoliageAtlas } from "./foliage";

export const SP = { SPRUCE: 0, PINE: 1, BIRCH: 2, BROAD: 3, WILLOW: 4 } as const;
const NSP = 5;
const SUB = 192; // wielkość podkomórki (m)
const TILE = SUB * 2;
const COLL_R = [0.34, 0.3, 0.2, 0.5, 0.4];

// ------------------------------------------------------------------ system
interface SubData {
  per: Float32Array[]; // dla gatunku: x,y,z,rot,sxz,sy,tint
  coll: Float32Array; // x,z,r
}

interface Tile {
  ti: number;
  tj: number;
  mode: "near" | "far";
  group: THREE.Group;
  lods: number[];
}

export class TreeSystem {
  group = new THREE.Group();
  private world: World;
  private geos: THREE.BufferGeometry[][] = [];
  private material: THREE.MeshStandardMaterial;
  private gens = new Map<string, SubData>();
  private tiles = new Map<string, Tile>();
  private osmTrees = new Map<string, number[]>();
  private lastX = 1e9;
  private lastZ = 1e9;
  private radius: number;
  private nearDist: number;
  private castShadows: boolean;

  constructor(world: World, farRadius: number, shadows: boolean, cards: boolean) {
    this.world = world;
    this.radius = farRadius;
    this.nearDist = Math.min(330, farRadius * 0.3);
    this.castShadows = shadows;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: getFoliageAtlas(),
      alphaTest: 0.4,
      alphaToCoverage: false,
      roughness: 0.93,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    patchMaterial(this.material, { sway: 0.5, swayHeight: 20, detail: cards ? 0.3 : 0.8, detailScale: 3.0, detailFar: 90, noFlip: true });
    this.geos = buildTreeGeometries(cards);
    const t = world.data.trees;
    for (let i = 0; i < t.length; i += 2) {
      const key = `${Math.floor(t[i] / SUB)},${Math.floor(t[i + 1] / SUB)}`;
      let arr = this.osmTrees.get(key);
      if (!arr) this.osmTrees.set(key, (arr = []));
      arr.push(t[i], t[i + 1]);
    }
  }

  // ---------------------------------------------------------- generowanie
  private sub(i: number, j: number): SubData {
    const key = `${i},${j}`;
    let d = this.gens.get(key);
    if (d) return d;
    const w = this.world;
    const x0 = i * SUB, z0 = j * SUB;
    const s = 4.2;
    const lists: number[][] = [[], [], [], [], []];
    const coll: number[] = [];
    const push = (sp: number, x: number, z: number, rot: number, sxz: number, sy: number, tint: number) => {
      const y = w.heightAt(x, z) - 0.15;
      lists[sp].push(x, y, z, rot, sxz, sy, tint);
      coll.push(x, z, COLL_R[sp] * sxz);
    };
    const gi0 = Math.floor(x0 / s), gi1 = Math.ceil((x0 + SUB) / s), gj0 = Math.floor(z0 / s), gj1 = Math.ceil((z0 + SUB) / s);
    for (let gj = gj0; gj <= gj1; gj++)
      for (let gi = gi0; gi <= gi1; gi++) {
        const px = (gi + 0.5 + (hash2(gi, gj, 1) - 0.5) * 0.85) * s;
        const pz = (gj + 0.5 + (hash2(gi, gj, 2) - 0.5) * 0.85) * s;
        if (px < x0 || px >= x0 + SUB || pz < z0 || pz >= z0 + SUB) continue;
        const raw = w.landRaw(px, pz);
        if (raw & BIT_BLOCK) continue;
        const d = w.sdfAt(px, pz);
        if (d < 1.4) continue;
        let code = raw & 15;
        if (code === LC.NONE) code = fbm(px / 500, pz / 500, 2, 61) > 0.52 ? LC.FARM : fbm(px / 260, pz / 260, 2, 62) > 0.55 ? LC.FOREST_MIX : LC.MEADOW;
        let dens = 0;
        let kind = 0; // 0 las, 1 drzewa parkowe, 2 mokradło, 3 zarośla, 4 sad
        switch (code) {
          case LC.FOREST_MIX:
          case LC.FOREST_CONIF:
          case LC.FOREST_BROAD:
            dens = 0.78;
            break;
          case LC.PARK:
          case LC.RESID:
            dens = 0.05;
            kind = 1;
            break;
          case LC.MEADOW:
            dens = 0.0035;
            kind = 1;
            break;
          case LC.FARM:
            dens = 0.0005;
            kind = 1;
            break;
          case LC.WET:
            dens = 0.16;
            kind = 2;
            break;
          case LC.SCRUB:
            dens = 0.22;
            kind = 3;
            break;
          case LC.ORCHARD:
            dens = 0.55;
            kind = 4;
            break;
          default:
            dens = 0;
        }
        if (code < 4 && code > 0) dens *= 0.2 + 0.8 * smoothstep(0.27, 0.4, fbm(px / 45, pz / 45, 2, 301));
        // nadbrzeżne zadrzewienia
        if (d < 18 && kind !== 0) dens = Math.max(dens, 0.07 * (1 - d / 18) * smoothstep(0.4, 0.6, fbm(px / 70, pz / 70, 2, 303)) * (code === LC.BEACH ? 0 : 1));
        if (dens <= 0) continue;
        if (hash2(gi, gj, 3) > dens) continue;
        const slope = Math.abs(w.macro(px + 3, pz) - w.macro(px - 3, pz)) + Math.abs(w.macro(px, pz + 3) - w.macro(px, pz - 3));
        if (slope > 4.2) continue;

        const r = hash2(gi, gj, 4), r2 = hash2(gi, gj, 5);
        const stand = vnoise(px * 0.011, pz * 0.011, 311);
        let sp: number;
        if (kind === 0) {
          if (code === LC.FOREST_CONIF) sp = stand < 0.55 ? (r < 0.72 ? SP.SPRUCE : SP.PINE) : r < 0.78 ? SP.PINE : r < 0.96 ? SP.SPRUCE : SP.BIRCH;
          else if (code === LC.FOREST_BROAD) sp = r < 0.5 ? SP.BROAD : r < 0.8 ? SP.BIRCH : r < 0.92 ? SP.SPRUCE : SP.PINE;
          else if (stand < 0.33) sp = r < 0.7 ? SP.SPRUCE : r < 0.8 ? SP.PINE : r < 0.9 ? SP.BIRCH : SP.BROAD;
          else if (stand < 0.66) sp = r < 0.65 ? SP.PINE : r < 0.8 ? SP.SPRUCE : r < 0.92 ? SP.BIRCH : SP.BROAD;
          else sp = r < 0.36 ? SP.BIRCH : r < 0.76 ? SP.BROAD : r < 0.9 ? SP.SPRUCE : SP.PINE;
          if (d < 30 && r2 < 0.25) sp = r < 0.5 ? SP.WILLOW : SP.BIRCH;
        } else if (kind === 2) sp = r < 0.6 ? SP.WILLOW : SP.BIRCH;
        else if (kind === 3) sp = r < 0.5 ? SP.BIRCH : r < 0.8 ? SP.WILLOW : SP.BROAD;
        else if (kind === 4) sp = SP.BROAD;
        else sp = d < 30 && r < 0.45 ? SP.WILLOW : r < 0.55 ? SP.BROAD : r < 0.75 ? SP.BIRCH : r < 0.9 ? SP.SPRUCE : SP.BROAD;

        let age = 0.72 + 0.5 * vnoise(px * 0.02, pz * 0.02, 317) + (r2 - 0.5) * 0.3;
        if (kind === 3) age *= 0.5;
        if (kind === 4) age = 0.42;
        const sxz = age * (0.9 + hash2(gi, gj, 6) * 0.22);
        push(sp, px, pz, hash2(gi, gj, 7) * 6.283, sxz, age * (0.95 + hash2(gi, gj, 8) * 0.1), 0.85 + hash2(gi, gj, 9) * 0.3);
      }
    // pojedyncze drzewa z OSM
    const ot = this.osmTrees.get(`${i},${j}`);
    if (ot)
      for (let k = 0; k < ot.length; k += 2) {
        const h = hash2(Math.floor(ot[k] * 3), Math.floor(ot[k + 1] * 3), 9);
        if (w.sdfAt(ot[k], ot[k + 1]) < 1) continue;
        const sp = h < 0.5 ? SP.BROAD : h < 0.75 ? SP.BIRCH : h < 0.9 ? SP.SPRUCE : SP.WILLOW;
        const a = 0.75 + h * 0.45;
        push(sp, ot[k], ot[k + 1], h * 20, a, a, 0.9 + h * 0.2);
      }
    d = { per: lists.map((l) => new Float32Array(l)), coll: new Float32Array(coll) };
    this.gens.set(key, d);
    return d;
  }

  // ------------------------------------------------------------- kafelki
  private makeMesh(sp: number, lod: number, arrs: Float32Array[], shadow: boolean): THREE.InstancedMesh | null {
    let n = 0;
    for (const a of arrs) n += a.length / 7;
    if (!n) return null;
    const mesh = new THREE.InstancedMesh(this.geos[sp][lod], this.material, n);
    const m = mesh.instanceMatrix.array as Float32Array;
    const colors = new Float32Array(n * 3);
    let k = 0;
    for (const a of arrs)
      for (let i = 0; i < a.length; i += 7) {
        const c = Math.cos(a[i + 3]), s = Math.sin(a[i + 3]);
        const sx = a[i + 4], sy = a[i + 5];
        const o = k * 16;
        m[o] = c * sx;
        m[o + 1] = 0;
        m[o + 2] = -s * sx;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = sy;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = s * sx;
        m[o + 9] = 0;
        m[o + 10] = c * sx;
        m[o + 11] = 0;
        m[o + 12] = a[i];
        m[o + 13] = a[i + 1];
        m[o + 14] = a[i + 2];
        m[o + 15] = 1;
        const t = a[i + 6];
        const h = hash2(Math.floor(a[i] * 7), Math.floor(a[i + 2] * 7), 55) - 0.5;
        colors[k * 3] = t * (1 + h * 0.18);
        colors[k * 3 + 1] = t;
        colors[k * 3 + 2] = t * (1 - h * 0.2);
        k++;
      }
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = shadow && this.castShadows;
    mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    return mesh;
  }

  private buildTile(ti: number, tj: number, mode: "near" | "far", cx: number, cz: number): Tile {
    const key = `${ti},${tj}`;
    const old = this.tiles.get(key);
    if (old) this.disposeTile(old);
    const group = new THREE.Group();
    const lods: number[] = [];
    const subs = [this.sub(ti * 2, tj * 2), this.sub(ti * 2 + 1, tj * 2), this.sub(ti * 2, tj * 2 + 1), this.sub(ti * 2 + 1, tj * 2 + 1)];
    if (mode === "far") {
      for (let sp = 0; sp < NSP; sp++) {
        const m = this.makeMesh(sp, 2, subs.map((s) => s.per[sp]), false);
        if (m) group.add(m);
      }
    } else {
      for (let q = 0; q < 4; q++) {
        const sx = (ti * 2 + (q & 1) + 0.5) * SUB, sz = (tj * 2 + (q >> 1) + 0.5) * SUB;
        const lod = Math.hypot(sx - cx, sz - cz) < 230 ? 0 : 1;
        lods.push(lod);
        for (let sp = 0; sp < NSP; sp++) {
          const m = this.makeMesh(sp, lod, [subs[q].per[sp]], lod === 0);
          if (m) group.add(m);
        }
      }
    }
    this.group.add(group);
    const tile: Tile = { ti, tj, mode, group, lods };
    this.tiles.set(key, tile);
    return tile;
  }

  private disposeTile(t: Tile) {
    this.group.remove(t.group);
    for (const c of t.group.children) {
      const im = c as THREE.InstancedMesh;
      im.dispose();
    }
    this.tiles.delete(`${t.ti},${t.tj}`);
  }

  /** zwraca liczbę przebudowanych kafelków */
  update(cx: number, cz: number, budget = 1, force = false): number {
    if (!force && Math.hypot(cx - this.lastX, cz - this.lastZ) < 6 && budget > 0 && this.pending === 0) return 0;
    this.lastX = cx;
    this.lastZ = cz;
    const R = this.radius;
    const t0 = Math.floor((cx - R) / TILE), t1 = Math.floor((cx + R) / TILE);
    const u0 = Math.floor((cz - R) / TILE), u1 = Math.floor((cz + R) / TILE);
    const jobs: { ti: number; tj: number; mode: "near" | "far"; d: number }[] = [];
    const keep = new Set<string>();
    for (let tj = u0; tj <= u1; tj++)
      for (let ti = t0; ti <= t1; ti++) {
        const x0 = ti * TILE, z0 = tj * TILE;
        const dx = Math.max(x0 - cx, 0, cx - (x0 + TILE)), dz = Math.max(z0 - cz, 0, cz - (z0 + TILE));
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const key = `${ti},${tj}`;
        keep.add(key);
        const cur = this.tiles.get(key);
        const wantNear = cur?.mode === "near" ? d < this.nearDist + 90 : d < this.nearDist;
        const mode = wantNear ? "near" : "far";
        let need = !cur || cur.mode !== mode;
        if (cur && !need && mode === "near") {
          for (let q = 0; q < 4; q++) {
            const sx = (ti * 2 + (q & 1) + 0.5) * SUB, sz = (tj * 2 + (q >> 1) + 0.5) * SUB;
            const dd = Math.hypot(sx - cx, sz - cz);
            const want = cur.lods[q] === 0 ? (dd < 270 ? 0 : 1) : dd < 190 ? 0 : 1;
            if (want !== cur.lods[q]) need = true;
          }
        }
        if (need) jobs.push({ ti, tj, mode, d });
      }
    for (const t of [...this.tiles.values()]) if (!keep.has(`${t.ti},${t.tj}`)) this.disposeTile(t);
    jobs.sort((a, b) => a.d - b.d);
    let done = 0;
    for (const j of jobs) {
      if (done >= budget) break;
      this.buildTile(j.ti, j.tj, j.mode, cx, cz);
      done++;
    }
    this.pending = jobs.length - done;
    return done;
  }
  pending = 0;

  /** wypycha okrąg z pni drzew */
  collide(p: { x: number; z: number }, r: number) {
    const ci = Math.floor(p.x / SUB), cj = Math.floor(p.z / SUB);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const d = this.gens.get(`${ci + di},${cj + dj}`);
        if (!d) continue;
        const c = d.coll;
        for (let i = 0; i < c.length; i += 3) {
          const dx = p.x - c[i], dz = p.z - c[i + 1];
          if (dx > 3 || dx < -3 || dz > 3 || dz < -3) continue;
          const rr = r + c[i + 2];
          const l2 = dx * dx + dz * dz;
          if (l2 < rr * rr) {
            const l = Math.sqrt(l2) || 0.001;
            p.x = c[i] + (dx / l) * rr;
            p.z = c[i + 1] + (dz / l) * rr;
          }
        }
      }
  }

  dispose() {
    for (const t of [...this.tiles.values()]) this.disposeTile(t);
    for (const l of this.geos) for (const g of l) g.dispose();
    this.material.dispose();
  }
}
