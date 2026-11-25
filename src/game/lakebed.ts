import * as THREE from "three";
import { World, BIT_ROAD_DIRT, BIT_ROAD_PAVED } from "./world";
import { fbm, smoothstep, clamp, hash2 } from "./noise";
import { ScatterLayer, Rule } from "./plants";
import { bedMix } from "./bedfield";
import {
  AQ,
  rockGeometry,
  branchGeometry,
  shellGeometry,
  ribbonTuftGeometry,
  aquaCardGeometry,
  leafGeometry,
  makeStoneMaterial,
  makeBarkMaterial,
  makeShellMaterial,
  makeAquaCardMaterial,
  makeRibbonMaterial,
} from "./bedassets";

export interface BedQuality {
  /** mnożnik liczby obiektów (0.3 … 1.6) */
  amount: number;
  /** mnożnik zasięgu */
  radius: number;
  shadows: boolean;
}

const STONE_TINTS: [number, number, number][] = [
  [0.8, 0.79, 0.76],
  [0.95, 0.86, 0.72],
  [0.72, 0.64, 0.57],
  [0.98, 0.96, 0.9],
  [0.6, 0.59, 0.6],
  [0.88, 0.72, 0.64],
];
const FOREST_OFF: [number, number][] = [
  [9, 0],
  [-9, 0],
  [0, 9],
  [0, -9],
];

/** dno jeziora i linia brzegowa: kamienie, żwir, patyki, kłody, muszle, liście, rośliny wodne */
export class LakeBed {
  group = new THREE.Group();
  private layers: { l: ScatterLayer; under: boolean }[] = [];
  private disposables: { dispose(): void }[] = [];
  private rr = 0;

  constructor(world: World, q: BedQuality) {
    const w = world;
    const info = world.info;
    const sp = world.spawn;
    const sc = new THREE.Color();
    const M = (n: number) => Math.max(30, Math.round(n * q.amount));
    const R = (r: number) => r * q.radius;
    const veg = 0.35 + 0.65 * 0.5 * (info.lilies + info.reedAmount);

    const spawnMul = (x: number, z: number) => 0.25 + 0.75 * smoothstep(8, 42, Math.hypot(x - sp.x, z - sp.z));
    const onPier = (x: number, z: number) => w.pierDeckAt(x, z) > -1e8;
    const onRoad = (x: number, z: number) => (w.landRaw(x, z) & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) !== 0;
    const slopeOf = (x: number, z: number): [number, number] => {
      const e = 0.3;
      return [(w.heightAt(x + e, z) - w.heightAt(x - e, z)) / (2 * e), (w.heightAt(x, z + e) - w.heightAt(x, z - e)) / (2 * e)];
    };
    const forestNear = (x: number, z: number) => {
      for (const [dx, dz] of FOREST_OFF) {
        const c = w.landAt(x + dx, z + dz);
        if (c >= 1 && c <= 3) return 1;
      }
      return 0;
    };

    const stoneMat = makeStoneMaterial();
    const barkMat = makeBarkMaterial();
    const shellMat = makeShellMaterial();
    const cardMat = makeAquaCardMaterial();
    const ribbonMat = makeRibbonMaterial();
    this.disposables.push(stoneMat, barkMat, shellMat, cardMat, ribbonMat);

    const add = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      max: number,
      radius: number,
      spacing: number,
      seed: number,
      rule: Rule,
      o: { under?: boolean; cast?: boolean; recv?: boolean; refresh?: number } = {}
    ) => {
      const l = new ScatterLayer(geo, mat, M(max), R(radius), spacing, seed, rule, o.refresh ?? 5);
      l.mesh.castShadow = !!(o.cast && q.shadows);
      l.mesh.receiveShadow = !!(o.recv && q.shadows);
      this.group.add(l.mesh);
      this.layers.push({ l, under: o.under ?? true });
      this.disposables.push(geo, l.mesh);
    };

    // ------------------------------------------------------------ rośliny wodne
    // jezierza (wstęgowate liście)
    add(
      ribbonTuftGeometry(5),
      ribbonMat,
      3500,
      30,
      0.55,
      611,
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d > -0.3 || d < -80) return null;
        const f = fbm(x / 21, z / 21, 3, 611);
        const thr = 0.62 - 0.2 * veg;
        if (f < thr) return null;
        if (r1 > smoothstep(thr, thr + 0.1, f) * 0.85 * spawnMul(x, z)) return null;
        const h = w.heightAt(x, z);
        const depth = -h;
        if (depth < 0.3 || depth > 2.7 || onPier(x, z)) return null;
        sc.setRGB(0.68 + 0.25 * r3, 0.72 + 0.2 * r2, 0.62 + 0.22 * r3);
        return { y: h - 0.02, rot: r3 * 6.28, sx: 0.85 + 0.4 * r3, sy: (0.75 + 0.7 * r2) * (0.5 + 0.5 * clamp(depth / 1.2, 0, 1)), c: sc };
      },
      { refresh: 6 }
    );

    const plantRule =
      (o: { fs: number; fscale: number; thr: number; dens: number; dmin: number; dmax: number; hk: number; hMin: number; hMax: number; w0: number }): Rule =>
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d > -0.3 || d < -90) return null;
        const f = fbm(x / o.fscale, z / o.fscale, 3, o.fs);
        const thr = o.thr - 0.2 * veg;
        if (f < thr) return null;
        if (r1 > smoothstep(thr, thr + 0.1, f) * o.dens * spawnMul(x, z)) return null;
        const h = w.heightAt(x, z);
        const depth = -h;
        if (depth < o.dmin || depth > o.dmax || onPier(x, z)) return null;
        sc.setRGB(0.68 + 0.25 * r3, 0.72 + 0.2 * r2, 0.62 + 0.22 * r3);
        return { y: h - 0.03, rot: r3 * 6.28, sx: o.w0 * (0.8 + 0.5 * r3), sy: clamp(depth * o.hk, o.hMin, o.hMax) * (0.75 + 0.5 * r2), c: sc };
      };
    const card = (cell: number, max: number, radius: number, spacing: number, seed: number, rule: Rule) =>
      add(aquaCardGeometry(cell, 1, 1, 3, 4), cardMat, max, radius, spacing, seed, rule, { refresh: 6 });

    card(AQ.hornwort, 4500, 34, 0.6, 621, plantRule({ fs: 621, fscale: 17, thr: 0.64, dens: 0.8, dmin: 0.6, dmax: 4.2, hk: 0.55, hMin: 0.3, hMax: 1.5, w0: 0.95 }));
    card(AQ.hornwort2, 3500, 34, 0.62, 623, plantRule({ fs: 623, fscale: 15, thr: 0.66, dens: 0.75, dmin: 0.6, dmax: 4.2, hk: 0.5, hMin: 0.3, hMax: 1.3, w0: 0.85 }));
    card(AQ.milfoil, 3500, 30, 0.62, 631, plantRule({ fs: 631, fscale: 19, thr: 0.64, dens: 0.8, dmin: 0.5, dmax: 3.6, hk: 0.6, hMin: 0.25, hMax: 1.6, w0: 1.0 }));
    card(AQ.milfoil2, 3000, 30, 0.64, 633, plantRule({ fs: 633, fscale: 16, thr: 0.66, dens: 0.75, dmin: 0.5, dmax: 3.6, hk: 0.55, hMin: 0.25, hMax: 1.4, w0: 0.9 }));
    card(AQ.chara, 5000, 24, 0.38, 641, plantRule({ fs: 641, fscale: 12, thr: 0.56, dens: 0.9, dmin: 0.25, dmax: 3.0, hk: 0.12, hMin: 0.12, hMax: 0.38, w0: 0.55 }));
    card(AQ.pondweed, 2200, 42, 0.9, 651, plantRule({ fs: 651, fscale: 24, thr: 0.66, dens: 0.5, dmin: 0.9, dmax: 3.4, hk: 0.85, hMin: 0.5, hMax: 2.6, w0: 0.75 }));

    // ------------------------------------------------------------------ kamienie
    const stoneRule =
      (o: { pBase: number; pGravel: number; pStony: number; pShore: number; smin: number; smax: number; pw: number; sink: number; big?: boolean; dim?: number }): Rule =>
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d < -75 || d > 5) return null;
        const h = w.heightAt(x, z);
        const depth = -h;
        if (depth > 4.8) return null;
        const shore = 1 - smoothstep(0.5, 4.5, Math.abs(d));
        const b = bedMix(x, z, Math.max(0, depth), fbm(x / 55, z / 55, 3, 21));
        const p = o.pBase + o.pGravel * b.gravel + o.pStony * b.stony + o.pShore * shore;
        if (r1 > p) return null;
        if (onRoad(x, z)) return null;
        const s = o.smin + (o.smax - o.smin) * Math.pow(r2, o.pw);
        if (s > 0.12 && onPier(x, z)) return null;
        const t = STONE_TINTS[Math.floor(hash2(Math.floor(x * 7.3), Math.floor(z * 7.3), 9) * STONE_TINTS.length)];
        const k = (0.85 + 0.3 * r3) * (o.dim ?? 1);
        sc.setRGB(t[0] * k, t[1] * k, t[2] * k);
        return { y: h - s * o.sink, rot: r3 * 6.28, sx: s * (0.8 + 0.5 * r2), sy: s * (0.75 + 0.5 * r3), c: sc, slope: o.big ? undefined : slopeOf(x, z) };
      };
    for (let v = 0; v < 2; v++)
      add(rockGeometry(101 + v * 13, 4, { round: 9, flat: 0.75, elong: 0.3, rough: 0.14 }), stoneMat, 200, 75, 6, 701 + v * 5, stoneRule({ pBase: 0.012, pGravel: 0.04, pStony: 0.14, pShore: 0.06, smin: 0.35, smax: 1.2, pw: 2.4, sink: 0.28, big: true }), {
        cast: true,
        recv: true,
        refresh: 12,
      });
    for (let v = 0; v < 3; v++)
      add(rockGeometry(201 + v * 17, 3, { round: 12, flat: 0.55 + v * 0.05, elong: 0.35, rough: 0.1 }), stoneMat, 900, 40, 1.3, 721 + v * 5, stoneRule({ pBase: 0.012, pGravel: 0.14, pStony: 0.1, pShore: 0.07, smin: 0.08, smax: 0.3, pw: 1.6, sink: 0.25, dim: 0.8 }), {
        cast: true,
        recv: true,
        refresh: 8,
      });
    for (let v = 0; v < 2; v++)
      add(rockGeometry(301 + v * 19, 2, { round: 8, flat: 0.55, elong: 0.35, rough: 0.07 }), stoneMat, 3500, 20, 0.36, 741 + v * 5, stoneRule({ pBase: 0.015, pGravel: 0.3, pStony: 0.18, pShore: 0.2, smin: 0.012, smax: 0.05, pw: 2, sink: 0.3, dim: 0.62 }), { refresh: 4 });

    // -------------------------------------------------------------------- patyki
    const stickRule =
      (o: { p: number; pDebris: number; pShore: number; pForest: number; smin: number; smax: number; maxDepth: number; sink: number; beachOnly?: boolean }): Rule =>
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d < -70 || d > (o.beachOnly ? 3 : 8)) return null;
        if (o.beachOnly && d < -1.2) return null;
        const h = w.heightAt(x, z);
        const depth = -h;
        if (depth > o.maxDepth) return null;
        const shore = 1 - smoothstep(0.5, 6, Math.abs(d));
        const base = o.p + o.pShore * shore;
        if (r1 > base + o.pDebris + o.pForest) return null;
        let p = base;
        if (r1 > p) {
          const b = bedMix(x, z, Math.max(0, depth), fbm(x / 55, z / 55, 3, 21));
          p += o.pDebris * b.debris + o.pForest * forestNear(x, z);
          if (r1 > p) return null;
        }
        if (onRoad(x, z) || onPier(x, z)) return null;
        const k = 0.8 + 0.35 * r3;
        sc.setRGB(k, k * 0.98, k * 0.95);
        const s = o.smin + (o.smax - o.smin) * r2;
        return { y: h - o.sink * s, rot: hash2(Math.floor(x * 3), Math.floor(z * 3), 4) * 6.28, sx: s, sy: s, c: sc, slope: slopeOf(x, z) };
      };
    for (let v = 0; v < 3; v++)
      add(branchGeometry(11 + v * 7, { len: 0.8 + v * 0.2, r: 0.015, forks: 2, wobble: 0.3, sides: 5 }), barkMat, 600, 32, 1.0, 801 + v * 3, stickRule({ p: 0.03, pDebris: 0.22, pShore: 0.14, pForest: 0.08, smin: 0.6, smax: 1.6, maxDepth: 3.4, sink: 0.2 }), {
        cast: true,
        recv: true,
        refresh: 6,
      });
    for (let v = 0; v < 2; v++)
      add(branchGeometry(41 + v * 9, { len: 2.4, r: 0.036, forks: 3, wobble: 0.16, sides: 6 }), barkMat, 160, 55, 3.4, 821 + v * 3, stickRule({ p: 0.07, pDebris: 0.1, pShore: 0.14, pForest: 0.1, smin: 0.7, smax: 1.4, maxDepth: 3.2, sink: 0.25 }), {
        cast: true,
        recv: true,
        refresh: 9,
      });
    add(branchGeometry(71, { len: 3.8, r: 0.17, forks: 2, wobble: 0.07, sides: 9, broken: true }), barkMat, 60, 80, 9, 841, stickRule({ p: 0.09, pDebris: 0.05, pShore: 0.3, pForest: 0.12, smin: 0.7, smax: 1.25, maxDepth: 2.4, sink: 0.45 }), {
      cast: true,
      recv: true,
      refresh: 14,
    });
    // wyrzucone na plażę, wybielone drewno
    add(branchGeometry(91, { len: 1.7, r: 0.04, forks: 3, wobble: 0.14, sides: 6, pale: true, broken: true }), barkMat, 120, 60, 2.6, 851, stickRule({ p: 0.07, pDebris: 0, pShore: 0.3, pForest: 0, smin: 0.6, smax: 1.5, maxDepth: 0.4, sink: 0.3, beachOnly: true }), {
      cast: true,
      recv: true,
      refresh: 10,
      under: false,
    });
    // zatopione pnie sterczące z wody
    add(
      branchGeometry(131, { len: 2.7, r: 0.1, forks: 5, wobble: 0.1, upright: true, broken: true, sides: 8 }),
      barkMat,
      30,
      110,
      24,
      861,
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d > -3 || d < -50) return null;
        if (r1 > 0.28 || fbm(x / 70, z / 70, 2, 661) < 0.52) return null;
        if (Math.hypot(x - sp.x, z - sp.z) < 30) return null;
        const h = w.heightAt(x, z);
        if (h > -0.5 || h < -1.9 || onPier(x, z)) return null;
        const k = 0.75 + 0.3 * r3;
        sc.setRGB(k, k * 0.97, k * 0.93);
        return { y: h - 0.25, rot: r3 * 6.28, sx: 0.8 + 0.5 * r2, sy: 0.8 + 0.5 * r2, c: sc };
      },
      { cast: true, recv: true, refresh: 16, under: false }
    );

    // -------------------------------------------------------------------- muszle
    const shellRule =
      (o: { smin: number; smax: number; pBase: number; pCluster: number; fs: number }): Rule =>
      (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d < -16 || d > 2.5) return null;
        const h = w.heightAt(x, z);
        const depth = -h;
        if (depth > 3.2 || depth < -0.25) return null;
        const cl = smoothstep(0.55, 0.72, fbm(x / 9, z / 9, 2, o.fs));
        const p = o.pBase + o.pCluster * cl;
        if (r1 > p) return null;
        const b = bedMix(x, z, Math.max(0, depth), fbm(x / 55, z / 55, 3, 21));
        if (r1 > p * (1 - b.mud * 0.7)) return null;
        if (onRoad(x, z) || onPier(x, z)) return null;
        const s = o.smin + (o.smax - o.smin) * r2;
        const k = 0.8 + 0.4 * r3;
        sc.setRGB(k, k, k * 0.95);
        return { y: h - 0.004, rot: hash2(Math.floor(x * 5), Math.floor(z * 5), 6) * 6.28, sx: s, sy: s * (0.8 + 0.5 * r3), c: sc, slope: slopeOf(x, z) };
      };
    add(shellGeometry(), shellMat, 800, 20, 0.7, 871, shellRule({ smin: 0.045, smax: 0.11, pBase: 0.03, pCluster: 0.4, fs: 651 }), { refresh: 4 });
    add(shellGeometry(), shellMat, 1500, 14, 0.28, 881, shellRule({ smin: 0.011, smax: 0.026, pBase: 0.04, pCluster: 0.5, fs: 661 }), { refresh: 3 });

    // -------------------------------------------------------------------- liście
    const leafCells = [AQ.alder, AQ.birch, AQ.oak, AQ.willow];
    leafCells.forEach((cell, i) => {
      add(
        leafGeometry(cell),
        cardMat,
        1100,
        24,
        0.5,
        891 + i * 3,
        (x, z, r1, r2, r3) => {
          const d = w.sdfAt(x, z);
          if (d < -40 || d > 6) return null;
          const h = w.heightAt(x, z);
          const depth = -h;
          if (depth > 3.6) return null;
          const forest = forestNear(x, z);
          const b = bedMix(x, z, Math.max(0, depth), fbm(x / 55, z / 55, 3, 21));
          const p = 0.015 + 0.2 * b.debris + 0.1 * forest * (1 - smoothstep(0.5, 3.5, depth));
          if (r1 > p) return null;
          if (onRoad(x, z) || onPier(x, z)) return null;
          const s = 0.06 + 0.075 * r2;
          const k = 0.55 + 0.6 * r3;
          sc.setRGB(k * 1.1, k * 0.95, k * 0.7);
          return { y: h + 0.002, rot: hash2(Math.floor(x * 4), Math.floor(z * 4), 7) * 6.28, sx: s, sy: 1, c: sc, slope: slopeOf(x, z) };
        },
        { refresh: 4 }
      );
    });
    // liście i szczątki dryfujące po powierzchni
    [AQ.birch, AQ.alder].forEach((cell, i) => {
      add(
        leafGeometry(cell),
        cardMat,
        300,
        45,
        1.4,
        911 + i * 3,
        (x, z, r1, r2, r3) => {
          const d = w.sdfAt(x, z);
          if (d > -0.5 || d < -16) return null;
          const p = 0.06 + 0.2 * forestNear(x, z) * (1 - smoothstep(2, 14, -d));
          if (r1 > p) return null;
          const h = w.heightAt(x, z);
          if (h > -0.1 || onPier(x, z)) return null;
          const s = 0.05 + 0.06 * r2;
          const k = 0.7 + 0.5 * r3;
          sc.setRGB(k * 1.15, k, k * 0.65);
          return { y: 0.014, rot: r3 * 6.28, sx: s, sy: 1, c: sc };
        },
        { refresh: 8, under: false }
      );
    });
  }

  update(cx: number, cz: number, force = false) {
    if (force) {
      for (const e of this.layers) e.l.update(cx, cz, true);
      return;
    }
    // jedna warstwa na klatkę — rozkłada koszt przeliczania
    const n = this.layers.length;
    if (!n) return;
    this.layers[this.rr++ % n].l.update(cx, cz);
  }

  /** podczas renderu odbicia ukrywamy wszystko, co jest pod wodą */
  setReflectionMode(on: boolean) {
    for (const e of this.layers) if (e.under) e.l.mesh.visible = !on;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
