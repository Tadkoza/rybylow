import * as THREE from "three";
import type { World } from "./world";
import type { AmbientAudio } from "./audio";
import { clamp } from "./noise";
import { BAITS, RODS, SPECIES_BY_ID, SpeciesId, BaitId, RodId, rollFish, rollFishOfLength, FishRoll, addCatch } from "./fishdata";
import { buildRod, RodModel } from "./rodmodel";
import type { FishLife, Fish } from "./fishlife";
import type { RigSpecies } from "./fishrig";

export type FishState = "idle" | "swing" | "casting" | "dropping" | "dropped" | "waiting" | "nibble" | "bite" | "fight" | "caught";

export interface CatchView {
  species: SpeciesId;
  name: string;
  length: number;
  weight: number;
  record: boolean;
  first: boolean;
}

export interface SwingHud {
  s: number;
  peak: number;
  v: number;
  power: number;
}

export interface FishHud {
  equipped: boolean;
  state: FishState;
  text: string;
  swing: SwingHud | null;
  tension: number;
  distance: number;
  shore: number;
  running: boolean;
  message: string;
  catch: CatchView | null;
  bait: BaitId;
  rod: RodId;
  reelSpeed: number;
  reeling: boolean;
  bailOpen: boolean;
}

/** parametry zamachu: kąt wędki (rad) względem pozycji spoczynkowej */
export const SWING = { min: -0.5, max: 1.3, lo: 0.1, hi: 0.72, minPeak: 0.55, vMin: 1.5, vMax: 8 };

const SP_COLOR: Record<SpeciesId, string> = {
  wzdrega: "#6b6a3a",
  ploc: "#5b6a66",
  leszcz: "#6a6450",
  karp: "#6b5c2c",
  lin: "#4a5a28",
  okon: "#55602e",
  szczupak: "#3f4e2f",
  klen: "#566444",
  bolen: "#475c6a",
  sandacz: "#515a3e",
};

const FLOAT_SCALE = 3.2;
const BASE_X = 0.17;
const BASE_Y = 0.08;
const BASE_Z = -0.04;

export class FishingSystem {
  group = new THREE.Group();
  equipped = false;
  state: FishState = "idle";
  cfg: { rod: RodId; bait: BaitId } = { rod: "telescope", bait: "worm" };
  onCatch: ((c: CatchView) => void) | null = null;
  timeBoost = 1;
  swingGain = 0.0044;
  reelSpeed = 3;
  /** żywe ryby w jeziorze (stada); gdy ustawione, holujemy dokładnie tę rybę, którą widać przy spławiku */
  life: FishLife | null = null;

  private rod: RodModel;
  private rodRoot: THREE.Group;
  private floatG = new THREE.Group();
  private line: THREE.Line;
  private linePos: Float32Array;
  private nodeCount: number;
  private sagN = 28;
  private ripples: { mesh: THREE.Mesh; age: number; life: number; size: number; on: boolean }[] = [];
  private fishMesh = new THREE.Group();
  private fishTail!: THREE.Mesh;
  private fishMat: THREE.MeshStandardMaterial;
  private disposables: { dispose(): void }[] = [];

  // zamach
  private castHeld = false;
  private swingS = 0;
  private swingPeak = 0;
  private swingV = 0;
  private fwdPeak = 0;
  private pendingDs = 0;
  private samples: { dt: number; ds: number }[] = [];
  private flex = 0;
  private flexV = 0;

  // zwijanie
  private reelHeld = false;
  private reelAct = 0;
  private crank = 0;
  private crankClick = 0;
  private bailOpen = 0;
  private bailTarget = 0;

  // rzut i przynęta
  private flightT = 0;
  private flightDur = 1;
  private apex = 2;
  private start = new THREE.Vector3();
  private target = new THREE.Vector3();
  private targetOnPier = false;
  private fpos = new THREE.Vector3();
  private fprev = new THREE.Vector3();
  private dropVy = 0;
  private retractT = 0;
  private retractFrom = new THREE.Vector3();
  private waitLeft = 0;
  private nibbleLeft = 0;
  private nibbleTick = 0;
  private biteLeft = 0;
  private biteReal = false;
  private pending: FishRoll | null = null;
  private biteFish: Fish | null = null;
  private hookFish: Fish | null = null;
  private strikeBuf = 0;
  private holdT = 0;
  private nibbleTotal = 1;
  private overT = 0;
  private hookT = 0;
  private nearT = 0;
  private nearCnt = 0;
  private sink = 0;
  private sinkTarget = 0;
  private msg = "";
  private msgT = 0;
  private catchView: CatchView | null = null;
  private caughtT = 0;
  private rippleT = 0;
  private heading = 0;
  private fight = { d: 0, angle: 0, wander: 0, wTarget: 0, run: false, phaseT: 1, stamina: 1, tension: 0.1, slack: 0, beach: 0 };
  private tip = new THREE.Vector3();
  private tmpV = new THREE.Vector3();
  private tmpH = new THREE.Vector3();

  constructor(private world: World, scene: THREE.Scene, private camera: THREE.Camera, private audio: AmbientAudio, private lakeId: string, renderer: THREE.WebGLRenderer) {
    // ---- wędka (dziecko kamery)
    this.rod = buildRod(renderer);
    this.rodRoot = this.rod.root;
    this.rodRoot.position.set(0.2, -0.08, -0.5);
    this.rodRoot.rotation.set(BASE_X, BASE_Y, BASE_Z);
    this.rodRoot.visible = false;
    camera.add(this.rodRoot);

    // ---- spławik
    const mat = (c: number, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: e, emissiveIntensity: 0.5 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.13, 5), mat(0x2a2a22));
    stem.position.y = -0.065;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mat(0xf1cf36));
    body.scale.set(1, 1.5, 1);
    body.position.y = -0.02;
    const antW = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.07, 6), mat(0xf4f1e8));
    antW.position.y = 0.035;
    const antR = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.04, 6), mat(0xe3261c, 0xaa1000));
    antR.position.y = 0.09;
    for (const m of [stem, body, antW, antR]) {
      this.floatG.add(m);
      this.disposables.push(m.geometry, m.material as THREE.Material);
    }
    this.floatG.scale.setScalar(FLOAT_SCALE);
    this.floatG.visible = false;
    this.group.add(this.floatG);

    // ---- żyłka: kabłąk → przelotki → szczytówka → spławik
    this.nodeCount = this.rod.lineNodes.length;
    this.linePos = new Float32Array((this.nodeCount + this.sagN) * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe9f1ee, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.group.add(this.line);
    this.disposables.push(lg, this.line.material as THREE.Material);

    // ---- kręgi na wodzie
    const rg2 = new THREE.RingGeometry(0.93, 1, 44);
    rg2.rotateX(-Math.PI / 2);
    this.disposables.push(rg2);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(rg2, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.renderOrder = 6;
      m.frustumCulled = false;
      this.group.add(m);
      this.ripples.push({ mesh: m, age: 0, life: 1.8, size: 1, on: false });
      this.disposables.push(m.material as THREE.Material);
    }

    // ---- ryba pod wodą
    this.fishMat = new THREE.MeshStandardMaterial({ color: 0x6b5c2c, roughness: 0.6 });
    const bg = new THREE.SphereGeometry(0.5, 14, 9);
    bg.scale(1, 0.3, 0.2);
    const bodyM = new THREE.Mesh(bg, this.fishMat);
    const tg2 = new THREE.BufferGeometry();
    tg2.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, -0.28, 0, 0.12, -0.28, 0, -0.12], 3));
    tg2.computeVertexNormals();
    const tailM = new THREE.Mesh(tg2, new THREE.MeshStandardMaterial({ color: 0x4a4430, side: THREE.DoubleSide, roughness: 0.7 }));
    tailM.position.x = -0.48;
    this.fishTail = tailM;
    this.fishMesh.add(bodyM, tailM);
    this.fishMesh.visible = false;
    this.group.add(this.fishMesh);
    this.disposables.push(bg, tg2, this.fishMat, tailM.material as THREE.Material);
    scene.add(this.group);
  }

  // ----------------------------------------------------------------- API
  get swinging() {
    return this.state === "swing";
  }

  setConfig(cfg: { rod: RodId; bait: BaitId }) {
    const changed = cfg.rod !== this.cfg.rod || cfg.bait !== this.cfg.bait;
    this.cfg = cfg;
    if (changed && this.state !== "idle" && this.state !== "caught" && this.state !== "swing") this.retract();
  }

  setEquipped(on: boolean) {
    this.equipped = on;
    if (!on) {
      this.releaseFish();
      this.state = "idle";
      this.castHeld = false;
      this.reelHeld = false;
      this.catchView = null;
      this.retractT = 0;
      this.bailTarget = 0;
      this.fishMesh.visible = false;
    }
  }

  private flash(text: string, s = 3) {
    this.msg = text;
    this.msgT = s;
  }

  private reelRate() {
    return 0.15 + 0.3 * this.reelSpeed;
  }

  addReelSpeed(n: number) {
    this.reelSpeed = clamp(this.reelSpeed + n, 1, 10);
  }

  /** przesunięcie myszy w pionie podczas zamachu (piksele; w dół = wędka do tyłu) */
  swingInput(dyPixels: number) {
    if (this.state !== "swing") return;
    this.pendingDs += dyPixels * this.swingGain;
  }

  /** rolka myszy: wciśnięcie = rozpoczęcie zamachu, puszczenie = zwolnienie kabłąka */
  castHold(down: boolean) {
    if (!this.equipped) return;
    if (down) {
      this.castHeld = true;
      switch (this.state) {
        case "idle":
          if (this.retractT <= 0.1) {
            this.state = "swing";
            this.holdT = 0;
            this.swingPeak = Math.max(0, this.swingS);
            this.swingV = 0;
            this.fwdPeak = 0;
            this.pendingDs = 0;
            this.samples.length = 0;
          }
          break;
        case "caught":
          if (this.caughtT > 0.7) {
            this.catchView = null;
            this.state = "idle";
          }
          break;
        case "waiting":
        case "dropped":
          this.flash("Najpierw zwiń żyłkę — trzymaj prawy przycisk myszy.");
          break;
        default:
          break;
      }
    } else {
      this.castHeld = false;
      if (this.state === "swing") this.releaseCast();
    }
  }

  /** prawy przycisk: zwijanie */
  reelHold(down: boolean) {
    this.reelHeld = down && this.equipped;
  }

  /** lewy przycisk: zacięcie — reaguje natychmiast, kliknięcie tuż przed braniem jest zapamiętywane */
  strike() {
    if (!this.equipped) return;
    switch (this.state) {
      case "nibble": {
        this.strikeBuf = 0.35;
        const prog = 1 - this.nibbleLeft / this.nibbleTotal;
        if (this.biteReal && prog > 0.45) this.hookset(0.82);
        else {
          this.kick(0.35);
          this.flash("Pusto — za wcześnie. Czekaj, aż spławik pójdzie pod wodę.", 1.8);
          if (Math.random() < 0.25) {
            this.releaseFish();
            this.state = "waiting";
            this.waitLeft = 3 + Math.random() * 5;
            this.sinkTarget = 0;
          }
        }
        break;
      }
      case "bite":
        this.hookset(0.92);
        break;
      case "waiting":
        this.strikeBuf = 0.3;
        this.kick(0.3);
        break;
      case "caught":
        if (this.caughtT > 0.7) {
          this.catchView = null;
          this.state = "idle";
        }
        break;
      default:
        break;
    }
  }

  /** natychmiastowy ruch wędką (zacięcie) */
  private kick(a: number) {
    this.swingS = Math.max(this.swingS, a);
    this.flexV -= 6;
  }

  private hookset(p: number) {
    this.kick(0.55);
    if (Math.random() < p) this.startFight();
    else {
      this.flash("Spadła! Ryba zrzuciła haczyk.");
      this.releaseFish();
      this.state = "waiting";
      this.waitLeft = 3 + Math.random() * 6;
      this.sinkTarget = 0;
    }
  }

  /** ryba przy przynęcie, której nie zacięto — odpływa */
  private releaseFish() {
    if (this.biteFish && this.life) this.life.flee(this.biteFish, this.fpos.x, this.fpos.z);
    this.biteFish = null;
  }

  /** utrata fokusu / zamknięcie menu */
  cancelInputs() {
    this.castHeld = false;
    this.reelHeld = false;
    if (this.state === "swing") this.state = "idle";
  }

  /** wciągnięcie zestawu (zmiana sprzętu, zbyt długa żyłka) */
  retract() {
    if (!this.equipped) return;
    if (this.state === "fight" || this.state === "casting") return;
    this.releaseFish();
    this.catchView = null;
    this.retractFrom.copy(this.fpos);
    this.retractT = 0.45;
    this.state = "idle";
    this.sinkTarget = 0;
    this.sink = 0;
    this.bailTarget = 0;
  }

  debugBite() {
    if (this.state === "waiting") this.waitLeft = 0.01;
  }
  debugState() {
    return {
      state: this.state,
      s: this.swingS,
      peak: this.swingPeak,
      v: this.swingV,
      wait: this.waitLeft,
      fpos: [this.fpos.x, this.fpos.y, this.fpos.z],
      reel: this.reelAct,
      bail: this.bailOpen,
      target: [this.target.x, this.target.z],
      fight: { ...this.fight },
      pending: this.pending,
    };
  }

  get hud(): FishHud {
    const f = this.fight;
    let text = "";
    switch (this.state) {
      case "idle":
        text = "Przytrzymaj rolkę myszy (lub F): ładuj rzut i puść — albo zrób zamach myszą";
        break;
      case "swing":
        text = this.holdT > 0.3 && this.swingPeak < SWING.minPeak ? "Ładowanie rzutu… puść, żeby rzucić" : "Trzymaj, by naładować rzut — albo pociągnij mysz do siebie i szybko do przodu";
        break;
      case "dropped":
        text = "Przynęta opadła — zwiń żyłkę (PPM) i zarzuć jeszcze raz";
        break;
      case "waiting":
        text = "Czekaj na branie… (PPM — powoli zwijaj)";
        break;
      case "nibble":
        text = "Ryba podchodzi do przynęty… czekaj";
        break;
      case "bite":
        text = "BRANIE! Kliknij LPM — zetnij!";
        break;
      case "fight":
        text = f.run ? "Ryba ucieka! Puść PPM lub zwijaj wolniej (kółko)" : "Zwijaj — trzymaj PPM, kółko zmienia prędkość";
        break;
      default:
        break;
    }
    const swing: SwingHud | null =
      this.state === "swing"
        ? { s: this.swingS, peak: this.swingPeak, v: this.swingV, power: Math.max(clamp((this.swingV - SWING.vMin) / (SWING.vMax - SWING.vMin), 0, 1), this.swingPeak < SWING.minPeak ? this.chargePower() : 0) }
        : null;
    return {
      equipped: this.equipped,
      state: this.state,
      text,
      swing,
      tension: f.tension,
      distance: f.d,
      shore: Math.max(0, -this.world.sdfAt(this.fpos.x, this.fpos.z)),
      running: f.run,
      message: this.msgT > 0 ? this.msg : "",
      catch: this.catchView,
      bait: this.cfg.bait,
      rod: this.cfg.rod,
      reelSpeed: this.reelSpeed,
      reeling: this.reelAct > 0.15,
      bailOpen: this.bailOpen > 0.5,
    };
  }

  ripple(x: number, z: number, size = 1) {
    const r = this.ripples.find((q) => !q.on) ?? this.ripples[0];
    r.on = true;
    r.age = 0;
    r.life = 1.4 + size * 0.5;
    r.size = size;
    r.mesh.position.set(x, 0.022, z);
    r.mesh.visible = true;
  }

  // ----------------------------------------------------------- mechanika
  private depthAt(x: number, z: number) {
    return Math.max(0, -this.world.heightAt(x, z));
  }

  /** puszczenie rolki: rzut (gdy był zamach) albo samo opadnięcie przynęty */
  private releaseCast() {
    // uwzględnij ruch myszy z ostatniej klatki
    const ds = clamp(this.pendingDs, -0.6, 0.6);
    this.pendingDs = 0;
    const prev = this.swingS;
    this.swingS = clamp(prev + ds, SWING.min, SWING.max);
    this.samples.push({ dt: 0.016, ds: this.swingS - prev });
    this.recomputeV();
    const s = this.swingS, peak = this.swingPeak, v = this.swingV;
    this.bailTarget = 1;
    this.audio.bail();
    const wound = peak >= SWING.minPeak;
    const forward = v >= SWING.vMin && peak - s >= 0.2;
    if (!wound || !forward) {
      if (this.holdT >= 0.18) return this.chargedCast();
      return this.startDrop("Przytrzymaj rolkę dłużej, by naładować rzut — albo zrób zamach myszą.");
    }
    const rod = RODS.find((r) => r.id === this.cfg.rod)!;
    const power = Math.pow(clamp((v - SWING.vMin) / (SWING.vMax - SWING.vMin), 0, 1), 0.85);
    let factor = 1;
    let note = "";
    if (s > SWING.hi) {
      factor = 1 - 0.7 * clamp((s - SWING.hi) / 0.5, 0, 1);
      if (factor < 0.9) note = " — puszczone za wcześnie";
    } else if (s < SWING.lo) {
      factor = 1 - 0.75 * clamp((SWING.lo - s) / 0.45, 0, 1);
      if (factor < 0.9) note = " — puszczone za późno";
    }
    const dist = Math.max(3, (4 + power * (rod.maxCast - 4)) * factor);
    this.launch(dist, s, note);
  }

  private chargePower() {
    return clamp((this.holdT - 0.12) / 1.1, 0, 1);
  }

  /** rzut z samego ładowania (bez zamachu myszą): im dłużej trzymasz, tym dalej */
  private chargedCast() {
    const rod = RODS.find((r) => r.id === this.cfg.rod)!;
    const power = Math.pow(Math.max(0.12, this.chargePower()), 0.9);
    const dist = Math.max(4, 4 + power * (rod.maxCast - 4) * 0.97);
    this.launch(dist, 0.5, "");
  }

  private launch(dist: number, s: number, note: string) {
    const cam = this.camera.position;
    const yaw = (this.camera as THREE.PerspectiveCamera).rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    this.target.set(cam.x + fx * dist, 0, cam.z + fz * dist);
    const gnd = this.world.heightAt(this.target.x, this.target.z);
    const deck = this.world.pierDeckAt(this.target.x, this.target.z);
    this.targetOnPier = deck > -1e8;
    this.target.y = this.targetOnPier ? deck : Math.max(0, gnd);
    this.start.copy(this.tip);
    this.flightT = 0;
    this.flightDur = 0.5 + dist / 38;
    this.apex = (1.2 + dist * 0.12) * (0.75 + 0.5 * clamp((s + 0.1) / 0.9, 0, 1));
    this.state = "casting";
    this.audio.cast();
    this.flash(`Rzut ${Math.round(dist)} m${note}`, 2.4);
  }

  private startDrop(message: string) {
    this.state = "dropping";
    this.dropVy = 0;
    this.flash(message, 4.5);
    this.audio.cast();
  }

  private recomputeV() {
    let sd = 0, st = 0;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      sd += this.samples[i].ds;
      st += this.samples[i].dt;
      if (st >= 0.08) {
        this.samples.splice(0, i);
        break;
      }
    }
    const inst = -sd / Math.max(st, 0.05);
    if (inst < -0.5) this.fwdPeak = 0;
    else this.fwdPeak = Math.max(this.fwdPeak, inst);
    // liczy się chwilowa prędkość lub 70% szczytowej prędkości bieżącego ruchu do przodu
    this.swingV = inst >= 0 ? Math.max(inst, this.fwdPeak * 0.7) : inst;
  }

  private integrateSwing(dt: number) {
    const prev = this.swingS;
    this.swingS = clamp(prev + clamp(this.pendingDs, -0.6, 0.6), SWING.min, SWING.max);
    this.pendingDs = 0;
    this.swingPeak = Math.max(this.swingPeak, this.swingS);
    this.holdT += dt;
    this.samples.push({ dt, ds: this.swingS - prev });
    this.recomputeV();
  }

  private landBait() {
    const w = this.world;
    this.fpos.copy(this.target);
    const gnd = w.heightAt(this.fpos.x, this.fpos.z);
    const inWater = gnd < -0.02 && !this.targetOnPier;
    if (inWater) {
      this.ripple(this.fpos.x, this.fpos.z, 1.3);
      this.audio.splash(0.3);
    }
    const depth = Math.max(0, -gnd);
    if (inWater && depth >= 0.45) {
      this.state = "waiting";
      this.sink = 0.05;
      this.sinkTarget = 0;
      const bait = BAITS.find((b) => b.id === this.cfg.bait)!;
      this.life?.lureLanded(this.fpos.x, this.fpos.z, this.cfg.bait);
      const near = this.life ? this.life.countNear(this.fpos.x, this.fpos.z, 9) : 0;
      this.waitLeft = (3 + Math.random() * 12) / (bait.speed * this.timeBoost) / (1 + 0.2 * Math.min(near, 10));
      this.strikeBuf = 0;
    } else {
      this.state = "dropped";
      this.flash(inWater ? "Za płytko — ryby tu nie biorą. Zwiń żyłkę (PPM) i rzuć dalej." : "Przynęta wylądowała na lądzie. Zwiń żyłkę (PPM) i rzuć w stronę jeziora.", 4.5);
    }
  }

  private pickSpecies(): FishRoll {
    const bait = BAITS.find((b) => b.id === this.cfg.bait)!;
    const depth = this.depthAt(this.fpos.x, this.fpos.z);
    const sm = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const list: [SpeciesId, number][] = [];
    let total = 0;
    for (const id of ["wzdrega", "ploc", "leszcz", "karp", "lin"] as SpeciesId[]) {
      let w = bait.weights[id] ?? 0;
      if (id === "wzdrega") w *= depth < 1.6 ? 1.3 : 0.5;
      if (id === "leszcz") w *= 0.2 + 1.4 * sm(0.7, 2.2, depth);
      if (id === "karp") w *= 0.12 + 0.5 * sm(0.6, 1.6, depth);
      if (id === "lin") w *= depth < 2.8 ? 0.9 : 0.3;
      if (this.lakeId === "klebarskie") w *= id === "karp" ? 1.3 : id === "leszcz" ? 1.15 : id === "lin" ? 1.4 : 1;
      else w *= id === "ploc" ? 1.2 : id === "wzdrega" ? 1.1 : 1;
      // ryby, które widać przy spławiku, biorą chętniej
      if (this.life && id !== "karp") w *= 1 + 2.4 * this.life.countNear(this.fpos.x, this.fpos.z, 7, id as RigSpecies);
      list.push([id, w]);
      total += w;
    }
    let r = Math.random() * total;
    let pick: SpeciesId = "ploc";
    for (const [id, w] of list) {
      r -= w;
      if (r <= 0) {
        pick = id;
        break;
      }
    }
    let roll = rollFish(pick, bait.sizeBias);
    // wybierz widoczną rybę tego gatunku (jej rozmiar = rozmiar złowionej) albo wypuść nową z głębi
    this.biteFish = null;
    const life = this.life;
    if (life) {
      const fp = this.fpos;
      const ty = -Math.min(0.55, depth * 0.5);
      const seen = pick === "karp" ? null : life.nearest(fp.x, fp.z, 9, pick as RigSpecies);
      if (seen) {
        roll = rollFishOfLength(pick, Math.max(8, Math.round(seen.len * 100)));
        life.claim(seen, fp.x, ty, fp.z);
        this.biteFish = seen;
      } else {
        this.biteFish = life.spawnNear(pick as RigSpecies, roll.length / 100, fp.x, fp.z, this.camera.position);
      }
    }
    return roll;
  }

  private startBite() {
    this.pending = this.pickSpecies();
    this.biteReal = Math.random() < 0.85;
    this.state = "nibble";
    this.nibbleTotal = this.nibbleLeft = 0.9 + Math.random() * 1.5;
    this.nibbleTick = 0.2;
    this.ripple(this.fpos.x, this.fpos.z, 0.5);
  }

  private startFight() {
    const cam = this.camera.position;
    const f = this.fight;
    f.d = Math.hypot(this.fpos.x - cam.x, this.fpos.z - cam.z);
    f.angle = Math.atan2(this.fpos.z - cam.z, this.fpos.x - cam.x);
    f.wander = 0;
    f.wTarget = 0;
    f.run = true;
    f.phaseT = 0.8;
    f.stamina = 1;
    f.tension = 0.22;
    f.slack = 0;
    f.beach = 0;
    this.state = "fight";
    this.sinkTarget = 0.1;
    this.overT = 0;
    this.hookT = 0;
    const roll = this.pending!;
    this.fprev.copy(this.fpos);
    if (this.life && this.biteFish) {
      this.hookFish = this.biteFish;
      this.biteFish = null;
      this.hookFish.len = Math.max(0.08, roll.length / 100);
      this.life.hook(this.hookFish);
      this.fishMesh.visible = false;
    } else {
      this.fishMat.color.set(SP_COLOR[roll.species]);
      this.fishMesh.scale.setScalar(Math.max(0.12, roll.length / 100));
      this.fishMesh.visible = true;
    }
    this.heading = Math.atan2(-(this.fpos.z - this.camera.position.z), this.fpos.x - this.camera.position.x);
    this.ripple(this.fpos.x, this.fpos.z, 1.2);
    this.audio.splash(0.3);
    this.flash("Zacięte! Zwijaj powoli (PPM), kółko zmienia prędkość.", 2.6);
  }

  private endFight(msg: string) {
    this.flash(msg, 3.5);
    if (this.hookFish && this.life) this.life.flee(this.hookFish, this.camera.position.x, this.camera.position.z);
    this.hookFish = null;
    this.fishMesh.visible = false;
    this.retractFrom.copy(this.fpos);
    this.retractT = 0.45;
    this.state = "idle";
    this.sink = 0;
    this.sinkTarget = 0;
    this.pending = null;
    this.bailTarget = 0;
  }

  private completeCatch() {
    const r = this.pending!;
    const sp = SPECIES_BY_ID[r.species];
    const entry = { id: Date.now(), species: r.species, length: r.length, weight: r.weight, lake: this.lakeId, bait: this.cfg.bait, ts: Date.now() };
    const flags = addCatch(entry);
    this.catchView = { species: r.species, name: sp.name, length: r.length, weight: r.weight, record: flags.record, first: flags.first };
    if (this.hookFish && this.life) this.life.remove(this.hookFish);
    this.hookFish = null;
    this.state = "caught";
    this.caughtT = 0;
    this.fishMesh.visible = false;
    this.retractFrom.copy(this.fpos);
    this.retractT = 0.45;
    this.sink = 0;
    this.bailTarget = 0;
    this.audio.catchJingle();
    this.audio.splash(0.4);
    this.onCatch?.(this.catchView);
    this.pending = null;
  }

  // --------------------------------------------------------------- pętla
  update(dt: number, t: number) {
    this.msgT -= dt;
    for (const r of this.ripples) {
      if (!r.on) continue;
      r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) {
        r.on = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.06 + r.age * 0.95 * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.pow(1 - u, 1.6);
    }
    const vis = this.equipped;
    this.rodRoot.visible = vis;
    this.floatG.visible = vis;
    this.line.visible = vis;
    if (!vis) {
      this.fishMesh.visible = false;
      return;
    }
    const f = this.fight;
    const w = this.world;

    // ---- zamach
    if (this.state === "swing" && !this.castHeld) this.state = "idle";
    if (this.state === "swing") this.integrateSwing(dt);
    else {
      this.pendingDs = 0;
      this.samples.length = 0;
      this.swingV = 0;
      const tgt = this.state === "casting" && this.flightT < 0.22 ? -0.38 : 0;
      this.swingS += (tgt - this.swingS) * Math.min(1, dt * (tgt < 0 ? 14 : 4.5));
    }
    // sprężystość szczytówki: podczas zamachu ugina się do tyłu, po puszczeniu „strzela”
    const vFwd = this.state === "swing" ? this.swingV : 0;
    const flexTarget = -clamp(vFwd * 0.05, -0.2, 0.55);
    this.flexV += (62 * (flexTarget - this.flex) - 7 * this.flexV) * dt;
    this.flex += this.flexV * dt;

    // ---- zwijanie
    const canReel = this.state === "waiting" || this.state === "dropped" || this.state === "fight";
    const want = this.reelHeld && canReel ? 1 : 0;
    this.reelAct += (want - this.reelAct) * Math.min(1, dt * 6);
    if (want) this.bailTarget = 0;
    this.bailOpen += (this.bailTarget - this.bailOpen) * Math.min(1, dt * 9);
    const rate = this.reelRate() * this.reelAct;
    const dCrank = rate * dt * 9;
    this.crank += dCrank;
    this.crankClick += dCrank;
    if (this.crankClick > Math.PI) {
      this.crankClick = 0;
      if (this.reelAct > 0.2) this.audio.reelClick();
    }

    // ---- pozycja wędki i wygięcie
    let bend = 0.05 + this.flex;
    if (this.state === "fight") bend += 0.12 + f.tension * 1.0;
    else if (this.state === "bite") bend += 0.12 + 0.1 * Math.sin(t * 18);
    else if (this.state === "nibble") bend += 0.04 * Math.max(0, Math.sin(t * 9));
    this.rodRoot.rotation.set(BASE_X + this.swingS, BASE_Y, BASE_Z);
    const segs = this.rod.segs;
    for (let i = 0; i < segs.length; i++) segs[i].rotation.x = -(bend * (0.35 + (1.4 * i) / segs.length)) / segs.length;
    this.rod.crank.rotation.x = this.crank;
    this.rod.bail.rotation.x = this.bailOpen * 2.0;
    this.rodRoot.updateWorldMatrix(true, true);
    this.rod.tip.getWorldPosition(this.tip);
    const tip = this.tip;
    const cam = this.camera.position;

    let sag = 0.1;
    let onWater = false;
    const fp = this.fpos;
    switch (this.state) {
      case "idle":
      case "swing":
      case "caught": {
        if (this.state === "caught") {
          this.caughtT += dt;
          if (this.caughtT > 10) {
            this.catchView = null;
            this.state = "idle";
          }
        }
        const hang = this.hangPos(tip, t);
        if (this.retractT > 0) {
          this.retractT -= dt;
          const k = 1 - Math.max(0, this.retractT) / 0.45;
          const e = 1 - Math.pow(1 - k, 3);
          fp.lerpVectors(this.retractFrom, hang, e);
          fp.y += Math.sin(e * Math.PI) * 0.5;
        } else fp.copy(hang);
        sag = 0.04;
        break;
      }
      case "casting": {
        this.flightT += dt;
        const u = Math.min(1, this.flightT / this.flightDur);
        fp.lerpVectors(this.start, this.target, u);
        fp.y = this.start.y * (1 - u) + this.target.y * u + this.apex * 4 * u * (1 - u);
        sag = 0.5 * (1 - u) + 0.15;
        if (u >= 1) this.landBait();
        break;
      }
      case "dropping": {
        if (this.dropVy === 0 && fp.y < 0.01) fp.copy(this.hangPos(tip, t));
        this.dropVy -= 10.5 * dt;
        fp.y += this.dropVy * dt;
        const gnd = w.heightAt(fp.x, fp.z);
        const deck = w.pierDeckAt(fp.x, fp.z);
        const floorY = deck > -1e8 ? deck : Math.max(0, gnd);
        sag = 0.5;
        if (fp.y <= floorY) {
          fp.y = floorY;
          if (gnd < -0.02 && deck < -1e8) {
            this.ripple(fp.x, fp.z, 1.1);
            this.audio.splash(0.22);
          }
          this.state = "dropped";
          this.dropVy = 0;
        }
        break;
      }
      case "dropped": {
        const gnd = w.heightAt(fp.x, fp.z);
        const deck = w.pierDeckAt(fp.x, fp.z);
        fp.y = deck > -1e8 ? deck + 0.02 : gnd < -0.02 ? Math.sin(t * 1.3) * 0.005 : gnd + 0.02;
        onWater = gnd < -0.02;
        sag = 0.42;
        if (this.reelAct > 0.05) this.reelBait(dt, rate);
        break;
      }
      case "waiting":
      case "nibble":
      case "bite": {
        onWater = true;
        const gnd = w.heightAt(fp.x, fp.z);
        fp.y = gnd > -0.02 ? gnd + 0.02 : Math.sin(t * 1.3) * 0.006 + Math.sin(t * 2.7 + 1) * 0.003;
        this.updateBite(dt);
        fp.y -= this.sink;
        sag = this.state === "bite" ? 0.05 : 0.18;
        if (this.state === "waiting" && this.reelAct > 0.05) this.reelBait(dt, rate);
        break;
      }
      case "fight": {
        onWater = true;
        this.updateFight(dt, rate);
        fp.y = -this.sink;
        sag = 0.03 + 0.25 * (1 - f.tension);
        break;
      }
    }
    this.life?.setLure(fp.x, fp.z, this.state === "waiting" || this.state === "nibble" || this.state === "bite");
    if ((this.state === "waiting" || this.state === "nibble" || this.state === "bite") && Math.hypot(fp.x - cam.x, fp.z - cam.z) > 70) {
      this.flash("Żyłka zbyt długa — zwinięto.");
      this.retract();
    }
    this.floatG.position.copy(fp);
    this.floatG.rotation.set(Math.sin(t * 1.1) * 0.05, 0, Math.cos(t * 0.9) * 0.05);

    // ---- żyłka: po przelotkach, potem luk do spławika
    const P = this.linePos;
    const nodes = this.rod.lineNodes;
    for (let i = 0; i < this.nodeCount; i++) {
      nodes[i].getWorldPosition(this.tmpV);
      P[i * 3] = this.tmpV.x;
      P[i * 3 + 1] = this.tmpV.y;
      P[i * 3 + 2] = this.tmpV.z;
    }
    const base = this.nodeCount * 3;
    const N = this.sagN;
    for (let i = 0; i < N; i++) {
      const k = (i + 1) / N;
      const x = tip.x + (fp.x - tip.x) * k;
      const z = tip.z + (fp.z - tip.z) * k;
      let y = tip.y + (fp.y + 0.03 - tip.y) * k - sag * 4 * k * (1 - k);
      if (onWater && k > 0.15 && w.heightAt(x, z) < -0.05 && y < 0.01) y = 0.01;
      P[base + i * 3] = x;
      P[base + i * 3 + 1] = y;
      P[base + i * 3 + 2] = z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    // szpula ubywa żyłki wraz z długością rzutu
    const out = Math.hypot(fp.x - tip.x, fp.z - tip.z);
    const sc = 1 - 0.22 * clamp(out / 35, 0, 1);
    this.rod.spoolLine.scale.set(sc, sc, 1);

    // ---- holowana ryba (szczegółowy model z systemu ryb)
    if (this.hookFish && this.life && this.state === "fight") {
      const hf = this.hookFish;
      const dx = fp.x - this.fprev.x, dz = fp.z - this.fprev.z;
      if (dx * dx + dz * dz > 1e-6) {
        let d = Math.atan2(-dz, dx) - this.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += d * Math.min(1, dt * 7);
      }
      this.fprev.copy(fp);
      this.hookT += dt;
      const depth = this.depthAt(fp.x, fp.z);
      const tired = 1 - f.stamina;
      const early = this.hookT < 1.4;
      let y = f.run ? -Math.min(0.9, depth * 0.62) : -Math.min(0.42, depth * 0.42);
      y += (-0.05 - y) * clamp(tired * tired * 1.1, 0, 0.9);
      if (early) y = Math.max(y, -0.07);
      const rollT = early ? Math.sin(t * 14) * 0.9 : tired > 0.5 && !f.run ? 1.15 : Math.sin(t * 8) * (f.run ? 0.45 : 0.15);
      const roll = hf.roll + (rollT - hf.roll) * Math.min(1, dt * 6);
      const intensity = early ? 1 : f.run ? 0.9 : 0.25 + 0.5 * (1 - tired);
      this.life.drive(hf, fp.x, y, fp.z, this.heading, f.run ? 0.1 : -0.04, roll, intensity, Math.sin(t * 9) * 0.35 * (f.run || early ? 1 : 0.35));
    } else if (this.fishMesh.visible) {
      const dx = fp.x - this.fprev.x, dz = fp.z - this.fprev.z;
      if (dx * dx + dz * dz > 1e-5) {
        const target = Math.atan2(-dz, dx);
        let d = target - this.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += d * Math.min(1, dt * 6);
      }
      this.fprev.copy(fp);
      const depth = this.depthAt(fp.x, fp.z);
      this.fishMesh.position.set(fp.x, -Math.min(0.45, depth * 0.5) - 0.04, fp.z);
      this.fishMesh.rotation.set(0, this.heading, 0);
      this.fishTail.rotation.y = Math.sin(t * (f.run ? 18 : 9)) * 0.55;
    }
  }

  private hangPos(tip: THREE.Vector3, t: number) {
    return this.tmpH.set(tip.x + Math.sin(t * 1.7) * 0.03, tip.y - 0.85, tip.z + Math.cos(t * 1.3) * 0.03);
  }

  /** przeciąganie przynęty po wodzie / lądzie w stronę szczytówki */
  private reelBait(dt: number, rate: number) {
    if (rate < 0.02) return;
    const fp = this.fpos;
    const dx = this.tip.x - fp.x, dz = this.tip.z - fp.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.4) {
      this.retract();
      return;
    }
    const step = Math.min(d - 2.2, rate * dt);
    fp.x += (dx / d) * step;
    fp.z += (dz / d) * step;
  }

  private updateBite(dt: number) {
    const fp = this.fpos;
    const life = this.life;
    this.strikeBuf = Math.max(0, this.strikeBuf - dt);
    this.sink += (this.sinkTarget - this.sink) * Math.min(1, dt * 16);
    if (life && this.biteFish) {
      const depth = this.depthAt(fp.x, fp.z);
      life.approach(this.biteFish, fp.x + 0.05, this.state === "bite" ? -Math.min(0.9, depth * 0.7) : -Math.min(0.5, depth * 0.45), fp.z);
    }
    if (this.state === "waiting") {
      if (this.reelAct < 0.1) {
        this.nearT -= dt;
        if (this.nearT <= 0) {
          this.nearT = 0.5;
          this.nearCnt = life ? life.countNear(fp.x, fp.z, 3.5) : 0;
        }
        this.waitLeft -= dt * (1 + 1.2 * Math.min(this.nearCnt, 3));
      }
      if (this.waitLeft <= 0) this.startBite();
    } else if (this.state === "nibble") {
      this.nibbleLeft -= dt;
      this.nibbleTick -= dt;
      if (this.nibbleTick <= 0) {
        this.nibbleTick = 0.28 + Math.random() * 0.5;
        this.sinkTarget = 0.05 + Math.random() * 0.06;
        this.ripple(fp.x, fp.z, 0.35 + Math.random() * 0.3);
        if (life && this.biteFish) life.peck(this.biteFish);
        setTimeout(() => {
          if (this.state === "nibble") this.sinkTarget = 0.01;
        }, 140);
      }
      if (this.nibbleLeft <= 0) {
        if (this.biteReal) {
          this.state = "bite";
          this.biteLeft = 2.3;
          this.sinkTarget = 0.3;
          this.sink = Math.max(this.sink, 0.12);
          this.ripple(fp.x, fp.z, 1.1);
          this.audio.ding();
          // kliknięcie tuż przed braniem liczy się od razu
          if (this.strikeBuf > 0) this.hookset(0.88);
        } else {
          this.releaseFish();
          this.state = "waiting";
          this.sinkTarget = 0;
          this.waitLeft = 4 + Math.random() * 8;
        }
      }
    } else if (this.state === "bite") {
      this.biteLeft -= dt;
      // krótki czas łaski po zniknięciu spławika — opóźnienie reakcji nie zabija brania
      if (this.biteLeft <= -0.3) {
        this.flash("Spóźniłeś się — ryba odpłynęła.");
        this.releaseFish();
        this.state = "waiting";
        this.sinkTarget = 0;
        this.waitLeft = 4 + Math.random() * 8;
      }
    }
  }

  private updateFight(dt: number, rate: number) {
    const f = this.fight;
    const roll = this.pending!;
    const rod = RODS.find((r) => r.id === this.cfg.rod)!;
    const pw = roll.power;
    const cam = this.camera.position;
    this.sink += (this.sinkTarget - this.sink) * Math.min(1, dt * 6);
    f.phaseT -= dt;
    if (f.phaseT <= 0) {
      f.run = !f.run;
      if (f.run) {
        f.phaseT = (0.8 + Math.random() * 1.1) * (0.6 + 0.6 * pw);
        f.wTarget = (Math.random() - 0.5) * 1.8;
        this.ripple(this.fpos.x, this.fpos.z, 1.3);
        this.audio.splash(0.18);
      } else f.phaseT = (2.6 + Math.random() * 2.6) / (0.6 + 0.5 * pw);
    }
    f.stamina = Math.max(0, f.stamina - (dt * (f.run ? 0.085 : 0.035)) / (0.5 + 0.5 * pw));
    const reeling = this.reelAct > 0.15;
    const Rn = clamp(this.reelRate() / 3.15, 0, 1);
    const P = (f.run ? 1 : 0.28) * (0.3 + 0.7 * f.stamina) * (0.35 + 0.9 * pw) * rod.stress;
    let Tt: number;
    if (f.run) Tt = reeling ? 0.2 + 0.85 * P * (0.2 + 0.8 * Rn) : 0.12 + 0.22 * P;
    else Tt = reeling ? 0.08 + 0.5 * Rn * (0.45 + P) : 0.04;
    f.tension += (Tt - f.tension) * (1 - Math.exp(-dt / 0.5));
    f.tension = clamp(f.tension, 0, 1.05);
    const vFish = f.run ? 1.1 * P : 0.2 * P;
    let dd = vFish;
    if (reeling) dd -= rate * (f.tension > 0.9 ? 0.3 : 1) * (1 - 0.45 * clamp((pw - 0.4) / 0.7, 0, 1));
    f.d += dd * dt;
    f.wander += (f.wTarget - f.wander) * dt * 0.6;

    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      this.rippleT = f.run ? 0.35 + Math.random() * 0.3 : 0.8 + Math.random() * 0.7;
      this.ripple(this.fpos.x + (Math.random() - 0.5) * 0.3, this.fpos.z + (Math.random() - 0.5) * 0.3, f.run ? 0.9 : 0.5);
    }
    if (f.tension < 0.05) f.slack += dt;
    else f.slack = Math.max(0, f.slack - dt);

    const a = f.angle + f.wander;
    this.fpos.x = cam.x + Math.cos(a) * f.d;
    this.fpos.z = cam.z + Math.sin(a) * f.d;

    // hamulec: przy przeciążeniu żyłka ustępuje, pęka dopiero po dłuższym przeciążeniu
    if (f.tension >= 0.98) {
      this.overT += dt;
      f.d += 0.9 * dt;
      if (this.overT > 0.6) return this.endFight("Żyłka pękła! Zwijaj wolniej, gdy ryba ucieka.");
    } else this.overT = Math.max(0, this.overT - dt * 2);
    if (f.slack > 5.5) return this.endFight("Ryba wypięła się z haczyka. Nie dopuszczaj do luźnej żyłki!");
    const maxD = rod.maxCast + 14;
    if (f.d > maxD) return this.endFight("Ryba zerwała się z zestawu.");
    // ryba doholowana do płycizny przy brzegu
    if (this.depthAt(this.fpos.x, this.fpos.z) < 0.28) {
      f.beach += dt;
      if (f.beach > 0.6) this.completeCatch();
    } else f.beach = Math.max(0, f.beach - dt);
    if (f.d <= 2.4) this.completeCatch();
  }

  dispose() {
    this.camera.remove(this.rodRoot);
    this.group.parent?.remove(this.group);
    this.rod.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
