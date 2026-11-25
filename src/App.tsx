import { useState } from "react";
import { LAKES, LakeInfo } from "./data/lakes";
import LakeThumb from "./components/LakeThumb";
import GameView from "./components/GameView";
import { PRESETS, TimeId } from "./game/sky";
import type { Quality } from "./game/engine";
import hero from "./assets/hero.jpg";

const QUALITY_OPTS: { id: Quality; label: string; hint: string }[] = [
  { id: "low", label: "Niska", hint: "bez cieni, mniejsze odbicia, krótszy zasięg lasu" },
  { id: "medium", label: "Średnia", hint: "cienie, odbicia w wodzie, zasięg ok. 1 km" },
  { id: "high", label: "Wysoka", hint: "ostre cienie i odbicia, bogate dno jeziora, zasięg ok. 1,35 km" },
  { id: "ultra", label: "Ultra", hint: "maksymalny realizm: dno z roślinami, kamieniami i patykami, cienie 4K, MSAA ×4 (wymaga mocnej karty)" },
];

export default function App() {
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [selected, setSelected] = useState<LakeInfo>(LAKES[0]);
  const [time, setTime] = useState<TimeId>("morning");
  const [quality, setQuality] = useState<Quality>("medium");

  if (screen === "game") return <GameView key={`${selected.id}-${quality}-${time}`} lake={selected} time={time} quality={quality} onExit={() => setScreen("menu")} />;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        <img src={hero} alt="" className="h-full w-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/75 to-slate-950" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-10 md:py-14">
        <header className="text-center">
          <div className="text-xs uppercase tracking-[0.45em] text-amber-200/80">Warmia · symulator spaceru</div>
          <h1 className="mt-3 font-serif text-5xl font-semibold leading-tight tracking-tight md:text-7xl">Jeziora Warmii</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-white/75 md:text-lg">
            Wybierz jezioro i przejdź się jego brzegiem w widoku z pierwszej osoby. Kształt akwenów, lasy, zabudowa, ścieżki i pomosty pochodzą z prawdziwych map.
          </p>
        </header>

        <main className="mt-10 grid flex-1 gap-6 md:grid-cols-2">
          {LAKES.map((lake) => {
            const active = selected.id === lake.id;
            return (
              <button
                key={lake.id}
                onClick={() => setSelected(lake)}
                className={`group relative flex flex-col overflow-hidden rounded-3xl border text-left backdrop-blur-md transition duration-300 ${
                  active ? "scale-[1.01] bg-slate-900/80 shadow-2xl" : "border-white/10 bg-slate-900/55 hover:bg-slate-900/70"
                }`}
                style={{ borderColor: active ? lake.accent : undefined, boxShadow: active ? `0 20px 60px -20px ${lake.accent}88` : undefined }}
              >
                <div className="relative">
                  <LakeThumb data={lake.data} className="h-56 w-full object-cover md:h-64" />
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-900/95 to-transparent" />
                  <div className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[11px] uppercase tracking-widest backdrop-blur" style={{ color: lake.accent }}>
                    mapa OSM
                  </div>
                  <div
                    className={`absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold transition ${active ? "text-white" : "border-white/40 text-transparent"}`}
                    style={{ background: active ? lake.accent : "transparent", borderColor: active ? lake.accent : undefined }}
                  >
                    ✓
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-6 pt-3">
                  <div className="text-xs uppercase tracking-[0.25em] text-white/50">{lake.place}</div>
                  <h2 className="mt-1 font-serif text-3xl font-semibold">{lake.name}</h2>
                  <div className="mt-1 text-sm font-medium" style={{ color: lake.accent }}>
                    {lake.tagline}
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-white/70">{lake.description}</p>
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    {lake.facts.map((f) => (
                      <div key={f.label} className="rounded-xl bg-white/5 px-3 py-2">
                        <dt className="text-[11px] uppercase tracking-wider text-white/45">{f.label}</dt>
                        <dd className="text-base font-semibold">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </button>
            );
          })}
        </main>

        <section className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-md">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
            <div>
              <div className="mb-2 text-xs uppercase tracking-widest text-white/50">Pora dnia</div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setTime(p.id)}
                    className={`rounded-full border px-4 py-2 text-sm transition ${time === p.id ? "border-white/70 bg-white/20" : "border-white/15 bg-white/5 hover:bg-white/10"}`}
                  >
                    <span className="mr-1.5">{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs uppercase tracking-widest text-white/50">Jakość grafiki</div>
              <div className="flex rounded-full border border-white/15 bg-white/5 p-1">
                {QUALITY_OPTS.map((q) => (
                  <button key={q.id} onClick={() => setQuality(q.id)} className={`flex-1 rounded-full px-4 py-1.5 text-sm transition ${quality === q.id ? "bg-white text-slate-900 font-semibold" : "text-white/75 hover:text-white"}`}>
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[11px] text-white/45">{QUALITY_OPTS.find((q) => q.id === quality)?.hint}</div>
            </div>
            <button
              onClick={() => setScreen("game")}
              className="rounded-full px-8 py-4 text-lg font-semibold text-white shadow-xl transition hover:brightness-110 active:scale-95"
              style={{ background: selected.accent, boxShadow: `0 12px 40px -10px ${selected.accent}` }}
            >
              Wejdź nad {selected.name.replace("Jezioro ", "jez. ")} →
            </button>
          </div>
        </section>

        <footer className="mt-6 text-center text-[11px] leading-relaxed text-white/40">
          Dane: © współtwórcy OpenStreetMap (ODbL) – brzegi, lasy, zabudowa, drogi, pomosty · rzeźba terenu: EU-DEM (Copernicus) · Gra działa w przeglądarce (WebGL2) – użyj klawiatury i myszy.
        </footer>
      </div>
    </div>
  );
}
