import { useEffect, useRef } from 'react';
import { drawBowArt, drawWeaponArt, type WeaponKind } from '../rig/rig';

// Icons are the real in-game weapon art, framed per weapon (art-space centre, scale, tilt).
const FRAME: Record<Exclude<WeaponKind, 'unarmed'>, { cx: number; cy: number; s: number; rot: number }> = {
  bow: { cx: 18, cy: 0, s: 0.145, rot: 0 },
  crossbow: { cx: 0, cy: 30, s: 0.19, rot: 1.45 },
  spear: { cx: 0, cy: -100, s: 0.092, rot: 0.7 },
  sword: { cx: 0, cy: -52, s: 0.19, rot: 0.7 },
  staff: { cx: 0, cy: -33, s: 0.098, rot: 0.7 },
  axe: { cx: -30, cy: -62, s: 0.18, rot: 0.45 },
};

export function WeaponIcon({ kind, size = 40 }: { kind: WeaponKind; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || kind === 'unarmed') return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const f = FRAME[kind];
    ctx.translate(size / 2, size / 2);
    ctx.rotate(f.rot);
    ctx.scale(f.s * (size / 40), f.s * (size / 40));
    ctx.translate(-f.cx, -f.cy);
    ctx.lineJoin = 'round';
    if (kind === 'bow') drawBowArt(ctx, 0, false);
    else drawWeaponArt(ctx, kind);
  }, [kind, size]);
  if (kind === 'unarmed') {
    return (
      <span className="flex items-center justify-center" style={{ width: size, height: size, fontSize: size * 0.62 }}>
        ✊
      </span>
    );
  }
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
