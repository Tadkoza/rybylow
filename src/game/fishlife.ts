import * as THREE from "three";
import type { World } from "./world";
import { FishSet, RigSpecies } from "./fishrig";

/**
 * Życie ryb w jeziorze: stada płoci i wzdręg tuż pod powierzchnią (po ok. 10 małych sztuk),
 * pojedyncze, rzadko widywane leszcze i liny. Ryby reagują na gracza i przynętę,
 * a ta, która bierze, jest tą samą rybą, którą potem holujemy.
 */
export type FishMode = "school" | "approach" | "hooked" | "flee";

export interface Fish {
  id: number;
  sp: RigSpecies;
  school: School | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  len: number;
  phase: number;
  freq: number;
  amp: number;
  bend: number;
  tint: number;
  off: [number, number];
  dy: number;
  mode: FishMode;
  tx: number;
  ty: number;
  tz: number;
  burst: number;
  fleeT: number;
  alive: boolean;
}

interface School {
  sp: RigSpecies;
  fish: Fish[];
  x: number;
  z: number;
  yaw: number;
  speed: number;
  depthY: number;
  wanderT: number;
  turn: number;
  shy: number;
  interest: boolean;
  attractT: number;
  surf: number;
  surfT: number;
  ripT: number;
  life: number;
}

interface SpDef {
  schools: number;
  count: [number, number];
  len: [number, number];
  speed: number;
  y: [number, number];
  minW: number;
  maxW: number;
  spread: number;
  dist: [number, number];
  bottom: boolean;
}

const DEF: Record<RigSpecies, SpDef> = {
  ploc: { schools: 3, count: [8, 12], len: [0.11, 0.19], speed: 0.3, y: [-0.16, -0.8], minW: 0.7, maxW: 5, spread: 0.95, dist: [7, 48], bottom: false },
  wzdrega: { schools: 3, count: [7, 11], len: [0.1, 0.18], speed: 0.24, y: [-0.07, -0.34], minW: 0.55, maxW: 3.2, spread: 0.85, dist: [6, 44], bottom: false },
  leszcz: { schools: 1, count: [1, 3], len: [0.28, 0.46], speed: 0.3, y: [-0.7, -2.2], minW: 1.3, maxW: 6, spread: 1.5, dist: [20, 85], bottom: false },
  lin: { schools: 1, count: [1, 1], len: [0.26, 0.42], speed: 0.15, y: [-9, -9], minW: 0.8, maxW: 3.2, spread: 0, dist: [16, 75], bottom: true },
  karp: { schools: 0, count: [1, 1], len: [0.4, 0.7], speed: 0.3, y: [-1, -2], minW: 1.2, maxW: 5, spread: 0, dist: [20, 60], bottom: false },
};
const ORDER: RigSpecies[] = ["ploc", "wzdrega", "leszcz", "lin", "karp"];
const CAP: Record<RigSpecies, number> = { ploc: 72, wzdrega: 72, leszcz: 20, lin: 14, karp: 10 };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export interface CamInfo {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class FishLife {
  group = new THREE.Group();
  onRipple: ((x: number, z: number, size: number) => void) | null = null;
  private sets = {} as Record<RigSpecies, FishSet>;
  private schools: School[] = [];
  private loose: Fish[] = [];
  private nextId = 1;
  private lure = { x: 0, z: 0, on: false };
  private first = true;
  private spawnT = 6;
  private mult: number;

  constructor(private w: World, o: { amount: number; shadows: boolean }) {
    this.mult = o.amount;
    for (const sp of ORDER) {
      this.sets[sp] = new FishSet(sp, CAP[sp], o.shadows);
      this.group.add(this.sets[sp].body, this.sets[sp].fins);
    }
  }

  // ------------------------------------------------------------- tworzenie
  private makeFish(sp: RigSpecies, len: number, x: number, z: number, y: number, yaw: number): Fish {
    return {
      id: this.nextId++,
      sp,
      school: null,
      x,
      y,
      z,
      yaw,
      pitch: 0,
      roll: 0,
      speed: DEF[sp].speed,
      len,
      phase: Math.random() * 6.28,
      freq: 12,
      amp: 0.5,
      bend: 0,
      tint: 0.92 + Math.random() * 0.16,
      off: [0, 0],
      dy: (Math.random() - 0.5) * 0.18,
      mode: "school",
      tx: x,
      ty: y,
      tz: z,
      burst: 0,
      fleeT: 0,
      alive: true,
    };
  }

  private depthAt(x: number, z: number) {
    return -this.w.heightAt(x, z);
  }

  private spot(sp: RigSpecies, cam: CamInfo, near: boolean): { x: number; z: number } | null {
    const d = DEF[sp];
    const fa = Math.atan2(-Math.cos(cam.yaw), -Math.sin(cam.yaw));
    for (let i = 0; i < 70; i++) {
      const a = fa + (Math.random() - 0.5) * 2 * (near ? 0.95 : Math.PI);
      const r = rnd(d.dist[0], d.dist[1]) * (near ? 0.75 : 1);
      const x = cam.x + Math.cos(a) * r, z = cam.z + Math.sin(a) * r;
      const dep = this.depthAt(x, z);
      if (dep < d.minW || dep > d.maxW) continue;
      if (this.w.sdfAt(x, z) > -2.5) continue;
      if (this.w.pierDeckAt(x, z) > -1e8) continue;
      return { x, z };
    }
    return null;
  }

  private spawnSchool(sp: RigSpecies, cam: CamInfo, near: boolean): School | null {
    const d = DEF[sp];
    const at = this.spot(sp, cam, near);
    if (!at) return null;
    const n = Math.round(rnd(d.count[0], d.count[1] + 0.49));
    const size = Math.random();
    const s: School = {
      sp,
      fish: [],
      x: at.x,
      z: at.z,
      yaw: Math.random() * 6.28,
      speed: d.speed,
      depthY: rnd(d.y[0], d.y[1]),
      wanderT: 0,
      turn: 0,
      shy: 0,
      interest: false,
      attractT: 0,
      surf: 0,
      surfT: rnd(4, 12),
      ripT: 0,
      life: rnd(70, 160),
    };
    for (let i = 0; i < n; i++) {
      const f = this.makeFish(sp, d.len[0] + (d.len[1] - d.len[0]) * clamp(size + (Math.random() - 0.5) * 0.3, 0, 1), at.x, at.z, s.depthY, s.yaw);
      const r = d.spread * Math.sqrt(Math.random()), a = Math.random() * 6.28;
      f.off = [Math.cos(a) * r * 1.3, Math.sin(a) * r];
      f.x = at.x + Math.cos(s.yaw) * f.off[0] + Math.sin(s.yaw) * f.off[1];
      f.z = at.z - Math.sin(s.yaw) * f.off[0] + Math.cos(s.yaw) * f.off[1];
      f.school = s;
      s.fish.push(f);
    }
    this.schools.push(s);
    return s;
  }

  private relocate(s: School, cam: CamInfo) {
    const at = this.spot(s.sp, cam, DEF[s.sp].dist[1] < 60);
    if (!at) return;
    s.x = at.x;
    s.z = at.z;
    s.life = rnd(70, 160);
    s.yaw = Math.random() * 6.28;
    for (const f of s.fish) {
      f.x = at.x + Math.cos(s.yaw) * f.off[0] + Math.sin(s.yaw) * f.off[1];
      f.z = at.z - Math.sin(s.yaw) * f.off[0] + Math.cos(s.yaw) * f.off[1];
      const bed = this.w.heightAt(f.x, f.z);
      f.y = Math.min(-0.05 - f.len * 0.1, Math.max(f.y, bed + 0.12 + f.len * 0.25));
    }
  }

  // ----------------------------------------------------------------- API
  setLure(x: number, z: number, on: boolean) {
    this.lure.x = x;
    this.lure.z = z;
    this.lure.on = on;
  }

  /** przynęta wylądowała: stada w pobliżu decydują, czy są zainteresowane */
  lureLanded(x: number, z: number, bait: string) {
    for (const s of this.schools) {
      if (Math.hypot(s.x - x, s.z - z) > 26) continue;
      const base = s.sp === "ploc" || s.sp === "wzdrega" ? (bait === "maggot" ? 0.9 : 0.65) : s.sp === "leszcz" ? (bait === "worm" ? 0.55 : 0.4) : 0.35;
      s.interest = Math.random() < base;
      s.attractT = s.interest ? 25 : 0;
    }
  }

  countNear(x: number, z: number, r: number, sp?: RigSpecies): number {
    let n = 0;
    const test = (f: Fish) => {
      if (f.alive && (f.mode === "school" || f.mode === "approach") && (!sp || f.sp === sp) && Math.hypot(f.x - x, f.z - z) < r) n++;
    };
    for (const s of this.schools) for (const f of s.fish) test(f);
    for (const f of this.loose) test(f);
    return n;
  }

  nearest(x: number, z: number, r: number, sp?: RigSpecies): Fish | null {
    let best: Fish | null = null;
    let bd = r;
    const test = (f: Fish) => {
      if (!f.alive || f.mode === "hooked" || f.mode === "flee" || (sp && f.sp !== sp)) return;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < bd) {
        bd = d;
        best = f;
      }
    };
    for (const s of this.schools) for (const f of s.fish) test(f);
    for (const f of this.loose) test(f);
    return best;
  }

  private detach(f: Fish) {
    if (f.school) {
      const i = f.school.fish.indexOf(f);
      if (i >= 0) f.school.fish.splice(i, 1);
      f.school = null;
    }
    if (!this.loose.includes(f)) this.loose.push(f);
  }

  /** ryba odrywa się od stada i płynie do przynęty */
  claim(f: Fish, x: number, y: number, z: number) {
    this.detach(f);
    f.mode = "approach";
    f.tx = x;
    f.ty = y;
    f.tz = z;
  }

  /** ryba spoza stada pojawia się przy przynęcie (z głębi, od strony otwartej wody) */
  spawnNear(sp: RigSpecies, len: number, x: number, z: number, from: { x: number; z: number }): Fish {
    let ang = Math.atan2(z - from.z, x - from.x);
    let px = x, pz = z;
    const wantD = 3.2;
    for (let i = 0; i < 12; i++) {
      const a = ang + (Math.random() - 0.5) * 1.6;
      const tx = x + Math.cos(a) * wantD, tz = z + Math.sin(a) * wantD;
      if (this.depthAt(tx, tz) > 0.45) {
        px = tx;
        pz = tz;
        ang = a;
        break;
      }
    }
    const dep = this.depthAt(px, pz);
    const f = this.makeFish(sp, len, px, pz, -Math.max(0.2, dep - 0.2), Math.atan2(-(z - pz), x - px));
    this.loose.push(f);
    f.mode = "approach";
    f.tx = x;
    f.ty = -0.3;
    f.tz = z;
    return f;
  }

  approach(f: Fish, x: number, y: number, z: number) {
    f.tx = x;
    f.ty = y;
    f.tz = z;
  }

  peck(f: Fish) {
    f.burst = 0.32;
  }

  flee(f: Fish, fromX: number, fromZ: number) {
    this.detach(f);
    f.mode = "flee";
    f.fleeT = 2.2;
    f.yaw = Math.atan2(-(f.z - fromZ), f.x - fromX) + (Math.random() - 0.5) * 0.7;
    f.burst = 0.5;
  }

  hook(f: Fish) {
    this.detach(f);
    f.mode = "hooked";
  }

  drive(f: Fish, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, intensity: number, bend: number) {
    f.x = x;
    f.y = y;
    f.z = z;
    f.yaw = yaw;
    f.pitch = pitch;
    f.roll = roll;
    f.freq = 6.28 * (2.2 + 3.6 * intensity);
    f.amp = 0.5 + 0.9 * intensity;
    f.bend = bend;
  }

  remove(f: Fish) {
    f.alive = false;
    const i = this.loose.indexOf(f);
    if (i >= 0) this.loose.splice(i, 1);
    if (f.school) {
      const j = f.school.fish.indexOf(f);
      if (j >= 0) f.school.fish.splice(j, 1);
    }
  }

  setReflectionMode(on: boolean) {
    this.group.visible = !on;
  }

  /** ustawia stado przed kamerą: pierwszy punkt od `from` metrów, gdzie woda jest dość głęboka */
  private placeNear(s: School, cam: CamInfo, k: number, from: number): boolean {
    const fa = Math.atan2(-Math.cos(cam.yaw), -Math.sin(cam.yaw)) + k;
    for (let d = from; d < 34; d += 0.5) {
      const x = cam.x + Math.cos(fa) * d, z = cam.z + Math.sin(fa) * d;
      if (this.depthAt(x, z) >= DEF[s.sp].minW + 0.08 && this.w.sdfAt(x, z) < -1.2 && this.w.pierDeckAt(x, z) < -1e8) {
        s.x = x;
        s.z = z;
        for (const f of s.fish) {
          f.x = x + Math.cos(s.yaw) * f.off[0] + Math.sin(s.yaw) * f.off[1];
          f.z = z - Math.sin(s.yaw) * f.off[0] + Math.cos(s.yaw) * f.off[1];
          // głębokość dopasowana do nowego miejsca (żeby ryby nie startowały pod dnem)
          const bed = this.w.heightAt(f.x, f.z);
          f.y = Math.min(-0.05 - f.len * 0.1, Math.max(s.depthY + f.dy, bed + 0.12 + f.len * 0.25));
        }
        return true;
      }
    }
    return false;
  }

  /** testy / zrzuty: ustawia stada płoci i wzdręg przed kamerą */
  debugPlace(cam: CamInfo, dist: number) {
    for (const s of this.schools) {
      if (s.sp !== "ploc" && s.sp !== "wzdrega") continue;
      this.placeNear(s, cam, s.sp === "ploc" ? -0.3 : 0.3, dist);
      s.shy = 0;
    }
  }

  // ------------------------------------------------------------- aktualizacja
  update(dt: number, t: number, cam: CamInfo) {
    dt = Math.min(dt, 0.05);
    // utrzymanie liczby stad
    if (this.first) {
      this.first = false;
      for (const sp of ORDER) {
        const n = Math.round(DEF[sp].schools * this.mult);
        for (let i = 0; i < n; i++) this.spawnSchool(sp, cam, sp === "ploc" || sp === "wzdrega");
      }
      // przy starcie zawsze widać po jednym stadzie płoci i wzdręg tuż przy brzegu
      let pl = false, wz = false;
      for (const s of this.schools) {
        if (s.sp === "ploc" && !pl) pl = this.placeNear(s, cam, -0.3, 4.5);
        else if (s.sp === "wzdrega" && !wz) wz = this.placeNear(s, cam, 0.3, 5.5);
      }
    }
    for (const s of this.schools) {
      this.updateSchool(s, dt, cam);
      s.life -= dt;
      const far = Math.hypot(s.x - cam.x, s.z - cam.z);
      if (far > 125 || (s.life <= 0 && far > 30)) this.relocate(s, cam);
    }
    // sprzątanie pustych stad i uzupełnianie liczebności
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      this.schools = this.schools.filter((s) => s.fish.length > 0);
      for (const sp of ORDER) {
        const want = Math.round(DEF[sp].schools * this.mult);
        const have = this.schools.filter((s) => s.sp === sp).length;
        if (have < want) this.spawnSchool(sp, cam, false);
      }
    }
    // ryby luzem
    for (let i = this.loose.length - 1; i >= 0; i--) {
      const f = this.loose[i];
      if (!f.alive) continue;
      if (f.mode === "approach") this.updateApproach(f, dt);
      else if (f.mode === "flee") {
        this.updateFlee(f, dt);
        if (f.fleeT <= 0) this.rejoin(f);
      }
    }
    this.render(t);
  }

  private rejoin(f: Fish) {
    const i = this.loose.indexOf(f);
    if (i >= 0) this.loose.splice(i, 1);
    // dołącz do najbliższego stada tego samego gatunku albo utwórz własne
    let best: School | null = null;
    let bd = 20;
    for (const s of this.schools) {
      if (s.sp !== f.sp) continue;
      const d = Math.hypot(s.x - f.x, s.z - f.z);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (!best) {
      best = { sp: f.sp, fish: [], x: f.x, z: f.z, yaw: f.yaw, speed: DEF[f.sp].speed, depthY: f.y, wanderT: 0, turn: 0, shy: 0, interest: false, attractT: 0, surf: 0, surfT: rnd(4, 12), ripT: 0, life: rnd(40, 80) };
      this.schools.push(best);
    }
    f.mode = "school";
    f.school = best;
    f.off = [(Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.6];
    best.fish.push(f);
    best.yaw = f.yaw;
  }

  private probeOK(sp: RigSpecies, x: number, z: number, yaw: number, look: number) {
    const px = x + Math.cos(yaw) * look, pz = z - Math.sin(yaw) * look;
    const d = DEF[sp];
    const dep = this.depthAt(px, pz);
    return dep > d.minW * 0.85 && dep < d.maxW + 3 && this.w.sdfAt(px, pz) < -1.2;
  }

  private updateSchool(s: School, dt: number, cam: CamInfo) {
    const d = DEF[s.sp];
    if (!s.fish.length) return;
    const dcx = s.x - cam.x, dcz = s.z - cam.z;
    const dc = Math.hypot(dcx, dcz);
    if (cam.y > -0.1 && dc < 3.4 + (s.sp === "lin" ? 1 : 0) && s.attractT <= 0) s.shy = 1.4;
    let want = s.yaw;
    let spd = d.speed;
    let turnRate = 1.1;
    s.wanderT -= dt;
    if (s.wanderT <= 0) {
      s.wanderT = rnd(2, 6);
      s.turn = (Math.random() - 0.5) * 1.3;
    }
    want += s.turn * 0.5;
    if (s.shy > 0) {
      s.shy -= dt;
      want = Math.atan2(-dcz, dcx);
      spd *= 2.6;
      turnRate = 3.2;
    } else if (s.attractT > 0 && this.lure.on) {
      s.attractT -= dt * 0.1;
      const lx = this.lure.x - s.x, lz = this.lure.z - s.z;
      const dl = Math.hypot(lx, lz);
      if (dl > 1.8) {
        want = Math.atan2(-lz, lx);
        spd *= 1.5;
      } else {
        // krążą wokół przynęty
        want = s.yaw + 0.9;
        spd *= 0.4;
        turnRate = 1.6;
      }
    }
    // omijanie płycizn i brzegów
    const look = 2.6 + s.speed * 2.5;
    if (!this.probeOK(s.sp, s.x, s.z, want, look)) {
      let found = false;
      for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3]) {
        if (this.probeOK(s.sp, s.x, s.z, want + off, look)) {
          want += off;
          found = true;
          break;
        }
      }
      if (!found) want += Math.PI;
      turnRate = Math.max(turnRate, 2);
    }
    const dyaw = wrap(want - s.yaw);
    s.yaw += clamp(dyaw, -turnRate * dt, turnRate * dt);
    s.speed += (spd - s.speed) * Math.min(1, dt * 2.2);
    s.x += Math.cos(s.yaw) * s.speed * dt;
    s.z -= Math.sin(s.yaw) * s.speed * dt;

    // głębokość stada: wzdręgi i płocie żerują tuż pod powierzchnią
    s.surfT -= dt;
    if (s.surfT <= 0 && s.surf <= 0 && (s.sp === "wzdrega" || s.sp === "ploc")) {
      s.surf = rnd(2, 4.5);
      s.surfT = rnd(7, 18);
    }
    let dTarget = s.depthY;
    if (s.surf > 0) {
      s.surf -= dt;
      dTarget = -0.04;
      s.ripT -= dt;
      if (s.ripT <= 0 && this.onRipple) {
        s.ripT = rnd(0.35, 0.9);
        const f = s.fish[Math.floor(Math.random() * s.fish.length)];
        if (f) this.onRipple(f.x, f.z, 0.22 + Math.random() * 0.2);
      }
    } else {
      s.depthY += (Math.random() - 0.5) * 0.12 * dt;
      s.depthY = clamp(s.depthY, Math.min(d.y[0], d.y[1]), Math.max(d.y[0], d.y[1]));
    }

    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    for (const f of s.fish) {
      if (f.mode !== "school") continue;
      f.off[0] += (Math.random() - 0.5) * 0.5 * dt;
      f.off[1] += (Math.random() - 0.5) * 0.5 * dt;
      f.off[0] = clamp(f.off[0], -d.spread * 1.6 - 0.2, d.spread * 1.6 + 0.2);
      f.off[1] = clamp(f.off[1], -d.spread * 1.3 - 0.2, d.spread * 1.3 + 0.2);
      const tx = s.x + c * f.off[0] + sn * f.off[1], tz = s.z - sn * f.off[0] + c * f.off[1];
      const dx = tx - f.x, dz = tz - f.z;
      let vx = c * s.speed + dx * 1.4, vz = -sn * s.speed + dz * 1.4;
      for (const g of s.fish) {
        if (g === f) continue;
        const ex = f.x - g.x, ez = f.z - g.z;
        const dd = Math.hypot(ex, ez);
        const lim = (f.len + g.len) * 0.9;
        if (dd < lim && dd > 1e-4) {
          vx += (ex / dd) * (lim - dd) * 2.2;
          vz += (ez / dd) * (lim - dd) * 2.2;
        }
      }
      this.moveFish(f, vx, vz, dt, dTarget + f.dy, s.shy > 0 ? 2.6 : 1, d);
    }
  }

  private moveFish(f: Fish, vx: number, vz: number, dt: number, yTarget: number, boost: number, d: SpDef) {
    const sp = Math.hypot(vx, vz);
    const heading = sp > 1e-3 ? Math.atan2(-vz, vx) : f.yaw;
    const dyaw = wrap(heading - f.yaw);
    const maxTurn = 3.8 * boost;
    const step = clamp(dyaw, -maxTurn * dt, maxTurn * dt);
    f.yaw += step;
    const targetSpd = Math.min(sp, d.speed * 3.8 * boost + 0.2) * (f.burst > 0 ? 2.8 : 1);
    f.speed += (targetSpd - f.speed) * Math.min(1, dt * 4);
    f.x += Math.cos(f.yaw) * f.speed * dt;
    f.z -= Math.sin(f.yaw) * f.speed * dt;
    f.burst = Math.max(0, f.burst - dt);
    f.bend += (clamp((step / Math.max(dt, 1e-3)) * 0.22, -0.5, 0.5) - f.bend) * Math.min(1, dt * 6);
    // głębokość
    const bed = this.w.heightAt(f.x, f.z);
    let ty = d.bottom ? bed + 0.1 + f.len * 0.22 : yTarget;
    ty = Math.max(ty, bed + 0.1 + f.len * 0.22);
    ty = Math.min(ty, -0.025 - f.len * 0.1);
    const vy = (ty - f.y) * 1.4;
    f.y += clamp(vy, -0.5, 0.5) * dt;
    f.pitch += (clamp(Math.atan2(vy, Math.max(0.08, f.speed)), -0.5, 0.5) - f.pitch) * Math.min(1, dt * 4);
    if (bed > -0.22) {
      // za płytko – wróć na głębszą wodę
      f.x -= Math.cos(f.yaw) * f.speed * dt * 2;
      f.z += Math.sin(f.yaw) * f.speed * dt * 2;
      f.yaw += Math.PI * dt * 1.5;
    }
    const bl = f.speed / Math.max(0.05, f.len);
    f.freq = 6.28 * (0.9 + 0.75 * bl);
    f.amp = 0.28 + 0.65 * Math.min(1, bl / 3.2) + (f.burst > 0 ? 0.35 : 0);
    f.roll += (clamp(f.bend * 0.5, -0.3, 0.3) - f.roll) * Math.min(1, dt * 3);
  }

  private updateApproach(f: Fish, dt: number) {
    const d = DEF[f.sp];
    const dx = f.tx - f.x, dz = f.tz - f.z;
    const dist = Math.hypot(dx, dz);
    const hover = dist < 0.22;
    const spd = hover ? 0.03 : clamp(dist * 1.4, 0.12, 1.0);
    const vx = hover ? Math.cos(f.yaw) * 0.02 : (dx / dist) * spd;
    const vz = hover ? -Math.sin(f.yaw) * 0.02 : (dz / dist) * spd;
    this.moveFish(f, vx, vz, dt, f.ty, 1.4, d);
  }

  private updateFlee(f: Fish, dt: number) {
    f.fleeT -= dt;
    const d = DEF[f.sp];
    const vx = Math.cos(f.yaw) * 1.2, vz = -Math.sin(f.yaw) * 1.2;
    // omijanie płycizn podczas ucieczki
    if (!this.probeOK(f.sp, f.x, f.z, f.yaw, 2.0)) f.yaw += 2.4 * dt * 2;
    this.moveFish(f, vx, vz, dt, f.y - 0.1, 2.2, d);
  }

  // ------------------------------------------------------------ rysowanie
  private render(t: number) {
    void t;
    const counts: Record<string, number> = {};
    const put = (f: Fish) => {
      if (!f.alive) return;
      const set = this.sets[f.sp];
      const n = counts[f.sp] ?? 0;
      if (n >= set.max) return;
      set.set(n, f.x, f.y, f.z, f.yaw, f.pitch, f.roll, f.len, f.phase, f.freq, f.amp, f.bend, f.tint);
      counts[f.sp] = n + 1;
    };
    for (const s of this.schools) for (const f of s.fish) put(f);
    for (const f of this.loose) put(f);
    for (const sp of ORDER) this.sets[sp].commit(counts[sp] ?? 0);
    // faza ciągle rośnie wraz z czasem (shader) — fazy ustawione przy tworzeniu
  }

  dispose() {
    for (const sp of ORDER) this.sets[sp].dispose();
  }
}
