import { useEffect, useRef } from "react";
import { drawFish, fishHeightRatio, SpeciesId } from "../game/fishdata";

export default function FishArt({ id, width = 300, className, dim }: { id: SpeciesId; width?: number; className?: string; dim?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round(width * 0.56);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    const w = c.width * 0.86;
    const hr = fishHeightRatio(id);
    drawFish(ctx, id, c.width * 0.07, c.height * 0.5 - (w * hr) / 2, w);
  }, [id, width]);
  return <canvas ref={ref} width={width * 2} height={height * 2} style={{ width, height, filter: dim ? "grayscale(0.7) brightness(0.8)" : undefined }} className={className} />;
}
