import * as THREE from "three";
import { World, WORLD_HALF, Surface } from "./world";
import { TreeSystem } from "./trees";
import { Boat } from "./boats";
import { clamp } from "./noise";

/** największa głębokość, do której można wejść na piechotę (m) */
export const MAX_WADE = 0.38;

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = true;
  swimming = false;
  eyeHeight = 1.65;
  speed = 0;
  surface: Surface = "grass";
  depth = 0;
  boat: Boat | null = null;
  /** > 0, gdy gracz właśnie napiera na zbyt głęboką wodę */
  waterBlock = 0;
  keys = new Set<string>();
  onStep: ((s: Surface, running: boolean) => void) | null = null;

  private bob = 0;
  private stepAcc = 0;
  private crouchK = 0;
  private bobOffset = 0;
  private bobSide = 0;
  private tmp = { x: 0, z: 0 };

  constructor(private world: World, private trees: TreeSystem) {
    const s = world.spawn;
    this.pos.set(s.x, world.groundY(s.x, s.z), s.z);
    this.yaw = s.yaw;
    this.pitch = -0.05;
  }

  look(dx: number, dy: number, sens: number) {
    this.yaw -= dx * sens;
    this.pitch = clamp(this.pitch - dy * sens, -1.52, 1.52);
  }

  get camY() {
    return this.pos.y + this.eyeHeight - this.crouchK * 0.55 + this.bobOffset;
  }
  get camSide() {
    return this.bobSide;
  }
  get underwater() {
    return this.camY < -0.03;
  }

  board(b: Boat) {
    this.boat = b;
    b.hasRider = true;
    b.speed = 0;
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.crouchK = 0;
    // patrz w kierunku dziobu
    this.yaw = b.yaw - Math.PI / 2;
    this.pitch = -0.12;
  }

  disembark(x: number, z: number) {
    if (this.boat) {
      this.boat.hasRider = false;
      this.boat.onStroke = null;
    }
    this.boat = null;
    this.pos.set(x, this.world.groundY(x, z), z);
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.crouchK = 0;
  }

  update(dt: number) {
    const w = this.world;
    const k = this.keys;
    const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const r = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const run = k.has("ShiftLeft") || k.has("ShiftRight");
    const crouchKey = k.has("KeyC");
    const jumpKey = k.has("Space");
    this.waterBlock = Math.max(0, this.waterBlock - dt);

    if (this.boat) {
      const b = this.boat;
      b.drive(f, r, run, dt);
      const s = b.seat();
      this.pos.set(s.x, s.y - this.eyeHeight, s.z);
      this.vel.set(0, 0, 0);
      this.crouchK = 0;
      this.bobOffset = 0;
      this.bobSide = 0;
      this.speed = Math.abs(b.speed);
      this.surface = "water";
      this.depth = Math.max(0, -w.heightAt(b.x, b.z));
      this.onGround = false;
      return;
    }

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let dx = fx * f + rx * r, dz = fz * f + rz * r;
    const dl = Math.hypot(dx, dz);
    if (dl > 1) {
      dx /= dl;
      dz /= dl;
    }

    const terrainH = w.heightAt(this.pos.x, this.pos.z);
    this.depth = Math.max(0, -terrainH);

    let target = crouchKey ? 1.5 : run ? 6.0 : 3.3;
    if (this.depth > 0.1) target *= 1 - 0.45 * clamp(this.depth / MAX_WADE, 0, 1);
    const tvx = dx * target, tvz = dz * target;
    const a = 1 - Math.exp(-(this.onGround ? 11 : 1.8) * dt);
    this.vel.x += (tvx - this.vel.x) * a;
    this.vel.z += (tvz - this.vel.z) * a;

    // ruch poziomy: nie można wejść w głęboką wodę ani spaść z pomostu
    const mx = this.vel.x * dt, mz = this.vel.z * dt;
    const tryMove = (nx: number, nz: number): boolean => {
      const gNew = w.groundY(nx, nz);
      if (gNew < -MAX_WADE && gNew < w.groundY(this.pos.x, this.pos.z)) {
        if (dl > 0.1) this.waterBlock = 1.4;
        return false;
      }
      if (this.onGround) {
        const rise = gNew - this.pos.y;
        const dist = Math.hypot(nx - this.pos.x, nz - this.pos.z) || 1e-4;
        if (rise > 0.45 && rise / dist > 1.15) return false;
      }
      this.pos.x = nx;
      this.pos.z = nz;
      return true;
    };
    if (!tryMove(this.pos.x + mx, this.pos.z + mz)) {
      if (!tryMove(this.pos.x + mx, this.pos.z)) tryMove(this.pos.x, this.pos.z + mz);
    }
    this.tmp.x = this.pos.x;
    this.tmp.z = this.pos.z;
    w.resolveBuildings(this.tmp, 0.38);
    this.trees.collide(this.tmp, 0.3);
    // po wypchnięciu przez przeszkodę nadal nie wolno wejść w głęboką wodę
    if (w.groundY(this.tmp.x, this.tmp.z) > -MAX_WADE || w.groundY(this.tmp.x, this.tmp.z) >= w.groundY(this.pos.x, this.pos.z)) {
      const lim = WORLD_HALF - 90;
      this.pos.x = clamp(this.tmp.x, -lim, lim);
      this.pos.z = clamp(this.tmp.z, -lim, lim);
    }

    // pion
    const ground = w.groundY(this.pos.x, this.pos.z);
    const wasGround = this.onGround;
    if (jumpKey && this.onGround) {
      this.vel.y = this.depth > 0.2 ? 4.4 : 6.0;
      this.onGround = false;
    }
    this.vel.y -= 22 * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= ground) {
      const impact = -this.vel.y;
      this.pos.y = ground;
      this.vel.y = 0;
      if (!this.onGround && impact > 3.5) this.onStep?.(this.surface, true);
      this.onGround = true;
    } else if (wasGround && this.vel.y <= 0 && this.pos.y - ground < 0.35 && !jumpKey) {
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = false;

    this.surface = w.surfaceAt(this.pos.x, this.pos.z);

    const hv = Math.hypot(this.vel.x, this.vel.z);
    this.speed = hv;
    this.crouchK += ((crouchKey ? 1 : 0) - this.crouchK) * Math.min(1, dt * 9);
    if (this.onGround && hv > 0.3) {
      this.bob += dt * hv * 2.4;
      const amp = Math.min(1, hv / 6) * 0.045 + 0.012;
      this.bobOffset = Math.sin(this.bob * 2) * amp;
      this.bobSide = Math.cos(this.bob) * amp * 0.7;
      this.stepAcc += hv * dt;
      const stride = run ? 2.3 : 1.55;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        this.onStep?.(this.surface, run);
      }
    } else {
      this.bobOffset += (0 - this.bobOffset) * Math.min(1, dt * 8);
      this.bobSide += (0 - this.bobSide) * Math.min(1, dt * 8);
    }
  }
}
