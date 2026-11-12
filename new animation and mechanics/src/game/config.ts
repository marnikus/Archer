// Tuning config – tweak freely. Units are "world units" (1 unit = 1 SVG px of the source art).
export const CFG = {
  world: { width: 4000, groundY: 651 },
  archer: { walkSpeed: 250, startX: 3600, minX: 1200, maxX: 3880 },
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

export type Cfg = typeof CFG;
