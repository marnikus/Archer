// Robust leg rig shared by the characters: stable two-bone IK with a fixed knee direction, soft limits near full
// extension (no knee snapping), optional controlled stretch for lunges/jumps, and a gait generator with heel-strike,
// heel-off and toe-bend so feet roll through each step. No dependency on rig.ts (rig.ts uses it).

export interface P2 {
  x: number;
  y: number;
}
export interface LegResult {
  knee: P2;
  ankle: P2;
  /** bone lengths actually used (> original when the leg stretched) */
  len1: number;
  len2: number;
  /** thigh / shin direction angles, rig convention (0 = down, + = forward = -x) */
  a1: number;
  a2: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
const dir = (a: number): P2 => ({ x: -Math.sin(a), y: Math.cos(a) });
const angOf = (dx: number, dy: number) => Math.atan2(-dx, dy);

/**
 * Two-bone leg IK. The knee always bends forward (-x). If the target is beyond reach the bones stretch up to
 * `maxStretch` (1 = never) and then the target is clamped softly, so the foot glides instead of the knee popping.
 */
export function solveLeg(hip: P2, target: P2, L1: number, L2: number, opts: { maxStretch?: number } = {}): LegResult {
  const maxS = opts.maxStretch ?? 1;
  const dx = target.x - hip.x;
  const dy = target.y - hip.y;
  const d = Math.hypot(dx, dy) || 1e-3;
  const base = L1 + L2;
  const s = clamp(d / (base * 0.975), 1, maxS);
  const l1 = L1 * s;
  const l2 = L2 * s;
  const reach = l1 + l2;
  const dmax = reach * 0.995;
  const dmin = Math.abs(l1 - l2) + 3;
  // ease the last 4% of extension so the knee straightens smoothly
  let dd = d;
  const soft = dmax * 0.96;
  if (dd > soft) dd = soft + (dmax - soft) * (1 - Math.exp(-(dd - soft) / (dmax - soft + 1e-3)));
  dd = clamp(dd, dmin, dmax);
  const phi = angOf(dx, dy);
  const a = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
  const b = Math.acos(clamp((l2 * l2 + dd * dd - l1 * l1) / (2 * l2 * dd), -1, 1));
  const a1 = phi + a;
  const a2 = phi - b;
  const k = dir(a1);
  const knee = { x: hip.x + k.x * l1, y: hip.y + k.y * l1 };
  const e = dir(a2);
  return { knee, ankle: { x: knee.x + e.x * l2, y: knee.y + e.y * l2 }, len1: l1, len2: l2, a1, a2 };
}

export interface FootStep {
  /** offset from the stance position (rig units) */
  x: number;
  y: number;
  /** ankle rotation, + = toes down */
  rot: number;
  /** toe bend at the ball of the foot, + = toes down */
  toe: number;
  ground: boolean;
}

/**
 * One foot over a gait cycle (ph 0..1). Stance: heel strike (toes up) → foot flat → heel-off with the toes bending
 * as the leg pushes. Swing: toes drag then lift, the foot clears the ground and reaches forward.
 */
export const GAIT_STANCE = 0.6;
/** cadence (cycles/s) that keeps the planted foot still on the ground: foot travels `step` during `stance` of the cycle */
export const plantedRate = (speed: number, step: number, stance = GAIT_STANCE) => (speed * stance) / step;

export function gaitFoot(ph: number, step: number, lift: number, stance = GAIT_STANCE): FootStep {
  ph = ((ph % 1) + 1) % 1;
  if (ph < stance) {
    const u = ph / stance;
    const heelStrike = 1 - smooth(u / 0.16);
    const heelOff = smooth((u - 0.68) / 0.32);
    return {
      x: -step / 2 + step * u, // planted foot slides BACKWARD (+x) relative to the body while the body moves forward (-x)
      y: -10 * heelOff,
      rot: -0.38 * heelStrike + 0.62 * heelOff,
      toe: 0.75 * smooth((u - 0.78) / 0.22),
      ground: true,
    };
  }
  const u = (ph - stance) / (1 - stance);
  const e = smooth(u);
  return {
    x: step / 2 - step * e, // the swinging foot reaches FORWARD (-x)
    y: -10 * (1 - smooth(u / 0.25)) - lift * Math.pow(Math.sin(Math.PI * u), 0.85),
    rot: 0.55 * (1 - smooth(u / 0.4)) - 0.34 * smooth((u - 0.65) / 0.35),
    toe: 0.55 * (1 - smooth(u / 0.45)),
    ground: false,
  };
}
