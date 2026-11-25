import * as THREE from "three";
import { World, LC, BIT_ROAD_PAVED, BIT_ROAD_DIRT, WORLD_HALF } from "./world";
import { fbm, hash2, smoothstep, vnoise } from "./noise";
import { patchMaterial } from "./materials";
import { bedMix } from "./bedfield";
import { terrainBedPatch } from "./bedshader";

const SEG = 32;
const ROOT = 1024;
const ROOT_ORIGIN = -2560;
const ROOT_N = 5;
const MIN_SIZE = 32;

const col = (hex: string) => new THREE.Color(hex);
const P = {
  grassLush: col("#5d8a33"),
  grassDry: col("#8a9a4c"),
  grassTall: col("#79893f"),
  lawn: col("#5b9034"),
  flowerY: col("#b8b247"),
  flowerW: col("#b9bf9a"),
  forestFloor: col("#3b3a26"),
  moss: col("#40582f"),
  needles: col("#4d3d29"),
  wheat: col("#c4ae55"),
  cropGreen: col("#6f9a3a"),
  rape: col("#d5c23c"),
  plowed: col("#6d5640"),
  stubble: col("#b3a468"),
  sand: col("#cdbb90"),
  sandWet: col("#8d7e5f"),
  mud: col("#4a4333"),
  bottomSand: col("#c2ae86"),
  bottomMud: col("#4a4130"),
  bottomGravel: col("#8a8474"),
  weeds: col("#4c6a38"),
  wet: col("#5d6a3a"),
  paved: col("#68686b"),
  roadAsphalt: col("#4a4a4e"),
  roadDirt: col("#8b7a5e"),
  rock: col("#6e6049"),
  scrub: col("#7a7446"),
};

interface TNode {
  key: string;
  mesh: THREE.Mesh;
  size: number;
  visible: boolean;
  used: number;
}

export class Terrain {
  group = new THREE.Group();
  private world: World;
  private cache = new Map<string, TNode>();
  private material: THREE.MeshStandardMaterial;
  private index: THREE.BufferAttribute;
  private lastX = 1e9;
  private lastZ = 1e9;
  private frame = 0;
  private tmp = new THREE.Color();

  constructor(world: World, opts: { bed: boolean } = { bed: true }) {
    this.world = world;
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    if (opts.bed) patchMaterial(this.material, { detail: 0.95, detailScale: 0.45, detailFar: 260, uw: true, uwDefer: true, extra: terrainBedPatch, key: "bed" });
    else patchMaterial(this.material, { detail: 0.95, detailScale: 0.45, detailFar: 260 });
    this.index = buildIndex();
  }

  update(camX: number, camZ: number, force = false) {
    if (!force && Math.hypot(camX - this.lastX, camZ - this.lastZ) < 2.5) return;
    this.lastX = camX;
    this.lastZ = camZ;
    this.frame++;
    const wanted: { x: number; z: number; s: number }[] = [];
    for (let j = 0; j < ROOT_N; j++)
      for (let i = 0; i < ROOT_N; i++) this.collect(ROOT_ORIGIN + i * ROOT, ROOT_ORIGIN + j * ROOT, ROOT, camX, camZ, wanted);

    const wantedKeys = new Set<string>();
    for (const w of wanted) {
      const key = `${w.s}:${w.x}:${w.z}`;
      wantedKeys.add(key);
      let n = this.cache.get(key);
      if (!n) {
        n = this.build(key, w.x, w.z, w.s);
        this.cache.set(key, n);
      }
      n.used = this.frame;
      if (!n.visible) {
        n.visible = true;
        this.group.add(n.mesh);
      }
    }
    for (const [key, n] of this.cache) {
      if (n.visible && !wantedKeys.has(key)) {
        n.visible = false;
        this.group.remove(n.mesh);
      }
    }
    if (this.cache.size > 260) {
      const arr = [...this.cache.values()].filter((n) => !n.visible).sort((a, b) => a.used - b.used);
      for (let i = 0; i < Math.min(60, arr.length); i++) {
        arr[i].mesh.geometry.dispose();
        this.cache.delete(arr[i].key);
      }
    }
  }

  private collect(x0: number, z0: number, s: number, cx: number, cz: number, out: { x: number; z: number; s: number }[]) {
    // odległość od najbliższego punktu prostokąta
    const dx = Math.max(x0 - cx, 0, cx - (x0 + s)), dz = Math.max(z0 - cz, 0, cz - (z0 + s));
    const dist = Math.hypot(dx, dz);
    if (s > MIN_SIZE && dist < s * 1.15) {
      const h = s / 2;
      this.collect(x0, z0, h, cx, cz, out);
      this.collect(x0 + h, z0, h, cx, cz, out);
      this.collect(x0, z0 + h, h, cx, cz, out);
      this.collect(x0 + h, z0 + h, h, cx, cz, out);
    } else out.push({ x: x0, z: z0, s });
  }

  private build(key: string, x0: number, z0: number, size: number): TNode {
    const w = this.world;
    const cell = size / SEG;
    const nv = (SEG + 1) * (SEG + 1);
    const ns = 4 * (SEG + 1);
    const total = nv + ns;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const colr = new Float32Array(total * 3);
    const bedA = new Float32Array(total * 4);
    const cx = x0 + size / 2, cz = z0 + size / 2;
    const e = Math.max(1.0, cell * 0.7);
    const skirt = Math.max(0.6, size * 0.012);
    for (let j = 0; j <= SEG; j++)
      for (let i = 0; i <= SEG; i++) {
        const x = x0 + i * cell, z = z0 + j * cell;
        const h = w.heightAt(x, z);
        const hx = w.heightAt(x + e, z) - w.heightAt(x - e, z);
        const hz = w.heightAt(x, z + e) - w.heightAt(x, z - e);
        let nx = -hx, ny = 2 * e, nz = -hz;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const o = (j * (SEG + 1) + i) * 3;
        pos[o] = x - cx;
        pos[o + 1] = h;
        pos[o + 2] = z - cz;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
        this.groundColor(x, z, h, ny, cell, colr, o, bedA, (j * (SEG + 1) + i) * 4);
      }
    // spódniczki
    let s = nv;
    const edge = (idx: (k: number) => number) => {
      for (let k = 0; k <= SEG; k++) {
        const src = idx(k) * 3;
        const o = s * 3;
        pos[o] = pos[src];
        pos[o + 1] = pos[src + 1] - skirt;
        pos[o + 2] = pos[src + 2];
        nor[o] = nor[src];
        nor[o + 1] = nor[src + 1];
        nor[o + 2] = nor[src + 2];
        colr[o] = colr[src];
        colr[o + 1] = colr[src + 1];
        colr[o + 2] = colr[src + 2];
        const sb = (src / 3) * 4, ob = s * 4;
        bedA[ob] = bedA[sb];
        bedA[ob + 1] = bedA[sb + 1];
        bedA[ob + 2] = bedA[sb + 2];
        bedA[ob + 3] = bedA[sb + 3];
        s++;
      }
    };
    edge((k) => k); // północ (j=0)
    edge((k) => SEG * (SEG + 1) + k); // południe
    edge((k) => k * (SEG + 1)); // zachód
    edge((k) => k * (SEG + 1) + SEG); // wschód

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colr, 3));
    geo.setAttribute("aBed", new THREE.BufferAttribute(bedA, 4));
    geo.setIndex(this.index);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    // ograniczenia do frustum cullingu
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 40, 0), size * 0.75 + 60);
    return { key, mesh, size, visible: false, used: this.frame };
  }

  /** kolor gruntu w punkcie (zapisuje do tablicy w liniowej przestrzeni barw) */
  private groundColor(x: number, z: number, h: number, ny: number, cell: number, out: Float32Array, o: number, bed: Float32Array, ob: number) {
    const w = this.world;
    const c = this.tmp;
    const d = w.sdfAt(x, z);
    const raw = w.landRaw(x, z);
    let code = raw & 15;
    const n1 = fbm(x / 55, z / 55, 3, 21);
    const n2 = vnoise(x / 7, z / 7, 22);
    const n3 = vnoise(x / 2.3, z / 2.3, 23);
    const farFade = smoothstep(40, 300, cell * 14); // dalej mniej drobnych szczegółów
    const fine = (n2 - 0.5) * 0.28 * (1 - farFade * 0.6) + (n3 - 0.5) * 0.22 * (1 - farFade);

    if (code === LC.NONE) code = fbm(x / 500, z / 500, 2, 61) > 0.52 ? LC.FARM : LC.MEADOW;

    if (d <= 0) {
      // dno jeziora: piasek / żwir / muł (szczegóły dorabia shader dna)
      const depth = Math.max(0, -h);
      const b = bedMix(x, z, depth, n1);
      const sw = b.sand + b.gravel + b.mud + 1e-4;
      const S = P.bottomSand, G = P.bottomGravel, M = P.bottomMud;
      c.setRGB((S.r * b.sand + G.r * b.gravel + M.r * b.mud) / sw, (S.g * b.sand + G.g * b.gravel + M.g * b.mud) / sw, (S.b * b.sand + G.b * b.gravel + M.b * b.mud) / sw);
      const weeds = smoothstep(0.55, 0.75, fbm(x / 40, z / 40, 2, 71)) * (1 - smoothstep(1.5, 4.5, depth));
      c.lerp(P.weeds, weeds * 0.35);
      c.multiplyScalar(1 + fine * 0.35);
      bed[ob] = b.sand;
      bed[ob + 1] = b.gravel;
      bed[ob + 2] = b.mud;
      bed[ob + 3] = b.debris;
    } else {
      switch (code) {
        case LC.FOREST_MIX:
        case LC.FOREST_CONIF:
        case LC.FOREST_BROAD: {
          c.copy(P.forestFloor);
          const mossy = smoothstep(0.42, 0.7, n1);
          c.lerp(P.moss, mossy * 0.75);
          if (code === LC.FOREST_CONIF) c.lerp(P.needles, 0.45);
          c.multiplyScalar(1 + fine * 1.2);
          break;
        }
        case LC.FARM: {
          const gx = Math.floor(x / 80), gz = Math.floor(z / 80);
          const r = hash2(gx, gz, 77);
          if (r < 0.28) c.copy(P.wheat);
          else if (r < 0.5) c.copy(P.cropGreen);
          else if (r < 0.64) c.copy(P.rape);
          else if (r < 0.82) c.copy(P.plowed);
          else c.copy(P.stubble);
          c.lerp(P.grassDry, 0.12 + 0.2 * n1);
          // ślady upraw
          const rows = 0.5 + 0.5 * Math.sin((x * 0.9 + z * 0.4) * 1.2);
          c.multiplyScalar(0.94 + rows * 0.08 + fine * 0.6);
          break;
        }
        case LC.MEADOW:
        case LC.SCRUB: {
          c.copy(P.grassLush).lerp(P.grassDry, smoothstep(0.35, 0.7, n1));
          if (code === LC.SCRUB) c.lerp(P.scrub, 0.45);
          const fl = smoothstep(0.72, 0.8, vnoise(x / 3.5, z / 3.5, 29));
          c.lerp(hash2(Math.floor(x / 12), Math.floor(z / 12), 5) > 0.5 ? P.flowerY : P.flowerW, fl * 0.28);
          c.multiplyScalar(1 + fine * 1.1);
          break;
        }
        case LC.RESID:
        case LC.PARK:
        case LC.ORCHARD: {
          c.copy(P.lawn).lerp(P.grassLush, smoothstep(0.3, 0.7, n1) * 0.6);
          c.multiplyScalar(1 + fine * 0.8);
          break;
        }
        case LC.WET: {
          c.copy(P.wet).lerp(P.grassTall, n1 * 0.6);
          c.multiplyScalar(0.9 + fine);
          break;
        }
        case LC.BEACH: {
          c.copy(P.sand);
          c.multiplyScalar(1 + fine * 0.5);
          break;
        }
        case LC.PAVED: {
          c.copy(P.paved);
          c.multiplyScalar(1 + fine * 0.4);
          break;
        }
        default:
          c.copy(P.grassLush);
      }
      // pas piasku i błota przy brzegu
      const beachy = code === LC.BEACH ? 1 : smoothstep(0.5, 0.72, fbm(x / 90, z / 90, 2, 41));
      const sandW = beachy * 7 + 0.8;
      const sandMix = 1 - smoothstep(sandW * 0.55, sandW, d + (n2 - 0.5) * 1.6);
      if (sandMix > 0) {
        const sc = this.tmpSand(d, beachy, fine);
        c.lerp(sc, sandMix * (beachy > 0.2 ? 1 : 0.8));
        if (beachy > 0.2) {
          bed[ob] = sandMix;
          bed[ob + 1] = sandMix * 0.5 * smoothstep(0.4, 0.65, fbm(x / 6, z / 6, 2, 309)) * (1 - smoothstep(0.4, 3.2, d));
        } else {
          bed[ob + 2] = sandMix * 0.8;
          bed[ob + 3] = sandMix * 0.45;
        }
      }
      if (code === LC.BEACH && bed[ob] < 0.9) bed[ob] = 1;
      // drogi
      if (raw & BIT_ROAD_PAVED) c.lerp(P.roadAsphalt, 0.8);
      else if (raw & BIT_ROAD_DIRT) c.lerp(P.roadDirt, 0.75);
      // stoki
      if (ny < 0.9) c.lerp(P.rock, smoothstep(0.9, 0.7, ny) * 0.8);
    }
    out[o] = c.r;
    out[o + 1] = c.g;
    out[o + 2] = c.b;
  }

  private tmpSandC = new THREE.Color();
  private tmpSand(d: number, beachy: number, fine: number): THREE.Color {
    const s = this.tmpSandC;
    if (beachy > 0.2) {
      s.copy(P.sand).lerp(P.sandWet, 1 - smoothstep(0.0, 1.6, d));
      s.multiplyScalar(1 + fine * 0.6);
    } else {
      // błotnisty brzeg porośnięty roślinnością
      s.copy(P.mud).lerp(P.grassTall, smoothstep(0.2, 1.4, d));
      s.multiplyScalar(1 + fine * 0.5);
    }
    return s;
  }

  /** punkt poza światem → odległość do krawędzi (do ograniczania ruchu) */
  static inside(x: number, z: number) {
    return Math.abs(x) < WORLD_HALF - 60 && Math.abs(z) < WORLD_HALF - 60;
  }

  dispose() {
    for (const n of this.cache.values()) n.mesh.geometry.dispose();
    this.cache.clear();
    this.material.dispose();
  }
}

function buildIndex(): THREE.BufferAttribute {
  const idx: number[] = [];
  const W = SEG + 1;
  for (let j = 0; j < SEG; j++)
    for (let i = 0; i < SEG; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  const nv = W * W;
  // spódniczki: N, S, W, E
  const edges = [0, 1, 2, 3];
  for (const e of edges) {
    const base = nv + e * W;
    for (let k = 0; k < SEG; k++) {
      let a: number, b: number;
      if (e === 0) {
        a = k;
        b = k + 1;
      } else if (e === 1) {
        a = SEG * W + k;
        b = a + 1;
      } else if (e === 2) {
        a = k * W;
        b = (k + 1) * W;
      } else {
        a = k * W + SEG;
        b = (k + 1) * W + SEG;
      }
      const sa = base + k, sb = base + k + 1;
      idx.push(a, b, sb, a, sb, sa);
    }
  }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
}
