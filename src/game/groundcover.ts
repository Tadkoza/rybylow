import * as THREE from "three";
import { World, LC, BIT_ROAD_DIRT, BIT_ROAD_PAVED } from "./world";
import { fbm, hash2, smoothstep } from "./noise";
import { patchMaterial } from "./materials";
import { ScatterLayer, Rule } from "./plants";
import { getGroundAtlas, groundCellUV } from "./foliage";

/** kilka pionowych kart z teksturą rośliny */
function crossedCards(cell: number, w: number, h: number): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = groundCellUV(cell);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3 + 0.3;
    const dx = Math.cos(a) * w * 0.5, dz = Math.sin(a) * w * 0.5;
    const quad: [number, number, number, number, number][] = [
      [-dx, 0, -dz, u0, v0],
      [dx, 0, dz, u1, v0],
      [dx, h, dz, u1, v1],
      [-dx, h, -dz, u0, v1],
    ];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const q = quad[i];
      pos.push(q[0], q[1], q[2]);
      nor.push(0, 1, 0);
      uv.push(q[3], q[4]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function colorBy(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number, i: number) => THREE.Color) {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

function pebbleGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute("uv");
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + 0.35 * hash2(Math.round(x * 50), Math.round(y * 50 + z * 70), 3);
    p.setXYZ(i, x * k, y * k * 0.55, z * k);
  }
  g.computeVertexNormals();
  const c = new THREE.Color();
  return colorBy(g, (x, _y, z) => c.set("#aaa398").multiplyScalar(0.8 + 0.4 * hash2(Math.round(x * 20), Math.round(z * 20), 8)));
}

function logGeometry(len: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.85, r, len, 9, 4);
  g.deleteAttribute("uv");
  g.rotateZ(Math.PI / 2);
  g.translate(0, r * 0.9, 0);
  const c = new THREE.Color();
  return colorBy(g, (x, _y, _z, nx, _ny, _nz, i) => {
    if (Math.abs(nx) > 0.9) return c.set("#bba07a").multiplyScalar(0.9 + 0.2 * hash2(i, 1, 1));
    return c.set("#4d3f32").multiplyScalar(0.7 + 0.5 * hash2(Math.floor(x * 5), i % 9, 4));
  });
}

function stumpGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.26, 0.34, 0.5, 10, 2);
  g.deleteAttribute("uv");
  g.translate(0, 0.2, 0);
  const c = new THREE.Color();
  return colorBy(g, (_x, y, _z, _nx, ny, _nz, i) => {
    if (ny > 0.9) return c.set("#c0a47c").multiplyScalar(0.85 + 0.2 * hash2(i, 2, 2));
    return c.set("#4b3d30").multiplyScalar(0.65 + 0.5 * hash2(i, Math.floor(y * 9), 6));
  });
}

function lilyPadGeometry(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(0.42, 18, 0.45, 5.4);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute("uv");
  const c = new THREE.Color();
  return colorBy(g, (x, _y, z, _nx, _ny, _nz, i) => {
    const r = Math.hypot(x, z) / 0.42;
    c.set("#2c6428").lerp(new THREE.Color("#4a8a35"), r * 0.8);
    return c.multiplyScalar(0.85 + 0.25 * hash2(i, 5, 5));
  });
}

function lilyFlowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [];
  const white = new THREE.Color("#f6f2e6"), pink = new THREE.Color("#f3dcdc"), yellow = new THREE.Color("#e8b820");
  for (let layer = 0; layer < 2; layer++) {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + layer * 0.4;
      const rr = layer ? 0.1 : 0.16;
      const up = layer ? 0.1 : 0.05;
      const w = 0.06;
      const tipx = Math.cos(a) * rr, tipz = Math.sin(a) * rr;
      const bx = Math.cos(a) * 0.025, bz = Math.sin(a) * 0.025;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      for (const v of [
        [bx - px * 0.4, 0.012, bz - pz * 0.4, 0],
        [bx + px * 0.4, 0.012, bz + pz * 0.4, 0],
        [tipx + px * 0.1, up, tipz + pz * 0.1, 1],
        [bx - px * 0.4, 0.012, bz - pz * 0.4, 0],
        [tipx + px * 0.1, up, tipz + pz * 0.1, 1],
        [tipx - px * 0.1, up, tipz - pz * 0.1, 1],
      ]) {
        pos.push(v[0], v[1], v[2]);
        nor.push(0, 1, 0);
        const cc = white.clone().lerp(pink, v[3] * 0.5);
        col.push(cc.r, cc.g, cc.b);
      }
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, b = ((k + 1) / 6) * Math.PI * 2;
    for (const v of [[0, 0.06, 0], [Math.cos(a) * 0.045, 0.045, Math.sin(a) * 0.045], [Math.cos(b) * 0.045, 0.045, Math.sin(b) * 0.045]]) {
      pos.push(v[0], v[1], v[2]);
      nor.push(0, 1, 0);
      col.push(yellow.r, yellow.g, yellow.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export interface GroundQuality {
  radius: number; // mnożnik promienia
  ferns: boolean;
  pebbles: boolean;
}

export class GroundCover {
  group = new THREE.Group();
  private layers: ScatterLayer[] = [];
  private lily: ScatterLayer[] = [];
  private disposables: { dispose(): void }[] = [];

  constructor(world: World, q: GroundQuality) {
    const w = world;
    const info = world.info;
    const sc = new THREE.Color();
    const gray = (v: number) => sc.setRGB(v, v, v);
    const sp = world.spawn;

    const plantMat = new THREE.MeshStandardMaterial({ map: getGroundAtlas(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    patchMaterial(plantMat, { sway: 0.12, swayHeight: 0.7, detail: 0, noFlip: true });
    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    patchMaterial(solidMat, { detail: 0.5, detailScale: 3, detailFar: 40 });
    this.disposables.push(plantMat, solidMat);

    /** wspólny test miejsca na łące (poza drogami, piaskiem, brzegiem) */
    const meadowCode = (x: number, z: number): number => {
      const raw = w.landRaw(x, z);
      if (raw & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) return -1;
      const d = w.sdfAt(x, z);
      if (d < 1.2) return -1;
      let code = raw & 15;
      if (code === 0) code = LC.MEADOW;
      const beachy = code === LC.BEACH ? 1 : smoothstep(0.5, 0.72, fbm(x / 90, z / 90, 2, 41));
      if (d < beachy * 7 + 0.8) return -1;
      return code;
    };

    const addPlant = (cell: number, w0: number, h0: number, max: number, radius: number, spacing: number, seed: number, rule: Rule) => {
      const l = new ScatterLayer(crossedCards(cell, w0, h0), plantMat, max, radius * q.radius, spacing, seed, rule, 3);
      l.mesh.receiveShadow = false;
      this.group.add(l.mesh);
      this.layers.push(l);
      this.disposables.push(l.mesh.geometry, l.mesh);
    };

    // paprocie
    if (q.ferns)
      addPlant(0, 1.1, 0.85, 2600, 34, 0.95, 301, (x, z, r1, r2, r3) => {
        const code = meadowCode(x, z);
        if (code < 1) return null;
        const forest = code >= 1 && code <= 3;
        if (!forest && code !== LC.SCRUB) return null;
        const patch = smoothstep(0.38, 0.56, fbm(x / 16, z / 16, 2, 201));
        const dens = 0.55 * patch + 0.02;
        if (r1 > dens) return null;
        const s = 0.55 + 0.8 * r2;
        return { y: w.heightAt(x, z) - 0.02, rot: r3 * 6.28, sx: s, sy: s * (0.8 + 0.3 * r3), c: gray(0.78 + 0.35 * r3) };
      });

    const flowerRule = (seed: number, thr: number, codes: number[], base: number): Rule => (x, z, r1, r2, r3) => {
      const code = meadowCode(x, z);
      if (code < 1 || !codes.includes(code)) return null;
      const patch = smoothstep(thr, thr + 0.12, fbm(x / 9, z / 9, 2, seed));
      const lawn = code === LC.PARK || code === LC.RESID || code === LC.ORCHARD;
      const dens = base * (lawn ? 0.2 : 1) * patch + 0.003;
      if (r1 > dens) return null;
      const s = 0.45 + 0.5 * r2;
      return { y: w.heightAt(x, z) - 0.02, rot: r3 * 6.28, sx: s, sy: s * (0.85 + 0.3 * r3), c: gray(0.85 + 0.3 * r3) };
    };
    const open = [LC.MEADOW, LC.PARK, LC.RESID, LC.SCRUB, LC.WET, LC.ORCHARD];
    addPlant(1, 0.62, 0.8, 3600, 24, 0.55, 311, flowerRule(211, 0.52, open, 0.5));
    addPlant(2, 0.62, 0.8, 3600, 24, 0.55, 321, flowerRule(221, 0.54, [LC.MEADOW, LC.PARK, LC.RESID, LC.ORCHARD], 0.45));
    addPlant(3, 0.66, 0.85, 3000, 22, 0.55, 331, flowerRule(231, 0.56, [LC.MEADOW, LC.SCRUB, LC.WET], 0.4));

    // kępy trawy (karty z teksturą) – uzupełniają źdźbła z geometrii
    addPlant(4, 1.05, 0.8, 5600, 20, 0.6, 341, (x, z, r1, r2, r3) => {
      const code = meadowCode(x, z);
      if (code < 1) return null;
      let dens = 0, sc = 1;
      if (code === LC.MEADOW || code === LC.WET) {
        dens = 0.85;
        sc = 1.0 + 0.4 * r2;
      } else if (code === LC.PARK || code === LC.RESID || code === LC.ORCHARD) {
        dens = 0.5;
        sc = 0.55 + 0.3 * r2;
      } else if (code === LC.SCRUB) {
        dens = 0.6;
        sc = 1.0 + 0.4 * r2;
      } else if (code === LC.FARM) {
        dens = 0.4;
        sc = 0.9 + 0.4 * r2;
      } else if (code >= 1 && code <= 3) {
        dens = 0.14;
        sc = 0.6 + 0.3 * r2;
      }
      if (r1 > dens) return null;
      return { y: w.heightAt(x, z) - 0.02, rot: r3 * 6.28, sx: sc, sy: sc * (0.8 + 0.4 * r3), c: gray(0.8 + 0.3 * r3) };
    });
    addPlant(5, 0.95, 1.15, 3600, 18, 0.7, 351, (x, z, r1, r2, r3) => {
      const code = meadowCode(x, z);
      if (code !== LC.MEADOW && code !== LC.FARM && code !== LC.SCRUB) return null;
      const patch = smoothstep(0.45, 0.6, fbm(x / 12, z / 12, 2, 251));
      const dens = code === LC.FARM ? 0.45 : 0.4 * patch + 0.03;
      if (r1 > dens) return null;
      const sc = 0.9 + 0.5 * r2;
      return { y: w.heightAt(x, z) - 0.02, rot: r3 * 6.28, sx: sc, sy: sc * (0.85 + 0.3 * r3), c: gray(0.85 + 0.3 * r3) };
    });

    const solid = (geo: THREE.BufferGeometry, max: number, radius: number, spacing: number, seed: number, rule: Rule, shadow = false) => {
      const l = new ScatterLayer(geo, solidMat, max, radius * q.radius, spacing, seed, rule, 6);
      l.mesh.receiveShadow = shadow;
      l.mesh.castShadow = false;
      this.group.add(l.mesh);
      this.layers.push(l);
      this.disposables.push(geo, l.mesh);
    };

    // kamyki i żwir na brzegu
    if (q.pebbles)
      solid(pebbleGeometry(), 5200, 24, 0.42, 401, (x, z, r1, r2, r3) => {
        const d = w.sdfAt(x, z);
        if (d < -0.9 || d > 3.4) return null;
        const raw = w.landRaw(x, z);
        if (raw & (BIT_ROAD_DIRT | BIT_ROAD_PAVED)) return null;
        const beachy = (raw & 15) === LC.BEACH ? 1 : smoothstep(0.5, 0.72, fbm(x / 90, z / 90, 2, 41));
        const dens = (beachy > 0.2 ? 0.55 : 0.1) * (1 - smoothstep(1.0, 3.4, Math.abs(d))) + 0.01;
        if (r1 > dens) return null;
        if (w.pierDeckAt(x, z) > -1e8) return null;
        const s = 0.035 + 0.1 * r2 * r2;
        return { y: w.heightAt(x, z) + s * 0.1, rot: r3 * 6.28, sx: s * (0.8 + r3 * 0.6), sy: s * (0.7 + r2 * 0.5), c: gray(0.7 + 0.5 * r3) };
      });

    // kłody i pniaki w lesie
    const forestOnly = (x: number, z: number) => {
      const code = meadowCode(x, z);
      if (code < 1 || code > 3) return false;
      return w.sdfAt(x, z) > 6;
    };
    solid(logGeometry(3.2, 0.19), 120, 70, 6.5, 411, (x, z, r1, r2, r3) => {
      if (!forestOnly(x, z) || r1 > 0.07) return null;
      const s = 0.7 + 0.8 * r2;
      return { y: w.heightAt(x, z) - 0.03, rot: r3 * 6.28, sx: s, sy: s, c: gray(0.85 + 0.3 * r2) };
    }, true);
    solid(stumpGeometry(), 120, 60, 5.5, 421, (x, z, r1, r2, r3) => {
      if (!forestOnly(x, z) || r1 > 0.05) return null;
      const s = 0.7 + 0.7 * r2;
      return { y: w.heightAt(x, z) - 0.08, rot: r3 * 6.28, sx: s, sy: s * (0.8 + r3 * 0.6), c: gray(0.85 + 0.3 * r2) };
    }, true);

    // grzybienie
    const lilyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
    this.disposables.push(lilyMat);
    const amt = info.lilies;
    const lilyRule = (flower: boolean): Rule => (x, z, r1, r2, r3) => {
      const d = w.sdfAt(x, z);
      if (d > -1.2 || d < -30) return null;
      const h = w.heightAt(x, z);
      if (h > -0.45 || h < -2.4) return null;
      if (Math.hypot(x - sp.x, z - sp.z) < 38) return null;
      if (w.pierDeckAt(x, z) > -1e8) return null;
      const m = fbm(x / 26, z / 26, 3, 123);
      const thr = 0.78 - amt * 0.3;
      if (m < thr) return null;
      const dens = smoothstep(thr, thr + 0.1, m) * (flower ? 0.12 : 0.75);
      if (r1 > dens) return null;
      const s = 0.65 + 0.9 * r2;
      return { y: 0.012, rot: r3 * 6.28, sx: s, sy: 1, c: gray(0.9 + 0.2 * r3) };
    };
    for (const flower of [false, true]) {
      const l = new ScatterLayer(flower ? lilyFlowerGeometry() : lilyPadGeometry(), lilyMat, flower ? 700 : 5000, 85 * q.radius, 1.05, flower ? 503 : 501, lilyRule(flower), 8);
      l.mesh.receiveShadow = false;
      this.group.add(l.mesh);
      this.lily.push(l);
      this.disposables.push(l.mesh.geometry, l.mesh);
    }
  }

  update(cx: number, cz: number, force = false) {
    for (const l of this.layers) l.update(cx, cz, force);
    for (const l of this.lily) l.update(cx, cz, force);
  }

  setReflectionMode(on: boolean) {
    for (const l of this.layers) l.mesh.visible = !on;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}
