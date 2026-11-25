import kortowskieRaw from "./lakes/kortowskie.json";
import klebarskieRaw from "./lakes/klebarskie.json";

export interface LakeData {
  id: string;
  lat0: number;
  lon0: number;
  water: number[][];
  areaHa: number;
  extent: [number, number];
  areas: { c: number; r: number[][] }[];
  buildings: { h: number; roof: "flat" | "gabled" | "hipped"; wall: number; type: string; p: number[] }[];
  roads: { type: string; w: number; surf: number; bridge: boolean; p: number[] }[];
  piers: { kind: string; w: number; closed: boolean; name: string; p: number[] }[];
  trees: number[];
  benches: number[][];
  lamps: number[];
  pois: { n: string; x: number; z: number; k: string; s?: number }[];
  dem: { n: number; step: number; level: number; rel: number[] };
}

export interface LakeInfo {
  id: "kortowskie" | "klebarskie";
  name: string;
  place: string;
  tagline: string;
  description: string;
  facts: { label: string; value: string }[];
  /** orientacyjne miejsce startu (m od środka jeziora; x = wschód, z = południe) */
  spawn: { x: number; z: number };
  maxDepth: number;
  depthScale: number; // skala wypłycenia przy brzegu (m)
  shoreBank: number; // jak stromo wznosi się brzeg
  hillAmp: number; // dodatkowe pagórki (m)
  reedAmount: number; // 0..1 gęstość trzcin
  lilies: number; // 0..1 gęstość grzybieni
  waterColor: [number, number, number];
  accent: string;
  data: LakeData;
}

export const LAKES: LakeInfo[] = [
  {
    id: "kortowskie",
    name: "Jezioro Kortowskie",
    place: "Olsztyn · Kortowo",
    tagline: "Akademickie jezioro w mieście i lesie",
    description:
      "Drugie co do wielkości jezioro Olsztyna, nad którym leży kampus Uniwersytetu Warmińsko-Mazurskiego. Kortowo to czerwona cegła, stare aleje i plaża. Brzegi porastają lasy. Z wysokiej skarpy widać całą misę jeziora.",
    facts: [
      { label: "Powierzchnia", value: "89,7 ha" },
      { label: "Głębokość maks.", value: "17,2 m" },
      { label: "Głębokość średnia", value: "5,9 m" },
      { label: "Wysokość n.p.m.", value: "103,5 m" },
    ],
    spawn: { x: 400, z: 690 },
    maxDepth: 17.2,
    depthScale: 85,
    shoreBank: 1.0,
    hillAmp: 5,
    reedAmount: 0.45,
    lilies: 0.25,
    waterColor: [0.055, 0.15, 0.14],
    accent: "#e4572e",
    data: kortowskieRaw as unknown as LakeData,
  },
  {
    id: "klebarskie",
    name: "Jezioro Klebarskie",
    place: "Klebark Wielki · gm. Purda",
    tagline: "Rozlewisko z wyspami wśród łąk i pól",
    description:
      "Rozległe, płytkie jezioro Pojezierza Olsztyńskiego z trzema wyspami. Płaskie brzegi opasują łąki, pola uprawne i pasy trzcin. Nad wodą stoją drewniane pomosty, a wieś Klebark Wielki leży tuż obok.",
    facts: [
      { label: "Powierzchnia (w grze)", value: "ok. 190 ha" },
      { label: "Głębokość maks.", value: "9,7 m" },
      { label: "Głębokość średnia", value: "3,2 m" },
      { label: "Wysokość n.p.m.", value: "111,5 m" },
    ],
    spawn: { x: 540, z: 676 },
    maxDepth: 9.7,
    depthScale: 150,
    shoreBank: 0.55,
    hillAmp: 3.5,
    reedAmount: 0.85,
    lilies: 0.85,
    waterColor: [0.07, 0.15, 0.1],
    accent: "#2a9d8f",
    data: klebarskieRaw as unknown as LakeData,
  },
];
