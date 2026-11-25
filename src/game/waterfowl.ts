import * as THREE from "three";
import type { World } from "./world";
import { mulberry32, clamp } from "./noise";
import { mergeParts, paint } from "./geoutil";

function ellipsoid(sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, ry = 0, rz = 0): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 9);
  g.scale(sx, sy, sz);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, color);
}

function duckGeometry(drake: boolean): THREE.BufferGeometry {
  const body = drake ? "#9a9c98" : "#8a6a48";
  const chest = drake ? "#6b402c" : "#7f5c3c";
  const head = drake ? "#1d5a3c" : "#8d6a46";
  const parts: THREE.BufferGeometry[] = [
    ellipsoid(0.27, 0.12, 0.15, 0, 0.1, 0, body),
    ellipsoid(0.14, 0.11, 0.13, 0.15, 0.14, 0, chest),
    ellipsoid(0.13, 0.05, 0.09, -0.26, 0.16, 0, drake ? "#1c1c1c" : "#6e5236", 0, 0.5),
    ellipsoid(0.04, 0.12, 0.04, 0.2, 0.26, 0, drake ? "#1d5a3c" : "#8d6a46", 0, -0.25),
    ellipsoid(0.07, 0.055, 0.055, 0.25, 0.37, 0, head),
    ellipsoid(0.05, 0.012, 0.03, 0.33, 0.355, 0, drake ? "#e0c038" : "#c88a30"),
    ellipsoid(0.056, 0.012, 0.056, 0.2, 0.31, 0, "#f0f0ec"),
  ];
  if (drake) parts.push(ellipsoid(0.1, 0.05, 0.1, -0.05, 0.19, 0, "#7d8084", 0, 0));
  else parts.push(ellipsoid(0.08, 0.03, 0.1, -0.05, 0.21, 0, "#9a7b55"));
  return mergeParts(parts)!;
}

interface Duck {
  g: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  retarget: number;
  speed: number;
  phase: number;
  cx: number;
  cz: number;
}

export class Waterfowl {
  group = new THREE.Group();
  private ducks: Duck[] = [];
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  private geos: THREE.BufferGeometry[] = [];

  constructor(private world: World, count: number) {
    this.geos = [duckGeometry(true), duckGeometry(false)];
    const rnd = mulberry32(77);
    const bb = world.lakeBBox;
    const sp = world.spawn;
    let tries = 0;
    while (this.ducks.length < count && tries++ < 900) {
      const gx = bb[0] + rnd() * (bb[2] - bb[0]), gz = bb[1] + rnd() * (bb[3] - bb[1]);
      if (world.heightAt(gx, gz) > -1.0 || world.sdfAt(gx, gz) > -14 || Math.hypot(gx - sp.x, gz - sp.z) < 40) continue;
      const n = Math.min(count - this.ducks.length, 2 + Math.floor(rnd() * 3));
      for (let k = 0; k < n; k++) {
        const x = gx + (rnd() - 0.5) * 5, z = gz + (rnd() - 0.5) * 5;
        if (world.heightAt(x, z) > -0.8) continue;
        const mesh = new THREE.Mesh(this.geos[k === 0 || rnd() < 0.4 ? 0 : 1], this.mat);
        mesh.castShadow = false;
        const d: Duck = { g: mesh, x, z, heading: rnd() * 6.28, tx: x, tz: z, retarget: rnd() * 6, speed: 0.3, phase: rnd() * 6, cx: gx, cz: gz };
        this.ducks.push(d);
        this.group.add(mesh);
      }
    }
  }

  update(t: number, dt: number, px: number, pz: number) {
    const w = this.world;
    for (const d of this.ducks) {
      d.retarget -= dt;
      const dp = Math.hypot(d.x - px, d.z - pz);
      let spd = 0.32;
      if (dp < 15) {
        // ucieczka przed graczem
        const ax = d.x - px, az = d.z - pz;
        const l = Math.hypot(ax, az) || 1;
        d.tx = d.x + (ax / l) * 25;
        d.tz = d.z + (az / l) * 25;
        spd = 1.5;
        d.retarget = 3;
      } else if (d.retarget <= 0) {
        d.retarget = 6 + Math.random() * 9;
        const a = Math.random() * 6.28, r = 4 + Math.random() * 20;
        d.tx = d.cx + Math.cos(a) * r;
        d.tz = d.cz + Math.sin(a) * r;
      }
      let dx = d.tx - d.x, dz = d.tz - d.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.5) {
        dx /= dl;
        dz /= dl;
        const want = Math.atan2(-dz, dx);
        let da = want - d.heading;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        d.heading += da * Math.min(1, dt * 2.5);
        const nx = d.x + Math.cos(d.heading) * spd * dt, nz = d.z - Math.sin(d.heading) * spd * dt;
        if (w.heightAt(nx, nz) < -0.8 && w.pierDeckAt(nx, nz) < -1e8) {
          d.x = nx;
          d.z = nz;
        } else {
          d.retarget = 0;
          d.heading += 0.8;
        }
      }
      const bob = Math.sin(t * 1.6 + d.phase) * 0.012;
      d.g.position.set(d.x, -0.045 + bob, d.z);
      d.g.rotation.set(Math.sin(t * 1.1 + d.phase) * 0.04, d.heading, clamp(spd - 0.3, 0, 1) * -0.08, "YXZ");
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.mat.dispose();
  }
}
