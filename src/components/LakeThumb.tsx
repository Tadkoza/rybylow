import { useEffect, useRef } from "react";
import type { LakeData } from "../data/lakes";

const COL: Record<number, string> = {
  1: "#6f9a5a",
  2: "#5f8a52",
  3: "#7fa869",
  4: "#d9d08f",
  5: "#b9d08a",
  6: "#cfc3b5",
  7: "#a5c98a",
  8: "#8fb58a",
  9: "#eadba3",
  10: "#c5c5c5",
  11: "#9db87c",
  12: "#b0cc8d",
};

/** miniatura jeziora narysowana z prawdziwych danych OSM */
export default function LakeThumb({ data, className }: { data: LakeData; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = c.width, H = c.height;
    const ctx = c.getContext("2d")!;
    // zakres: jezioro + margines
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const r of data.water) for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]);
      x1 = Math.max(x1, r[i]);
      z0 = Math.min(z0, r[i + 1]);
      z1 = Math.max(z1, r[i + 1]);
    }
    const pad = 420;
    x0 -= pad;
    x1 += pad;
    z0 -= pad;
    z1 += pad;
    const s = Math.min(W / (x1 - x0), H / (z1 - z0));
    const ox = (W - (x1 - x0) * s) / 2, oz = (H - (z1 - z0) * s) / 2;
    const X = (x: number) => (x - x0) * s + ox, Z = (z: number) => (z - z0) * s + oz;
    ctx.fillStyle = "#cfd9a6";
    ctx.fillRect(0, 0, W, H);
    for (const a of data.areas) {
      ctx.fillStyle = COL[a.c] ?? "#cfd9a6";
      ctx.beginPath();
      for (const r of a.r) {
        for (let i = 0; i < r.length; i += 2) i === 0 ? ctx.moveTo(X(r[i]), Z(r[i + 1])) : ctx.lineTo(X(r[i]), Z(r[i + 1]));
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 0.8;
    for (const r of data.roads) {
      if (r.type === "path" || r.type === "footway" || r.type === "steps" || r.type === "track" || r.type === "cycleway") continue;
      ctx.beginPath();
      for (let i = 0; i < r.p.length; i += 2) i === 0 ? ctx.moveTo(X(r.p[i]), Z(r.p[i + 1])) : ctx.lineTo(X(r.p[i]), Z(r.p[i + 1]));
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(150,135,125,0.9)";
    for (const b of data.buildings) {
      ctx.beginPath();
      for (let i = 0; i < b.p.length; i += 2) i === 0 ? ctx.moveTo(X(b.p[i]), Z(b.p[i + 1])) : ctx.lineTo(X(b.p[i]), Z(b.p[i + 1]));
      ctx.closePath();
      ctx.fill();
    }
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#5ea6dc");
    g.addColorStop(1, "#2f78b5");
    ctx.fillStyle = g;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const r of data.water) {
      for (let i = 0; i < r.length; i += 2) i === 0 ? ctx.moveTo(X(r[i]), Z(r[i + 1])) : ctx.lineTo(X(r[i]), Z(r[i + 1]));
      ctx.closePath();
    }
    ctx.fill("evenodd");
    ctx.stroke();
  }, [data]);
  return <canvas ref={ref} width={560} height={340} className={className} />;
}
