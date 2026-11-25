import * as THREE from "three";
import { vnoise, smoothstep, mulberry32 } from "./noise";
import { patchMaterial, ShaderParts, uwUniforms } from "./materials";

/**
 * Realistyczne ryby karpiowate: parametryczne ciało (profil przekrojów), płetwy z promieniami,
 * oczy, tekstury skóry rysowane proceduralnie, łuski i falowanie ciała liczone w shaderze.
 * Układ: nos = +X, grzbiet = +Y, bok = ±Z; długość całkowita (z płetwą ogonową) = 1.
 */
export type RigSpecies = "ploc" | "wzdrega" | "leszcz" | "lin" | "karp";

type RGB = [number, number, number];
interface FinSpan {
  t0: number;
  t1: number;
  h: number;
  sweep: number;
}
interface SpeciesDef {
  prof: number[][]; // [t, góra, dół, pół-szerokość]
  bodyLen: number;
  exp: number;
  snoutLift: number;
  eye: { t: number; r: number; up: number; iris: string; ring: string; crescent?: string };
  scales: [number, number];
  scaleAmp: number;
  sheen: number;
  skin: { back: RGB; flank: RGB; belly: RGB; shine: RGB; head: RGB };
  fins: {
    dorsal: FinSpan;
    anal: FinSpan;
    caudal: { h: number; notch: number; lobe: number };
    pect: number;
    pelv: number;
    cDorsal: string;
    cCaudal: string;
    cAnal: string;
    cPelv: string;
    cPect: string;
  };
  barbels: number;
}

const P = (rows: number[][]) => rows;

export const RIG: Record<RigSpecies, SpeciesDef> = {
  ploc: {
    prof: P([
      [0, 0, 0, 0],
      [0.014, 0.026, 0.024, 0.021],
      [0.05, 0.047, 0.040, 0.038],
      [0.15, 0.07, 0.062, 0.052],
      [0.27, 0.098, 0.088, 0.064],
      [0.4, 0.112, 0.1, 0.066],
      [0.55, 0.104, 0.092, 0.058],
      [0.7, 0.076, 0.066, 0.04],
      [0.85, 0.05, 0.044, 0.026],
      [1, 0.03, 0.027, 0.015],
    ]),
    bodyLen: 0.835,
    exp: 2.25,
    snoutLift: 0,
    eye: { t: 0.085, r: 0.021, up: 0.3, iris: "#d9942e", ring: "#c0391f", crescent: "#d8431f" },
    scales: [58, 29],
    scaleAmp: 0.5,
    sheen: 0.55,
    skin: { back: [0.2, 0.3, 0.32], flank: [0.74, 0.8, 0.8], belly: [0.94, 0.94, 0.9], shine: [0.5, 0.62, 0.66], head: [0.55, 0.62, 0.6] },
    fins: {
      dorsal: { t0: 0.38, t1: 0.57, h: 0.1, sweep: 0.45 },
      anal: { t0: 0.7, t1: 0.82, h: 0.07, sweep: 0.4 },
      caudal: { h: 0.27, notch: 0.3, lobe: 0 },
      pect: 0.115,
      pelv: 0.1,
      cDorsal: "#7d6a5e",
      cCaudal: "#a05a48",
      cAnal: "#d4502f",
      cPelv: "#d84e2b",
      cPect: "#e0a064",
    },
    barbels: 0,
  },
  wzdrega: {
    prof: P([
      [0, 0, 0, 0],
      [0.014, 0.026, 0.024, 0.021],
      [0.05, 0.049, 0.043, 0.038],
      [0.15, 0.076, 0.07, 0.052],
      [0.27, 0.108, 0.102, 0.062],
      [0.4, 0.122, 0.112, 0.064],
      [0.55, 0.112, 0.098, 0.056],
      [0.7, 0.082, 0.068, 0.038],
      [0.85, 0.054, 0.046, 0.025],
      [1, 0.03, 0.027, 0.015],
    ]),
    bodyLen: 0.83,
    exp: 2.2,
    snoutLift: 0.006,
    eye: { t: 0.085, r: 0.021, up: 0.3, iris: "#e5b43a", ring: "#d63a1d", crescent: "#d9381c" },
    scales: [52, 29],
    scaleAmp: 0.55,
    sheen: 0.65,
    skin: { back: [0.26, 0.26, 0.1], flank: [0.76, 0.62, 0.28], belly: [0.9, 0.82, 0.55], shine: [0.85, 0.7, 0.3], head: [0.65, 0.52, 0.22] },
    fins: {
      dorsal: { t0: 0.5, t1: 0.66, h: 0.1, sweep: 0.45 },
      anal: { t0: 0.7, t1: 0.82, h: 0.085, sweep: 0.4 },
      caudal: { h: 0.29, notch: 0.3, lobe: 0 },
      pect: 0.12,
      pelv: 0.105,
      cDorsal: "#b8452c",
      cCaudal: "#cf3b24",
      cAnal: "#d82e1c",
      cPelv: "#dc3220",
      cPect: "#e0602a",
    },
    barbels: 0,
  },
  leszcz: {
    prof: P([
      [0, 0, 0, 0],
      [0.014, 0.026, 0.024, 0.018],
      [0.05, 0.052, 0.045, 0.034],
      [0.15, 0.092, 0.074, 0.044],
      [0.27, 0.15, 0.112, 0.054],
      [0.38, 0.172, 0.126, 0.058],
      [0.52, 0.15, 0.118, 0.052],
      [0.68, 0.098, 0.086, 0.036],
      [0.85, 0.046, 0.05, 0.022],
      [1, 0.027, 0.029, 0.013],
    ]),
    bodyLen: 0.8,
    exp: 2.0,
    snoutLift: -0.006,
    eye: { t: 0.075, r: 0.018, up: 0.25, iris: "#b9a766", ring: "#6e6540" },
    scales: [62, 44],
    scaleAmp: 0.45,
    sheen: 0.5,
    skin: { back: [0.2, 0.2, 0.15], flank: [0.62, 0.55, 0.37], belly: [0.84, 0.8, 0.62], shine: [0.7, 0.62, 0.4], head: [0.42, 0.4, 0.3] },
    fins: {
      dorsal: { t0: 0.36, t1: 0.5, h: 0.12, sweep: 0.5 },
      anal: { t0: 0.58, t1: 0.82, h: 0.07, sweep: 0.35 },
      caudal: { h: 0.34, notch: 0.4, lobe: 0.35 },
      pect: 0.13,
      pelv: 0.11,
      cDorsal: "#4d4c49",
      cCaudal: "#55524d",
      cAnal: "#5d5a54",
      cPelv: "#66625a",
      cPect: "#6e6a60",
    },
    barbels: 0,
  },
  lin: {
    prof: P([
      [0, 0, 0, 0],
      [0.014, 0.032, 0.029, 0.029],
      [0.05, 0.054, 0.049, 0.052],
      [0.15, 0.074, 0.07, 0.066],
      [0.27, 0.092, 0.088, 0.08],
      [0.4, 0.1, 0.096, 0.084],
      [0.55, 0.098, 0.09, 0.08],
      [0.7, 0.082, 0.074, 0.066],
      [0.85, 0.064, 0.058, 0.05],
      [1, 0.04, 0.037, 0.03],
    ]),
    bodyLen: 0.87,
    exp: 2.6,
    snoutLift: 0,
    eye: { t: 0.1, r: 0.014, up: 0.3, iris: "#d9632a", ring: "#a73a15" },
    scales: [120, 60],
    scaleAmp: 0.14,
    sheen: 0.3,
    skin: { back: [0.12, 0.15, 0.06], flank: [0.3, 0.36, 0.14], belly: [0.55, 0.5, 0.22], shine: [0.5, 0.52, 0.2], head: [0.2, 0.24, 0.1] },
    fins: {
      dorsal: { t0: 0.46, t1: 0.62, h: 0.1, sweep: 0.25 },
      anal: { t0: 0.7, t1: 0.82, h: 0.08, sweep: 0.2 },
      caudal: { h: 0.22, notch: 0.06, lobe: 0 },
      pect: 0.13,
      pelv: 0.12,
      cDorsal: "#454a28",
      cCaudal: "#4b502c",
      cAnal: "#4c512c",
      cPelv: "#565a30",
      cPect: "#5d6034",
    },
    barbels: 1,
  },
  karp: {
    prof: P([
      [0, 0, 0, 0],
      [0.014, 0.029, 0.026, 0.024],
      [0.05, 0.052, 0.045, 0.045],
      [0.15, 0.082, 0.072, 0.06],
      [0.27, 0.118, 0.1, 0.072],
      [0.4, 0.132, 0.108, 0.074],
      [0.55, 0.122, 0.1, 0.068],
      [0.7, 0.092, 0.078, 0.052],
      [0.85, 0.062, 0.056, 0.034],
      [1, 0.036, 0.033, 0.022],
    ]),
    bodyLen: 0.84,
    exp: 2.3,
    snoutLift: -0.004,
    eye: { t: 0.085, r: 0.014, up: 0.3, iris: "#caa02e", ring: "#6f5418" },
    scales: [40, 26],
    scaleAmp: 0.65,
    sheen: 0.45,
    skin: { back: [0.2, 0.2, 0.08], flank: [0.62, 0.5, 0.2], belly: [0.86, 0.78, 0.5], shine: [0.8, 0.62, 0.22], head: [0.4, 0.34, 0.14] },
    fins: {
      dorsal: { t0: 0.3, t1: 0.66, h: 0.1, sweep: 0.35 },
      anal: { t0: 0.7, t1: 0.82, h: 0.085, sweep: 0.3 },
      caudal: { h: 0.27, notch: 0.22, lobe: 0 },
      pect: 0.13,
      pelv: 0.115,
      cDorsal: "#6d6a3a",
      cCaudal: "#9a6a3a",
      cAnal: "#a47c44",
      cPelv: "#b0864a",
      cPect: "#a8804a",
    },
    barbels: 2,
  },
};

/* =========================================================================
 *  Geometria
 * ========================================================================= */
const TEX_W = 1024;
const TEX_H = 1024;

/** komórki płetw/oczu w dolnej połowie tekstury (4 x 2 po 256 px) */
function cellUV(col: number, row: number): [number, number, number, number] {
  const e = 1.5 / TEX_W;
  return [col / 4 + e, 0.5 - (row + 1) * 0.25 + e, (col + 1) / 4 - e, 0.5 - row * 0.25 - e];
}
const CELL = { caudal: cellUV(0, 0), dorsal: cellUV(1, 0), anal: cellUV(2, 0), pect: cellUV(3, 0), pelv: cellUV(0, 1), eye: cellUV(1, 1) };

function cr(p0: number, p1: number, p2: number, p3: number, f: number) {
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}
function profileAt(def: SpeciesDef, t: number): [number, number, number] {
  const rows = def.prof;
  let i = 0;
  while (i < rows.length - 2 && t > rows[i + 1][0]) i++;
  const a = rows[Math.max(0, i - 1)], b = rows[i], c = rows[i + 1], d = rows[Math.min(rows.length - 1, i + 2)];
  const f = Math.min(1, Math.max(0, (t - b[0]) / (c[0] - b[0])));
  return [Math.max(0, cr(a[1], b[1], c[1], d[1], f)), Math.max(0, cr(a[2], b[2], c[2], d[2], f)), Math.max(0, cr(a[3], b[3], c[3], d[3], f))];
}
const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  part: number[] = [];
  flap: number[] = [];
  idx: number[] = [];
  get n() {
    return this.pos.length / 3;
  }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, part: number, flap = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.part.push(part);
    this.flap.push(flap);
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aPart", new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute("aFlap", new THREE.Float32BufferAttribute(this.flap, 1));
    g.setIndex(this.idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.75);
    return g;
  }
}

type V3 = [number, number, number];

function buildGeometry(def: SpeciesDef): { body: THREE.BufferGeometry; fins: THREE.BufferGeometry } {
  const B = new Builder();
  const nT = 46, nA = 22;
  const e = 2 / def.exp;
  const xAt = (t: number) => 0.5 - def.bodyLen * t;
  interface Ring {
    t: number;
    x: number;
    top: number;
    bot: number;
    hw: number;
    cy: number;
    k: number;
  }
  const rings: Ring[] = [];
  for (let i = 0; i <= nT; i++) {
    const t = Math.pow(i / nT, 1.12);
    const [top, bot, hw] = profileAt(def, t);
    rings.push({ t, x: xAt(t), top, bot, hw, cy: def.snoutLift * (1 - smoothstep(0, 0.13, t)), k: 1 });
  }
  const last = rings[rings.length - 1];
  rings.push({ ...last, x: last.x - 0.004, k: 0 });
  for (const r of rings)
    for (let j = 0; j <= nA; j++) {
      const th = (j / nA) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const y = r.cy + (c >= 0 ? r.top : r.bot) * sgnPow(c, e) * r.k;
      const z = r.hw * sgnPow(s, e) * r.k;
      B.v(r.x, y, z, 0, 0, 0, r.t, 0.5 + 0.5 * (j / nA), 0);
    }
  const W = nA + 1;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < nA; j++) {
      const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
      B.idx.push(a, c, b, b, c, d);
    }
  // normalne ciała (z korektą szwu i końców)
  const tmp = new THREE.BufferGeometry();
  tmp.setAttribute("position", new THREE.Float32BufferAttribute(B.pos.slice(), 3));
  tmp.setIndex(B.idx.slice());
  tmp.computeVertexNormals();
  const tn = tmp.attributes.normal.array as Float32Array;
  for (let k = 0; k < tn.length; k++) B.nor[k] = tn[k];
  tmp.dispose();
  for (let i = 0; i < rings.length; i++) {
    const a = (i * W) * 3, b = (i * W + nA) * 3;
    const nx = B.nor[a] + B.nor[b], ny = B.nor[a + 1] + B.nor[b + 1], nz = B.nor[a + 2] + B.nor[b + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const o of [a, b]) {
      B.nor[o] = nx / l;
      B.nor[o + 1] = ny / l;
      B.nor[o + 2] = nz / l;
    }
  }
  for (let j = 0; j <= nA; j++) {
    const o0 = j * 3, o1 = ((rings.length - 1) * W + j) * 3;
    B.nor[o0] = 1;
    B.nor[o0 + 1] = 0;
    B.nor[o0 + 2] = 0;
    B.nor[o1] = -1;
    B.nor[o1 + 1] = 0;
    B.nor[o1 + 2] = 0;
  }

  // ---- oczy
  const [eu0, ev0, eu1, ev1] = CELL.eye;
  const [etop, , ehw] = profileAt(def, def.eye.t);
  const ex = xAt(def.eye.t), ey = etop * def.eye.up, er = def.eye.r;
  const sph = new THREE.SphereGeometry(1, 16, 12);
  for (const sg of [1, -1]) {
    const base = B.n;
    const p = sph.attributes.position, ix = sph.index!;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
      const lx = dx * sg, ly = dy;
      B.v(ex + dx * er * 1.05, ey + dy * er, sg * (ehw - er * 0.5) + dz * er, dx, dy, dz, eu0 + (0.5 + 0.5 * lx) * (eu1 - eu0), ev0 + (0.5 + 0.5 * ly) * (ev1 - ev0), 1);
    }
    for (let i = 0; i < ix.count; i++) B.idx.push(base + ix.getX(i));
  }
  sph.dispose();

  // ---- wąsy (lin: 1 para, karp: 2 pary)
  for (let k = 0; k < def.barbels; k++)
    for (const sg of [1, -1]) {
      const [, bbot, bhw] = profileAt(def, 0.03);
      const cyl = new THREE.CylinderGeometry(0.0016, 0.0036, 0.032, 5, 1);
      cyl.translate(0, -0.016, 0);
      const pr = cyl.attributes.position, nr = cyl.attributes.normal, ci = cyl.index!;
      const base = B.n;
      const ang = 0.9 + k * 0.5;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const ox = xAt(0.025) + 0.002 - k * 0.012, oy = -bbot * (0.25 + k * 0.2), oz = sg * bhw * (0.6 + k * 0.2);
      for (let i = 0; i < pr.count; i++) {
        // obrót wokół Z: cylinder (oś Y w dół) odchylony do przodu
        const x = pr.getX(i), y = pr.getY(i), z = pr.getZ(i);
        const rx = x * ca - y * sa, ry = x * sa + y * ca;
        const nx = nr.getX(i), ny = nr.getY(i), nz = nr.getZ(i);
        B.v(ox + rx + 0.0, oy + ry, oz + z + sg * 0.004 * Math.abs(y) * 20 * 0.05, nx * ca - ny * sa, nx * sa + ny * ca, nz, 0.06, 0.78, 3);
      }
      for (let i = 0; i < ci.count; i++) B.idx.push(base + ci.getX(i));
      cyl.dispose();
    }

  // ---- płetwy
  const F = new Builder();
  const card = (p0: V3, a: V3, b: V3, nA2: number, nB2: number, cell: [number, number, number, number], flap = 0) => {
    const nx = a[1] * b[2] - a[2] * b[1], ny = a[2] * b[0] - a[0] * b[2], nz = a[0] * b[1] - a[1] * b[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    const base = F.n;
    for (let iv = 0; iv <= nB2; iv++)
      for (let iu = 0; iu <= nA2; iu++) {
        const u = iu / nA2, v = iv / nB2;
        F.v(p0[0] + a[0] * u + b[0] * v, p0[1] + a[1] * u + b[1] * v, p0[2] + a[2] * u + b[2] * v, nx / l, ny / l, nz / l, cell[0] + (cell[2] - cell[0]) * u, cell[1] + (cell[3] - cell[1]) * v, 2, flap * Math.pow(v, 1.3));
      }
    const w = nA2 + 1;
    for (let iv = 0; iv < nB2; iv++)
      for (let iu = 0; iu < nA2; iu++) {
        const i0 = base + iv * w + iu;
        F.idx.push(i0, i0 + 1, i0 + w, i0 + 1, i0 + w + 1, i0 + w);
      }
  };
  const fd = def.fins;
  {
    // grzbietowa
    const [tp0] = profileAt(def, fd.dorsal.t0), [tp1] = profileAt(def, fd.dorsal.t1);
    const P0: V3 = [xAt(fd.dorsal.t0), tp0 - 0.006, 0], P1: V3 = [xAt(fd.dorsal.t1), tp1 - 0.006, 0];
    card(P0, [P1[0] - P0[0], P1[1] - P0[1], 0], [-fd.dorsal.sweep * fd.dorsal.h, fd.dorsal.h, 0], 5, 3, CELL.dorsal);
    // odbytowa
    const [, bt0] = profileAt(def, fd.anal.t0), [, bt1] = profileAt(def, fd.anal.t1);
    const A0: V3 = [xAt(fd.anal.t0), -(bt0 - 0.006), 0], A1: V3 = [xAt(fd.anal.t1), -(bt1 - 0.006), 0];
    card(A0, [A1[0] - A0[0], A1[1] - A0[1], 0], [-fd.anal.sweep * fd.anal.h, -fd.anal.h, 0], 5, 3, CELL.anal);
    // ogonowa
    const x0 = 0.5 - def.bodyLen + 0.032;
    card([x0, -fd.caudal.h / 2, 0], [-(x0 + 0.5), 0, 0], [0, fd.caudal.h, 0], 8, 8, CELL.caudal);
    // piersiowe i brzuszne
    const pt = 0.255;
    const [, pbot, phw] = profileAt(def, pt);
    for (const sg of [1, -1]) {
      const L = fd.pect * 1.15;
      const root: V3 = [xAt(pt), -pbot * 0.5, sg * phw * 0.94];
      const a: V3 = [0, -L * 0.55, 0];
      card([root[0] - a[0] * 0.5, root[1] - a[1] * 0.5, root[2]], a, [-L * 0.9, -L * 0.18, sg * L * 0.78], 4, 4, CELL.pect, sg * 1);
      const vt = 0.47;
      const [, vbot, vhw] = profileAt(def, vt);
      const Lp = fd.pelv;
      const proot: V3 = [xAt(vt), -vbot * 0.97, sg * vhw * 0.5];
      const pa: V3 = [-Lp * 0.5, 0, 0];
      card([proot[0] - pa[0] * 0.5, proot[1], proot[2]], pa, [-Lp * 0.55, -Lp * 0.85, sg * Lp * 0.4], 3, 3, CELL.pelv, sg * 0.6);
    }
  }
  return { body: B.geometry(), fins: F.geometry() };
}

/* =========================================================================
 *  Tekstury
 * ========================================================================= */
function css(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function hexRGB(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function drawFinCell(ctx: CanvasRenderingContext2D, ox: number, oy: number, shape: (c: CanvasRenderingContext2D) => void, color: string, root: [number, number], rays: [number, number][], rnd: () => number, ak = 1) {
  ctx.save();
  ctx.translate(ox, oy);
  const g = ctx.createRadialGradient(root[0], root[1], 6, root[0], root[1], 270);
  g.addColorStop(0, css(color, 0.97 * ak));
  g.addColorStop(0.5, css(color, 0.72 * ak));
  g.addColorStop(1, css(color, 0.4 * ak));
  ctx.fillStyle = g;
  ctx.beginPath();
  shape(ctx);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  shape(ctx);
  ctx.clip();
  for (const [x, y] of rays) {
    ctx.strokeStyle = `rgba(0,0,0,${0.2 + rnd() * 0.16})`;
    ctx.lineWidth = 1.2 + rnd() * 0.9;
    ctx.beginPath();
    ctx.moveTo(root[0] + (rnd() - 0.5) * 6, root[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(root[0] + 3, root[1]);
    ctx.lineTo(x + 3, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = css(color, 0.9 * ak);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  shape(ctx);
  ctx.stroke();
  ctx.restore();
}

function buildTexture(def: SpeciesDef, seed: number): THREE.DataTexture {
  const data = new Uint8Array(TEX_W * TEX_H * 4);
  const sk = def.skin;
  // ---- skóra ciała (górna połowa: V 0.5…1)
  for (let y = 512; y < 1024; y++) {
    const vA = (y - 512) / 511;
    const s = Math.cos(vA * Math.PI * 2);
    const t01 = (s + 1) / 2;
    for (let x = 0; x < 1024; x++) {
      const u = x / 1023;
      const n1 = vnoise(u * 26, vA * 11, seed);
      const n2 = vnoise(u * 150, vA * 60, seed + 1);
      const n3 = vnoise(u * 6, vA * 3, seed + 2);
      const head = 1 - smoothstep(0.1, 0.25, u);
      const t = t01 + head * 0.16 + (n3 - 0.5) * 0.05;
      const wf = smoothstep(0.17, 0.41, t);
      const wb = smoothstep(0.58, 0.84, t);
      let r = sk.belly[0] + (sk.flank[0] - sk.belly[0]) * wf;
      let g = sk.belly[1] + (sk.flank[1] - sk.belly[1]) * wf;
      let b = sk.belly[2] + (sk.flank[2] - sk.belly[2]) * wf;
      r += (sk.back[0] - r) * wb;
      g += (sk.back[1] - g) * wb;
      b += (sk.back[2] - b) * wb;
      // opalizujący połysk górnej części boku
      const sh = smoothstep(0.42, 0.58, t) * (1 - smoothstep(0.64, 0.82, t)) * (0.45 + 0.55 * n3);
      r += (sk.shine[0] - r) * sh * 0.55;
      g += (sk.shine[1] - g) * sh * 0.55;
      b += (sk.shine[2] - b) * sh * 0.55;
      // pokrywa skrzelowa
      const uc = 0.205 + 0.02 * (t01 - 0.5);
      const plate = smoothstep(0.075, 0.12, u) * (1 - smoothstep(uc - 0.006, uc, u)) * smoothstep(0.2, 0.38, t01) * (1 - smoothstep(0.66, 0.8, t01));
      r += (sk.head[0] + 0.12 - r) * plate * 0.55;
      g += (sk.head[1] + 0.12 - g) * plate * 0.55;
      b += (sk.head[2] + 0.12 - b) * plate * 0.55;
      let lum = 0.93 + 0.14 * n1 + (n2 - 0.5) * 0.08;
      const edge = Math.abs(u - uc);
      if (edge < 0.004 && t01 > 0.22 && t01 < 0.8) lum *= 0.55 + 0.45 * (edge / 0.004);
      else if (u > uc && u < uc + 0.012 && t01 > 0.3 && t01 < 0.74) lum *= 1.1;
      // linia boczna
      if (u > 0.21) {
        const ll = 1 - smoothstep(0.003, 0.011, Math.abs(t01 - 0.585));
        lum *= 1 - 0.3 * ll * (0.55 + 0.45 * Math.sin(u * 900));
      }
      // pysk i nozdrza
      if (u < 0.05 && Math.abs(t01 - 0.4) < 0.018) lum *= 0.3;
      if (Math.abs(u - 0.07) < 0.004 && Math.abs(t01 - 0.62) < 0.012) lum *= 0.4;
      // piegi na grzbiecie
      if (t01 > 0.72 && n2 > 0.86) lum *= 0.78;
      const o = (y * TEX_W + x) * 4;
      data[o] = Math.min(255, Math.max(0, Math.pow(r * lum, 1 / 2.2) * 255));
      data[o + 1] = Math.min(255, Math.max(0, Math.pow(g * lum, 1 / 2.2) * 255));
      data[o + 2] = Math.min(255, Math.max(0, Math.pow(b * lum, 1 / 2.2) * 255));
      data[o + 3] = 255;
    }
  }
  // ---- płetwy i oko (canvas 1024 x 512 → dolna połowa)
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const rnd = mulberry32(seed * 7 + 3);
  const fd = def.fins;
  const notchX = 256 * (1 - fd.caudal.notch);
  const upTip = 8 + fd.caudal.lobe * 0, loTip = 248 - fd.caudal.lobe * 36;
  const caudalPath = (g: CanvasRenderingContext2D) => {
    g.moveTo(4, 112);
    g.quadraticCurveTo(100, 92, 246, upTip + 6);
    g.quadraticCurveTo(Math.max(notchX + 28, 150), 94, notchX, 128);
    g.quadraticCurveTo(Math.max(notchX + 28, 150), 164, 246, loTip - 4);
    g.quadraticCurveTo(100, 164, 4, 144);
    g.closePath();
  };
  const raysCaudal: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    raysCaudal.push(f < 0.5 ? [246 - (246 - notchX) * (f * 2) * 0.9, upTip + 6 + (128 - upTip - 6) * (f * 2)] : [notchX + (246 - notchX) * ((f - 0.5) * 2) * 0.9, 128 + (loTip - 4 - 128) * ((f - 0.5) * 2)]);
  }
  drawFinCell(ctx, 0, 0, caudalPath, fd.cCaudal, [4, 128], raysCaudal, rnd);
  const edgeRays = (p0: [number, number], p1: [number, number], p2: [number, number], n: number, base: (t: number) => [number, number]) => {
    const out: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const e = [(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]] as [number, number];
      void base;
      out.push(e);
    }
    return out;
  };
  const dRays = edgeRays([30, 18], [120, 66], [246, 176], 9, () => [0, 0]);
  const dRoot: [number, number] = [128, 252];
  drawFinCell(ctx, 256, 0, (g) => { g.moveTo(8, 250); g.lineTo(30, 18); g.quadraticCurveTo(120, 66, 246, 176); g.lineTo(246, 250); g.closePath(); }, fd.cDorsal, dRoot, dRays, rnd);
  const aRays = edgeRays([40, 40], [150, 70], [246, 200], 8, () => [0, 0]);
  drawFinCell(ctx, 512, 0, (g) => { g.moveTo(8, 250); g.lineTo(40, 40); g.quadraticCurveTo(150, 70, 246, 200); g.lineTo(246, 250); g.closePath(); }, fd.cAnal, dRoot, aRays, rnd);
  const pRays: [number, number][] = [];
  for (let i = 0; i <= 9; i++) {
    const a = Math.PI * (0.12 + 0.76 * (i / 9));
    pRays.push([128 - Math.cos(a) * 118, 250 - Math.sin(a) * 236]);
  }
  drawFinCell(ctx, 768, 0, (g) => { g.moveTo(112, 250); g.quadraticCurveTo(10, 150, 30, 60); g.quadraticCurveTo(128, 0, 226, 60); g.quadraticCurveTo(246, 150, 144, 250); g.closePath(); }, fd.cPect, [128, 250], pRays, rnd, 0.5);
  drawFinCell(ctx, 0, 256, (g) => { g.moveTo(100, 250); g.quadraticCurveTo(20, 130, 40, 50); g.quadraticCurveTo(140, 10, 220, 90); g.quadraticCurveTo(236, 170, 156, 250); g.closePath(); }, fd.cPelv, [128, 250], pRays, rnd, 0.75);
  // oko
  {
    ctx.save();
    ctx.translate(256, 256);
    ctx.fillStyle = "#0d0b09";
    ctx.fillRect(0, 0, 256, 256);
    const ig = ctx.createRadialGradient(128, 128, 20, 128, 128, 112);
    ig.addColorStop(0, css(def.eye.iris, 1));
    ig.addColorStop(0.7, css(def.eye.iris, 1));
    ig.addColorStop(1, css(def.eye.ring, 1));
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.fill();
    if (def.eye.crescent) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(128, 128, 112, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = css(def.eye.crescent, 0.7);
      ctx.beginPath();
      ctx.arc(128, 70, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(20,10,5,0.9)";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(128, 128, 109, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#050403";
    ctx.beginPath();
    ctx.arc(128, 132, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(104, 104, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(152, 152, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, 1024, 512).data;
  const fill = hexRGB(fd.cDorsal).map((v) => Math.round(v * 255));
  for (let cy = 0; cy < 512; cy++)
    for (let x = 0; x < 1024; x++) {
      const s = (cy * 1024 + x) * 4;
      const d = ((511 - cy) * TEX_W + x) * 4;
      const a = img[s + 3];
      if (a < 20) {
        data[d] = fill[0];
        data[d + 1] = fill[1];
        data[d + 2] = fill[2];
        data[d + 3] = 0;
      } else {
        data[d] = img[s];
        data[d + 1] = img[s + 1];
        data[d + 2] = img[s + 2];
        data[d + 3] = a;
      }
    }
  const t = new THREE.DataTexture(data, TEX_W, TEX_H, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/* =========================================================================
 *  Materiały (falowanie ciała, łuski, połysk)
 * ========================================================================= */
function fishExtra(s: ShaderParts, def: SpeciesDef, body: boolean) {
  s.uniforms.uScaleUV = { value: new THREE.Vector2(def.scales[0], def.scales[1]) };
  s.uniforms.uScaleAmp = { value: def.scaleAmp };
  s.uniforms.uSheen = { value: def.sheen };
  s.uniforms.uHazeCol = uwUniforms.uHazeCol;
  s.uniforms.uSkyCol = uwUniforms.uSkyCol;
  s.vertexShader = s.vertexShader
    .replace("#include <common>", "#include <common>\nattribute vec4 aSwim; attribute float aPart; attribute float aFlap; varying float vPart;")
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vPart = aPart;
      {
        float xn = clamp(0.5 - transformed.x, 0.0, 1.0);
        float ph = aSwim.x + uTime * aSwim.y;
        float env = 0.012 + 0.28 * xn * xn;
        transformed.z += aSwim.z * env * sin(ph - xn * 5.4) + aSwim.w * xn * xn * 0.5;
        transformed.z += aFlap * sin(ph * 0.75 + 1.3) * (0.03 + 0.03 * aSwim.z);
        transformed.y += abs(aFlap) * 0.01 * sin(ph * 0.75);
      }`
    );
  const scaleCode = body
    ? `
    if (vPart < 0.5) {
      vec2 uvb = vec2(vMapUv.x, (vMapUv.y - 0.5) * 2.0);
      vec2 gq = uvb * uScaleUV;
      gq.x += 0.5 * mod(floor(gq.y), 2.0);
      vec2 fq = fract(gq);
      float dq = length((fq - vec2(0.5, 0.12)) * vec2(1.0, 0.82));
      float arc = 1.0 - smoothstep(0.0, 0.07, abs(dq - 0.56));
      float dome = clamp(0.62 - dq, 0.0, 0.62);
      float distF = length(vWPos - cameraPosition);
      float lod = 1.0 - smoothstep(2.0, 8.0, distF);
      float headFade = smoothstep(0.17, 0.27, uvb.x);
      float lumS = 1.0 + uScaleAmp * (dome * 0.35 - arc * 0.34);
      diffuseColor.rgb *= mix(1.0, lumS, lod * headFade);
      fishH = (dome - 0.3) * uScaleAmp * 0.00055 * lod * headFade;
    }`
    : "";
  s.fragmentShader = s.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vPart; uniform vec2 uScaleUV; uniform float uScaleAmp; uniform float uSheen; uniform vec3 uHazeCol; uniform vec3 uSkyCol;")
    .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>\n float fishH = 0.0;\n${scaleCode}`)
    .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n ${body ? "if (vPart > 0.5 && vPart < 1.5) roughnessFactor = 0.07;" : ""}`)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n ${body ? "if (vPart < 0.5) normal = bumpPerturb(-vViewPosition, normal, fishH, faceDirection);" : ""}`)
    .replace(
      "#include <opaque_fragment>",
      `{
        float dW = max(0.0, -vWPos.y);
        if (dW > 0.0 && cameraPosition.y > 0.0) {
          vec3 Vv = normalize(cameraPosition - vWPos);
          float cosV = clamp(Vv.y, 0.04, 1.0);
          float cosR = sqrt(max(0.0, 1.0 - (1.0 - cosV * cosV) / 1.78));
          float hz = 1.0 - exp(-(dW / max(cosR, 0.22)) * 0.36);
          float Fr = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
          outgoingLight = mix(outgoingLight, uHazeCol, hz * 0.9);
          outgoingLight = mix(outgoingLight, uSkyCol * 0.55, Fr);
        }
      }
      #include <opaque_fragment>`
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - ndv, 3.0);
        ${body ? "float skin = step(vPart, 0.5);" : "float skin = 0.0;"}
        totalEmissiveRadiance += diffuseColor.rgb * fres * uSheen * 0.55 * skin;
      }`
    );
}

/* =========================================================================
 *  Zestaw instancji jednego gatunku
 * ========================================================================= */
export class FishSet {
  body: THREE.InstancedMesh;
  fins: THREE.InstancedMesh;
  swim: THREE.InstancedBufferAttribute;
  n = 0;
  private geos: THREE.BufferGeometry[];
  private mats: THREE.Material[];
  private tex: THREE.Texture;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(public species: RigSpecies, public max: number, shadows: boolean) {
    const def = RIG[species];
    const g = buildGeometry(def);
    this.tex = buildTexture(def, 11 + species.length * 5);
    const bodyMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.3, metalness: 0.12, transparent: true, depthWrite: true });
    const finMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, transparent: true, depthWrite: false, alphaTest: 0.03 });
    patchMaterial(bodyMat, { uw: true, detail: 0, key: "fb" + species, extra: (s) => fishExtra(s, def, true) });
    patchMaterial(finMat, { uw: true, detail: 0, key: "ff" + species, extra: (s) => fishExtra(s, def, false) });
    this.swim = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.swim.setUsage(THREE.DynamicDrawUsage);
    g.body.setAttribute("aSwim", this.swim);
    g.fins.setAttribute("aSwim", this.swim);
    this.body = new THREE.InstancedMesh(g.body, bodyMat, max);
    this.fins = new THREE.InstancedMesh(g.fins, finMat, max);
    for (const mesh of [this.body, this.fins]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    }
    this.body.castShadow = shadows;
    this.body.receiveShadow = false;
    this.body.renderOrder = 6;
    this.fins.renderOrder = 7;
    this.geos = [g.body, g.fins];
    this.mats = [bodyMat, finMat];
  }

  /** yaw – kierunek ruchu (rad, wokół Y), pitch – nos w górę, roll – przechył; len – długość ryby (m) */
  set(i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, len: number, phase: number, freq: number, amp: number, bend: number, tint: number) {
    this.e.set(roll, yaw, pitch, "YZX");
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.sc.setScalar(len);
    this.m.compose(this.p, this.q, this.sc);
    this.body.setMatrixAt(i, this.m);
    this.fins.setMatrixAt(i, this.m);
    this.swim.setXYZW(i, phase, freq, amp, bend);
    this.col.setScalar(tint);
    this.body.setColorAt(i, this.col);
    this.fins.setColorAt(i, this.col);
  }

  commit(n: number) {
    this.n = n;
    for (const mesh of [this.body, this.fins]) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.swim.needsUpdate = true;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
    this.body.dispose();
    this.fins.dispose();
  }
}
