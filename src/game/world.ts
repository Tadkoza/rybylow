import type { LakeData, LakeInfo } from "../data/lakes";
import { clamp, fbm, smoothstep, vnoise } from "./noise";

export const WORLD_HALF = 2400;
export const CELL = 4; // siatka makro (m)
export const GN = (WORLD_HALF * 2) / CELL;
export const GW = GN + 1;
export const LAND_CELL = 2;
export const LN = (WORLD_HALF * 2) / LAND_CELL;

// kody pokrycia terenu (z OSM)
export const LC = {
  NONE: 0,
  FOREST_MIX: 1,
  FOREST_CONIF: 2,
  FOREST_BROAD: 3,
  FARM: 4,
  MEADOW: 5,
  RESID: 6,
  PARK: 7,
  WET: 8,
  BEACH: 9,
  PAVED: 10,
  SCRUB: 11,
  ORCHARD: 12,
} as const;

export const BIT_ROAD_PAVED = 16;
export const BIT_ROAD_DIRT = 32;
export const BIT_BLOCK = 128;

export const PIER_DECK = 0.62;

export interface BuildingRec {
  h: number;
  roof: "flat" | "gabled" | "hipped";
  wall: number;
  type: string;
  pts: Float64Array; // x,z,...
  floorY: number;
  bbox: [number, number, number, number];
}

export interface PierRec {
  pts: number[];
  w: number;
  poly: boolean;
  bbox: [number, number, number, number];
}

export type Surface = "water" | "sand" | "grass" | "forest" | "wood" | "asphalt" | "dirt";

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export class World {
  info: LakeInfo;
  data: LakeData;
  H = new Float32Array(GW * GW);
  SDF = new Float32Array(GW * GW);
  land = new Uint8Array(LN * LN);
  lakeBBox: [number, number, number, number] = [0, 0, 0, 0];
  buildings: BuildingRec[] = [];
  piers: PierRec[] = [];
  private bHash = new Map<number, number[]>();
  spawn = { x: 0, z: 0, yaw: 0 };

  private constructor(info: LakeInfo) {
    this.info = info;
    this.data = info.data;
  }

  static async create(info: LakeInfo, onProgress: (f: number, label: string) => void): Promise<World> {
    const w = new World(info);
    await w.build(onProgress);
    return w;
  }

  // ------------------------------------------------------------------ budowa
  private async build(report: (f: number, label: string) => void) {
    const { data } = this;
    report(0.0, "Wczytywanie linii brzegowej…");
    await yieldFrame();

    // --- segmenty brzegu
    const segs: number[] = [];
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (const ring of data.water) {
      const n = ring.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        segs.push(ring[i * 2], ring[i * 2 + 1], ring[j * 2], ring[j * 2 + 1]);
        bx0 = Math.min(bx0, ring[i * 2]);
        bx1 = Math.max(bx1, ring[i * 2]);
        bz0 = Math.min(bz0, ring[i * 2 + 1]);
        bz1 = Math.max(bz1, ring[i * 2 + 1]);
      }
    }
    this.lakeBBox = [bx0, bz0, bx1, bz1];
    const S = new Float64Array(segs);
    const ns = S.length / 4;
    const M = 450;

    // --- pole odległości ze znakiem
    const SDF = this.SDF;
    for (let iz = 0; iz < GW; iz++) {
      const z = -WORLD_HALF + iz * CELL;
      for (let ix = 0; ix < GW; ix++) {
        const x = -WORLD_HALF + ix * CELL;
        let d: number;
        if (x < bx0 - M || x > bx1 + M || z < bz0 - M || z > bz1 + M) {
          const dx = Math.max(bx0 - x, 0, x - bx1), dz = Math.max(bz0 - z, 0, z - bz1);
          d = Math.hypot(dx, dz) + 40;
        } else {
          let best = 1e18;
          let inside = false;
          for (let k = 0; k < ns; k++) {
            const o = k * 4;
            const ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3];
            const ex = bx - ax, ez = bz - az;
            const l2 = ex * ex + ez * ez;
            let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + t * ex - x, pz = az + t * ez - z;
            const dd = px * px + pz * pz;
            if (dd < best) best = dd;
            if (az > z !== bz > z) {
              const xi = ax + ((z - az) * ex) / ez;
              if (xi > x) inside = !inside;
            }
          }
          d = Math.sqrt(best);
          if (inside) d = -d;
          if (Math.abs(d) < 90) d += (fbm(x * 0.045, z * 0.045, 2, 91) - 0.5) * 3.2;
        }
        SDF[iz * GW + ix] = d;
      }
      if (iz % 60 === 0) {
        report(0.02 + 0.3 * (iz / GW), "Obliczanie brzegów…");
        await yieldFrame();
      }
    }

    // --- makro-rzeźba terenu
    const A = this.info;
    for (let iz = 0; iz < GW; iz++) {
      const z = -WORLD_HALF + iz * CELL;
      for (let ix = 0; ix < GW; ix++) {
        const x = -WORLD_HALF + ix * CELL;
        const d = SDF[iz * GW + ix];
        let h: number;
        if (d <= 0) {
          const s = -d;
          const dn = 0.78 + 0.44 * fbm(x * 0.004, z * 0.004, 2, 5);
          h = -A.maxDepth * (1 - Math.exp(-s / A.depthScale)) * dn;
        } else {
          const base = 0.5 * (1 - Math.exp(-d / 5)) + Math.min(d, 60) * 0.03 * A.shoreBank;
          const t1 = smoothstep(15, 180, d);
          let hills = 0;
          if (t1 > 0) hills = Math.max(0.3, this.demAt(x, z)) * t1;
          const big = (fbm(x / 300, z / 300, 3, 7) - 0.5) * 2 * A.hillAmp * smoothstep(40, 300, d);
          const mid = (fbm(x / 70, z / 70, 2, 11) - 0.5) * 2 * 1.4 * smoothstep(20, 120, d);
          const bluff =
            smoothstep(0.56, 0.8, fbm(x / 120, z / 120, 2, 13)) * 3.5 * A.shoreBank * smoothstep(2, 14, d) * (1 - smoothstep(14, 60, d));
          h = Math.max(base * 0.9 + 0.02, base + hills + big + mid + bluff);
        }
        this.H[iz * GW + ix] = h;
      }
      if (iz % 60 === 0) {
        report(0.32 + 0.25 * (iz / GW), "Rzeźbienie terenu…");
        await yieldFrame();
      }
    }

    // --- budynki
    report(0.58, "Stawianie budynków…");
    await yieldFrame();
    for (const b of data.buildings) {
      const pts = new Float64Array(b.p);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, hs = 0;
      const n = pts.length / 2;
      for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, pts[i * 2]);
        x1 = Math.max(x1, pts[i * 2]);
        z0 = Math.min(z0, pts[i * 2 + 1]);
        z1 = Math.max(z1, pts[i * 2 + 1]);
        hs += this.macro(pts[i * 2], pts[i * 2 + 1]);
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (this.sdfAt(cx, cz) < 3) continue;
      const floorY = Math.max(0.3, hs / n);
      const rec: BuildingRec = { h: b.h, roof: b.roof, wall: b.wall, type: b.type, pts, floorY, bbox: [x0, z0, x1, z1] };
      this.buildings.push(rec);
      // wyrównanie terenu pod budynkiem
      const gi0 = Math.floor((x0 - 8 + WORLD_HALF) / CELL), gi1 = Math.ceil((x1 + 8 + WORLD_HALF) / CELL);
      const gj0 = Math.floor((z0 - 8 + WORLD_HALF) / CELL), gj1 = Math.ceil((z1 + 8 + WORLD_HALF) / CELL);
      for (let j = Math.max(0, gj0); j <= Math.min(GN, gj1); j++)
        for (let i = Math.max(0, gi0); i <= Math.min(GN, gi1); i++) {
          const x = -WORLD_HALF + i * CELL, z = -WORLD_HALF + j * CELL;
          if (SDF[j * GW + i] < 1.5) continue;
          const dist = distToPoly(x, z, pts);
          const wgt = 1 - smoothstep(0, 7, dist);
          if (wgt > 0) this.H[j * GW + i] += (floorY - this.H[j * GW + i]) * wgt;
        }
      // indeks przestrzenny
      const idx = this.buildings.length - 1;
      for (let cx2 = Math.floor(x0 / 32); cx2 <= Math.floor(x1 / 32); cx2++)
        for (let cz2 = Math.floor(z0 / 32); cz2 <= Math.floor(z1 / 32); cz2++) {
          const key = hkey(cx2, cz2);
          let arr = this.bHash.get(key);
          if (!arr) this.bHash.set(key, (arr = []));
          arr.push(idx);
        }
    }

    // --- pokrycie terenu
    report(0.68, "Sadzenie lasów i pól…");
    await yieldFrame();
    let count = 0;
    for (const a of data.areas) {
      this.fillPolys(a.r, a.c);
      if (++count % 60 === 0) await yieldFrame();
    }

    // --- drogi i mola → maski
    report(0.82, "Wytyczanie dróg…");
    await yieldFrame();
    for (const r of data.roads) {
      if (r.bridge) continue;
      const paved = r.surf === 0 || r.surf === 3;
      const bit = paved ? BIT_ROAD_PAVED : BIT_ROAD_DIRT;
      const rad = r.w / 2 + 0.2;
      this.markPolyline(r.p, rad, bit, true);
      this.markPolyline(r.p, r.w / 2 + 1.6, BIT_BLOCK, false);
    }
    for (const b of this.buildings) this.markPolygonBlock(b.pts, 1.8);

    // mola
    for (const p of data.piers) {
      if (p.kind !== "pier") continue;
      if (p.p.length < 4) continue;
      this.addPier(p.p, p.w, p.closed && p.p.length >= 8);
    }
    this.computeSpawn();
    report(0.95, "Układanie pomostów…");
    await yieldFrame();
  }

  private addPier(pts: number[], w: number, poly: boolean) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      z0 = Math.min(z0, pts[i + 1]);
      z1 = Math.max(z1, pts[i + 1]);
    }
    const m = w / 2 + 1;
    this.piers.push({ pts, w: Math.max(1.6, w), poly, bbox: [x0 - m, z0 - m, x1 + m, z1 + m] });
  }

  private computeSpawn() {
    let x = clamp(this.info.spawn.x, -WORLD_HALF + 100, WORLD_HALF - 100);
    let z = clamp(this.info.spawn.z, -WORLD_HALF + 100, WORLD_HALF - 100);
    let gx = 0, gz = 0;
    for (let it = 0; it < 80; it++) {
      const d = this.sdfAt(x, z);
      const e = 1.5;
      gx = this.sdfAt(x + e, z) - this.sdfAt(x - e, z);
      gz = this.sdfAt(x, z + e) - this.sdfAt(x, z - e);
      const gl = Math.hypot(gx, gz) || 1;
      gx /= gl;
      gz /= gl;
      const target = 7;
      if (Math.abs(d - target) < 1.5 && d > 4) break;
      x += gx * (target - d) * 0.6;
      z += gz * (target - d) * 0.6;
    }
    // kierunek na wodę
    const yaw = Math.atan2(gx, gz); // forward = (-sin(yaw), -cos(yaw)) = (-gx,-gz)
    this.spawn = { x, z, yaw };
    // dodatkowy pomost przy miejscu startu (jeśli w pobliżu nie ma żadnego)
    const near = this.piers.some((p) => x > p.bbox[0] - 60 && x < p.bbox[2] + 60 && z > p.bbox[1] - 60 && z < p.bbox[3] + 60);
    if (!near) {
      const sx = x - gx * Math.max(0, this.sdfAt(x, z) - 0.2);
      const sz = z - gz * Math.max(0, this.sdfAt(x, z) - 0.2);
      // pomost zaczyna się 2 m na lądzie i biegnie 20 m w wodę, prostopadle do brzegu, z boku od miejsca startu
      const px = -gz, pz = gx;
      const ox = sx + px * 9, oz = sz + pz * 9;
      this.addPier([ox + gx * 3, oz + gz * 3, ox - gx * 20, oz - gz * 20], 2.2, false);
    }
  }

  // ------------------------------------------------------------ rasteryzacja
  private fillPolys(rings: number[][], code: number) {
    const rs = rings.map((r) => {
      const a = new Float64Array(r);
      return a;
    });
    let minZ = 1e9, maxZ = -1e9;
    for (const r of rs) for (let i = 1; i < r.length; i += 2) {
      minZ = Math.min(minZ, r[i]);
      maxZ = Math.max(maxZ, r[i]);
    }
    const r0 = Math.max(0, Math.floor((minZ + WORLD_HALF) / LAND_CELL)), r1 = Math.min(LN - 1, Math.ceil((maxZ + WORLD_HALF) / LAND_CELL));
    const xs: number[] = [];
    for (let row = r0; row <= r1; row++) {
      const z = (row + 0.5) * LAND_CELL - WORLD_HALF;
      xs.length = 0;
      for (const r of rs) {
        const n = r.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const az = r[i * 2 + 1], bz = r[j * 2 + 1];
          if (az > z !== bz > z) xs.push(r[i * 2] + ((z - az) * (r[j * 2] - r[i * 2])) / (bz - az));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + WORLD_HALF) / LAND_CELL - 0.5));
        const c1 = Math.min(LN - 1, Math.floor((xs[k + 1] + WORLD_HALF) / LAND_CELL - 0.5));
        const base = row * LN;
        for (let c = c0; c <= c1; c++) this.land[base + c] = (this.land[base + c] & 0xf0) | code;
      }
    }
  }

  private markPolyline(p: number[], rad: number, bit: number, clearOther: boolean) {
    const r = Math.ceil(rad / LAND_CELL);
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 1.2));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
        const cx = Math.floor((x + WORLD_HALF) / LAND_CELL), cz = Math.floor((z + WORLD_HALF) / LAND_CELL);
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            const ix = cx + dx, iz = cz + dz;
            if (ix < 0 || iz < 0 || ix >= LN || iz >= LN) continue;
            const px = (ix + 0.5) * LAND_CELL - WORLD_HALF - x, pz = (iz + 0.5) * LAND_CELL - WORLD_HALF - z;
            if (px * px + pz * pz <= rad * rad) {
              const id = iz * LN + ix;
              if (clearOther) this.land[id] &= ~(BIT_ROAD_PAVED | BIT_ROAD_DIRT);
              this.land[id] |= bit;
            }
          }
      }
    }
  }

  private markPolygonBlock(pts: Float64Array, margin: number) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]);
      x1 = Math.max(x1, pts[i]);
      z0 = Math.min(z0, pts[i + 1]);
      z1 = Math.max(z1, pts[i + 1]);
    }
    const i0 = Math.max(0, Math.floor((x0 - margin + WORLD_HALF) / LAND_CELL)), i1 = Math.min(LN - 1, Math.ceil((x1 + margin + WORLD_HALF) / LAND_CELL));
    const j0 = Math.max(0, Math.floor((z0 - margin + WORLD_HALF) / LAND_CELL)), j1 = Math.min(LN - 1, Math.ceil((z1 + margin + WORLD_HALF) / LAND_CELL));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * LAND_CELL - WORLD_HALF, z = (j + 0.5) * LAND_CELL - WORLD_HALF;
        if (distToPoly(x, z, pts) <= margin) this.land[j * LN + i] |= BIT_BLOCK;
      }
  }

  // --------------------------------------------------------------- zapytania
  private demAt(x: number, z: number): number {
    const dm = this.data.dem;
    const n = dm.n;
    const gx = clamp((x + WORLD_HALF) / dm.step, 0, n - 1.0001);
    const gz = clamp((z + WORLD_HALF) / dm.step, 0, n - 1.0001);
    const i0 = Math.floor(gx), j0 = Math.floor(gz);
    const fx = gx - i0, fz = gz - j0;
    const col: number[] = [0, 0, 0, 0];
    for (let r = -1; r <= 2; r++) {
      const jj = clamp(j0 + r, 0, n - 1);
      const p0 = dm.rel[jj * n + clamp(i0 - 1, 0, n - 1)], p1 = dm.rel[jj * n + i0];
      const p2 = dm.rel[jj * n + clamp(i0 + 1, 0, n - 1)], p3 = dm.rel[jj * n + clamp(i0 + 2, 0, n - 1)];
      col[r + 1] = cubic(p0, p1, p2, p3, fx);
    }
    return cubic(col[0], col[1], col[2], col[3], fz);
  }

  /** wysokość makro (bilinearnie) */
  macro(x: number, z: number): number {
    const gx = clamp((x + WORLD_HALF) / CELL, 0, GN - 0.0001), gz = clamp((z + WORLD_HALF) / CELL, 0, GN - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const o = j * GW + i;
    const H = this.H;
    const a = H[o], b = H[o + 1], c = H[o + GW], d = H[o + GW + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  sdfAt(x: number, z: number): number {
    const gx = clamp((x + WORLD_HALF) / CELL, 0, GN - 0.0001), gz = clamp((z + WORLD_HALF) / CELL, 0, GN - 0.0001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const o = j * GW + i;
    const S = this.SDF;
    const a = S[o], b = S[o + 1], c = S[o + GW], d = S[o + GW + 1];
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  }

  /** wysokość terenu (z drobnymi nierównościami) */
  heightAt(x: number, z: number): number {
    const m = this.macro(x, z);
    const amp = 0.55 + 0.45 * smoothstep(-0.5, 0.4, m);
    const dt =
      ((vnoise(x * 0.27, z * 0.27, 3) - 0.5) * 0.3 + (vnoise(x * 0.07 + 50, z * 0.07 + 20, 5) - 0.5) * 0.9 + (vnoise(x * 1.3, z * 1.3, 8) - 0.5) * 0.05) * amp;
    return m + dt;
  }

  pierDeckAt(x: number, z: number): number {
    for (const p of this.piers) {
      if (x < p.bbox[0] || x > p.bbox[2] || z < p.bbox[1] || z > p.bbox[3]) continue;
      if (p.poly) {
        if (pointInPoly(x, z, p.pts)) return PIER_DECK;
        continue;
      }
      const hw = p.w / 2;
      for (let i = 0; i + 3 < p.pts.length; i += 2) {
        const ax = p.pts[i], az = p.pts[i + 1], bx = p.pts[i + 2], bz = p.pts[i + 3];
        const ex = bx - ax, ez = bz - az;
        const l2 = ex * ex + ez * ez;
        if (l2 < 1e-6) continue;
        let t = ((x - ax) * ex + (z - az) * ez) / l2;
        t = clamp(t, 0, 1);
        const px = ax + t * ex - x, pz = az + t * ez - z;
        if (px * px + pz * pz <= hw * hw) return PIER_DECK;
      }
    }
    return -1e9;
  }

  /** wysokość po której można chodzić (teren albo pomost) */
  groundY(x: number, z: number): number {
    return Math.max(this.heightAt(x, z), this.pierDeckAt(x, z));
  }

  landRaw(x: number, z: number): number {
    const ix = Math.floor((x + WORLD_HALF) / LAND_CELL), iz = Math.floor((z + WORLD_HALF) / LAND_CELL);
    if (ix < 0 || iz < 0 || ix >= LN || iz >= LN) return 0;
    return this.land[iz * LN + ix];
  }

  landAt(x: number, z: number): number {
    return this.landRaw(x, z) & 15;
  }

  surfaceAt(x: number, z: number): Surface {
    const h = this.heightAt(x, z);
    if (this.pierDeckAt(x, z) > h) return "wood";
    if (h < -0.12) return "water";
    const raw = this.landRaw(x, z);
    if (raw & BIT_ROAD_PAVED) return "asphalt";
    if (raw & BIT_ROAD_DIRT) return "dirt";
    const c = raw & 15;
    if (c === LC.BEACH || this.sdfAt(x, z) < 3.5) return "sand";
    if (c >= 1 && c <= 3) return "forest";
    return "grass";
  }

  /** wypycha okrąg z budynków */
  resolveBuildings(p: { x: number; z: number }, r: number) {
    const cx = Math.floor(p.x / 32), cz = Math.floor(p.z / 32);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.bHash.get(hkey(cx + dx, cz + dz));
        if (!arr) continue;
        for (const bi of arr) {
          const b = this.buildings[bi];
          if (p.x < b.bbox[0] - r || p.x > b.bbox[2] + r || p.z < b.bbox[1] - r || p.z > b.bbox[3] + r) continue;
          const pts = b.pts;
          const n = pts.length / 2;
          let best = 1e18, bx = 0, bz = 0;
          let inside = false;
          for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const ax = pts[i * 2], az = pts[i * 2 + 1], ex = pts[j * 2] - ax, ez = pts[j * 2 + 1] - az;
            const l2 = ex * ex + ez * ez;
            let t = l2 > 0 ? ((p.x - ax) * ex + (p.z - az) * ez) / l2 : 0;
            t = clamp(t, 0, 1);
            const qx = ax + t * ex, qz = az + t * ez;
            const dd = (qx - p.x) ** 2 + (qz - p.z) ** 2;
            if (dd < best) {
              best = dd;
              bx = qx;
              bz = qz;
            }
            if (az > p.z !== pts[j * 2 + 1] > p.z) {
              const xi = ax + ((p.z - az) * ex) / ez;
              if (xi > p.x) inside = !inside;
            }
          }
          const dist = Math.sqrt(best);
          if (inside) {
            const nx = bx - p.x, nz = bz - p.z;
            const l = Math.hypot(nx, nz) || 1;
            p.x = bx + (nx / l) * r;
            p.z = bz + (nz / l) * r;
          } else if (dist < r) {
            const nx = p.x - bx, nz = p.z - bz;
            const l = dist || 1;
            p.x = bx + (nx / l) * r;
            p.z = bz + (nz / l) * r;
          }
        }
      }
  }
}

function hkey(cx: number, cz: number) {
  return (cx + 512) * 1024 + (cz + 512);
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}

export function pointInPoly(x: number, z: number, pts: ArrayLike<number>): boolean {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], zi = pts[i * 2 + 1], xj = pts[j * 2], zj = pts[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** odległość do wielokąta (0 gdy wewnątrz) */
export function distToPoly(x: number, z: number, pts: ArrayLike<number>): number {
  const n = pts.length / 2;
  let best = 1e18;
  let inside = false;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2], az = pts[i * 2 + 1], ex = pts[j * 2] - ax, ez = pts[j * 2 + 1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dd = (ax + t * ex - x) ** 2 + (az + t * ez - z) ** 2;
    if (dd < best) best = dd;
    if (az > z !== pts[j * 2 + 1] > z && x < ax + ((z - az) * ex) / ez) inside = !inside;
  }
  return inside ? 0 : Math.sqrt(best);
}
