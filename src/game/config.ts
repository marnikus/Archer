// Tuning config – tweak freely. Units are "world units" (1 unit = 1 SVG px of the source art).
export const CFG = {
  world: { width: 4000, groundY: 651 },
  archer: { walkSpeed: 250, runSpeed: 450, startX: 3600, minX: 1200, maxX: 3880 },
  bow: { x: 1700 },
  quiver: { x: 2800 },
  target: { x: 300, baseRadius: 100, standLift: 100 },
  shot: {
    angleMin: 5,
    angleMax: 80,
    speedMin: 600,
    speedMax: 1500,
    gravity: 900,
    meterSpeed: 0.9, // full bar per (1/meterSpeed) seconds (normal mode)
  },
  streakGoal: 10,
  wind: { startAtHit: 4, max: 120 },
  hard: { arrows: 15, windMul: 1.5, meterSpeed: 1.2 },
  fence: { x: 1140 },
  signposts: [3300, 2500, 1500],
  flags: [900, 2180],
};

// Section 23 animation tuning values (in SVG/world units where archer ≈ 400 units tall)
export const ANIM_CFG = {
  charHeight: 396,
  walkStride: 62, // ~4.03 steps/s at 250 u/s (target 3.5–4.5 steps/s)
  walkBob: 8,
  runSpeed: 450, // 1.8x walk
  runStride: 112, // ~4.02 steps/s at 450 u/s with 25% air phase
  runLeanDeg: 13.5,
  jumpTapHeight: 60,
  jumpHoldHeight: 140,
  jumpAirTime: 0.55,
  turnTime: 0.18,
  drawTravel: 110, // string travel for 0–100% power
  bowTipBend: 12,
  releaseKickBack: 24,
  hatFloatApex: 7,
  secondaryDelay: 0.09,
  fidgetWaitMin: 6,
  fidgetWaitMax: 10,
  napWait: 15,
  autoSitWait: 20,
  inputMemory: 0.2,
};

export type Cfg = typeof CFG;
export type AnimCfg = typeof ANIM_CFG;
