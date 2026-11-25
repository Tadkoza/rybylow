import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** akumulator trójkątów (płaskie cieniowanie, współrzędne UV, kolor wierzchołków) */
export class Acc {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  count = 0;
  tri(p0: number[], p1: number[], p2: number[], n: number[] | null, uv0: number[], uv1: number[], uv2: number[], c: THREE.Color) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l;
    ny /= l;
    nz /= l;
    let a = p1, b = p2, ua = uv1, ub = uv2;
    if (n && nx * n[0] + ny * n[1] + nz * n[2] < 0) {
      a = p2;
      b = p1;
      ua = uv2;
      ub = uv1;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    for (const [p, t] of [[p0, uv0], [a, ua], [b, ub]] as [number[], number[]][]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.uv.push(t[0], t[1]);
      this.col.push(c.r, c.g, c.b);
    }
    this.count += 3;
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.count) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

export function paint(g: THREE.BufferGeometry, color: THREE.Color | string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  return g;
}

const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);

/** belka o długości len wzdłuż kierunku (dx,dy,dz) ze środkiem w (cx,cy,cz) */
export function beam(len: number, h: number, w: number, cx: number, cy: number, cz: number, dx: number, dy: number, dz: number, color: THREE.Color | string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(len, h, w);
  _q.setFromUnitVectors(_x, new THREE.Vector3(dx, dy, dz).normalize());
  _m.compose(_p.set(cx, cy, cz), _q, _s);
  g.applyMatrix4(_m);
  return paint(g, color);
}

export function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, color: string, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return paint(g, color);
}

/** scala geometrie do jednej (bez indeksów; zostają pozycja, normalne, kolor i opcjonalnie uv) */
export function mergeParts(parts: THREE.BufferGeometry[], uv = false): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const keep = uv ? ["position", "normal", "color", "uv"] : ["position", "normal", "color"];
  const list = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!keep.includes(k)) n.deleteAttribute(k);
    return n;
  });
  return mergeGeometries(list, false);
}
