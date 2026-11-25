import { World, WORLD_HALF } from "./world";

const SIZE = 1600;
export const MAP_MPP = (WORLD_HALF * 2) / SIZE;

const AREA_COL: Record<number, string> = {
  1: "#9bbd86",
  2: "#86ab76",
  3: "#a6c78f",
  4: "#ebe3ac",
  5: "#d6e5a6",
  6: "#ebe0d2",
  7: "#c3deaa",
  8: "#b0cfa6",
  9: "#f3e5b4",
  10: "#dcdcdc",
  11: "#bccb96",
  12: "#c9e0a6",
};

export function createMapBase(world: World): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#dfe6b8";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const X = (x: number) => (x + WORLD_HALF) / MAP_MPP;

  for (const a of world.data.areas) {
    ctx.fillStyle = AREA_COL[a.c] ?? "#dfe6b8";
    ctx.beginPath();
    for (const r of a.r) {
      for (let i = 0; i < r.length; i += 2) {
        if (i === 0) ctx.moveTo(X(r[i]), X(r[i + 1]));
        else ctx.lineTo(X(r[i]), X(r[i + 1]));
      }
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
  // woda
  ctx.fillStyle = "#79b6e4";
  ctx.beginPath();
  for (const r of world.data.water) {
    for (let i = 0; i < r.length; i += 2) {
      if (i === 0) ctx.moveTo(X(r[i]), X(r[i + 1]));
      else ctx.lineTo(X(r[i]), X(r[i + 1]));
    }
    ctx.closePath();
  }
  ctx.fill("evenodd");
  ctx.strokeStyle = "#4f94c9";
  ctx.lineWidth = 1;
  ctx.stroke();

  // drogi
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const roads = world.data.roads.filter((r) => !r.bridge);
  for (const pass of [0, 1]) {
    for (const r of roads) {
      const narrow = r.type === "path" || r.type === "footway" || r.type === "steps" || r.type === "cycleway" || r.type === "track" || r.type === "bridleway";
      const lw = Math.max(narrow ? 0.7 : 1.1, (r.w / MAP_MPP) * 1.5);
      ctx.lineWidth = pass === 0 ? lw + 1.2 : lw;
      ctx.strokeStyle = pass === 0 ? "#b9b4a8" : narrow ? (r.type === "track" ? "#d9c9a0" : "#f4ecdf") : "#ffffff";
      if (narrow && pass === 0) continue;
      ctx.beginPath();
      for (let i = 0; i < r.p.length; i += 2) {
        if (i === 0) ctx.moveTo(X(r.p[i]), X(r.p[i + 1]));
        else ctx.lineTo(X(r.p[i]), X(r.p[i + 1]));
      }
      ctx.stroke();
    }
  }
  // budynki
  ctx.fillStyle = "#b3a69b";
  for (const b of world.buildings) {
    ctx.beginPath();
    for (let i = 0; i < b.pts.length; i += 2) {
      if (i === 0) ctx.moveTo(X(b.pts[i]), X(b.pts[i + 1]));
      else ctx.lineTo(X(b.pts[i]), X(b.pts[i + 1]));
    }
    ctx.closePath();
    ctx.fill();
  }
  // mola
  ctx.strokeStyle = "#7a5a3a";
  for (const p of world.piers) {
    if (p.poly) continue;
    ctx.lineWidth = Math.max(1.2, p.w / MAP_MPP);
    ctx.beginPath();
    for (let i = 0; i < p.pts.length; i += 2) {
      if (i === 0) ctx.moveTo(X(p.pts[i]), X(p.pts[i + 1]));
      else ctx.lineTo(X(p.pts[i]), X(p.pts[i + 1]));
    }
    ctx.stroke();
  }
  return c;
}

/** rysuje wycinek mapy wycentrowany na graczu, obrócony zgodnie z kierunkiem patrzenia */
export function drawMiniMap(canvas: HTMLCanvasElement, base: HTMLCanvasElement, x: number, z: number, yaw: number, radius: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const S = canvas.width;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.rotate(yaw);
  const k = (S / 2 / radius) * MAP_MPP;
  ctx.scale(k, k);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, -(x + WORLD_HALF) / MAP_MPP, -(z + WORLD_HALF) / MAP_MPP);
  ctx.restore();
  // strzałka gracza
  ctx.save();
  ctx.translate(S / 2, S / 2);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, S * 0.22, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e4572e";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -S * 0.045);
  ctx.lineTo(S * 0.032, S * 0.04);
  ctx.lineTo(0, S * 0.022);
  ctx.lineTo(-S * 0.032, S * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
