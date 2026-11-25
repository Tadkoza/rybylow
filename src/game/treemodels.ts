import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clamp, hash2, mulberry32, smoothstep } from "./noise";
import { addCard, cardsToGeometry, newCardSet, CardSet, SOLID_UV } from "./foliage";
import { mergeParts } from "./geoutil";

const C = (hex: string) => new THREE.Color(hex);
const tmpC = new THREE.Color();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

type V3 = [number, number, number];

function xform(g: THREE.BufferGeometry, px: number, py: number, pz: number, sx: number, sy: number, sz: number, rotY = 0, tx = 0, tz = 0) {
  _e.set(tx, rotY, tz);
  _q.setFromEuler(_e);
  _m.compose(_v.set(px, py, pz), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
}

function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number, i: number) => THREE.Color) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    uv[i * 2] = SOLID_UV[0];
    uv[i * 2 + 1] = SOLID_UV[1];
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

function cleanIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  return mergeVertices(g, 1e-4);
}

function blob(detail: number, jit: number, seed: number): THREE.BufferGeometry {
  const g = cleanIndexed(new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + jit * (hash2(i, seed, 7) * 2 - 1);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  return g;
}

function coneGeo(r: number, h: number, radial: number, hseg: number, droop: number, jit: number, seed: number): THREE.BufferGeometry {
  const g = cleanIndexed(new THREE.ConeGeometry(r, h, radial, hseg, true));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = Math.hypot(x, z) / r;
    const k = 1 + jit * (hash2(i, seed, 11) * 2 - 1) * f;
    p.setXYZ(i, x * k, y - droop * f * f * h * 0.5 + jit * 0.4 * (hash2(i, seed, 13) - 0.5) * f * h * 0.3, z * k);
  }
  return g;
}

function trunk(rTop: number, rBot: number, h: number, radial: number, bend: number, colorFn: (y: number, t: number) => THREE.Color): THREE.BufferGeometry {
  const g = cleanIndexed(new THREE.CylinderGeometry(rTop, rBot, h, radial, 4, true));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + h / 2) / h;
    p.setXYZ(i, p.getX(i) + bend * t * t, p.getY(i) + h / 2, p.getZ(i));
  }
  return colorize(g, (_x, y) => colorFn(y, y / h));
}

const norm = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

interface CrownOpts {
  n: number;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  size: [number, number];
  sy: number;
  det: number;
  seed: number;
  pal: [THREE.Color, THREE.Color, THREE.Color];
  jit: number;
}

/** korona z zachodzących na siebie kęp (bryły) */
function crown(parts: THREE.BufferGeometry[], o: CrownOpts) {
  const rnd = mulberry32(o.seed);
  for (let i = 0; i < o.n; i++) {
    let x = 0, y = 0, z = 0;
    if (i > 0)
      do {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
      } while (x * x + y * y + z * z > 1);
    const rr = Math.sqrt(x * x + y * y + z * z);
    const sz = (o.size[0] + (o.size[1] - o.size[0]) * rnd()) * (1 - 0.22 * rr);
    const g = blob(o.det, o.jit, o.seed * 7 + i);
    xform(g, o.cx + x * o.rx, o.cy + y * o.ry, o.cz + z * o.rz, sz, sz * o.sy, sz, rnd() * 6);
    colorize(g, (px, py, pz, _nx, ny, _nz, k) => {
      const j = hash2(k, i, o.seed);
      const top = clamp((py - (o.cy - o.ry)) / (2 * o.ry), 0, 1);
      tmpC.copy(o.pal[0]).lerp(o.pal[1], 0.25 + 0.3 * j + 0.3 * top).lerp(o.pal[2], Math.max(0, ny) * 0.55 * (0.4 + 0.6 * top));
      const dc = Math.hypot((px - o.cx) / o.rx, (py - o.cy) / o.ry, (pz - o.cz) / o.rz);
      return tmpC.multiplyScalar(0.6 + 0.5 * clamp(dc, 0, 1.2));
    });
    parts.push(g);
  }
}

interface CardCrown {
  n: number;
  cx: number;
  cy: number;
  cz: number;
  rx: number;
  ry: number;
  rz: number;
  size: [number, number];
  cell: number;
  seed: number;
  pal: [THREE.Color, THREE.Color, THREE.Color];
  hang?: boolean;
  gain: number;
}

/** korona z kart z teksturą liści, styczne do powierzchni elipsoidy, z normalnymi "kulistymi" */
function cardCrown(set: CardSet, o: CardCrown) {
  const rnd = mulberry32(o.seed);
  for (let i = 0; i < o.n; i++) {
    let dx = 0, dy = 0, dz = 0;
    do {
      dx = rnd() * 2 - 1;
      dy = rnd() * 2 - 1;
      dz = rnd() * 2 - 1;
    } while (dx * dx + dy * dy + dz * dz > 1 || dx * dx + dy * dy + dz * dz < 0.05);
    const d = norm(dx, dy, dz);
    const rf = 0.5 + 0.5 * Math.sqrt(rnd());
    const px = d[0] * rf, py = d[1] * rf, pz = d[2] * rf;
    const c: V3 = [o.cx + px * o.rx, o.cy + py * o.ry, o.cz + pz * o.rz];
    const sz = (o.size[0] + (o.size[1] - o.size[0]) * rnd()) * (1 - 0.18 * (1 - rf));
    const n = norm(d[0], d[1] + 0.35, d[2]);
    let right: V3, up: V3;
    if (o.hang) {
      right = scale(norm(-d[2], 0, d[0]), sz * 0.5);
      up = [0, sz * 0.5, 0];
      c[1] -= sz * 0.1;
    } else {
      let r0 = cross([0, 1, 0], n);
      if (Math.hypot(...r0) < 0.05) r0 = [1, 0, 0];
      r0 = norm(...r0);
      const u0 = norm(...cross(n, r0));
      const roll = rnd() * Math.PI * 2;
      const cr = Math.cos(roll), sr = Math.sin(roll);
      right = scale([r0[0] * cr + u0[0] * sr, r0[1] * cr + u0[1] * sr, r0[2] * cr + u0[2] * sr], sz * 0.5);
      up = scale([u0[0] * cr - r0[0] * sr, u0[1] * cr - r0[1] * sr, u0[2] * cr - r0[2] * sr], sz * 0.5);
    }
    const top = clamp((c[1] - (o.cy - o.ry)) / (2 * o.ry), 0, 1);
    tmpC
      .copy(o.pal[0])
      .lerp(o.pal[1], 0.2 + 0.35 * rnd() + 0.3 * top)
      .lerp(o.pal[2], Math.max(0, d[1]) * 0.5 * rnd());
    tmpC.multiplyScalar((0.55 + 0.5 * rf) * (0.85 + 0.3 * rnd()) * o.gain);
    addCard(set, c, right, up, n, o.cell, tmpC, rnd() < 0.5);
  }
}

function buildSpruce(lod: number, cards: boolean): THREE.BufferGeometry {
  const H = 20;
  const parts: THREE.BufferGeometry[] = [];
  const useCards = lod === 0 && cards;
  const tiers = [11, 5, 3][lod], radial = [12, 8, 6][lod], hseg = lod === 0 ? 2 : 1;
  const bark = C("#4a3c30");
  if (lod < 2) parts.push(trunk(0.1, 0.36, H * 0.92, lod === 0 ? 7 : 4, 0, () => bark));
  const deep = C("#162d1b"), mid = C("#27472a"), light = C("#3f6a38");
  const rnd = mulberry32(42 + lod);
  const set = newCardSet();
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const r = (3.5 - 2.7 * Math.pow(f, 0.9)) * (lod === 2 ? 1.05 : 1);
    const h = lod === 0 ? 5.6 - 2.6 * f : lod === 1 ? 8 - 3 * f : 10 - 3 * f;
    const y0 = 2.0 + f * (H - 2.0 - h * 0.9);
    const g = coneGeo(useCards ? r * 0.8 : r, h, radial, hseg, 0.5, 0.16, 100 + t + lod * 20);
    xform(g, 0, y0 + h / 2, 0, 1, 1, 1, rnd() * 6.28);
    const darken = useCards ? 0.82 : 1;
    colorize(g, (x, y, z, _nx, _ny, _nz, i) => {
      const rr = Math.min(1, Math.hypot(x, z) / Math.max(0.5, r));
      const j = hash2(i, t, 3 + lod);
      tmpC.copy(deep).lerp(mid, 0.3 + 0.5 * rr + 0.3 * j).lerp(light, Math.max(0, rr - 0.55) * (0.6 + 0.6 * j));
      return tmpC.multiplyScalar((0.72 + 0.4 * f + 0.22 * (y / H)) * darken);
    });
    parts.push(g);
    if (useCards) {
      const m = Math.round(8 + 7 * (1 - f));
      const L = r * 1.1 + 0.6;
      const yb = y0 + h * 0.28;
      for (let k = 0; k < m; k++) {
        const a = (k / m) * Math.PI * 2 + rnd() * 0.5;
        const dir: V3 = [Math.cos(a), 0, Math.sin(a)];
        const droop = (0.35 + 0.25 * rnd()) * (1 - f * 0.5);
        const upAxis = norm(dir[0] * Math.cos(droop), -Math.sin(droop), dir[2] * Math.cos(droop));
        const len = L * (0.85 + 0.3 * rnd());
        const c: V3 = [dir[0] * 0.25 + upAxis[0] * len * 0.5, yb + upAxis[1] * len * 0.5 + rnd() * 0.3, dir[2] * 0.25 + upAxis[2] * len * 0.5];
        const right = scale([-dir[2], 0, dir[0]], len * 0.44);
        const n = norm(dir[0] * 0.7, 0.75, dir[2] * 0.7);
        tmpC.copy(deep).lerp(mid, 0.4 + 0.4 * rnd()).lerp(light, 0.15 + 0.3 * f * rnd());
        tmpC.multiplyScalar((0.85 + 0.5 * f + 0.2 * rnd()) * 1.7);
        addCard(set, c, right, scale(upAxis, len * 0.5), n, 2, tmpC, rnd() < 0.5);
      }
    }
  }
  if (useCards) parts.push(cardsToGeometry(set));
  return mergeParts(parts, true)!;
}

function buildPine(lod: number, cards: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const useCards = lod === 0 && cards;
  const barkLow = C("#54463a"), barkUp = C("#b0622f");
  const th = 17;
  parts.push(trunk(0.1, 0.32, th, lod === 0 ? 8 : 4, 0.9, (y) => tmpC.copy(barkLow).lerp(barkUp, smoothstep(th * 0.45, th * 0.8, y))));
  const nb = [6, 3, 1][lod], det = lod === 0 ? 1 : 0;
  const c1 = C("#2c4a28"), c2 = C("#4c6c34"), c3 = C("#5f7d3b");
  const rnd = mulberry32(77 + lod);
  const set = newCardSet();
  for (let i = 0; i < nb; i++) {
    const f = nb === 1 ? 0.5 : i / (nb - 1);
    const y = 13.5 + f * 7.5 + 0.4 * Math.sin(i * 2.1);
    const a = i * 2.4 + rnd() * 2;
    const off = (1 - f) * 2.1 + 0.2;
    const sz = nb === 1 ? 3.6 : 2.7 - 1.0 * f;
    const g = blob(det, 0.26, 200 + i + lod * 10);
    const bx = (0.9 + Math.cos(a) * off * (nb === 1 ? 0 : 1)) * 0.8, bz = Math.sin(a) * off * (nb === 1 ? 0 : 1);
    xform(g, bx, y, bz, sz * 1.15, sz * 0.5, sz * 1.15, rnd() * 6);
    const dark = useCards ? 0.8 : 1;
    colorize(g, (_x, yy, _z, _nx, ny, _nz, k) => {
      const j = hash2(k, i, 5);
      tmpC.copy(c1).lerp(c2, 0.35 + 0.35 * j + 0.3 * Math.max(0, ny)).lerp(c3, Math.max(0, ny) * 0.4 * j);
      return tmpC.multiplyScalar((0.8 + 0.3 * (yy - y + 2) / 4) * dark);
    });
    parts.push(g);
    if (useCards) {
      for (let k = 0; k < 10; k++) {
        const aa = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.1;
        const d = norm(Math.cos(aa) * Math.cos(el), Math.sin(el), Math.sin(aa) * Math.cos(el));
        const half = 1.1 + 0.4 * rnd();
        const c: V3 = [bx + d[0] * (sz * 0.85 + half * 0.7), y + d[1] * (sz * 0.45 + half * 0.7), bz + d[2] * (sz * 0.85 + half * 0.7)];
        let r0 = cross(d, [0, 1, 0]);
        if (Math.hypot(...r0) < 0.05) r0 = [1, 0, 0];
        const right = scale(norm(...r0), half * 0.95);
        tmpC.copy(c1).lerp(c2, 0.4 + 0.5 * rnd()).lerp(c3, 0.2 * rnd());
        tmpC.multiplyScalar((0.9 + 0.4 * f) * 1.65);
        addCard(set, c, right, scale(d, half), norm(d[0], d[1] + 0.4, d[2]), 3, tmpC, rnd() < 0.5);
      }
    }
  }
  if (useCards) parts.push(cardsToGeometry(set));
  return mergeParts(parts, true)!;
}

function buildBirch(lod: number, cards: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const useCards = lod === 0 && cards;
  const white = C("#e6e1d3"), dark = C("#2d2824");
  const th = 12;
  parts.push(
    trunk(0.05, 0.15, th, lod === 0 ? 7 : 4, 0.7, (y) => {
      const band = hash2(Math.floor(y * 3.1), 3, 9);
      return tmpC.copy(white).lerp(dark, band > 0.72 ? 0.85 : band > 0.5 ? 0.15 : 0.0);
    })
  );
  const k = [1, 1.5, 2.2][lod];
  const pal: [THREE.Color, THREE.Color, THREE.Color] = [C("#43702a"), C("#76a339"), C("#9bbd50")];
  if (useCards) {
    crown(parts, { n: 4, cx: 0.6, cy: 10, cz: 0, rx: 1.4, ry: 2.8, rz: 1.4, size: [1.2, 1.7], sy: 1.1, det: 0, seed: 21, jit: 0.2, pal: [C("#37601f"), C("#5a8a2c"), C("#76a339")] });
    const set = newCardSet();
    cardCrown(set, { n: 140, cx: 0.6, cy: 10, cz: 0, rx: 2.2, ry: 3.7, rz: 2.2, size: [1.6, 2.5], cell: 1, seed: 25, pal, gain: 1.8 });
    parts.push(cardsToGeometry(set));
  } else
    crown(parts, { n: [11, 4, 1][lod], cx: 0.6, cy: 10, cz: 0, rx: 2.0, ry: 3.6, rz: 2.0, size: [1.4 * k, 2.0 * k], sy: 1.1, det: 0, seed: 21 + lod, jit: 0.22, pal });
  return mergeParts(parts, true)!;
}

function buildBroad(lod: number, cards: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const useCards = lod === 0 && cards;
  const bark = C("#5a4d40");
  parts.push(trunk(0.22, 0.52, 8, lod === 0 ? 10 : 5, 0.0, (_y, t) => tmpC.copy(bark).multiplyScalar(0.8 + 0.4 * (1 - t))));
  if (lod === 0) {
    for (let k = 0; k < 3; k++) {
      const br = trunk(0.07, 0.2, 5.6, 5, 0, () => bark);
      xform(br, 0, 6.6, 0, 1, 1, 1, k * 2.1 + 0.5, 0, 0.7);
      parts.push(br);
    }
  }
  const k = [1, 1.5, 2.3][lod];
  const pal: [THREE.Color, THREE.Color, THREE.Color] = [C("#2c5a22"), C("#4f8030"), C("#74a040")];
  if (useCards) {
    crown(parts, { n: 5, cx: 0, cy: 12.5, cz: 0, rx: 3.0, ry: 2.6, rz: 3.0, size: [2.4, 3.2], sy: 0.85, det: 0, seed: 33, jit: 0.2, pal: [C("#2a5a20"), C("#3f7228"), C("#5a8c34")] });
    const set = newCardSet();
    cardCrown(set, { n: 190, cx: 0, cy: 12.5, cz: 0, rx: 4.6, ry: 3.8, rz: 4.6, size: [2.4, 3.5], cell: 0, seed: 37, pal, gain: 1.75 });
    parts.push(cardsToGeometry(set));
  } else
    crown(parts, { n: [16, 6, 2][lod], cx: 0, cy: 12.5, cz: 0, rx: 4.2, ry: 3.6, rz: 4.2, size: [2.4 * k, 3.4 * k], sy: 0.85, det: lod === 0 ? 1 : 0, seed: 33 + lod, jit: 0.24, pal });
  return mergeParts(parts, true)!;
}

function buildWillow(lod: number, cards: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const useCards = lod === 0 && cards;
  const bark = C("#5e5445");
  parts.push(trunk(0.2, 0.48, 4.2, lod === 0 ? 8 : 4, 1.2, () => bark));
  const k = [1, 1.5, 2.4][lod];
  const pal: [THREE.Color, THREE.Color, THREE.Color] = [C("#62843a"), C("#8aa84a"), C("#aec45e")];
  if (useCards) {
    crown(parts, { n: 5, cx: 1.1, cy: 6.4, cz: 0, rx: 2.6, ry: 1.6, rz: 2.6, size: [1.8, 2.4], sy: 1.0, det: 0, seed: 45, jit: 0.2, pal: [C("#4c6c2c"), C("#6c8c3a"), C("#8aa84a")] });
    const set = newCardSet();
    cardCrown(set, { n: 95, cx: 1.1, cy: 6.4, cz: 0, rx: 3.9, ry: 2.2, rz: 3.9, size: [2.6, 3.6], cell: 4, seed: 47, pal, hang: true, gain: 1.7 });
    parts.push(cardsToGeometry(set));
  } else
    crown(parts, { n: [12, 5, 1][lod], cx: 1.1, cy: 6.2, cz: 0, rx: 3.8, ry: 2.4, rz: 3.8, size: [1.8 * k, 2.6 * k], sy: 1.05, det: lod === 0 ? 1 : 0, seed: 45 + lod, jit: 0.26, pal });
  return mergeParts(parts, true)!;
}

/** [gatunek][LOD] */
export function buildTreeGeometries(cards: boolean): THREE.BufferGeometry[][] {
  const builders = [buildSpruce, buildPine, buildBirch, buildBroad, buildWillow];
  return builders.map((b) => [0, 1, 2].map((l) => b(l, cards)));
}
