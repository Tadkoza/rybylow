export type SpeciesId = "szczupak" | "okon" | "wzdrega" | "ploc" | "karp" | "leszcz" | "lin" | "klen" | "bolen" | "sandacz";
export type MethodId = "float" | "spinning" | "ground" | "fly";
export type BaitId = "corn" | "worm" | "maggot";
export type RodId = "telescope" | "match";

export interface Species {
  id: SpeciesId;
  name: string;
  latin: string;
  minL: number; // cm
  maxL: number;
  k: number; // masa [kg] = k * (L/100)^3
  power: number; // 0..1 – siła walki
  methods: MethodId[];
  habitat: string;
  desc: string;
  needs: string;
}

export const SPECIES: Species[] = [
  {
    id: "wzdrega",
    name: "Wzdręga",
    latin: "Scardinius erythrophthalmus",
    minL: 12,
    maxL: 40,
    k: 11,
    power: 0.3,
    methods: ["float"],
    habitat: "Płycizny, trzciny, zarośnięte zatoki; trzyma się tuż pod powierzchnią.",
    desc: "Złocista ryba z czerwonymi płetwami. Chętnie bierze białe robaki z wierzchu wody.",
    needs: "spławik",
  },
  {
    id: "ploc",
    name: "Płoć",
    latin: "Rutilus rutilus",
    minL: 12,
    maxL: 42,
    k: 11,
    power: 0.32,
    methods: ["float"],
    habitat: "Prawie cały akwen: od płycizn po głębsze rynny. Żyje w stadach.",
    desc: "Srebrzysta, z czerwonym okiem. Najpospolitsza ryba na spławik, uwielbia białe robaki.",
    needs: "spławik",
  },
  {
    id: "leszcz",
    name: "Leszcz",
    latin: "Abramis brama",
    minL: 25,
    maxL: 70,
    k: 13,
    power: 0.5,
    methods: ["float"],
    habitat: "Głębsze, spokojne partie jeziora z miękkim dnem.",
    desc: "Wysoki, spłaszczony i brązowo-miedziany. Ciężko holuje, ale rzadko robi gwałtowne ucieczki.",
    needs: "spławik",
  },
  {
    id: "karp",
    name: "Karp",
    latin: "Cyprinus carpio",
    minL: 30,
    maxL: 95,
    k: 14.5,
    power: 0.95,
    methods: ["float"],
    habitat: "Zarośnięte zatoki i przybrzeżne głębiny. Najchętniej żeruje przy mule.",
    desc: "Najsilniejsza ryba na spławik. Uwielbia kukurydzę, a po braniu potrafi ruszyć w długą ucieczkę.",
    needs: "spławik",
  },
  {
    id: "lin",
    name: "Lin",
    latin: "Tinca tinca",
    minL: 22,
    maxL: 55,
    k: 13.5,
    power: 0.55,
    methods: ["float"],
    habitat: "Zarośnięte, muliste płycizny i zatoki; żeruje przy dnie, wśród roślin podwodnych.",
    desc: "Oliwkowozielony, gruby i śluzowaty, z drobnymi łuskami i czerwonym okiem. Rzadko widywany, bierze ostrożnie, a holowany ciągnie przy dnie.",
    needs: "spławik",
  },
  {
    id: "okon",
    name: "Okoń",
    latin: "Perca fluviatilis",
    minL: 15,
    maxL: 50,
    k: 13.6,
    power: 0.45,
    methods: ["spinning"],
    habitat: "Przy trzcinach, zatopionych gałęziach i skarpach. Drapieżnik stadny.",
    desc: "Pasiasty drapieżnik z czerwonymi płetwami brzusznymi.",
    needs: "spinning (wkrótce)",
  },
  {
    id: "szczupak",
    name: "Szczupak",
    latin: "Esox lucius",
    minL: 40,
    maxL: 120,
    k: 6.5,
    power: 0.9,
    methods: ["spinning"],
    habitat: "Skraj trzcin i grzybieni; czai się w zasadzce.",
    desc: "Drapieżnik-zasadnik o wielkiej paszczy. Atakuje gwałtownie i walczy do końca.",
    needs: "spinning (wkrótce)",
  },
  {
    id: "klen",
    name: "Kleń",
    latin: "Squalius cephalus",
    minL: 20,
    maxL: 60,
    k: 11.5,
    power: 0.6,
    methods: ["spinning"],
    habitat: "Przy dopływach, pod zwisającymi gałęziami i przy pomostach.",
    desc: "Ostrożny i silny karpiowaty. Szeroka głowa i pomarańczowe płetwy.",
    needs: "spinning (wkrótce)",
  },
  {
    id: "bolen",
    name: "Boleń",
    latin: "Leuciscus aspius",
    minL: 40,
    maxL: 100,
    k: 9,
    power: 0.85,
    methods: ["spinning"],
    habitat: "Toń otwartej wody; poluje na drobnicę przy powierzchni.",
    desc: "Jedyny karpiowaty drapieżnik. Srebrzysty, szybki, z dużym, skośnym pyskiem.",
    needs: "spinning (wkrótce)",
  },
  {
    id: "sandacz",
    name: "Sandacz",
    latin: "Sander lucioperca",
    minL: 35,
    maxL: 100,
    k: 8.8,
    power: 0.7,
    methods: ["spinning"],
    habitat: "Głębokie, twardodenne rynny i skarpy; poluje o zmroku.",
    desc: "Wydłużony drapieżnik z kłami i szklistym okiem, dobrze widzi w półmroku.",
    needs: "spinning (wkrótce)",
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s])) as Record<SpeciesId, Species>;

export interface MethodInfo {
  id: MethodId;
  name: string;
  available: boolean;
  desc: string;
}
export const METHODS: MethodInfo[] = [
  { id: "float", name: "Spławik", available: true, desc: "Klasyczne łowienie na spławik – wzdręga, płoć, leszcz i karp." },
  { id: "ground", name: "Gruntówka", available: false, desc: "Wkrótce." },
  { id: "spinning", name: "Spinning", available: false, desc: "Wkrótce – szczupak, okoń, boleń, sandacz, kleń." },
  { id: "fly", name: "Muchowanie", available: false, desc: "Wkrótce." },
];

export interface BaitInfo {
  id: BaitId;
  name: string;
  desc: string;
  best: string;
  weights: Partial<Record<SpeciesId, number>>;
  sizeBias: number; // + większe ryby
  speed: number; // szybkość brań
  color: string;
}
export const BAITS: BaitInfo[] = [
  {
    id: "corn",
    name: "Kukurydza",
    desc: "Twarda, słodka przynęta. Odsiewa drobnicę i wabi większe ryby.",
    best: "karp, leszcz",
    weights: { karp: 5, leszcz: 2.5, ploc: 1, wzdrega: 0.7, lin: 1.4 },
    sizeBias: 0.3,
    speed: 0.85,
    color: "#f2c230",
  },
  {
    id: "worm",
    name: "Dżdżownice",
    desc: "Uniwersalna, naturalna przynęta. Dobra na leszcza i płoć.",
    best: "leszcz, płoć",
    weights: { leszcz: 4, karp: 2, ploc: 2.5, wzdrega: 1.3, lin: 2.2 },
    sizeBias: 0.12,
    speed: 1,
    color: "#b3544a",
  },
  {
    id: "maggot",
    name: "Biały robak",
    desc: "Drobna, ruchliwa przynęta. Płocie i wzdręgi biorą szybko, ale zwykle są niewielkie.",
    best: "płoć, wzdręga",
    weights: { ploc: 5, wzdrega: 4, leszcz: 2, karp: 0.6, lin: 0.7 },
    sizeBias: -0.2,
    speed: 1.35,
    color: "#efe8cc",
  },
];

export interface RodInfo {
  id: RodId;
  name: string;
  desc: string;
  maxCast: number;
  stress: number; // mnożnik napięcia żyłki (mniej = bezpieczniej)
}
export const RODS: RodInfo[] = [
  { id: "telescope", name: "Teleskop 3,6 m", desc: "Lekka i poręczna. Rzut do ok. 22 m, żyłka napina się szybciej.", maxCast: 22, stress: 1.15 },
  { id: "match", name: "Match 4,5 m", desc: "Dłuższa, z miękkim szczytówką. Rzut do ok. 32 m, lepiej amortyzuje szarpnięcia.", maxCast: 32, stress: 0.82 },
];

export interface FishRoll {
  species: SpeciesId;
  length: number;
  weight: number;
  power: number;
}

export function rollFishOfLength(id: SpeciesId, length: number, rnd: () => number = Math.random): FishRoll {
  const sp = SPECIES_BY_ID[id];
  const weight = Math.max(0.02, sp.k * Math.pow(length / 100, 3) * (0.88 + rnd() * 0.24));
  const sizeRatio = Math.min(1, Math.max(0, (length - sp.minL) / (sp.maxL - sp.minL)));
  const power = Math.min(1.15, 0.2 + 0.5 * Math.sqrt(Math.min(1, weight / 6)) + 0.45 * sp.power * (0.35 + 0.65 * sizeRatio));
  return { species: id, length, weight: Math.round(weight * 100) / 100, power };
}

export function rollFish(id: SpeciesId, sizeBias: number, rnd: () => number = Math.random): FishRoll {
  const sp = SPECIES_BY_ID[id];
  const u = rnd();
  const t = Math.pow(u, Math.max(0.9, 2.4 - sizeBias * 2.4));
  const length = Math.round(sp.minL + (sp.maxL - sp.minL) * t * (0.92 + rnd() * 0.08));
  return rollFishOfLength(id, length, rnd);
}

export function fmtWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(2).replace(".", ",")} kg`;
}

// ------------------------------------------------------------------- dziennik
export interface CatchEntry {
  id: number;
  species: SpeciesId;
  length: number;
  weight: number;
  lake: string;
  bait: BaitId;
  ts: number;
}
export interface Journal {
  catches: CatchEntry[];
  records: Partial<Record<SpeciesId, { length: number; weight: number }>>;
}
const KEY = "jeziora-warmii-dziennik-v1";

export function loadJournal(): Journal {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Journal;
      if (j && Array.isArray(j.catches)) return { catches: j.catches, records: j.records ?? {} };
    }
  } catch {
    /* ignore */
  }
  return { catches: [], records: {} };
}

export function addCatch(e: CatchEntry): { record: boolean; first: boolean } {
  const j = loadJournal();
  const prev = j.records[e.species];
  const first = !prev;
  const record = !prev || e.weight > prev.weight;
  if (record) j.records[e.species] = { length: e.length, weight: e.weight };
  j.catches.unshift(e);
  j.catches = j.catches.slice(0, 200);
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
  return { record, first };
}

// -------------------------------------------------------------- rysowanie ryb
interface Style {
  hr: number;
  top: number[];
  bot: number[];
  back: string;
  flank: string;
  belly: string;
  fin: string;
  fin2: string;
  tail: number;
  eye: string;
  pupil?: string;
  dorsal: [number, number, number]; // początek, koniec, wysokość
  stripes?: number;
  spots?: string;
  scales?: number;
  barbels?: boolean;
  jaw?: number;
  twoDorsal?: boolean;
  fin2Dark?: boolean;
}

const STYLES: Record<SpeciesId, Style> = {
  ploc: {
    hr: 0.3,
    top: [0.5, 0.3, 0.16, 0.07, 0.03, 0.04, 0.12, 0.24, 0.34, 0.4, 0.42],
    bot: [0.5, 0.7, 0.84, 0.93, 0.98, 0.97, 0.88, 0.76, 0.66, 0.6, 0.58],
    back: "#4f6560", flank: "#c9d4d2", belly: "#f4f4ee", fin: "#d4553a", fin2: "#d96a45", tail: 0.55, eye: "#e0602a", dorsal: [0.4, 0.57, 0.15], scales: 0.35,
  },
  wzdrega: {
    hr: 0.34,
    top: [0.5, 0.3, 0.14, 0.05, 0.02, 0.04, 0.12, 0.24, 0.34, 0.4, 0.42],
    bot: [0.5, 0.72, 0.88, 0.97, 1.0, 0.98, 0.9, 0.78, 0.68, 0.62, 0.58],
    back: "#5e6030", flank: "#c9b25a", belly: "#ecdca0", fin: "#d83a22", fin2: "#e0482a", tail: 0.55, eye: "#e8b020", dorsal: [0.5, 0.64, 0.14], scales: 0.4,
  },
  leszcz: {
    hr: 0.46,
    top: [0.5, 0.28, 0.1, 0.01, 0.0, 0.05, 0.16, 0.3, 0.4, 0.43, 0.44],
    bot: [0.5, 0.72, 0.9, 1.0, 1.0, 0.96, 0.86, 0.72, 0.62, 0.58, 0.56],
    back: "#5a5a46", flank: "#b5a97c", belly: "#dcd3b0", fin: "#58554e", fin2: "#6a665c", tail: 0.7, eye: "#d8d4c0", dorsal: [0.4, 0.5, 0.2], scales: 0.35, fin2Dark: true,
  },
  karp: {
    hr: 0.36,
    top: [0.5, 0.3, 0.12, 0.03, 0.0, 0.03, 0.12, 0.26, 0.38, 0.42, 0.43],
    bot: [0.5, 0.72, 0.9, 0.98, 1.0, 0.98, 0.88, 0.74, 0.64, 0.6, 0.58],
    back: "#555526", flank: "#b99a46", belly: "#e2d192", fin: "#8a6838", fin2: "#9a7240", tail: 0.5, eye: "#c9a030", dorsal: [0.3, 0.7, 0.14], scales: 0.9, barbels: true,
  },
  lin: {
    hr: 0.33,
    top: [0.5, 0.3, 0.14, 0.05, 0.02, 0.05, 0.14, 0.27, 0.37, 0.41, 0.42],
    bot: [0.5, 0.72, 0.88, 0.96, 0.99, 0.97, 0.89, 0.77, 0.67, 0.62, 0.6],
    back: "#33401f", flank: "#667632", belly: "#b4a64e", fin: "#4a572b", fin2: "#566330", tail: 0.12, eye: "#d9632a", dorsal: [0.42, 0.62, 0.13], scales: 0.12, barbels: true,
  },
  okon: {
    hr: 0.33,
    top: [0.48, 0.28, 0.12, 0.04, 0.0, 0.08, 0.22, 0.34, 0.42, 0.45, 0.46],
    bot: [0.52, 0.72, 0.86, 0.94, 0.98, 0.94, 0.84, 0.72, 0.64, 0.6, 0.58],
    back: "#3a4a24", flank: "#8c9a36", belly: "#efe8c4", fin: "#d8452a", fin2: "#d8452a", tail: 0.4, eye: "#e8872a", dorsal: [0.3, 0.58, 0.2], stripes: 6, twoDorsal: true,
  },
  szczupak: {
    hr: 0.2,
    top: [0.46, 0.3, 0.22, 0.18, 0.16, 0.18, 0.24, 0.34, 0.42, 0.45, 0.46],
    bot: [0.58, 0.74, 0.82, 0.86, 0.88, 0.86, 0.8, 0.7, 0.6, 0.55, 0.54],
    back: "#33442a", flank: "#6f804a", belly: "#ebe6c4", fin: "#a8683a", fin2: "#b9784a", tail: 0.45, eye: "#e0b840", dorsal: [0.66, 0.8, 0.26], spots: "#d9d8a0", jaw: 1,
  },
  klen: {
    hr: 0.26,
    top: [0.5, 0.3, 0.15, 0.08, 0.05, 0.07, 0.15, 0.28, 0.38, 0.42, 0.43],
    bot: [0.5, 0.72, 0.86, 0.93, 0.95, 0.93, 0.85, 0.72, 0.63, 0.59, 0.57],
    back: "#47593a", flank: "#b2b88c", belly: "#f1efe2", fin: "#c8553a", fin2: "#d96a3e", tail: 0.55, eye: "#cfd0c0", dorsal: [0.46, 0.6, 0.15], scales: 0.7,
  },
  bolen: {
    hr: 0.24,
    top: [0.5, 0.3, 0.18, 0.1, 0.07, 0.1, 0.18, 0.3, 0.4, 0.43, 0.44],
    bot: [0.62, 0.75, 0.84, 0.9, 0.92, 0.9, 0.83, 0.72, 0.63, 0.59, 0.57],
    back: "#3a5160", flank: "#c9d1d5", belly: "#f6f6f6", fin: "#b04030", fin2: "#c04a36", tail: 0.75, eye: "#d8dad0", dorsal: [0.52, 0.64, 0.14], scales: 0.45, jaw: 0.6,
  },
  sandacz: {
    hr: 0.23,
    top: [0.46, 0.28, 0.18, 0.12, 0.1, 0.14, 0.22, 0.33, 0.41, 0.44, 0.45],
    bot: [0.58, 0.74, 0.84, 0.9, 0.92, 0.9, 0.82, 0.7, 0.62, 0.58, 0.56],
    back: "#444f36", flank: "#97965a", belly: "#e9e5c9", fin: "#7a7a50", fin2: "#8a8a58", tail: 0.5, eye: "#d8e2d2", dorsal: [0.38, 0.52, 0.2], stripes: 7, twoDorsal: true, jaw: 0.4,
  },
};

function interp(arr: number[], t: number): number {
  const n = arr.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const f = x - i;
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

/** rysuje rybę zwróconą głową w lewo w polu (x,y,w); wysokość ≈ w*hr */
export function drawFish(ctx: CanvasRenderingContext2D, id: SpeciesId, x: number, y: number, w: number) {
  const st = STYLES[id];
  const h = w * st.hr;
  const bodyW = w * 0.9;
  const X = (nx: number) => x + nx * bodyW;
  const Y = (ny: number) => y + ny * h;
  const topY = (t: number) => Y(interp(st.top, t));
  const botY = (t: number) => Y(interp(st.bot, t));
  ctx.save();
  ctx.lineJoin = "round";

  // cień
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 1.15, w * 0.42, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();

  // płetwa ogonowa
  const ty = Y(0.5);
  const tH = h * (id === "szczupak" ? 0.7 : 0.95) * (id === "bolen" ? 1.15 : 1);
  const tx0 = X(0.9) - w * 0.006;
  ctx.fillStyle = st.fin;
  ctx.beginPath();
  ctx.moveTo(tx0, ty - h * 0.085);
  ctx.quadraticCurveTo(x + w * 0.97, ty - tH * 0.62, x + w * 1.0, ty - tH * 0.58);
  ctx.quadraticCurveTo(x + w * (1 - 0.1 * st.tail - 0.03), ty - tH * 0.1, x + w * (1 - 0.14 * st.tail - 0.03), ty);
  ctx.quadraticCurveTo(x + w * (1 - 0.1 * st.tail - 0.03), ty + tH * 0.1, x + w * 1.0, ty + tH * 0.58);
  ctx.quadraticCurveTo(x + w * 0.97, ty + tH * 0.62, tx0, ty + h * 0.085);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(tx0, ty);
    ctx.lineTo(x + w * (0.99 - 0.05 * Math.abs(i) * st.tail * 0.4), ty + (tH * 0.55 * i) / 3);
    ctx.stroke();
  }

  // płetwy grzbietowe
  const drawDorsal = (a: number, b: number, hh: number) => {
    const ta = (a - 0) / 0.9, tb = (b - 0) / 0.9;
    ctx.fillStyle = st.fin;
    ctx.beginPath();
    ctx.moveTo(X(a), topY(ta) + h * 0.02);
    ctx.quadraticCurveTo(X(a + (b - a) * 0.25), topY(ta) - h * hh * 1.1, X(a + (b - a) * 0.5), topY((ta + tb) / 2) - h * hh);
    ctx.lineTo(X(b), topY(tb) - h * hh * 0.35);
    ctx.lineTo(X(b), topY(tb) + h * 0.03);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      ctx.beginPath();
      ctx.moveTo(X(a + (b - a) * t), topY(ta + (tb - ta) * t) + h * 0.02);
      ctx.lineTo(X(a + (b - a) * t * 0.85 + (b - a) * 0.12), topY(ta + (tb - ta) * t) - h * hh * (1 - 0.5 * t));
      ctx.stroke();
    }
  };
  if (st.twoDorsal) {
    drawDorsal(st.dorsal[0], st.dorsal[0] + (st.dorsal[1] - st.dorsal[0]) * 0.52, st.dorsal[2]);
    drawDorsal(st.dorsal[0] + (st.dorsal[1] - st.dorsal[0]) * 0.58 + 0.04, st.dorsal[1] + 0.14, st.dorsal[2] * 0.8);
  } else drawDorsal(st.dorsal[0], st.dorsal[1], st.dorsal[2]);

  // płetwa odbytowa i brzuszna
  const drawBottomFin = (a: number, b: number, hh: number, col: string) => {
    const ta = a / 0.9, tb = b / 0.9;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(X(a), botY(ta) - h * 0.03);
    ctx.quadraticCurveTo(X(a + (b - a) * 0.3), botY(ta) + h * hh * 1.1, X(a + (b - a) * 0.55), botY((ta + tb) / 2) + h * hh);
    ctx.lineTo(X(b), botY(tb) + h * hh * 0.2);
    ctx.lineTo(X(b), botY(tb) - h * 0.03);
    ctx.closePath();
    ctx.fill();
  };
  drawBottomFin(0.74, 0.86, 0.22, st.fin);
  drawBottomFin(0.4, 0.5, 0.2, st.fin2);

  // korpus
  const N = 48;
  const body = new Path2D();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const px = X(t * 0.9), py = topY(t);
    i === 0 ? body.moveTo(px, py) : body.lineTo(px, py);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    body.lineTo(X(t * 0.9), botY(t));
  }
  body.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, st.back);
  g.addColorStop(0.38, st.flank);
  g.addColorStop(0.72, st.flank);
  g.addColorStop(1, st.belly);
  ctx.fillStyle = g;
  ctx.fill(body);

  ctx.save();
  ctx.clip(body);
  // łuski
  if (st.scales) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + st.scales * 0.12})`;
    ctx.lineWidth = 0.8;
    const sz = w * (0.02 + st.scales * 0.016);
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 40; col++) {
        const cx = X(0.22 + col * 0.018) + (row % 2) * sz * 0.5, cy = Y(0.1 + row * 0.075);
        ctx.beginPath();
        ctx.arc(cx, cy, sz * 0.6, -0.4, Math.PI * 0.9);
        ctx.stroke();
      }
  }
  if (st.stripes) {
    ctx.fillStyle = id === "okon" ? "rgba(20,30,10,0.65)" : "rgba(40,40,20,0.42)";
    for (let i = 0; i < st.stripes; i++) {
      const sx = X(0.27 + (i / st.stripes) * 0.55);
      ctx.beginPath();
      ctx.moveTo(sx - w * 0.012, y - 2);
      ctx.lineTo(sx + w * 0.018, y - 2);
      ctx.lineTo(sx + w * 0.03, y + h * 0.78);
      ctx.lineTo(sx + w * 0.004, y + h * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (st.spots) {
    ctx.fillStyle = st.spots;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 22; c++) {
        const sx = X(0.16 + c * 0.034 + (r % 2) * 0.015), sy = Y(0.22 + r * 0.14 + ((c * 7) % 3) * 0.02);
        ctx.beginPath();
        ctx.ellipse(sx, sy, w * 0.011, w * 0.006, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  // połysk wzdłuż grzbietu
  const hl = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
  hl.addColorStop(0, "rgba(255,255,255,0.28)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, w, h * 0.55);
  // linia boczna
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 30; i++) {
    const t = 0.22 + (i / 30) * 0.68;
    const px = X(t * 0.9), py = (topY(t) * 0.6 + botY(t) * 0.4);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // obrys
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.4;
  ctx.stroke(body);

  // płetwa piersiowa
  ctx.fillStyle = st.fin2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.ellipse(X(0.27), Y(0.74), w * 0.05, h * 0.1, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // pokrywa skrzelowa, oko, pysk
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(X(0.19), Y(0.2));
  ctx.quadraticCurveTo(X(0.235), Y(0.5), X(0.19), Y(0.86));
  ctx.stroke();
  const ex = X(st.jaw && st.jaw > 0.9 ? 0.11 : 0.085), ey = Y(0.4);
  const er = Math.max(3, h * 0.09);
  ctx.fillStyle = st.eye;
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#050505";
  ctx.beginPath();
  ctx.arc(ex, ey, er * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(ex - er * 0.2, ey - er * 0.25, er * 0.16, 0, Math.PI * 2);
  ctx.fill();
  // pysk
  ctx.strokeStyle = "rgba(20,10,5,0.7)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + 1, Y(0.52));
  ctx.quadraticCurveTo(X(0.05), Y(0.6 + (st.jaw ?? 0) * 0.02), X(0.1 + (st.jaw ?? 0) * 0.05), Y(0.62));
  ctx.stroke();
  if (st.barbels) {
    ctx.strokeStyle = "#a88a40";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 2, Y(0.6));
    ctx.quadraticCurveTo(x - w * 0.02, Y(0.8), x + w * 0.015, Y(0.95));
    ctx.stroke();
  }
  ctx.restore();
}

export function fishHeightRatio(id: SpeciesId): number {
  return STYLES[id].hr;
}
