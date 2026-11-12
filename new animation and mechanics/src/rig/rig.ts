// Layered paper-rig for the archer.
// Rig space: origin = ground point between the feet, +x = right (= BACK of the
// character), +y = down. The character is authored facing LEFT (toward -x);
// the caller flips the context to face right.
import { drawArrowArt, PAL } from '../game/art';

export type Vec = { x: number; y: number };
export const DEG = Math.PI / 180;

export const COL = {
  skin: PAL.skin,
  skinDark: '#F29B70',
  orange: PAL.orange,
  orangeDark: PAL.orangeDark,
  strap: '#723F2A',
  boot: PAL.brownDark,
  bootBack: '#3E2C22',
  beard: '#E6E1DC',
  beardShade: '#D8D2CC',
  eye: '#272220',
  white: '#FFFFFF',
  red: PAL.red,
  red2: PAL.red2,
  orange2: PAL.orange2,
  brown: PAL.brown,
  brownDeep: '#5E3020',
  grey: PAL.grey,
  hatCrown: '#8B4B2D',
  hatBand: '#D4A872',
  hatBandDark: '#C2945F',
  wood: '#9C7A5B',
  woodDark: '#6B4A32',
  steel: '#CDD6E6',
  steelDark: '#9AA6BC',
  gold: PAL.gold,
};

/** Geometry constants (rig units; 1 unit = 1 game world unit). */
export const G = {
  pelvisY: -98,
  hipOff: 22,
  thigh: 44,
  shin: 40,
  thighW: 46,
  shinW: 42,
  boot: { toe: 38, heel: 24, top: 14, bot: 18, r: 13 },
  standAnkleY: -18,
  // torso rect relative to the pelvis
  torso: { x0: -110, x1: 112, top: -202, bottom: 10, r: 36 },
  shoulderF: { x: -96, y: -138 },
  shoulderB: { x: 98, y: -138 },
  neck: { x: -4, y: -150 },
  upperArm: 62,
  foreArm: 62,
  armW: 44,
  handR: 24,
  // head relative to the neck pivot
  head: { x0: -114, x1: 94, top: -147, bottom: 83, r: 44 },
  face: { x0: -104, x1: 44, top: -120, bottom: 2, r: 32 },
  eyes: { y: -84, xs: [-74, -8], w: 22, h: 36 },
  nose: { x: -58, y: -46, w: 34, h: 28 },
  mustache: { ax: -54, ay: -22, dx: 44, dy: 34, w: 42 },
  beardTips: [
    { x: -94, w: 62 },
    { x: -6, w: 62 },
  ],
  tipLen: 54,
  hat: { band: { x0: -130, x1: 110, y0: -172, y1: -122, r: 25 }, crown: { x0: -114, x1: 94, y0: -228, y1: -146, r: 48 } },
  quiver: { ax: 94, ay: -150, w: 64, h: 128, rot: 22 * DEG },
  bow: { half: 140, bulge: 44, stringX: 40, drawMax: 150, wrap: 22, width: 24 },
  arrowLen: 230,
  slung: { cx: -38, cy: -238, rot: 50 * DEG },
};

// ---------------------------------------------------------------------------
// Pose description
// ---------------------------------------------------------------------------
export type ArmPose = { kind: 'fk'; shoulder: number; elbow: number } | { kind: 'ik'; target: Vec; bend: 1 | -1 };
export interface LegPose {
  ankle: Vec; // rig space
  foot: number; // rotation about the ankle (+ = toes down)
}
export type WeaponKind = 'unarmed' | 'bow' | 'crossbow' | 'spear' | 'sword' | 'staff' | 'axe';
export type HatWhere = 'head' | 'hand' | 'world' | 'none';

export interface RigPose {
  x: number;
  y: number;
  squash: number;
  tilt: number; // whole upper body lean about the pelvis (+ = forward)
  hipX: number;
  pelvisY: number;
  hipRot: number;
  torsoRot: number; // extra torso rotation (counter to hips)
  breath: number; // px lift of the whole torso group
  shoulderSway: number; // px, front shoulder forward / back shoulder back
  backShoulderX: number; // px, back shoulder pulled forward (draw / chest opening)
  head: { rot: number; x: number; y: number; turn: number };
  face: { blink: number; brow: number; lookX: number; lookY: number; smile: number; tremor: number };
  beardSwing: number;
  frontArm: ArmPose;
  backArm: ArmPose;
  frontLeg: LegPose;
  backLeg: LegPose;
  layers: { backArmFront: boolean; frontArmBehindHead: boolean };
  hat: { where: HatWhere; lift: number; rot: number; x: number; y: number; squash: number };
  quiver: { on: boolean; swing: number; bounce: number };
  bow: {
    mode: 'none' | 'slung' | 'hand';
    draw: number;
    arrow: boolean;
    rot: number; // rotation of the in-hand bow (rig space); 0 = limbs vertical, + = aim up
    slungT: number; // 0 = fully in hand pose, 1 = fully slung (blend for unsling)
    recoil: number;
  };
  weapon: { kind: WeaponKind; rot: number | null; backHand: boolean };
  sit: number;
  carriedItem: { kind: 'none' | 'quiver' | 'bow'; rot: number; t: number };
}

export function defaultPose(): RigPose {
  return {
    x: 0,
    y: 0,
    squash: 1,
    tilt: 0,
    hipX: 0,
    pelvisY: G.pelvisY,
    hipRot: 0,
    torsoRot: 0,
    breath: 0,
    shoulderSway: 0,
    backShoulderX: 0,
    head: { rot: 0, x: 0, y: 0, turn: 0 },
    face: { blink: 0, brow: 0, lookX: 0, lookY: 0, smile: 0, tremor: 0 },
    beardSwing: 0,
    frontArm: { kind: 'fk', shoulder: 6 * DEG, elbow: 10 * DEG },
    backArm: { kind: 'fk', shoulder: -6 * DEG, elbow: 12 * DEG },
    frontLeg: { ankle: { x: -G.hipOff - 4, y: G.standAnkleY }, foot: 0 },
    backLeg: { ankle: { x: G.hipOff + 4, y: G.standAnkleY }, foot: 0 },
    layers: { backArmFront: false, frontArmBehindHead: false },
    hat: { where: 'head', lift: 0, rot: 0, x: 0, y: 0, squash: 1 },
    quiver: { on: false, swing: 0, bounce: 0 },
    bow: { mode: 'none', draw: 0, arrow: false, rot: 0, slungT: 1, recoil: 0 },
    weapon: { kind: 'unarmed', rot: null, backHand: false },
    sit: 0,
    carriedItem: { kind: 'none', rot: 0, t: 0 },
  };
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const vlerp = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
/** direction vector for an angle in rig convention: 0 = down, +90° = forward (-x). */
export const dir = (a: number): Vec => ({ x: -Math.sin(a), y: Math.cos(a) });
export const angOf = (dx: number, dy: number) => Math.atan2(-dx, dy);
export function rotV(v: Vec, a: number): Vec {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Two-bone IK. Returns absolute segment angles (rig convention). bend=+1 → middle joint in front (knee), -1 → behind (elbow). */
export function ik2(S: Vec, T: Vec, L1: number, L2: number, bend: 1 | -1) {
  const dx = T.x - S.x;
  const dy = T.y - S.y;
  const d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
  const phi = angOf(dx, dy);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const b = Math.acos(clamp((L2 * L2 + d * d - L1 * L1) / (2 * L2 * d), -1, 1));
  return { a1: phi + bend * a, a2: phi - bend * b };
}

/** A simple transform frame (translation + rotation). */
export interface Frame {
  o: Vec;
  a: number;
}
export const applyFrame = (f: Frame, p: Vec): Vec => {
  const r = rotV(p, f.a);
  return { x: f.o.x + r.x, y: f.o.y + r.y };
};

// ---------------------------------------------------------------------------
// Skeleton solve (FK + IK)
// ---------------------------------------------------------------------------
export interface Skeleton {
  pelvis: Vec;
  bodyAng: number;
  torso: Frame;
  shoulderF: Vec;
  shoulderB: Vec;
  neck: Vec;
  head: Frame;
  elbowF: Vec;
  handF: Vec;
  aUF: number;
  aFF: number;
  elbowB: Vec;
  handB: Vec;
  aUB: number;
  aFB: number;
  hipF: Vec;
  kneeF: Vec;
  ankleF: Vec;
  hipB: Vec;
  kneeB: Vec;
  ankleB: Vec;
  bowGrip: Vec | null;
  nock: Vec | null;
  tip: Vec | null;
  hatAnchor: Vec;
}

export function torsoFrame(p: RigPose): { pelvis: Vec; torso: Frame; shoulderF: Vec; shoulderB: Vec; neck: Vec } {
  const pelvis = { x: p.hipX, y: p.pelvisY };
  const torso: Frame = { o: { x: pelvis.x, y: pelvis.y - p.breath }, a: -(p.tilt + p.torsoRot) };
  const shoulderF = applyFrame(torso, { x: G.shoulderF.x - p.shoulderSway, y: G.shoulderF.y });
  const shoulderB = applyFrame(torso, { x: G.shoulderB.x + p.shoulderSway - p.backShoulderX, y: G.shoulderB.y });
  const neck = applyFrame(torso, G.neck);
  return { pelvis, torso, shoulderF, shoulderB, neck };
}

function solveArm(p: RigPose, arm: ArmPose, shoulder: Vec, torsoAng: number) {
  let a1: number;
  let a2: number;
  if (arm.kind === 'fk') {
    a1 = arm.shoulder - torsoAng;
    a2 = a1 + arm.elbow;
  } else {
    const r = ik2(shoulder, arm.target, G.upperArm, G.foreArm, arm.bend);
    a1 = r.a1;
    a2 = r.a2;
  }
  const d1 = dir(a1);
  const d2 = dir(a2);
  const elbow = { x: shoulder.x + d1.x * G.upperArm, y: shoulder.y + d1.y * G.upperArm };
  const hand = { x: elbow.x + d2.x * G.foreArm, y: elbow.y + d2.y * G.foreArm };
  void p;
  return { a1, a2, elbow, hand };
}

export function solveSkeleton(p: RigPose): Skeleton {
  const { pelvis, torso, shoulderF, shoulderB, neck } = torsoFrame(p);
  const torsoAng = torso.a;
  const head: Frame = { o: { x: neck.x + p.head.x, y: neck.y + p.head.y }, a: torsoAng - p.head.rot };
  const F = solveArm(p, p.frontArm, shoulderF, torsoAng);
  const B = solveArm(p, p.backArm, shoulderB, torsoAng);
  // legs
  const hipF = { x: pelvis.x - G.hipOff * Math.cos(p.hipRot), y: pelvis.y + 2 - G.hipOff * Math.sin(p.hipRot) };
  const hipB = { x: pelvis.x + G.hipOff * Math.cos(p.hipRot), y: pelvis.y + 2 + G.hipOff * Math.sin(p.hipRot) };
  const lf = ik2(hipF, p.frontLeg.ankle, G.thigh, G.shin, 1);
  const lb = ik2(hipB, p.backLeg.ankle, G.thigh, G.shin, 1);
  const kneeF = { x: hipF.x + dir(lf.a1).x * G.thigh, y: hipF.y + dir(lf.a1).y * G.thigh };
  const kneeB = { x: hipB.x + dir(lb.a1).x * G.thigh, y: hipB.y + dir(lb.a1).y * G.thigh };
  const ankleF = { x: kneeF.x + dir(lf.a2).x * G.shin, y: kneeF.y + dir(lf.a2).y * G.shin };
  const ankleB = { x: kneeB.x + dir(lb.a2).x * G.shin, y: kneeB.y + dir(lb.a2).y * G.shin };
  // bow anchors (in hand)
  let bowGrip: Vec | null = null;
  let nock: Vec | null = null;
  let tip: Vec | null = null;
  if (p.bow.mode === 'hand') {
    bowGrip = F.hand;
    const n = rotV({ x: G.bow.stringX + G.bow.drawMax * p.bow.draw, y: 0 }, p.bow.rot);
    nock = { x: bowGrip.x + n.x, y: bowGrip.y + n.y };
    const t = rotV({ x: -G.arrowLen, y: 0 }, p.bow.rot);
    tip = { x: nock.x + t.x, y: nock.y + t.y };
  }
  const hatAnchor = applyFrame(head, { x: -10, y: G.head.top });
  return {
    pelvis,
    bodyAng: torsoAng,
    torso,
    shoulderF,
    shoulderB,
    neck,
    head,
    elbowF: F.elbow,
    handF: F.hand,
    aUF: F.a1,
    aFF: F.a2,
    elbowB: B.elbow,
    handB: B.hand,
    aUB: B.a1,
    aFB: B.a2,
    hipF,
    kneeF,
    ankleF,
    hipB,
    kneeB,
    ankleB,
    bowGrip,
    nock,
    tip,
    hatAnchor,
  };
}

/** World-space nock/tip for a hypothetical draw & aim using the current hand position. */
export function bowGeom(hand: Vec, rot: number, draw: number) {
  const n = rotV({ x: G.bow.stringX + G.bow.drawMax * draw, y: 0 }, rot);
  const nock = { x: hand.x + n.x, y: hand.y + n.y };
  const t = rotV({ x: -G.arrowLen, y: 0 }, rot);
  return { nock, tip: { x: nock.x + t.x, y: nock.y + t.y } };
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------
export function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
export function stadium(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, r: number) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, ang + Math.PI / 2, ang - Math.PI / 2);
  ctx.arc(b.x, b.y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}
export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
/** Bow in its local frame: origin = grip, +x toward the archer (string side), limbs along y. */
export function drawBowArt(ctx: CanvasRenderingContext2D, draw: number, arrow: boolean, recoil = 0) {
  const B = G.bow;
  const half = B.half * (1 - 0.04 * draw);
  const bulge = B.bulge + 26 * draw - 10 * recoil;
  const sx = B.stringX + 14 * draw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // limbs
  ctx.strokeStyle = COL.red;
  ctx.lineWidth = B.width;
  ctx.beginPath();
  ctx.moveTo(sx, -half);
  ctx.quadraticCurveTo(-bulge, -half * 0.42, 0, 0);
  ctx.quadraticCurveTo(-bulge, half * 0.42, sx, half);
  ctx.stroke();
  // tip wraps
  ctx.strokeStyle = COL.white;
  ctx.lineWidth = 9;
  for (const s of [-1, 1]) {
    const t0 = 0.04;
    const t1 = 0.16;
    const q = (t: number) => {
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * -bulge + t * t * 0;
      const y = (1 - t) * (1 - t) * (s * half) + 2 * (1 - t) * t * (s * half * 0.42) + t * t * 0;
      return { x, y };
    };
    const p0 = q(t0);
    const p1 = q(t1);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // grip wrap
  ctx.fillStyle = '#B8231F';
  rrect(ctx, -13, -22, 26, 44, 9);
  ctx.fill();
  // string
  const nx = sx + B.drawMax * draw;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(sx, -half + 4);
  ctx.lineTo(nx, 0);
  ctx.lineTo(sx, half - 4);
  ctx.stroke();
  if (arrow) {
    ctx.save();
    ctx.translate(nx - G.arrowLen, 0);
    ctx.rotate(Math.PI);
    drawArrowArt(ctx, G.arrowLen);
    ctx.restore();
  }
}

/** Quiver in its local frame: origin at the top-centre of the body, +y down the body. */
export function drawQuiverArt(ctx: CanvasRenderingContext2D, arrows = 3) {
  const Q = G.quiver;
  ctx.lineCap = 'round';
  // arrows
  const xs = [-16, 1, 18];
  for (let i = 0; i < Math.min(arrows, 3); i++) {
    const x = xs[i];
    const h = 56 + (i === 1 ? 10 : 0);
    ctx.strokeStyle = COL.grey;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, -h);
    ctx.stroke();
    // fletching (two small flags)
    ctx.fillStyle = i === 1 ? COL.orange2 : COL.red2;
    ctx.beginPath();
    ctx.moveTo(x - 3, -h + 2);
    ctx.lineTo(x - 15, -h + 10);
    ctx.lineTo(x - 13, -h + 28);
    ctx.lineTo(x - 3, -h + 24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i === 1 ? COL.red2 : COL.orange2;
    ctx.beginPath();
    ctx.moveTo(x + 3, -h + 2);
    ctx.lineTo(x + 15, -h + 10);
    ctx.lineTo(x + 13, -h + 28);
    ctx.lineTo(x + 3, -h + 24);
    ctx.closePath();
    ctx.fill();
  }
  // body
  ctx.fillStyle = COL.brown;
  rrect(ctx, -Q.w / 2, 4, Q.w, Q.h, 22);
  ctx.fill();
  // band stripe
  ctx.fillStyle = COL.brownDeep;
  rrect(ctx, -Q.w / 2, 58, Q.w, 18, 4);
  ctx.fill();
  // rim
  ctx.fillStyle = COL.brownDeep;
  rrect(ctx, -Q.w / 2 - 5, -8, Q.w + 10, 32, 13);
  ctx.fill();
  ctx.fillStyle = COL.brown;
  rrect(ctx, -Q.w / 2 - 1, -3, Q.w + 2, 18, 9);
  ctx.fill();
}

/** Standalone quiver item, bottom-centre at origin (ground prop). */
export function drawQuiverProp(ctx: CanvasRenderingContext2D, scale = 0.75) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.rotate(-0.25);
  ctx.translate(0, -G.quiver.h - 4);
  drawQuiverArt(ctx);
  ctx.restore();
}

/** Standalone bow item, bottom tip at origin, leaning (ground prop). */
export function drawBowProp(ctx: CanvasRenderingContext2D, scale = 0.8) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.rotate(0.22);
  ctx.translate(-G.bow.stringX, -G.bow.half);
  drawBowArt(ctx, 0, false);
  ctx.restore();
}

/** Hat in its local frame = head frame (neck pivot origin). */
export function drawHatArt(ctx: CanvasRenderingContext2D) {
  const H = G.hat;
  ctx.fillStyle = COL.hatCrown;
  rrect(ctx, H.crown.x0, H.crown.y0, H.crown.x1 - H.crown.x0, H.crown.y1 - H.crown.y0, H.crown.r);
  ctx.fill();
  // crown highlight seam
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  rrect(ctx, H.crown.x0 + 18, H.crown.y0 + 10, H.crown.x1 - H.crown.x0 - 36, 18, 9);
  ctx.fill();
  ctx.fillStyle = COL.hatBand;
  rrect(ctx, H.band.x0, H.band.y0, H.band.x1 - H.band.x0, H.band.y1 - H.band.y0, H.band.r);
  ctx.fill();
  ctx.fillStyle = COL.hatBandDark;
  rrect(ctx, H.band.x0 + 10, H.band.y1 - 12, H.band.x1 - H.band.x0 - 20, 7, 3);
  ctx.fill();
}

/** Hat drawn as a held / dropped object: origin at the band's front-bottom corner, upright. */
export function drawHatLoose(ctx: CanvasRenderingContext2D) {
  const H = G.hat;
  ctx.save();
  ctx.translate(-(H.band.x0 + H.band.x1) / 2, -H.band.y1);
  drawHatArt(ctx);
  ctx.restore();
}

/** Weapons in a local frame: origin at the grip, the weapon's axis points along -y (up). */
export function drawWeaponArt(ctx: CanvasRenderingContext2D, kind: WeaponKind) {
  ctx.lineCap = 'round';
  switch (kind) {
    case 'spear': {
      ctx.strokeStyle = COL.wood;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(0, 130);
      ctx.lineTo(0, -250);
      ctx.stroke();
      ctx.fillStyle = COL.steel;
      ctx.beginPath();
      ctx.moveTo(0, -330);
      ctx.lineTo(16, -280);
      ctx.lineTo(9, -246);
      ctx.lineTo(-9, -246);
      ctx.lineTo(-16, -280);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.steelDark;
      ctx.beginPath();
      ctx.moveTo(0, -330);
      ctx.lineTo(0, -246);
      ctx.lineTo(9, -246);
      ctx.lineTo(16, -280);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.red2;
      rrect(ctx, -9, -244, 18, 20, 5);
      ctx.fill();
      break;
    }
    case 'sword': {
      ctx.fillStyle = COL.steel;
      ctx.beginPath();
      ctx.moveTo(-11, -16);
      ctx.lineTo(11, -16);
      ctx.lineTo(9, -130);
      ctx.lineTo(0, -156);
      ctx.lineTo(-9, -130);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.steelDark;
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.lineTo(11, -16);
      ctx.lineTo(9, -130);
      ctx.lineTo(0, -156);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.gold;
      rrect(ctx, -28, -20, 56, 12, 5);
      ctx.fill();
      ctx.fillStyle = COL.woodDark;
      rrect(ctx, -8, -10, 16, 46, 6);
      ctx.fill();
      ctx.fillStyle = COL.gold;
      circle(ctx, 0, 42, 9);
      ctx.fill();
      break;
    }
    case 'staff': {
      ctx.strokeStyle = COL.woodDark;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, 180);
      ctx.lineTo(0, -214);
      ctx.stroke();
      ctx.strokeStyle = COL.wood;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-2, 150);
      ctx.lineTo(-2, -190);
      ctx.stroke();
      for (const y of [-120, -60]) {
        ctx.fillStyle = COL.strap;
        rrect(ctx, -9, y, 18, 14, 4);
        ctx.fill();
      }
      ctx.fillStyle = COL.orangeDark;
      circle(ctx, 0, -228, 18);
      ctx.fill();
      ctx.fillStyle = COL.gold;
      circle(ctx, -5, -233, 6);
      ctx.fill();
      break;
    }
    case 'axe': {
      ctx.strokeStyle = COL.wood;
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(0, 44);
      ctx.lineTo(0, -168);
      ctx.stroke();
      ctx.fillStyle = COL.steel;
      ctx.beginPath();
      ctx.moveTo(-4, -170);
      ctx.quadraticCurveTo(-78, -160, -70, -92);
      ctx.quadraticCurveTo(-40, -104, -4, -104);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.steelDark;
      ctx.beginPath();
      ctx.moveTo(-4, -170);
      ctx.quadraticCurveTo(-30, -150, -30, -104);
      ctx.lineTo(-4, -104);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL.steelDark;
      rrect(ctx, -8, -168, 26, 36, 6);
      ctx.fill();
      break;
    }
    case 'crossbow': {
      // stock along the axis, prod perpendicular near the front (-y)
      ctx.fillStyle = COL.woodDark;
      rrect(ctx, -10, -70, 20, 200, 8);
      ctx.fill();
      ctx.fillStyle = COL.wood;
      rrect(ctx, -6, -40, 12, 120, 4);
      ctx.fill();
      // prod (red bow limb)
      ctx.strokeStyle = COL.red;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(-76, -34);
      ctx.quadraticCurveTo(0, -84, 76, -34);
      ctx.stroke();
      ctx.strokeStyle = COL.white;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(-76, -36);
      ctx.lineTo(-62, -43);
      ctx.moveTo(76, -36);
      ctx.lineTo(62, -43);
      ctx.stroke();
      // string
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-76, -32);
      ctx.lineTo(0, 40);
      ctx.lineTo(76, -32);
      ctx.stroke();
      // bolt
      ctx.strokeStyle = COL.grey;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 36);
      ctx.lineTo(0, -92);
      ctx.stroke();
      ctx.fillStyle = '#5B4F4A';
      ctx.beginPath();
      ctx.moveTo(0, -104);
      ctx.lineTo(7, -86);
      ctx.lineTo(-7, -86);
      ctx.closePath();
      ctx.fill();
      // trigger lever
      ctx.strokeStyle = COL.steelDark;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(6, 70);
      ctx.lineTo(22, 86);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
export interface DrawOpts {
  debug?: { pivots?: boolean; anchors?: boolean; shoulders?: boolean; hips?: boolean };
  arrowsInQuiver?: number;
}

function drawLeg(ctx: CanvasRenderingContext2D, hip: Vec, knee: Vec, ankle: Vec, footRot: number, color: string) {
  ctx.fillStyle = color;
  stadium(ctx, hip, knee, G.thighW / 2);
  ctx.fill();
  stadium(ctx, knee, ankle, G.shinW / 2);
  ctx.fill();
  ctx.save();
  ctx.translate(ankle.x, ankle.y);
  ctx.rotate(-footRot);
  const b = G.boot;
  rrect(ctx, -b.toe, -b.top, b.toe + b.heel, b.top + b.bot, b.r);
  ctx.fill();
  ctx.restore();
}

function drawArmSeg(ctx: CanvasRenderingContext2D, a: Vec, b: Vec) {
  ctx.fillStyle = COL.skin;
  stadium(ctx, a, b, G.armW / 2);
  ctx.fill();
}
function drawHand(ctx: CanvasRenderingContext2D, h: Vec) {
  ctx.fillStyle = COL.skin;
  circle(ctx, h.x, h.y, G.handR);
  ctx.fill();
}

function weaponFrontRot(p: RigPose, s: Skeleton) {
  // weapon axis rotation in canvas radians (0 = pointing up); null = continue the forearm
  return p.weapon.rot ?? s.aFF + Math.PI;
}

/** Draw the whole character. Context must be translated to the feet and flipped for facing right. */
export function drawRig(ctx: CanvasRenderingContext2D, p: RigPose, s: Skeleton, opts: DrawOpts = {}) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.squash !== 1) ctx.scale(1 + (1 - p.squash) * 0.6, p.squash);
  ctx.lineJoin = 'round';

  // ---- 1. slung bow (behind everything)
  if (p.bow.mode === 'slung' || (p.bow.mode === 'hand' && p.bow.slungT > 0.001)) {
    const sl = G.slung;
    const target = applyFrame(s.torso, { x: sl.cx, y: sl.cy - G.pelvisY });
    const k = p.bow.mode === 'slung' ? 1 : smooth(p.bow.slungT);
    const o = p.bow.mode === 'slung' ? target : vlerp(s.handF, target, k);
    const rot = p.bow.mode === 'slung' ? sl.rot : lerp(-p.bow.rot, sl.rot, k);
    if (p.bow.mode === 'slung' || k > 0.5) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(-rot + s.torso.a);
      ctx.scale(-1, 1); // belly bulges away from the back
      drawBowArt(ctx, 0, false);
      ctx.restore();
    }
  }

  // ---- 2. quiver
  if (p.quiver.on) {
    const at = applyFrame(s.torso, { x: G.quiver.ax, y: G.quiver.ay });
    ctx.save();
    ctx.translate(at.x, at.y + p.quiver.bounce);
    ctx.rotate(G.quiver.rot + p.quiver.swing + s.torso.a);
    drawQuiverArt(ctx, opts.arrowsInQuiver ?? 3);
    ctx.restore();
  }

  // ---- 3. legs
  drawLeg(ctx, s.hipB, s.kneeB, s.ankleB, p.backLeg.foot, COL.bootBack);
  drawLeg(ctx, s.hipF, s.kneeF, s.ankleF, p.frontLeg.foot, COL.boot);

  // Draw helpers. Layering rule:
  //  - the arm HOLDING the bow is on the back layer, underneath the body and the beard;
  //  - the arm WITHOUT the bow is drawn over the beard.
  const drawBackWeapon = () => {
    if (p.weapon.backHand && p.weapon.kind !== 'unarmed' && p.weapon.kind !== 'bow') {
      ctx.save();
      ctx.translate(s.handB.x, s.handB.y);
      ctx.rotate(p.weapon.rot ?? s.aFB + Math.PI);
      drawWeaponArt(ctx, p.weapon.kind);
      ctx.restore();
    }
  };
  const drawHead = () => {
    ctx.save();
    ctx.translate(s.head.o.x, s.head.o.y);
    ctx.rotate(s.head.a);
    const H = G.head;
    // beard tips (behind the block, swing about their roots)
    for (const tip of G.beardTips) {
      ctx.save();
      ctx.translate(tip.x + tip.w / 2, H.bottom - 20);
      ctx.rotate(-p.beardSwing);
      ctx.fillStyle = COL.beard;
      rrect(ctx, -tip.w / 2, -10, tip.w, G.tipLen + 10, tip.w / 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = COL.beard;
    rrect(ctx, H.x0, H.top, H.x1 - H.x0, H.bottom - H.top, H.r);
    ctx.fill();
    // face (shifts with the head turn)
    const turnX = p.head.turn * 20;
    ctx.save();
    ctx.translate(turnX, 0);
    const Fc = G.face;
    ctx.fillStyle = COL.skin;
    rrect(ctx, Fc.x0, Fc.top, Fc.x1 - Fc.x0, Fc.bottom - Fc.top, Fc.r);
    ctx.fill();
    // eyes
    const E = G.eyes;
    const open = 1 - clamp(p.face.blink, 0, 1);
    for (const ex of E.xs) {
      ctx.save();
      ctx.translate(ex + p.face.lookX * 6, E.y + p.face.lookY * 5);
      ctx.scale(1, Math.max(0.06, open));
      ctx.fillStyle = COL.eye;
      rrect(ctx, -E.w / 2, -E.h / 2, E.w, E.h, E.w / 2);
      ctx.fill();
      ctx.restore();
      if (Math.abs(p.face.brow) > 0.03) {
        ctx.strokeStyle = COL.beardShade;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const by = E.y - E.h / 2 - 12 - p.face.brow * 10;
        ctx.moveTo(ex - 14, by + (p.face.brow < 0 ? -4 : 2));
        ctx.lineTo(ex + 14, by + (p.face.brow < 0 ? 4 : -2));
        ctx.stroke();
      }
    }
    // nose
    const N = G.nose;
    ctx.fillStyle = COL.skinDark;
    rrect(ctx, N.x - N.w / 2, N.y - N.h / 2, N.w, N.h, 14);
    ctx.fill();
    // mustache
    const M = G.mustache;
    const sm = p.face.smile;
    ctx.save();
    ctx.translate(M.ax, M.ay - 5 * sm);
    ctx.scale(1 + 0.1 * sm, 1 - 0.16 * sm);
    ctx.strokeStyle = COL.white;
    ctx.lineWidth = M.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-16 - M.dx, M.dy);
    ctx.moveTo(16, 0);
    ctx.lineTo(16 + M.dx, M.dy);
    ctx.stroke();
    ctx.restore();
    ctx.restore(); // turn
    // hat on head
    if (p.hat.where === 'head') {
      ctx.save();
      ctx.translate(p.hat.x, -p.hat.lift + p.hat.y);
      ctx.translate(-10, G.head.top);
      ctx.rotate(p.hat.rot);
      ctx.scale(1 + (1 - p.hat.squash) * 0.5, p.hat.squash);
      ctx.translate(10, -G.head.top);
      drawHatArt(ctx);
      ctx.restore();
    }
    ctx.restore();
  };

  const drawFrontArmAndWeapon = () => {
    drawArmSeg(ctx, s.shoulderF, s.elbowF);
    drawArmSeg(ctx, s.elbowF, s.handF);
    // bow in hand
    if (p.bow.mode === 'hand' && p.bow.slungT < 0.5) {
      ctx.save();
      ctx.translate(s.handF.x, s.handF.y);
      ctx.rotate(p.bow.rot);
      drawBowArt(ctx, p.bow.draw, p.bow.arrow, p.bow.recoil);
      ctx.restore();
    }
    if (p.weapon.kind !== 'unarmed' && p.weapon.kind !== 'bow' && !p.weapon.backHand) {
      ctx.save();
      ctx.translate(s.handF.x, s.handF.y);
      ctx.rotate(weaponFrontRot(p, s));
      drawWeaponArt(ctx, p.weapon.kind);
      ctx.restore();
    }
    // carried pickup item (in the front hand)
    if (p.carriedItem.kind !== 'none') {
      ctx.save();
      ctx.translate(s.handF.x, s.handF.y);
      ctx.rotate(p.carriedItem.rot);
      if (p.carriedItem.kind === 'quiver') {
        ctx.translate(0, -40);
        ctx.scale(0.9, 0.9);
        drawQuiverArt(ctx);
      } else {
        ctx.scale(0.9, 0.9);
        drawBowArt(ctx, 0, false);
      }
      ctx.restore();
    }
    // hat in hand
    if (p.hat.where === 'hand') {
      ctx.save();
      ctx.translate(s.handF.x, s.handF.y);
      ctx.rotate(p.hat.rot);
      ctx.translate(-30, 18);
      drawHatLoose(ctx);
      ctx.restore();
    }
    drawHand(ctx, s.handF);
  };


  const bowInFrontHand = p.bow.mode === 'hand' && p.bow.slungT < 0.5;

  // bow arm first, so the torso and beard cover it
  if (bowInFrontHand) drawFrontArmAndWeapon();

  // ---- 4. torso
  ctx.save();
  ctx.translate(s.torso.o.x, s.torso.o.y);
  ctx.rotate(s.torso.a);
  const T = G.torso;
  const tw = T.x1 - T.x0;
  const th = T.bottom - T.top;
  rrect(ctx, T.x0, T.top, tw, th, T.r);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = COL.orange;
  ctx.fillRect(T.x0, T.top, tw, th);
  // tunic details
  ctx.fillStyle = COL.orangeDark;
  ctx.beginPath(); // front flap
  ctx.moveTo(T.x0 + 30, -92);
  ctx.lineTo(T.x0 + 78, -44);
  ctx.lineTo(T.x0 + 30, -20);
  ctx.closePath();
  ctx.fill();
  circle(ctx, 24, -40, 20);
  ctx.fill();
  rrect(ctx, T.x0 + 54, -16, 56, 36, 18); // hem patches
  ctx.fill();
  rrect(ctx, T.x1 - 100, -16, 56, 36, 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.06)'; // back shade
  ctx.fillRect(T.x1 - 24, T.top, 24, th);
  if (p.quiver.on) {
    // strap across the chest
    ctx.strokeStyle = COL.strap;
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(G.quiver.ax + 6, G.quiver.ay - 6);
    ctx.lineTo(T.x0 + 22, -34);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();

  // ---- head
  drawHead();

  // arm without the bow — over the beard (back arm never holds the bow)
  drawArmSeg(ctx, s.shoulderB, s.elbowB);
  drawArmSeg(ctx, s.elbowB, s.handB);
  drawBackWeapon();
  drawHand(ctx, s.handB);

  // front arm over the beard, unless it is the one holding the bow
  if (!bowInFrontHand) drawFrontArmAndWeapon();

  // ---- debug overlays
  const d = opts.debug;
  if (d) {
    ctx.lineWidth = 2;
    if (d.shoulders) {
      ctx.strokeStyle = 'rgba(217,43,39,0.8)';
      ctx.beginPath();
      ctx.moveTo(s.shoulderF.x, s.shoulderF.y);
      ctx.lineTo(s.shoulderB.x, s.shoulderB.y);
      ctx.stroke();
    }
    if (d.hips) {
      ctx.strokeStyle = 'rgba(33,118,214,0.85)';
      ctx.beginPath();
      ctx.moveTo(s.hipF.x, s.hipF.y);
      ctx.lineTo(s.hipB.x, s.hipB.y);
      ctx.stroke();
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(s.pelvis.x, s.pelvis.y);
      ctx.lineTo(s.pelvis.x, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(33,118,214,0.85)';
      circle(ctx, s.pelvis.x, 6, 5);
      ctx.fill();
    }
    if (d.pivots) {
      const pts: Array<[Vec, string]> = [
        [s.pelvis, '#2176D6'],
        [s.shoulderF, '#D92B27'],
        [s.shoulderB, '#D92B27'],
        [s.elbowF, '#EA6227'],
        [s.elbowB, '#EA6227'],
        [s.neck, '#7B3FA0'],
        [s.hipF, '#2176D6'],
        [s.hipB, '#2176D6'],
        [s.kneeF, '#1E9E6A'],
        [s.kneeB, '#1E9E6A'],
        [s.ankleF, '#1E9E6A'],
        [s.ankleB, '#1E9E6A'],
      ];
      for (const [pt, c] of pts) {
        ctx.fillStyle = c;
        circle(ctx, pt.x, pt.y, 5);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    }
    if (d.anchors) {
      for (const [pt, c] of [
        [s.handF, '#F2B134'],
        [s.handB, '#F2B134'],
      ] as Array<[Vec, string]>) {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2.5;
        circle(ctx, pt.x, pt.y, 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pt.x - 16, pt.y);
        ctx.lineTo(pt.x + 16, pt.y);
        ctx.moveTo(pt.x, pt.y - 16);
        ctx.lineTo(pt.x, pt.y + 16);
        ctx.stroke();
      }
      if (s.nock && s.tip) {
        ctx.strokeStyle = 'rgba(39,34,32,0.5)';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(s.nock.x, s.nock.y);
        ctx.lineTo(s.tip.x, s.tip.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#1E9E6A';
        circle(ctx, s.nock.x, s.nock.y, 5);
        ctx.fill();
        circle(ctx, s.tip.x, s.tip.y, 5);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
