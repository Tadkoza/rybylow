import { fbm, smoothstep, clamp } from "./noise";

/** udział podłoży dna (wspólny dla koloru terenu i rozmieszczenia kamieni / roślin) */
export interface BedMix {
  sand: number;
  gravel: number;
  mud: number;
  debris: number;
  stony: number;
}

const OUT: BedMix = { sand: 1, gravel: 0, mud: 0, debris: 0, stony: 0 };

/** UWAGA: zwraca współdzielony obiekt — odczytaj wartości od razu */
export function bedMix(x: number, z: number, depth: number, n1: number): BedMix {
  const dd = depth + (n1 - 0.5) * 1.4;
  let sand = 1 - smoothstep(1.8, 4.6, dd);
  let mud = smoothstep(1.4, 5.0, dd);
  const patch = smoothstep(0.56, 0.7, fbm(x / 13, z / 13, 3, 303));
  const stony = smoothstep(0.5, 0.68, fbm(x / 40, z / 40, 2, 305)) * (1 - smoothstep(0.6, 2.6, depth));
  const gravel = clamp(patch * (1 - smoothstep(2.6, 5.2, depth)) + stony * 0.7, 0, 1);
  sand *= 1 - gravel * 0.85;
  mud *= 1 - gravel * 0.9;
  const debris = smoothstep(0.52, 0.74, fbm(x / 7, z / 7, 3, 307)) * (0.3 + 0.7 * mud + 0.3 * sand);
  OUT.sand = sand;
  OUT.gravel = gravel;
  OUT.mud = mud;
  OUT.debris = debris;
  OUT.stony = stony;
  return OUT;
}
