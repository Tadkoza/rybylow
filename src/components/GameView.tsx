import { useEffect, useRef, useState } from "react";
import type { LakeInfo } from "../data/lakes";
import { Engine, HudInfo, Quality } from "../game/engine";
import { PRESETS, TimeId } from "../game/sky";
import { SWING, type FishHud } from "../game/fishing";
import { BAITS, RODS, fmtWeight, loadJournal, Journal } from "../game/fishdata";
import FishingMenu, { FishCfg } from "./FishingMenu";
import FishArt from "./FishArt";

interface Props {
  lake: LakeInfo;
  time: TimeId;
  quality: Quality;
  onExit: () => void;
}

type Phase = "loading" | "ready" | "playing" | "paused" | "menu" | "error";

const SURFACE_PL: Record<string, string> = {
  water: "woda",
  sand: "piasek",
  grass: "trawa",
  forest: "leśna ściółka",
  wood: "pomost",
  asphalt: "asfalt / kostka",
  dirt: "ścieżka gruntowa",
};

const swingPct = (v: number) => (1 - (v - SWING.min) / (SWING.max - SWING.min)) * 100;

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIR_PL: Record<string, string> = { N: "N", NE: "NE", E: "E", SE: "SE", S: "S", SW: "SW", W: "W", NW: "NW" };

function Compass({ heading }: { heading: number }) {
  const marks: { ang: number; x: number }[] = [];
  const span = 70;
  const k0 = Math.floor((heading - span) / 5), k1 = Math.ceil((heading + span) / 5);
  for (let k = k0; k <= k1; k++) {
    const ang = k * 5;
    marks.push({ ang, x: 50 + ((ang - heading) / (span * 2)) * 100 });
  }
  return (
    <div className="relative h-11 w-[420px] max-w-[70vw] overflow-hidden rounded-full border border-white/20 bg-black/35 backdrop-blur-sm">
      {marks.map((m) => {
        const a = ((m.ang % 360) + 360) % 360;
        const major = a % 45 === 0;
        const mid = a % 15 === 0;
        const edge = Math.abs(m.x - 50) / 50;
        return (
          <div key={m.ang} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${m.x}%`, opacity: 1 - edge * 0.85 }}>
            {major ? (
              <span className={`mt-0.5 text-[13px] font-semibold ${a === 0 ? "text-red-400" : "text-white"}`}>{DIR_PL[DIRS[a / 45]]}</span>
            ) : (
              <span className="mt-1 text-[9px] leading-3 text-white/60">{mid ? a : ""}</span>
            )}
            <span className={`mt-0.5 w-px bg-white/70 ${major ? "h-3" : mid ? "h-2" : "h-1"}`} />
          </div>
        );
      })}
      <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-amber-300/90" />
    </div>
  );
}

export default function GameView({ lake, time, quality, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("Przygotowanie…");
  const [hud, setHud] = useState<HudInfo | null>(null);
  const [error, setError] = useState("");
  const [curTime, setCurTime] = useState<TimeId>(time);
  const [sens, setSens] = useState(5);
  const [fov, setFov] = useState(74);
  const [volume, setVolume] = useState(0.7);
  const [showHint, setShowHint] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [fishOpen, setFishOpen] = useState(false);
  const [fishHud, setFishHud] = useState<FishHud | null>(null);
  const [journal, setJournal] = useState<Journal>(() => loadJournal());
  const [fishCfg, setFishCfg] = useState<FishCfg>(() => {
    try {
      const raw = localStorage.getItem("jeziora-warmii-sprzet");
      if (raw) return JSON.parse(raw) as FishCfg;
    } catch {
      /* ignore */
    }
    return { rod: "telescope", bait: "worm" };
  });
  const fishMenuRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let eng: Engine | null = null;
    const container = containerRef.current!;
    Engine.create({
      container,
      lake,
      time,
      quality,
      onProgress: (f, l) => {
        if (disposed) return;
        setProgress(f);
        setLabel(l);
      },
      onLockChange: (l) => {
        if (disposed) return;
        if (l) {
          fishMenuRef.current = false;
          setFishOpen(false);
        }
        setPhase((p) => (l ? "playing" : p === "playing" ? (fishMenuRef.current ? "menu" : "paused") : p));
      },
      onFishMenu: () => {
        if (disposed) return;
        fishMenuRef.current = true;
        setJournal(loadJournal());
        setFishOpen(true);
      },
      onFish: (h) => {
        if (!disposed) setFishHud(h);
      },
      onCatch: () => {
        if (!disposed) setJournal(loadJournal());
      },
      onHud: (h) => {
        if (!disposed) setHud(h);
      },
    })
      .then((e) => {
        if (disposed) {
          e.dispose();
          return;
        }
        eng = e;
        engineRef.current = e;
        e.setMinimap(mapRef.current);
        (window as unknown as { __lake?: Engine }).__lake = e;
        e.setSensitivity(0.0004 * 5 + 0.0002);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        console.error(err);
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
          setPhase("error");
        }
      });
    return () => {
      disposed = true;
      eng?.dispose();
      engineRef.current = null;
    };
  }, [lake, quality, time]);

  useEffect(() => {
    engineRef.current?.applyTime(curTime);
  }, [curTime, phase]);
  useEffect(() => {
    engineRef.current?.setSensitivity(0.0004 * sens + 0.0002);
  }, [sens, phase]);
  useEffect(() => {
    engineRef.current?.setFov(fov);
  }, [fov, phase]);
  useEffect(() => {
    engineRef.current?.setVolume(volume);
  }, [volume, phase]);

  useEffect(() => {
    if (phase === "playing") {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 15000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const closeMenu = (relock: boolean) => {
    fishMenuRef.current = false;
    setFishOpen(false);
    if (relock) engineRef.current?.requestLock();
    else setPhase("paused");
  };
  const startFishing = () => {
    localStorage.setItem("jeziora-warmii-sprzet", JSON.stringify(fishCfg));
    const f = engineRef.current?.fishing;
    if (f) {
      f.setConfig(fishCfg);
      f.setEquipped(true);
    }
    closeMenu(true);
  };
  const stowRod = () => {
    engineRef.current?.fishing.setEquipped(false);
    closeMenu(true);
  };
  const closeRef = useRef(closeMenu);
  closeRef.current = closeMenu;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "F3") {
        e.preventDefault();
        setShowFps((v) => !v);
      }
      if (e.code === "KeyG" && !e.repeat && fishMenuRef.current && !document.pointerLockElement) {
        e.preventDefault();
        closeRef.current(true);
      }
      if (e.code === "Escape" && fishMenuRef.current && !document.pointerLockElement) closeRef.current(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const lockIn = () => engineRef.current?.requestLock();
  const inGame = phase === "playing";
  const heading = hud?.heading ?? 0;
  const nRad = (heading * Math.PI) / 180;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-black text-white">
      <div ref={containerRef} className="absolute inset-0" onClick={() => (phase === "ready" || phase === "paused") && lockIn()} />

      {/* HUD */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${inGame ? "opacity-100" : "opacity-0"}`}>
        {hud?.underwater && <div className="absolute inset-0 bg-cyan-900/35 backdrop-blur-[1.5px]" />}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)" }} />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]" />
        <div className="absolute left-1/2 top-4 -translate-x-1/2">
          <Compass heading={heading} />
          <div className="mt-1 text-center text-xs font-medium tracking-widest text-white/80 drop-shadow">{Math.round(heading)}°</div>
        </div>
        <div className="absolute left-5 top-4 rounded-xl bg-black/35 px-4 py-2 backdrop-blur-sm">
          <div className="text-sm font-semibold">{lake.name}</div>
          <div className="text-[11px] text-white/70">{lake.place}</div>
        </div>
        {showFps && hud && <div className="absolute right-5 top-4 rounded bg-black/50 px-2 py-1 font-mono text-xs">{hud.fps.toFixed(0)} FPS</div>}

        {/* minimapa */}
        <div className="absolute bottom-5 left-5">
          <div className="relative h-[210px] w-[210px]">
            <canvas ref={mapRef} width={420} height={420} className="h-full w-full rounded-full border-[3px] border-white/80 shadow-xl shadow-black/50" />
            <div
              className="absolute left-1/2 top-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow"
              style={{ transform: `translate(calc(-50% + ${-Math.sin(nRad) * 96}px), calc(-50% + ${-Math.cos(nRad) * 96}px))` }}
            >
              N
            </div>
          </div>
          <div className="mt-1 text-center text-[10px] text-white/70">M – zmień skalę mapy</div>
        </div>

        {/* informacje */}
        {hud && (
          <div className="absolute bottom-5 right-5 min-w-[210px] rounded-xl bg-black/40 px-4 py-3 text-sm backdrop-blur-sm">
            <div className="text-[11px] uppercase tracking-wider text-white/60">Tu jesteś</div>
            <div className="font-semibold capitalize">{hud.place}</div>
            <div className="mt-1 text-white/80">
              {hud.inBoat
                ? `Wiosłujesz · głębokość ${hud.depth.toFixed(1)} m`
                : hud.depth > 0.1
                  ? `Brodzisz w płytkiej wodzie · ${hud.depth.toFixed(2)} m`
                  : `Podłoże: ${SURFACE_PL[hud.surface] ?? hud.surface}`}
            </div>
            <div className="text-xs text-white/60">
              {hud.distToWater > 0 ? `do brzegu: ${Math.round(hud.distToWater)} m` : "na jeziorze"} · {(hud.speed * 3.6).toFixed(1)} km/h
            </div>
          </div>
        )}

        {fishHud?.equipped && (
          <>
            {fishHud.state === "bite" && (
              <div className="absolute left-1/2 top-[22%] -translate-x-1/2 animate-pulse rounded-2xl bg-red-600/85 px-8 py-3 font-serif text-3xl font-bold tracking-wide text-white shadow-2xl">BRANIE!</div>
            )}
            {fishHud.state === "swing" && fishHud.swing && (
              <div className="absolute right-[14%] top-1/2 flex -translate-y-1/2 items-stretch gap-4">
                <div className="flex flex-col items-center gap-1 text-[11px] uppercase tracking-wider text-white/70">
                  <span>do tyłu</span>
                  <div className="relative h-60 w-10 rounded-full border border-white/35 bg-black/55">
                    <div className="absolute inset-x-0 rounded-sm bg-emerald-400/60" style={{ top: `${swingPct(SWING.hi)}%`, height: `${swingPct(SWING.lo) - swingPct(SWING.hi)}%` }} />
                    <div className="absolute inset-x-1 h-px bg-amber-300/80" style={{ top: `${swingPct(fishHud.swing.peak)}%` }} />
                    <div className="absolute -left-2 -right-2 h-1.5 rounded bg-white shadow" style={{ top: `calc(${swingPct(fishHud.swing.s)}% - 3px)` }} />
                  </div>
                  <span>do przodu</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-[11px] uppercase tracking-wider text-white/70">
                  <span>siła</span>
                  <div className="relative h-60 w-4 overflow-hidden rounded-full border border-white/35 bg-black/55">
                    <div className="absolute inset-x-0 bottom-0 rounded-full" style={{ height: `${Math.max(2, fishHud.swing.power * 100)}%`, background: "linear-gradient(0deg,#4ade80,#facc15 60%,#ef4444)" }} />
                  </div>
                </div>
              </div>
            )}
            <div className="absolute bottom-[96px] left-1/2 flex w-[min(440px,86vw)] -translate-x-1/2 flex-col items-center gap-2">
              {fishHud.state === "fight" && (
                <div className="w-full rounded-2xl border border-white/20 bg-black/55 p-3">
                  <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-white/70">
                    <span>Napięcie żyłki</span>
                    <span>do brzegu: {fishHud.shore.toFixed(1)} m</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${Math.min(100, fishHud.tension * 100)}%`, background: fishHud.tension > 0.8 ? "#ef4444" : fishHud.tension > 0.55 ? "#facc15" : "#4ade80" }} />
                  </div>
                </div>
              )}
              {fishHud.text && fishHud.state !== "caught" && (
                <div className={`rounded-full px-5 py-2 text-sm font-semibold backdrop-blur-sm ${fishHud.state === "bite" || (fishHud.state === "fight" && fishHud.running) ? "bg-red-600/80 text-white" : "bg-black/55 text-white/90"}`}>{fishHud.text}</div>
              )}
              {fishHud.message && <div className="rounded-xl border border-amber-300/40 bg-black/65 px-4 py-1.5 text-sm text-amber-100">{fishHud.message}</div>}
            </div>
            <div className="absolute right-5 top-4 flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 text-xs text-white/80 backdrop-blur-sm">
              🎣 {RODS.find((r) => r.id === fishHud.rod)?.name} · <span style={{ color: BAITS.find((b) => b.id === fishHud.bait)?.color }}>●</span> {BAITS.find((b) => b.id === fishHud.bait)?.name}
              <span className="text-white/40">· G</span>
            </div>
            <div className="absolute right-5 top-[58px] rounded-xl bg-black/40 px-3 py-2 text-xs text-white/80 backdrop-blur-sm">
              <div className="mb-1 flex items-center justify-between gap-6">
                <span className="uppercase tracking-wider text-white/55">Prędkość zwijania</span>
                <span className={fishHud.reeling ? "font-semibold text-emerald-300" : "text-white/50"}>{fishHud.reeling ? "zwijasz" : fishHud.reelSpeed + "/10"}</span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className="h-3 w-3.5 rounded-sm" style={{ background: i < fishHud.reelSpeed ? (i < 4 ? "#4ade80" : i < 7 ? "#facc15" : "#f87171") : "rgba(255,255,255,0.16)" }} />
                ))}
              </div>
              <div className="mt-1 text-[10px] text-white/45">PPM zwijaj · kółko myszy = prędkość</div>
            </div>
            {fishHud.catch && (
              <div className="absolute left-1/2 top-[14%] w-[min(420px,90vw)] -translate-x-1/2 rounded-3xl border border-white/25 bg-slate-950/85 p-5 text-center shadow-2xl backdrop-blur-md">
                {fishHud.catch.record && <div className="mb-1 text-xs font-bold uppercase tracking-[0.3em] text-amber-300">{fishHud.catch.first ? "Nowy gatunek w dzienniku!" : "Nowy rekord!"}</div>}
                <div className="text-xs uppercase tracking-[0.3em] text-white/50">Złowiono</div>
                <FishArt id={fishHud.catch.species} width={340} className="mx-auto" />
                <div className="font-serif text-3xl font-semibold">{fishHud.catch.name}</div>
                <div className="mt-1 text-lg text-white/85">
                  {fishHud.catch.length} cm · {fmtWeight(fishHud.catch.weight)}
                </div>
                <div className="mt-2 text-xs text-white/50">Ryba wraca do wody. Kliknij LPM lub wciśnij rolkę, aby łowić dalej.</div>
              </div>
            )}
          </>
        )}

        {hud?.prompt && (
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-white/25 bg-black/55 px-6 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-sm">
            {hud.prompt}
          </div>
        )}
        {hud?.message && (
          <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-xl border border-amber-300/40 bg-black/60 px-5 py-2 text-sm text-amber-100 backdrop-blur-sm">{hud.message}</div>
        )}

        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-max max-w-[94vw] rounded-full bg-black/45 px-5 py-2 text-center text-xs text-white/90 backdrop-blur-sm transition-opacity duration-1000 ${showHint ? "opacity-100" : "opacity-0"}`}>
          <b>WASD</b> ruch · <b>Mysz</b> rozglądanie · <b>Shift</b> bieg · <b>Spacja</b> skok · <b>C</b> kucanie · <b>E</b> łódka · <b>G</b> wędka · <b>M</b> mapa · <b>Esc</b> pauza
        </div>
      </div>

      {/* ekran ładowania */}
      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6">
          <div className="text-xs uppercase tracking-[0.35em] text-white/50">Ładowanie świata</div>
          <h2 className="mt-3 text-center font-serif text-4xl font-semibold md:text-5xl" style={{ color: lake.accent }}>
            {lake.name}
          </h2>
          <div className="mt-1 text-white/60">{lake.place}</div>
          <div className="mt-10 h-2 w-[min(520px,80vw)] overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-all duration-200" style={{ width: `${Math.round(progress * 100)}%`, background: lake.accent }} />
          </div>
          <div className="mt-3 text-sm text-white/70">
            {label} <span className="text-white/40">{Math.round(progress * 100)}%</span>
          </div>
          <p className="mt-10 max-w-md text-center text-xs leading-relaxed text-white/40">
            Brzeg jeziora, lasy, zabudowa, drogi i pomosty pochodzą z danych OpenStreetMap, a rzeźba terenu z modelu EU-DEM. Świat jest generowany przy każdym starcie.
          </p>
        </div>
      )}

      {/* ready / pauza */}
      {(phase === "ready" || phase === "paused") && !fishOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]" onClick={lockIn}>
          <div className="max-h-full w-[min(760px,100%)] overflow-y-auto rounded-3xl border border-white/15 bg-slate-950/85 p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-white/50">{phase === "paused" ? "Pauza" : "Świat gotowy"}</div>
                <h2 className="mt-1 font-serif text-3xl font-semibold" style={{ color: lake.accent }}>
                  {lake.name}
                </h2>
                <div className="text-sm text-white/60">{lake.place}</div>
              </div>
              <button onClick={lockIn} className="rounded-full px-7 py-3 text-base font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95" style={{ background: lake.accent }}>
                {phase === "paused" ? "Wznów spacer" : "Wejdź nad jezioro"}
              </button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs uppercase tracking-widest text-white/50">Pora dnia</div>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setCurTime(p.id)}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${curTime === p.id ? "border-white/70 bg-white/15" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
                    >
                      <span className="mr-1.5">{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 space-y-3 text-sm">
                  <label className="block">
                    <div className="mb-1 flex justify-between text-white/70">
                      <span>Czułość myszy</span>
                      <span>{sens}</span>
                    </div>
                    <input type="range" min={1} max={12} value={sens} onChange={(e) => setSens(+e.target.value)} className="w-full accent-amber-400" />
                  </label>
                  <label className="block">
                    <div className="mb-1 flex justify-between text-white/70">
                      <span>Pole widzenia (FOV)</span>
                      <span>{fov}°</span>
                    </div>
                    <input type="range" min={55} max={105} value={fov} onChange={(e) => setFov(+e.target.value)} className="w-full accent-amber-400" />
                  </label>
                  <label className="block">
                    <div className="mb-1 flex justify-between text-white/70">
                      <span>Głośność</span>
                      <span>{Math.round(volume * 100)}%</span>
                    </div>
                    <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} className="w-full accent-amber-400" />
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs uppercase tracking-widest text-white/50">Sterowanie</div>
                <ul className="space-y-1.5 text-sm text-white/85">
                  {[
                    ["W A S D", "chodzenie"],
                    ["Mysz", "rozglądanie się"],
                    ["Shift", "bieg"],
                    ["Spacja", "skok"],
                    ["C", "kucanie"],
                    ["E", "wsiądź / wysiądź z łódki"],
                    ["G", "wędkarstwo (sprzęt, atlas ryb)"],
                    ["Rolka (ŚPM) / F", "rzut: przytrzymaj i puść (lub zamach myszką)"],
                    ["LPM", "zacięcie przy braniu"],
                    ["PPM · kółko", "zwijanie · prędkość"],
                    ["M", "skala minimapy"],
                    ["F3", "licznik FPS"],
                    ["Esc", "pauza"],
                  ].map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
                      <kbd className="rounded bg-white/15 px-2 py-0.5 font-mono text-xs">{k}</kbd>
                      <span>{v}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-white/50">W głębszą wodę nie wejdziesz i nie spadniesz z pomostu. Na jezioro wypłyniesz łódką: podejdź do niej na pomoście i naciśnij E, potem wiosłuj W/S i skręcaj A/D.</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <button onClick={onExit} className="rounded-full border border-white/20 px-5 py-2 text-sm text-white/80 transition hover:bg-white/10">
                ← Wybierz inne jezioro
              </button>
              <span className="text-xs text-white/40">Kliknij w tło, aby wrócić do gry</span>
            </div>
          </div>
        </div>
      )}

      {fishOpen && (
        <FishingMenu
          journal={journal}
          cfg={fishCfg}
          equipped={!!fishHud?.equipped}
          lakeName={lake.name}
          onCfg={setFishCfg}
          onStart={startFishing}
          onStow={stowRod}
          onClose={() => closeMenu(true)}
        />
      )}

      {phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-8 text-center">
          <h2 className="text-2xl font-semibold text-red-400">Nie udało się uruchomić gry</h2>
          <p className="mt-3 max-w-lg text-white/70">Gra wymaga przeglądarki z włączoną akceleracją WebGL2. Szczegóły: {error}</p>
          <button onClick={onExit} className="mt-6 rounded-full bg-white/10 px-6 py-2 hover:bg-white/20">
            Wróć do menu
          </button>
        </div>
      )}
    </div>
  );
}
