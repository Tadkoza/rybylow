import * as THREE from "three";
import type { LakeInfo } from "../data/lakes";
import { World, LC } from "./world";
import { Terrain } from "./terrain";
import { Water } from "./water";
import { Atmosphere, PRESETS, TimeId } from "./sky";
import { TreeSystem } from "./trees";
import { Plants } from "./plants";
import { Structures } from "./structures";
import { BoatSystem } from "./boats";
import { GroundCover } from "./groundcover";
import { FishingSystem, FishHud, CatchView } from "./fishing";
import { Waterfowl } from "./waterfowl";
import { Player } from "./player";
import { AmbientAudio } from "./audio";
import { createMapBase, drawMiniMap } from "./minimap";
import { timeUniform, windUniform, uwUniforms } from "./materials";
import { LakeBed } from "./lakebed";
import { FishLife } from "./fishlife";

export type Quality = "low" | "medium" | "high" | "ultra";

const QUALITY = {
  low: { pr: 1, shadow: 0, range: 60, refl: 0.3, samples: 0, trees: 650, grassR: 14, grassMax: 5500, reedR: 55, detail: false, cards: false, msaa: false, cover: 0.55, ferns: false, pebbles: false, bed: 0.25, bedR: 0.55, bedShader: false, fish: 0.6 },
  medium: { pr: 1.25, shadow: 1024, range: 70, refl: 0.55, samples: 0, trees: 1000, grassR: 22, grassMax: 10000, reedR: 100, detail: true, cards: true, msaa: true, cover: 0.8, ferns: true, pebbles: true, bed: 0.6, bedR: 0.8, bedShader: true, fish: 1 },
  high: { pr: 1.75, shadow: 2048, range: 100, refl: 0.6, samples: 2, trees: 1350, grassR: 28, grassMax: 16000, reedR: 150, detail: true, cards: true, msaa: true, cover: 1, ferns: true, pebbles: true, bed: 1, bedR: 1, bedShader: true, fish: 1 },
  ultra: { pr: 2, shadow: 4096, range: 110, refl: 0.85, samples: 4, trees: 1600, grassR: 32, grassMax: 22000, reedR: 170, detail: true, cards: true, msaa: true, cover: 1.15, ferns: true, pebbles: true, bed: 1.6, bedR: 1.2, bedShader: true, fish: 1.35 },
};

export interface HudInfo {
  heading: number;
  surface: string;
  depth: number;
  speed: number;
  swimming: boolean;
  underwater: boolean;
  x: number;
  z: number;
  fps: number;
  distToWater: number;
  place: string;
  inBoat: boolean;
  prompt: string;
  message: string;
}

export interface EngineOptions {
  container: HTMLElement;
  lake: LakeInfo;
  time: TimeId;
  quality: Quality;
  onProgress: (f: number, label: string) => void;
  onLockChange: (locked: boolean) => void;
  onHud: (h: HudInfo) => void;
  onFish: (h: FishHud) => void;
  onFishMenu: () => void;
  onCatch: (c: CatchView) => void;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export class Engine {
  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  world!: World;
  terrain!: Terrain;
  water!: Water;
  atmosphere!: Atmosphere;
  trees!: TreeSystem;
  plants!: Plants;
  structures!: Structures;
  boats!: BoatSystem;
  cover!: GroundCover;
  bed!: LakeBed;
  life!: FishLife;
  fishing!: FishingSystem;
  fowl!: Waterfowl;
  player!: Player;
  audio = new AmbientAudio();

  private opts: EngineOptions;
  private q;
  private raf = 0;
  private disposed = false;
  private locked = false;
  private sensitivity = 0.0022;
  private time = 0;
  private hudTimer = 0;
  private fishTimer = 0;
  private riseTimer = 8;
  private msg = "";
  private msgT = 0;
  private mapTimer = 0;
  private fpsAcc = 0;
  private prBase = 1;
  private prCur = 1;
  private adaptT = 0;
  private fishSig = "";
  private fpsFrames = 0;
  private fps = 60;
  private lastT = 0;
  private uw = false;
  private uwFog = new THREE.FogExp2(0x1d4a44, 0.085);
  private uwBg = new THREE.Color(0x1d4a44);
  private mapBase: HTMLCanvasElement | null = null;
  private minimap: HTMLCanvasElement | null = null;
  private mapRadius = 380;
  private resizeObs: ResizeObserver | null = null;
  private handlers: [EventTarget, string, EventListener][] = [];

  private constructor(opts: EngineOptions) {
    this.opts = opts;
    this.q = QUALITY[opts.quality];
  }

  static async create(opts: EngineOptions): Promise<Engine> {
    const e = new Engine(opts);
    await e.init();
    return e;
  }

  private async init() {
    const { container, lake } = this.opts;
    const q = this.q;
    const prog = this.opts.onProgress;

    const renderer = new THREE.WebGLRenderer({ antialias: this.opts.quality !== "low", powerPreference: "high-performance" });
    this.prBase = this.prCur = Math.min(window.devicePixelRatio || 1, q.pr);
    renderer.setPixelRatio(this.prCur);
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = q.shadow > 0;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 6500);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.world = await World.create(lake, (f, l) => prog(f * 0.62, l));
    if (this.disposed) return;
    const world = this.world;

    prog(0.64, "Napełnianie jeziora wodą…");
    await nextFrame();
    const dbw = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.water = new Water(world, dbw.x * q.refl, dbw.y * q.refl, q.samples);
    this.scene.add(this.water.mesh);

    this.atmosphere = new Atmosphere(this.scene, q.shadow, q.range);
    this.applyTime(this.opts.time);

    prog(0.68, "Formowanie terenu…");
    await nextFrame();
    this.terrain = new Terrain(world, { bed: q.bedShader });
    this.scene.add(this.terrain.group);
    this.terrain.update(world.spawn.x, world.spawn.z, true);

    prog(0.74, "Budowanie zabudowy, dróg i pomostów…");
    await nextFrame();
    this.structures = new Structures(world, { shadows: q.shadow > 0 });
    this.scene.add(this.structures.group);
    this.boats = new BoatSystem(world, q.shadow > 0);
    this.scene.add(this.boats.group);

    prog(0.8, "Sianie trawy i trzcin…");
    await nextFrame();
    this.plants = new Plants(world, { grassRadius: q.grassR, grassMax: q.grassMax, reedRadius: q.reedR, detail: q.detail });
    this.scene.add(this.plants.group);
    this.plants.update(world.spawn.x, world.spawn.z, true);
    this.cover = new GroundCover(world, { radius: q.cover, ferns: q.ferns, pebbles: q.pebbles });
    this.scene.add(this.cover.group);
    this.cover.update(world.spawn.x, world.spawn.z, true);

    prog(0.82, "Układanie dna jeziora: piasek, kamienie, patyki, rośliny…");
    await nextFrame();
    this.bed = new LakeBed(world, { amount: q.bed, radius: q.bedR, shadows: q.shadow > 0 });
    this.scene.add(this.bed.group);
    this.bed.update(world.spawn.x, world.spawn.z, true);

    prog(0.84, "Sadzenie lasu…");
    await nextFrame();
    this.trees = new TreeSystem(world, q.trees, q.shadow > 0, q.cards);
    this.scene.add(this.trees.group);
    let guard = 0;
    for (;;) {
      this.trees.update(world.spawn.x, world.spawn.z, 4, true);
      if (this.trees.pending === 0 || guard++ > 80) break;
      prog(0.84 + 0.14 * Math.min(1, guard / 14), "Sadzenie lasu…");
      await nextFrame();
      if (this.disposed) return;
    }

    this.player = new Player(world, this.trees);
    this.player.onStep = (s, run) => this.audio.footstep(s, run);
    this.fowl = new Waterfowl(world, this.opts.quality === "low" ? 5 : 11);
    this.scene.add(this.fowl.group);
    this.fishing = new FishingSystem(world, this.scene, this.camera, this.audio, lake.id, this.renderer);
    this.fishing.onCatch = (c) => this.opts.onCatch(c);
    this.life = new FishLife(world, { amount: q.fish, shadows: q.shadow > 0 });
    this.scene.add(this.life.group);
    this.fishing.life = this.life;
    this.life.onRipple = (x, z, size) => {
      this.fishing.ripple(x, z, size);
      if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 20) this.audio.splash(0.035);
    };
    this.applyTime(this.opts.time);

    prog(0.99, "Rysowanie mapy…");
    await nextFrame();
    this.mapBase = createMapBase(world);

    this.water.onReflectionStart = () => {
      this.plants.setReflectionMode(true);
      this.cover.setReflectionMode(true);
      this.bed.setReflectionMode(true);
      this.life.setReflectionMode(true);
    };
    this.water.onReflectionEnd = () => {
      this.plants.setReflectionMode(false);
      this.cover.setReflectionMode(false);
      this.bed.setReflectionMode(false);
      this.life.setReflectionMode(false);
    };
    this.water.setReflections(true);

    this.bindEvents();
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    prog(1, "Gotowe");
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ----------------------------------------------------------- zdarzenia
  private on(target: EventTarget, type: string, fn: (e: never) => void) {
    target.addEventListener(type, fn as EventListener);
    this.handlers.push([target, type, fn as EventListener]);
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;
    this.on(document, "pointerlockchange", () => {
      const l = document.pointerLockElement === canvas;
      this.locked = l;
      if (!l) {
        this.player.keys.clear();
        this.fishing.cancelInputs();
      }
      this.opts.onLockChange(l);
    });
    this.on(document, "mousedown", (e: MouseEvent) => {
      if (!this.locked) return;
      if (e.button === 1) e.preventDefault();
      if (e.button === 0) this.fishing.strike();
      else if (e.button === 1) this.fishing.castHold(true);
      else if (e.button === 2) this.fishing.reelHold(true);
    });
    this.on(document, "mouseup", (e: MouseEvent) => {
      if (e.button === 1) this.fishing.castHold(false);
      else if (e.button === 2) this.fishing.reelHold(false);
    });
    this.on(document, "auxclick", (e: MouseEvent) => {
      if (this.locked) e.preventDefault();
    });
    this.on(canvas, "contextmenu", (e: Event) => e.preventDefault());
    this.on(window, "wheel", (e: WheelEvent) => {
      if (!this.locked || !this.fishing.equipped) return;
      e.preventDefault();
      this.fishing.addReelSpeed(e.deltaY < 0 ? 1 : -1);
    });
    this.on(document, "mousemove", (e: MouseEvent) => {
      if (!this.locked) return;
      if (this.fishing.swinging) {
        this.fishing.swingInput(e.movementY);
        this.player.look(e.movementX, 0, this.sensitivity);
      } else this.player.look(e.movementX, e.movementY, this.sensitivity);
    });
    this.on(window, "keydown", (e: KeyboardEvent) => {
      if (!this.locked) return;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
      this.player.keys.add(e.code);
      if (e.code === "KeyE" && !e.repeat) this.toggleBoat();
      if (e.code === "KeyF" && !e.repeat) this.fishing.castHold(true);
      if (e.code === "KeyR" && !e.repeat) this.fishing.reelHold(true);
      if (e.code === "KeyX" && !e.repeat) this.fishing.addReelSpeed(1);
      if (e.code === "KeyZ" && !e.repeat) this.fishing.addReelSpeed(-1);
      if (e.code === "KeyG" && !e.repeat) {
        this.opts.onFishMenu();
        this.fishing.cancelInputs();
        document.exitPointerLock();
      }
      if (e.code === "KeyM") {
        this.mapRadius = this.mapRadius === 380 ? 900 : this.mapRadius === 900 ? 190 : 380;
      }
    });
    this.on(window, "keyup", (e: KeyboardEvent) => {
      this.player.keys.delete(e.code);
      if (e.code === "KeyF") this.fishing.castHold(false);
      if (e.code === "KeyR") this.fishing.reelHold(false);
    });
    this.on(window, "blur", () => this.player.keys.clear());
    this.on(window, "resize", () => this.resize());
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.opts.container);
  }

  private resize() {
    const c = this.opts.container;
    const w = c.clientWidth || window.innerWidth, h = c.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dbw = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.water.setSize(dbw.x * this.q.refl, dbw.y * this.q.refl);
  }

  private setPixelRatio(v: number) {
    this.prCur = v;
    this.renderer.setPixelRatio(v);
    this.resize();
  }

  private flash(text: string, sec = 3) {
    this.msg = text;
    this.msgT = sec;
  }

  private toggleBoat() {
    const p = this.player;
    if (p.boat) {
      const spot = this.boats.findLanding(p.boat);
      if (spot) p.disembark(spot.x, spot.z);
      else this.flash("Podpłyń bliżej brzegu lub pomostu, aby wysiąść");
    } else {
      const b = this.boats.nearest(p.pos.x, p.pos.z, 3.4);
      if (b && p.onGround) {
        p.board(b);
        b.onStroke = () => this.audio.splash(0.16);
        this.audio.splash(0.2);
      }
    }
  }

  // ------------------------------------------------------------------- API
  requestLock() {
    this.audio.start();
    const el = this.renderer.domElement;
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  setSensitivity(v: number) {
    this.sensitivity = v;
    if (this.fishing) this.fishing.swingGain = 0.0025 + v * 0.8;
  }
  setFov(v: number) {
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
  }
  setVolume(v: number) {
    this.audio.setVolume(v);
  }
  setMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
  }

  applyTime(id: TimeId) {
    const p = PRESETS.find((x) => x.id === id) ?? PRESETS[1];
    this.atmosphere.apply(p, this.renderer);
    windUniform.value = p.wind;
    // kaustyki na dnie zależą od wysokości i siły słońca oraz od zachmurzenia
    const sunUp = Math.sin((p.elevation * Math.PI) / 180);
    uwUniforms.uCaustic.value = (p.id === "overcast" ? 0.1 : 1) * Math.min(1, p.sunIntensity / 3.6) * Math.min(1, sunUp * 2.4);
    if (this.fishing) this.fishing.timeBoost = id === "morning" ? 1.35 : id === "golden" ? 1.4 : id === "overcast" ? 1.1 : 0.8;
    uwUniforms.uSkyCol.value.copy(this.atmosphere.fog.color);
    const wc = this.opts.lake.waterColor;
    uwUniforms.uHazeCol.value.setRGB(wc[0] * 2.0 * p.bodyMul, wc[1] * 1.8 * p.bodyMul, wc[2] * 1.4 * p.bodyMul);
    const sc = new THREE.Color(p.sunColor);
    this.water.setAtmosphere({
      sunDir: this.atmosphere.sunDir,
      sunColor: sc.multiplyScalar(id === "overcast" ? 0.2 : 1.2),
      fogColor: this.atmosphere.fog.color,
      fogDensity: p.fogDensity,
      waveAmp: p.waveAmp,
      bodyMul: p.bodyMul,
    });
  }

  // ---------------------------------------------------------------- pętla
  private updateCamera() {
    const p = this.player;
    const cam = this.camera;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    cam.position.set(p.pos.x + cy * p.camSide, p.camY, p.pos.z - sy * p.camSide);
    cam.rotation.set(p.pitch, p.yaw, 0);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.tick(dt);
  };

  /** narzędzia diagnostyczne (testy automatyczne) */
  debugStop() {
    cancelAnimationFrame(this.raf);
  }
  debugTick(dt = 0.016, locked = false, render = true) {
    this.locked = locked;
    this.skipRender = !render;
    this.tick(dt);
    this.skipRender = false;
  }
  private skipRender = false;

  private tick(dt: number) {
    this.time += dt;
    timeUniform.value = this.time;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    // adaptacyjna rozdzielczość: przy niskim FPS obniżamy, przy zapasie wracamy
    this.adaptT += dt;
    if (this.adaptT > 2.5 && this.time > 6 && !this.skipRender) {
      this.adaptT = 0;
      if (this.fps < 34 && this.prCur > this.prBase * 0.55) this.setPixelRatio(this.prCur * 0.87);
      else if (this.fps > 57 && this.prCur < this.prBase) this.setPixelRatio(Math.min(this.prBase, this.prCur * 1.08));
    }

    if (this.locked) this.player.update(dt);
    this.updateCamera();
    const cam = this.camera.position;

    this.terrain.update(cam.x, cam.z);
    this.trees.update(cam.x, cam.z, 1);
    this.plants.update(cam.x, cam.z);
    this.cover.update(cam.x, cam.z);
    this.bed.update(cam.x, cam.z);
    this.life.update(dt, this.time, { x: cam.x, y: cam.y, z: cam.z, yaw: this.player.yaw });
    this.fishing.update(dt, this.time);
    this.fowl.update(this.time, dt, this.player.pos.x, this.player.pos.z);
    this.riseTimer -= dt;
    if (this.riseTimer <= 0) {
      this.riseTimer = 6 + Math.random() * 12;
      const a = this.player.yaw + (Math.random() - 0.5) * 2.2, d = 10 + Math.random() * 38;
      const rx = cam.x - Math.sin(a) * d, rz = cam.z - Math.cos(a) * d;
      if (this.world.heightAt(rx, rz) < -0.7) {
        this.fishing.ripple(rx, rz, 0.9);
        this.audio.splash(Math.max(0.03, 0.12 - d * 0.002));
      }
    }
    this.fishTimer -= dt;
    if (this.fishTimer <= 0) {
      this.fishTimer = 0.05;
      // odświeżaj HUD tylko przy zmianie (mniej renderów Reacta = płynniejsza gra)
      const h = this.fishing.hud;
      const sw = h.swing ? `${(h.swing.s * 40) | 0}:${(h.swing.peak * 40) | 0}:${(h.swing.power * 40) | 0}` : "";
      const sig = `${h.equipped}|${h.state}|${h.text}|${(h.tension * 50) | 0}|${(h.distance * 5) | 0}|${h.message}|${h.reeling}|${h.bailOpen}|${h.reelSpeed}|${h.catch ? 1 : 0}|${sw}|${h.running}|${(h.shore * 4) | 0}|${h.rod}|${h.bait}`;
      if (sig !== this.fishSig) {
        this.fishSig = sig;
        this.opts.onFish(h);
      }
    }
    this.boats.update(this.time, dt);
    this.structures.update(this.time, cam.x, cam.z);
    this.atmosphere.update(cam, dt);

    // pod wodą
    const uw = this.player.underwater;
    if (uw !== this.uw) {
      this.uw = uw;
      this.scene.fog = uw ? this.uwFog : this.atmosphere.fog;
      this.scene.background = uw ? this.uwBg : null;
      this.atmosphere.sky.visible = !uw;
    }

    // dźwięk
    const w = this.world;
    const sd = w.sdfAt(this.player.pos.x, this.player.pos.z);
    const lc = w.landAt(this.player.pos.x, this.player.pos.z);
    const preset = this.atmosphere.preset;
    this.audio.update(dt, { waterDist: sd, forest: lc >= 1 && lc <= 3, underwater: uw, birds: preset.birds, wind: preset.wind });

    if (!this.skipRender) this.renderer.render(this.scene, this.camera);

    this.msgT -= dt;
    if (this.player.waterBlock > 1.0 && !this.player.boat && this.msgT <= 0) this.flash("Woda jest tu za głęboka — skorzystaj z łódki przy pomoście", 3.5);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.15;
      const p = this.player;
      let prompt = "";
      if (p.boat) prompt = "E — wysiądź · W/S wiosłuj · A/D skręcaj · Shift szybciej";
      else if (p.onGround && this.boats.nearest(p.pos.x, p.pos.z, 3.4)) prompt = "E — wsiądź do łódki";
      let hd = (-p.yaw * 180) / Math.PI;
      hd = ((hd % 360) + 360) % 360;
      this.opts.onHud({
        heading: hd,
        surface: p.surface,
        depth: p.depth,
        speed: p.speed,
        swimming: p.swimming,
        underwater: uw,
        x: p.pos.x,
        z: p.pos.z,
        fps: this.fps,
        distToWater: sd,
        place: p.boat ? "na jeziorze (łódka)" : placeName(lc),
        inBoat: !!p.boat,
        prompt,
        message: this.msgT > 0 ? this.msg : "",
      });
    }
    this.mapTimer -= dt;
    if (this.mapTimer <= 0 && this.minimap && this.mapBase) {
      this.mapTimer = 0.08;
      drawMiniMap(this.minimap, this.mapBase, this.player.pos.x, this.player.pos.z, this.player.yaw, this.mapRadius);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const [t, ty, fn] of this.handlers) t.removeEventListener(ty, fn);
    this.handlers = [];
    this.resizeObs?.disconnect();
    if (document.pointerLockElement === this.renderer?.domElement) document.exitPointerLock();
    this.audio.dispose();
    try {
      this.terrain?.dispose();
      this.water?.dispose();
      this.trees?.dispose();
      this.plants?.dispose();
      this.structures?.dispose();
      this.boats?.dispose();
      this.cover?.dispose();
      this.bed?.dispose();
      this.fishing?.dispose();
      this.fowl?.dispose();
      this.life?.dispose();
    } catch {
      /* ignore */
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}

function placeName(lc: number): string {
  switch (lc) {
    case LC.FOREST_MIX:
    case LC.FOREST_CONIF:
    case LC.FOREST_BROAD:
      return "las";
    case LC.FARM:
      return "pola uprawne";
    case LC.MEADOW:
      return "łąka";
    case LC.RESID:
      return "zabudowa";
    case LC.PARK:
      return "park / tereny zielone";
    case LC.WET:
      return "mokradło";
    case LC.BEACH:
      return "plaża";
    case LC.PAVED:
      return "teren utwardzony";
    case LC.SCRUB:
      return "zarośla";
    case LC.ORCHARD:
      return "sad";
    default:
      return "okolice jeziora";
  }
}
