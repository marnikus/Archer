// Upgraded modular archer rig (GDD section 14, 18, 19) + fixed left-facing geometry & slung bow.
import { PAL, RIG, art, drawArrowArt, drawQuiverArt, roundRectPath } from './art';

export type WeaponId = 'none' | 'shortbow' | 'longbow' | 'crossbow' | 'javelin' | 'slingshot' | 'snowball';
export type HatId = 'none' | 'wool' | 'archer' | 'fur';
export type AttachPoint = 'leadHand' | 'rearHand' | 'headTop' | 'back' | 'belt' | 'underArm' | 'ground';
export type CarryPose = 'stand' | 'walk' | 'run' | 'low' | 'air';
export type EyeExpr = 'normal' | 'blink' | 'squint' | 'wide' | 'happy' | 'wink' | 'cross';
export type WeaponAttachMode = 'slung' | 'leadHand' | 'rearHand' | 'bothHands' | 'underArm' | 'belt' | 'back' | 'hidden';

export const WEAPON_LABELS: Record<WeaponId, string> = {
  none: 'Empty hands',
  shortbow: 'Short bow',
  longbow: 'Longbow',
  crossbow: 'Crossbow',
  javelin: 'Javelin',
  slingshot: 'Slingshot',
  snowball: 'Snowball',
};

export const HAT_LABELS: Record<HatId, string> = {
  none: 'None',
  wool: 'Wool hat',
  archer: 'Archer cap',
  fur: 'Fur hat',
};

export interface LegRig {
  hipX: number;
  ang: number; // hip swing radians (+ swings forward/left, - swings back/right)
  slideUp: number; // up to ~22 units sliding up under tunic
  bootTilt: number; // local boot tilt radians
  planted: boolean;
}

export interface ArmTarget {
  shoulderX: number;
  shoulderY: number;
  upperLen: number;
  foreLen: number;
  elbowDir: 1 | -1; // bend direction in IK
  handX?: number;
  handY?: number;
  upperAng?: number; // FK fallback if handX/Y omitted
  foreAng?: number;
}

export interface RigPose {
  // Body transform (local SVG space around FEET (480, 651))
  bodyX: number;
  bodyY: number; // vertical offset (+ = up, - = down)
  jumpY: number; // jump height above ground (+ = up)
  squashX: number;
  squashY: number;
  lean: number; // forward/back lean radians (- = lean left/forward, + = lean right/back)
  roll: number; // sideways roll
  turnScaleX: number; // turn squish/flip scalar (1 normal, down to 0.85 mid-turn)
  spinX: number; // victory spin scalar

  // Face & head group (canonical facing LEFT: face centered around x=458, beard x=340..574)
  faceSlideX: number; // +/- 20u
  faceSlideY: number; // +/- 8u
  headTilt: number;
  eyeExpr: EyeExpr;
  eyeScale: number;
  eyeLookX: number;
  eyeLookY: number;
  mustacheCurlL: number;
  mustacheCurlR: number;
  mustacheBack: number;
  smile: number;
  beardSwayX: number;
  beardSwayY: number;
  beardLiftY: number;

  // Legs
  legLead: LegRig; // far/lead-side leg (hip 420)
  legRear: LegRig; // near/rear-side leg (hip 538)

  // Arms
  leadArm: ArmTarget;
  rearArm: ArmTarget;
  leadArmInFront: boolean; // false in idle/slung (behind torso like ref 1), true when aiming/reaching out
  rearArmInFront: boolean; // true in idle/slung/aim (in front of torso like ref 1 & 2)

  // Equipment & attachments
  weapon: WeaponId;
  weaponMode: WeaponAttachMode;
  weaponRot: number; // rotation for hand-held weapon (radians, 0 = aiming straight left)
  bowDraw: number; // 0..1
  bowTipBend: number; // extra bend px
  stringVib: number; // decaying string oscillation offset
  showArrow: boolean;
  javelinThrowAmt: number; // cock back / throw progress
  snowballSize: number; // 0..1

  quiverOn: boolean;
  quiverBounce: number;
  quiverTilt: number;
  arrowRattle: number;
  quiverArrows: number; // 2 normally, 1 when arrow nocked

  hat: HatId;
  hatOffX: number;
  hatOffY: number;
  hatRot: number;
  hatLagX: number;
  hatWobble: number; // pom-pom / feather / flap secondary lag
  hatInHand: boolean; // true while rear hand lifts/puts on/takes off hat
  hatThrowY: number; // victory throw height
  hatThrowRot: number;

  // Secondary FX
  baldShine: number; // 0..1 highlight blink when hat removed
  zzzPhase: number; // >0 when napping
  breathPuff: number; // >0 subtle mouth puff
  sitProgress: number; // 0 standing, 1 seated (legs forward/dangling)
  sitOnStump: boolean;
  hideProgress: number; // 0 standing, 1 ducked
  silhouetteColor: string | null; // non-null in Silhouette mode
}

export interface RigPivots {
  bodyBase: { x: number; y: number };
  headTop: { x: number; y: number };
  hatTop: { x: number; y: number };
  leadShoulder: { x: number; y: number };
  leadElbow: { x: number; y: number };
  leadHand: { x: number; y: number };
  rearShoulder: { x: number; y: number };
  rearElbow: { x: number; y: number };
  rearHand: { x: number; y: number };
  leadFoot: { x: number; y: number };
  rearFoot: { x: number; y: number };
  bowTip: { x: number; y: number };
  nock: { x: number; y: number };
  arrowTip: { x: number; y: number };
  backAttach: { x: number; y: number };
  beltAttach: { x: number; y: number };
  underArmAttach: { x: number; y: number };
}

export function createDefaultPose(): RigPose {
  return {
    bodyX: 0,
    bodyY: 0,
    jumpY: 0,
    squashX: 1,
    squashY: 1,
    lean: 0,
    roll: 0,
    turnScaleX: 1,
    spinX: 1,
    faceSlideX: 0,
    faceSlideY: 0,
    headTilt: 0,
    eyeExpr: 'normal',
    eyeScale: 1,
    eyeLookX: 0,
    eyeLookY: 0,
    mustacheCurlL: 0,
    mustacheCurlR: 0,
    mustacheBack: 0,
    smile: 0,
    beardSwayX: 0,
    beardSwayY: 0,
    beardLiftY: 0,
    legLead: { hipX: 420, ang: 0, slideUp: 0, bootTilt: 0, planted: true },
    legRear: { hipX: 538, ang: 0, slideUp: 0, bootTilt: 0, planted: true },
    leadArm: {
      shoulderX: 358,
      shoulderY: 425,
      upperLen: 56,
      foreLen: 56,
      elbowDir: -1,
      upperAng: Math.PI / 2 - 0.08,
      foreAng: Math.PI / 2 + 0.06,
    },
    rearArm: {
      shoulderX: 582,
      shoulderY: 425,
      upperLen: 82,
      foreLen: 82,
      elbowDir: 1,
      upperAng: Math.PI / 2,
      foreAng: Math.PI / 2,
    },
    leadArmInFront: false,
    rearArmInFront: true,
    weapon: 'none',
    weaponMode: 'slung',
    weaponRot: 0,
    bowDraw: 0,
    bowTipBend: 0,
    stringVib: 0,
    showArrow: false,
    javelinThrowAmt: 0,
    snowballSize: 0,
    quiverOn: false,
    quiverBounce: 0,
    quiverTilt: 0,
    arrowRattle: 0,
    quiverArrows: 2,
    hat: 'none',
    hatOffX: 0,
    hatOffY: 0,
    hatRot: 0,
    hatLagX: 0,
    hatWobble: 0,
    hatInHand: false,
    hatThrowY: 0,
    hatThrowRot: 0,
    baldShine: 0,
    zzzPhase: 0,
    breathPuff: 0,
    sitProgress: 0,
    sitOnStump: false,
    hideProgress: 0,
    silhouetteColor: null,
  };
}

// ---------------------------------------------------------------------------
// 2-bone IK + capsule renderer
// ---------------------------------------------------------------------------
export function solveArm(arm: ArmTarget): { sx: number; sy: number; ex: number; ey: number; hx: number; hy: number } {
  const sx = arm.shoulderX;
  const sy = arm.shoulderY;
  const L1 = arm.upperLen;
  const L2 = arm.foreLen;
  if (arm.handX !== undefined && arm.handY !== undefined) {
    const dx = arm.handX - sx;
    const dy = arm.handY - sy;
    const rawD = Math.hypot(dx, dy);
    const maxD = L1 + L2 - 0.5;
    const minD = Math.abs(L1 - L2) + 2;
    const d = Math.max(minD, Math.min(maxD, rawD));
    const base = Math.atan2(dy, dx);
    const cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
    const alpha = Math.acos(cosA);
    const ang1 = base + arm.elbowDir * alpha;
    const ex = sx + Math.cos(ang1) * L1;
    const ey = sy + Math.sin(ang1) * L1;
    const hx = rawD > maxD ? sx + (dx / (rawD || 1)) * d : arm.handX;
    const hy = rawD > maxD ? sy + (dy / (rawD || 1)) * d : arm.handY;
    return { sx, sy, ex, ey, hx, hy };
  }
  const u = arm.upperAng ?? Math.PI / 2;
  const f = arm.foreAng ?? u;
  const ex = sx + Math.cos(u) * L1;
  const ey = sy + Math.sin(u) * L1;
  const hx = ex + Math.cos(f) * L2;
  const hy = ey + Math.sin(f) * L2;
  return { sx, sy, ex, ey, hx, hy };
}

function drawCapsule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, color: string) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

function drawTwoPartArm(ctx: CanvasRenderingContext2D, pts: ReturnType<typeof solveArm>, r: number, color: string) {
  drawCapsule(ctx, pts.sx, pts.sy, pts.ex, pts.ey, r, color);
  drawCapsule(ctx, pts.ex, pts.ey, pts.hx, pts.hy, r, color);
}

// ---------------------------------------------------------------------------
// Weapon geometry helpers (consistent across aim, draw, release, and projectile)
// ---------------------------------------------------------------------------
export const RIG_NEW = {
  FEET: { x: 480, y: 651 },
  LEAD_SHOULDER: { x: 358, y: 425 },
  REAR_SHOULDER_IDLE: { x: 582, y: 425 },
  REAR_SHOULDER_AIM: { x: 470, y: 426 },
  LEAD_ARM_LEN: 102, // 52 + 50
  REAR_ARM_LEN: 172, // 86 + 86 (idle uses 82 + 82 = 164 so hand sits at y=589)
  BOW_SCALE: 0.65,
  LONGBOW_SCALE: 0.91, // 1.4x shortbow
  BOW_STRING_X: 45,
  BOW_TIP_Y: 97,
  DRAW_TRAVEL: 110,
  ARROW_LEN: 230,
};

export function bowWeaponGeom(
  handX: number,
  handY: number,
  bowRot: number,
  draw: number,
  weapon: WeaponId,
  stringVib = 0,
) {
  const long = weapon === 'longbow';
  const scaleMul = long ? 1.4 : 1;
  const bx = 1 + 0.28 * draw;
  const sx = RIG_NEW.BOW_STRING_X * scaleMul * bx;
  const nx = sx + RIG_NEW.DRAW_TRAVEL * draw + stringVib;
  const ny = 4;
  const c = Math.cos(bowRot);
  const s = Math.sin(bowRot);
  const nock = { x: handX + nx * c - ny * s, y: handY + nx * s + ny * c };
  const arrowLen = long ? RIG_NEW.ARROW_LEN * 1.15 : RIG_NEW.ARROW_LEN;
  const tip = { x: nock.x - arrowLen * c, y: nock.y - arrowLen * s };
  const topTip = {
    x: handX + sx * c - -RIG_NEW.BOW_TIP_Y * scaleMul * s,
    y: handY + sx * s + -RIG_NEW.BOW_TIP_Y * scaleMul * c,
  };
  return { nock, tip, topTip, nx, ny, sx, scaleMul, bx };
}

// ---------------------------------------------------------------------------
// Hats renderer
// ---------------------------------------------------------------------------
export function drawHatArt(ctx: CanvasRenderingContext2D, hat: HatId, wobble: number, sil: string | null) {
  if (hat === 'none') return;
  const c = (col: string) => sil ?? col;
  ctx.save();
  if (hat === 'wool') {
    // Red wool dome + orange cuff band + springy white pom-pom
    ctx.fillStyle = c(PAL.red2);
    ctx.beginPath();
    ctx.moveTo(-124, 14);
    ctx.bezierCurveTo(-122, -78, -60, -108, 0, -108);
    ctx.bezierCurveTo(60, -108, 122, -78, 124, 14);
    ctx.closePath();
    ctx.fill();
    // rib stripes
    if (!sil) {
      ctx.strokeStyle = 'rgba(130,22,16,0.22)';
      ctx.lineWidth = 6;
      for (const rx of [-58, 0, 58]) {
        ctx.beginPath();
        ctx.moveTo(rx, -100 + Math.abs(rx) * 0.22);
        ctx.quadraticCurveTo(rx * 1.15, -45, rx * 1.1, 0);
        ctx.stroke();
      }
    }
    // orange folded band
    ctx.fillStyle = c(PAL.orange2);
    roundRectPath(ctx, -138, -14, 276, 42, 20);
    ctx.fill();
    // pom-pom with lag
    ctx.fillStyle = c('#FFFFFF');
    ctx.beginPath();
    ctx.arc(wobble * 18, -118 + Math.abs(wobble) * 3, 28, 0, Math.PI * 2);
    ctx.fill();
  } else if (hat === 'archer') {
    // Pointed brown cap + feather
    ctx.fillStyle = c(PAL.brown);
    ctx.beginPath();
    ctx.moveTo(-136, 12);
    ctx.quadraticCurveTo(-100, -76, -24, -98);
    ctx.lineTo(132, -74);
    ctx.quadraticCurveTo(106, -12, 130, 12);
    ctx.closePath();
    ctx.fill();
    // brim fold
    ctx.fillStyle = c(PAL.brownDark);
    roundRectPath(ctx, -142, -8, 282, 34, 16);
    ctx.fill();
    // feather bending back with speed/wobble
    ctx.save();
    ctx.translate(64, -22);
    ctx.rotate(0.45 + wobble * 0.45);
    ctx.fillStyle = c(PAL.red);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(36, -68, 72, -108);
    ctx.quadraticCurveTo(72, -48, 12, 6);
    ctx.closePath();
    ctx.fill();
    if (!sil) {
      ctx.strokeStyle = '#FFF3EA';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, -2);
      ctx.quadraticCurveTo(34, -56, 62, -94);
      ctx.stroke();
    }
    ctx.restore();
  } else if (hat === 'fur') {
    // Reference-inspired warm explorer/fur hat with ear flaps
    const brimCol = c('#C49F77');
    const crownCol = c('#81442B');
    const flapCol = c(PAL.brownDark);
    // crown
    ctx.fillStyle = crownCol;
    roundRectPath(ctx, -116, -98, 232, 98, 42);
    ctx.fill();
    // ear flaps bouncing on step
    for (const dir of [-1, 1] as const) {
      ctx.save();
      ctx.translate(dir * 116, 8);
      ctx.rotate(dir * (0.06 + wobble * 0.26));
      ctx.fillStyle = flapCol;
      roundRectPath(ctx, -20, -4, 40, 62, 18);
      ctx.fill();
      ctx.restore();
    }
    // fluffy brim
    ctx.fillStyle = brimCol;
    roundRectPath(ctx, -142, -26, 284, 52, 24);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Extra weapon renderers
// ---------------------------------------------------------------------------
function drawBowBodyAndString(
  ctx: CanvasRenderingContext2D,
  draw: number,
  tipBend: number,
  stringVib: number,
  showArrow: boolean,
  weapon: WeaponId,
  sil: string | null,
) {
  const A = art();
  const isLong = weapon === 'longbow';
  const k = isLong ? RIG_NEW.LONGBOW_SCALE : RIG_NEW.BOW_SCALE;
  const scaleMul = isLong ? 1.4 : 1;
  const bx = 1 + 0.28 * draw + tipBend * 0.008;
  const by = 1 - 0.05 * draw;
  const BOW_TILT = Math.atan2(69.4715 - 110.191, 704.12 - 409.281);
  ctx.save();
  ctx.scale(bx, by);
  ctx.scale(-k, k);
  ctx.translate(-235, -539);
  ctx.rotate(BOW_TILT);
  ctx.fillStyle = sil ?? (isLong ? PAL.brown : PAL.red);
  ctx.fill(A.bowBody);
  ctx.strokeStyle = sil ?? (isLong ? PAL.gold : '#FFFFFF');
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke(A.bowTipTop);
  ctx.stroke(A.bowTipBot);
  ctx.restore();
  const sx = RIG_NEW.BOW_STRING_X * scaleMul * bx;
  const ty = RIG_NEW.BOW_TIP_Y * scaleMul * by;
  const nx = sx + RIG_NEW.DRAW_TRAVEL * draw + stringVib;
  const ny = 4;
  ctx.strokeStyle = sil ?? 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, -ty);
  ctx.lineTo(nx, ny);
  ctx.lineTo(sx, ty);
  ctx.stroke();
  if (showArrow) {
    ctx.save();
    ctx.translate(nx - (isLong ? RIG_NEW.ARROW_LEN * 1.15 : RIG_NEW.ARROW_LEN), ny);
    ctx.rotate(Math.PI);
    if (sil) {
      ctx.strokeStyle = sil;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-(isLong ? RIG_NEW.ARROW_LEN * 1.15 : RIG_NEW.ARROW_LEN), 0);
      ctx.stroke();
    } else {
      drawArrowArt(ctx, isLong ? RIG_NEW.ARROW_LEN * 1.15 : RIG_NEW.ARROW_LEN);
    }
    ctx.restore();
  }
}

function drawCrossbow(ctx: CanvasRenderingContext2D, draw: number, showBolt: boolean, sil: string | null) {
  const c = (col: string) => sil ?? col;
  ctx.save();
  // prod (bow limbs)
  ctx.strokeStyle = c(PAL.grey);
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-45, -52);
  ctx.quadraticCurveTo(-72, 0, -45, 52);
  ctx.stroke();
  // string
  const strX = -45 + 48 * draw;
  ctx.strokeStyle = c('#FFFFFF');
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-45, -52);
  ctx.lineTo(strX, 0);
  ctx.lineTo(-45, 52);
  ctx.stroke();
  // stock
  ctx.fillStyle = c(PAL.brown);
  roundRectPath(ctx, -78, -11, 138, 22, 9);
  ctx.fill();
  // butt
  ctx.fillStyle = c(PAL.brownDark);
  roundRectPath(ctx, 40, -15, 36, 34, 8);
  ctx.fill();
  if (showBolt) {
    ctx.fillStyle = c('#5B4F4A');
    roundRectPath(ctx, -112, -4, 96, 8, 3);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-124, 0);
    ctx.lineTo(-102, -9);
    ctx.lineTo(-102, 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawJavelin(ctx: CanvasRenderingContext2D, sil: string | null) {
  const c = (col: string) => sil ?? col;
  ctx.save();
  ctx.strokeStyle = c(PAL.brown);
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-140, 0);
  ctx.lineTo(130, 0);
  ctx.stroke();
  // red grip wrap
  ctx.fillStyle = c(PAL.red2);
  roundRectPath(ctx, -18, -7, 38, 14, 5);
  ctx.fill();
  // spearhead (pointing -x)
  ctx.fillStyle = c('#5B4F4A');
  ctx.beginPath();
  ctx.moveTo(-172, 0);
  ctx.lineTo(-132, -13);
  ctx.lineTo(-132, 13);
  ctx.closePath();
  ctx.fill();
  // tail feathers
  ctx.fillStyle = c(PAL.orange2);
  ctx.beginPath();
  ctx.moveTo(108, 0);
  ctx.lineTo(136, -11);
  ctx.lineTo(136, 11);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSlingshot(ctx: CanvasRenderingContext2D, draw: number, sil: string | null) {
  const c = (col: string) => sil ?? col;
  ctx.save();
  // Y handle
  ctx.strokeStyle = c(PAL.brown);
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 38);
  ctx.lineTo(0, 2);
  ctx.lineTo(-16, -28);
  ctx.moveTo(0, 2);
  ctx.lineTo(16, -24);
  ctx.stroke();
  // elastic band
  const pullX = 78 * draw;
  ctx.strokeStyle = c(PAL.orange2);
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-16, -28);
  ctx.lineTo(pullX, -22 + draw * 12);
  ctx.lineTo(16, -24);
  ctx.stroke();
  // pouch + stone
  ctx.fillStyle = c(PAL.brownDark);
  ctx.beginPath();
  ctx.arc(pullX, -22 + draw * 12, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Slung bow on body (matches reference image 1!)
// ---------------------------------------------------------------------------
function drawSlungBowBack(ctx: CanvasRenderingContext2D, weapon: WeaponId, sil: string | null) {
  const A = art();
  const isLong = weapon === 'longbow';
  const sc = isLong ? 1.44 : 1.28;
  // Positioned diagonally behind the torso so upper-left tip peeks outside x=340
  // and lower-right tip peeks outside x=622, matching image-1.png!
  ctx.save();
  ctx.translate(484, 456);
  ctx.rotate(-1.31);
  ctx.scale(sc, sc);
  ctx.translate(-128, -555);
  ctx.fillStyle = sil ?? (isLong ? PAL.brown : PAL.red);
  ctx.fill(A.bowBody);
  ctx.strokeStyle = sil ?? (isLong ? PAL.gold : '#FFFFFF');
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke(A.bowTipTop);
  ctx.stroke(A.bowTipBot);
  ctx.restore();
}

function drawSlungBowString(ctx: CanvasRenderingContext2D, weapon: WeaponId, sil: string | null) {
  const isLong = weapon === 'longbow';
  const sc = isLong ? 1.44 : 1.28;
  // Exact matching string transform across chest/beard (in front of torso/beard, behind near arm!)
  ctx.save();
  ctx.translate(484, 456);
  ctx.rotate(-1.31);
  ctx.scale(sc, sc);
  ctx.translate(-128, -555);
  ctx.strokeStyle = sil ?? 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(110.2, 409.3);
  ctx.lineTo(69.5, 704.1);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Main Rig Renderer
// ---------------------------------------------------------------------------
function drawLeg(ctx: CanvasRenderingContext2D, leg: LegRig, color: string, sitProgress: number, sitOnStump: boolean) {
  ctx.save();
  // Sit transforms: legs swing forward (-x) on ground or dangle on stump
  const hipY = 582 - leg.slideUp;
  if (sitProgress > 0.01) {
    const targetAng = sitOnStump ? -0.15 : Math.PI * 0.48; // forward along ground vs dangling off stump
    const a = leg.ang * (1 - sitProgress) + targetAng * sitProgress;
    ctx.translate(leg.hipX, hipY);
    ctx.rotate(a);
    ctx.translate(-leg.hipX, -hipY);
  } else {
    ctx.translate(leg.hipX, hipY);
    ctx.rotate(leg.ang);
    ctx.translate(-leg.hipX, -hipY);
  }
  ctx.fillStyle = color;
  // Upper-boot + toe tilt near bottom
  if (Math.abs(leg.bootTilt) > 0.005 && sitProgress < 0.1) {
    ctx.fill(
      (() => {
        const p = new Path2D();
        p.roundRect(leg.hipX - 32, 575, 64, 46, 12);
        return p;
      })(),
    );
    ctx.save();
    ctx.translate(leg.hipX, 626);
    ctx.rotate(leg.bootTilt);
    ctx.fillStyle = color;
    roundRectPath(ctx, -32, -16, 64, 41, 16);
    ctx.fill();
    ctx.restore();
  } else {
    roundRectPath(ctx, leg.hipX - 32, 575, 64, 76, 16);
    ctx.fill();
  }
  ctx.restore();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  expr: EyeExpr,
  eyeScale: number,
  lookX: number,
  lookY: number,
  isLeadEye: boolean,
  sil: string | null,
) {
  const col = sil ?? '#272220';
  ctx.save();
  ctx.translate(cx + lookX * 5, cy + lookY * 4);
  if (expr === 'happy' || (expr === 'wink' && isLeadEye)) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 6, 12, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (expr === 'squint') {
    ctx.strokeStyle = col;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (isLeadEye) {
      ctx.moveTo(-11, -5);
      ctx.lineTo(10, 0);
      ctx.lineTo(-11, 5);
    } else {
      ctx.moveTo(11, -5);
      ctx.lineTo(-10, 0);
      ctx.lineTo(11, 5);
    }
    ctx.stroke();
  } else if (expr === 'cross') {
    const crossOff = isLeadEye ? 5 : -5;
    ctx.fillStyle = col;
    roundRectPath(ctx, -11 + crossOff, -15, 22, 30, 11);
    ctx.fill();
  } else {
    const sy = expr === 'blink' ? 0.12 : expr === 'wide' ? 1.18 : eyeScale;
    const sx = expr === 'wide' ? 1.18 : 1;
    ctx.scale(sx, sy);
    ctx.fillStyle = col;
    roundRectPath(ctx, -12, -18.5, 24, 37, 12);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the upgraded archer rig at local origin (0, 0) = feet on ground.
 * Unflipped = facing LEFT (-x). Wrap with `ctx.scale(-1, 1)` when facing RIGHT.
 * Returns pivot positions in the same local space (feet = 0,0) for overlays/projectiles.
 */
export function drawRigArcher(ctx: CanvasRenderingContext2D, p: RigPose): RigPivots {
  const sil = p.silhouetteColor;
  const col = (c: string) => sil ?? c;

  // Pivot accumulator in SVG coords, later transformed into local feet=(0,0) coords
  const pivots: RigPivots = {
    bodyBase: { x: 0, y: 0 },
    headTop: { x: 0, y: -396 },
    hatTop: { x: 0, y: -470 },
    leadShoulder: { x: -122, y: -226 },
    leadElbow: { x: -122, y: -170 },
    leadHand: { x: -122, y: -114 },
    rearShoulder: { x: 102, y: -226 },
    rearElbow: { x: 102, y: -144 },
    rearHand: { x: 102, y: -62 },
    leadFoot: { x: -60, y: 0 },
    rearFoot: { x: 58, y: 0 },
    bowTip: { x: -170, y: -260 },
    nock: { x: -120, y: -220 },
    arrowTip: { x: -350, y: -220 },
    backAttach: { x: 132, y: -173 },
    beltAttach: { x: 40, y: -105 },
    underArmAttach: { x: -60, y: -155 },
  };

  // Helper to convert SVG coordinates (480, 651 = feet) into current local coords
  const sx = p.turnScaleX * p.spinX * p.squashX;
  const sy = p.squashY;
  const bodyDrop = -p.bodyY + p.hideProgress * 125 + p.sitProgress * 55;

  const toLocal = (ax: number, ay: number, includeBodyDrop = true) => {
    const lx = (ax - RIG_NEW.FEET.x) * sx + p.bodyX;
    const ly = (ay - RIG_NEW.FEET.y + (includeBodyDrop ? bodyDrop : 0)) * sy - p.jumpY;
    return { x: lx, y: ly };
  };

  // Compute foot contact centers in local coords (for Foot locks overlay)
  const legAngLead = p.sitProgress > 0.01 ? p.legLead.ang * (1 - p.sitProgress) + (p.sitOnStump ? -0.15 : Math.PI * 0.48) * p.sitProgress : p.legLead.ang;
  const legAngRear = p.sitProgress > 0.01 ? p.legRear.ang * (1 - p.sitProgress) + (p.sitOnStump ? -0.15 : Math.PI * 0.48) * p.sitProgress : p.legRear.ang;
  const footDist = 69; // 651 - 582
  const lfSvgX = p.legLead.hipX - Math.sin(legAngLead) * footDist;
  const lfSvgY = 582 - p.legLead.slideUp + Math.cos(legAngLead) * footDist;
  const rfSvgX = p.legRear.hipX - Math.sin(legAngRear) * footDist;
  const rfSvgY = 582 - p.legRear.slideUp + Math.cos(legAngRear) * footDist;
  pivots.leadFoot = toLocal(lfSvgX, lfSvgY, false);
  pivots.rearFoot = toLocal(rfSvgX, rfSvgY, false);

  ctx.save();
  ctx.translate(p.bodyX, -p.jumpY);
  ctx.scale(sx, sy);
  ctx.translate(-RIG_NEW.FEET.x, -RIG_NEW.FEET.y);

  // 1. Legs (far/lead leg slightly darker and behind when moving, unless sitting)
  if (p.hideProgress < 0.85) {
    const legSink = p.hideProgress * 45 + p.sitProgress * 52;
    ctx.save();
    ctx.translate(0, legSink);
    drawLeg(ctx, p.legLead, col('#3D2B20'), p.sitProgress, p.sitOnStump);
    drawLeg(ctx, p.legRear, col(PAL.brownDark), p.sitProgress, p.sitOnStump);
    ctx.restore();
  }

  // 2. Upper body transform (bob / sit / hide / lean / roll around hips y=590)
  ctx.translate(0, bodyDrop);
  ctx.translate(480, 590);
  ctx.rotate(p.lean + p.roll);
  ctx.translate(-480, -590);

  // Solve arms up front so weapon & hat hand attachments use exact wrist positions
  const leadPts = solveArm(p.leadArm);
  const rearPts = solveArm(p.rearArm);

  // Compute pivot locations rotated by body lean around (480, 590)
  const leanRot = (ax: number, ay: number) => {
    const dx = ax - 480;
    const dy = ay - 590;
    const a = p.lean + p.roll;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return toLocal(480 + dx * c - dy * s, 590 + dx * s + dy * c, true);
  };
  pivots.bodyBase = leanRot(480, 590);
  pivots.headTop = leanRot(460, 255);
  pivots.leadShoulder = leanRot(leadPts.sx, leadPts.sy);
  pivots.leadElbow = leanRot(leadPts.ex, leadPts.ey);
  pivots.leadHand = leanRot(leadPts.hx, leadPts.hy);
  pivots.rearShoulder = leanRot(rearPts.sx, rearPts.sy);
  pivots.rearElbow = leanRot(rearPts.ex, rearPts.ey);
  pivots.rearHand = leanRot(rearPts.hx, rearPts.hy);
  pivots.backAttach = leanRot(612, 478);
  pivots.beltAttach = leanRot(520, 545);
  pivots.underArmAttach = leanRot(420, 495);

  // 3. Back items: Quiver & Slung Bow Back (behind torso!)
  if (p.quiverOn) {
    ctx.save();
    ctx.translate(612, 478 + p.quiverBounce);
    ctx.rotate(0.35 + p.quiverTilt);
    ctx.scale(0.6, 0.6);
    ctx.translate(-825, -650);
    if (sil) {
      ctx.fillStyle = sil;
      roundRectPath(ctx, 774, 564, 103, 168, 28);
      ctx.fill();
      ctx.strokeStyle = sil;
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(808, 575);
      ctx.lineTo(804, 490);
      ctx.moveTo(842, 575);
      ctx.lineTo(840, 495);
      ctx.stroke();
    } else {
      // slight arrow rattle inside quiver
      ctx.save();
      ctx.translate(825, 580);
      ctx.rotate(p.arrowRattle);
      ctx.translate(-825, -580);
      const A = art();
      for (let i = 0; i < A.quiverFills.length; i++) {
        if (p.quiverArrows <= 1 && i >= 2) continue;
        ctx.fillStyle = A.quiverFills[i][1];
        ctx.fill(A.quiverFills[i][0]);
      }
      for (let i = 0; i < A.quiverStrokes.length; i++) {
        if (p.quiverArrows <= 1 && i < 2) continue;
        ctx.strokeStyle = A.quiverStrokes[i][1];
        ctx.lineWidth = A.quiverStrokes[i][2];
        ctx.lineCap = 'round';
        ctx.stroke(A.quiverStrokes[i][0]);
      }
      ctx.restore();
      ctx.strokeStyle = PAL.brown;
      ctx.lineWidth = 20;
      ctx.lineCap = 'round';
      ctx.stroke(art().quiverStrap);
      ctx.fillStyle = PAL.brown;
      ctx.fill(art().quiverRim);
      ctx.fill(art().quiverBody);
    }
    ctx.restore();
  }

  // Slung bow or stowed weapon on back
  if ((p.weapon === 'shortbow' || p.weapon === 'longbow') && p.weaponMode === 'slung') {
    drawSlungBowBack(ctx, p.weapon, sil);
  } else if (p.weapon === 'javelin' && p.weaponMode === 'back') {
    ctx.save();
    ctx.translate(580, 460);
    ctx.rotate(1.1);
    drawJavelin(ctx, sil);
    ctx.restore();
  }

  // Far/lead arm behind body when not reaching out in front
  if (!p.leadArmInFront) {
    drawTwoPartArm(ctx, leadPts, 24, col(PAL.skin));
  }
  if (!p.rearArmInFront) {
    drawTwoPartArm(ctx, rearPts, 24, col(PAL.skin));
  }

  // 4. Torso (fixed LEFT-facing body block!)
  const bodyMask = new Path2D();
  bodyMask.roundRect(340, 255, 282, 335, 32);
  ctx.save();
  ctx.clip(bodyMask);
  // Base head skin
  ctx.fillStyle = col(PAL.skin);
  ctx.fillRect(340, 255, 282, 160);
  // Orange tunic (including shoulder/neck back on right side 565..622 below hat line y=312)
  ctx.fillStyle = col(PAL.orange);
  ctx.fillRect(340, 403, 282, 187);
  ctx.fillRect(564, 312, 58, 100);
  if (!sil) {
    // Tunic camo spots (matching image-1.png!)
    ctx.fillStyle = PAL.orangeDark;
    ctx.beginPath();
    ctx.ellipse(588, 372, 26, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(478, 515, 28, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(362, 482, 26, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    roundRectPath(ctx, 412, 553, 58, 55, 24);
    ctx.fill();
    roundRectPath(ctx, 520, 553, 58, 55, 24);
    ctx.fill();
    // Diagonal quiver strap across chest (bottom-left up-right toward quiver!)
    if (p.quiverOn) {
      ctx.strokeStyle = '#723F2A';
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(332, 540);
      ctx.lineTo(632, 456);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Under-arm stowed weapon (e.g. while putting on/taking off hat)
  if (p.weaponMode === 'underArm' && p.weapon !== 'none') {
    ctx.save();
    ctx.translate(425, 495);
    ctx.rotate(0.12);
    if (p.weapon === 'shortbow' || p.weapon === 'longbow') drawBowBodyAndString(ctx, 0, 0, 0, false, p.weapon, sil);
    else if (p.weapon === 'crossbow') drawCrossbow(ctx, 0, false, sil);
    else if (p.weapon === 'javelin') drawJavelin(ctx, sil);
    ctx.restore();
  }

  // Belt stowed weapon (slingshot)
  if (p.weapon === 'slingshot' && p.weaponMode === 'belt') {
    ctx.save();
    ctx.translate(518, 548);
    ctx.rotate(0.2);
    ctx.scale(0.85, 0.85);
    drawSlingshot(ctx, 0, sil);
    ctx.restore();
  }

  // 5. Head & Beard Group (canonical LEFT-facing: beard flush on LEFT x=340..574!)
  ctx.save();
  ctx.translate(458 + p.faceSlideX, 403 + p.faceSlideY);
  ctx.rotate(p.headTilt);
  ctx.translate(-458, -403);

  // Beard main silhouette (x=340..574, top y=288, rounded bottom y=506, with dynamic tails)
  ctx.fillStyle = col('#E6E1DC');
  ctx.beginPath();
  ctx.moveTo(368, 288);
  ctx.lineTo(548, 288);
  ctx.arcTo(574, 288, 574, 314, 26);
  ctx.lineTo(574, 425);
  ctx.quadraticCurveTo(574, 476, 530, 502);
  ctx.lineTo(392, 502);
  ctx.quadraticCurveTo(340, 476, 340, 425);
  ctx.lineTo(340, 314);
  ctx.arcTo(340, 288, 368, 288, 26);
  ctx.closePath();
  ctx.fill();

  // Two beard tails with secondary sway lag
  for (const tx of [404, 492]) {
    ctx.save();
    ctx.translate(tx, 488);
    ctx.rotate(p.beardSwayX * 0.015);
    ctx.fillStyle = col('#E6E1DC');
    roundRectPath(ctx, -27 + p.beardSwayX * 0.4, -10 - p.beardLiftY, 54, 78, 27);
    ctx.fill();
    ctx.restore();
  }

  // Inner peach face (x=378..538, shifted -23 LEFT of body center 481!)
  ctx.fillStyle = col(PAL.skin);
  roundRectPath(ctx, 378, 304, 160, 120, 28);
  ctx.fill();

  // Eyes (left eye 415, right eye 497)
  drawEye(ctx, 415, 358, p.eyeExpr, p.eyeScale, p.eyeLookX, p.eyeLookY, true, sil);
  drawEye(ctx, 497, 358, p.eyeExpr, p.eyeScale, p.eyeLookX, p.eyeLookY, false, sil);

  // Nose
  ctx.fillStyle = col('#F29B70');
  roundRectPath(ctx, 431, 410, 46, 36, 14);
  ctx.fill();

  // Two-half mustache (left & right halves rotate independently!)
  ctx.strokeStyle = col('#FFFFFF');
  ctx.lineWidth = 44;
  ctx.lineCap = 'round';
  // Left half
  ctx.save();
  ctx.translate(442, 405 - 4 * p.smile);
  ctx.rotate(-p.mustacheCurlL + p.mustacheBack);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-49, 28);
  ctx.stroke();
  ctx.restore();
  // Right half
  ctx.save();
  ctx.translate(466, 405 - 4 * p.smile);
  ctx.rotate(p.mustacheCurlR + p.mustacheBack);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(49, 28);
  ctx.stroke();
  ctx.restore();

  // Bald shine blink when hat removed
  if (p.baldShine > 0.01 && !sil) {
    ctx.save();
    ctx.globalAlpha = Math.sin(p.baldShine * Math.PI);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(435, 274, 24, 9, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Hat on head (when not held in hand)
  if (p.hat !== 'none' && !p.hatInHand) {
    ctx.save();
    const hx = 468 + p.hatOffX + p.hatLagX;
    const hy = 278 + p.hatOffY - p.hatThrowY;
    ctx.translate(hx, hy);
    ctx.rotate(p.hatRot + p.hatThrowRot);
    drawHatArt(ctx, p.hat, p.hatWobble, sil);
    pivots.hatTop = leanRot(hx, hy - 115);
    ctx.restore();
  } else {
    pivots.hatTop = pivots.headTop;
  }

  ctx.restore(); // end face/head group

  // Slung bow white string crosses diagonally IN FRONT of beard/chest, BEHIND near arm (image-1.png!)
  if ((p.weapon === 'shortbow' || p.weapon === 'longbow') && p.weaponMode === 'slung') {
    drawSlungBowString(ctx, p.weapon, sil);
    const tipRot = leanRot(310, 412);
    pivots.bowTip = tipRot;
  }

  // Front-layered arms & hand-held weapons
  if (p.leadArmInFront) {
    drawTwoPartArm(ctx, leadPts, 24, col(PAL.skin));
  }

  // Hand-held weapons (bow, longbow, crossbow, javelin, slingshot, snowball)
  if (p.weapon !== 'none' && p.weaponMode !== 'slung' && p.weaponMode !== 'underArm' && p.weaponMode !== 'belt' && p.weaponMode !== 'back' && p.weaponMode !== 'hidden') {
    if (p.weapon === 'shortbow' || p.weapon === 'longbow') {
      const gx = leadPts.hx;
      const gy = leadPts.hy;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(p.weaponRot);
      drawBowBodyAndString(ctx, p.bowDraw, p.bowTipBend, p.stringVib, p.showArrow, p.weapon, sil);
      ctx.restore();
      const g = bowWeaponGeom(gx, gy, p.weaponRot, p.bowDraw, p.weapon, p.stringVib);
      pivots.nock = leanRot(g.nock.x, g.nock.y);
      pivots.arrowTip = leanRot(g.tip.x, g.tip.y);
      pivots.bowTip = leanRot(g.topTip.x, g.topTip.y);
    } else if (p.weapon === 'crossbow') {
      ctx.save();
      ctx.translate(leadPts.hx, leadPts.hy);
      ctx.rotate(p.weaponRot);
      drawCrossbow(ctx, p.bowDraw, p.showArrow, sil);
      ctx.restore();
      const c = Math.cos(p.weaponRot);
      const s = Math.sin(p.weaponRot);
      pivots.bowTip = leanRot(leadPts.hx - 70 * c, leadPts.hy - 70 * s);
      pivots.nock = leanRot(leadPts.hx + 15 * c, leadPts.hy + 15 * s);
      pivots.arrowTip = leanRot(leadPts.hx - 124 * c, leadPts.hy - 124 * s);
    } else if (p.weapon === 'javelin') {
      const hx = p.weaponMode === 'rearHand' ? rearPts.hx : leadPts.hx;
      const hy = p.weaponMode === 'rearHand' ? rearPts.hy : leadPts.hy;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(p.weaponRot);
      drawJavelin(ctx, sil);
      ctx.restore();
      const c = Math.cos(p.weaponRot);
      const s = Math.sin(p.weaponRot);
      pivots.bowTip = leanRot(hx - 172 * c, hy - 172 * s);
      pivots.arrowTip = pivots.bowTip;
    } else if (p.weapon === 'slingshot') {
      ctx.save();
      ctx.translate(leadPts.hx, leadPts.hy);
      ctx.rotate(p.weaponRot);
      drawSlingshot(ctx, p.bowDraw, sil);
      ctx.restore();
      pivots.bowTip = leanRot(leadPts.hx, leadPts.hy - 28);
    } else if (p.weapon === 'snowball' && p.snowballSize > 0.05) {
      ctx.save();
      ctx.translate(rearPts.hx, rearPts.hy);
      ctx.fillStyle = col('#FFFFFF');
      ctx.beginPath();
      ctx.arc(0, 0, 22 * p.snowballSize, 0, Math.PI * 2);
      ctx.fill();
      if (!sil) {
        ctx.fillStyle = '#DAE5F7';
        ctx.beginPath();
        ctx.arc(5, 5, 14 * p.snowballSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Near/rear arm drawn in front (so it overlays the slung bowstring & tunic, AND reaches across to draw!)
  if (p.rearArmInFront) {
    drawTwoPartArm(ctx, rearPts, 24, col(PAL.skin));
  }

  // Hat while held in rear hand during put-on / take-off
  if (p.hat !== 'none' && p.hatInHand) {
    ctx.save();
    ctx.translate(rearPts.hx, rearPts.hy - 18);
    ctx.rotate(p.hatRot);
    ctx.scale(0.82, 0.82);
    drawHatArt(ctx, p.hat, p.hatWobble, sil);
    pivots.hatTop = leanRot(rearPts.hx, rearPts.hy - 110);
    ctx.restore();
  }

  // Nap Zzz bubbles
  if (p.zzzPhase > 0 && !sil) {
    for (let i = 0; i < 3; i++) {
      const zp = ((p.zzzPhase * 0.65 + i * 0.33) % 1);
      const zx = 445 - zp * 32 + Math.sin(zp * 6) * 8;
      const zy = 285 - zp * 95;
      const al = zp < 0.2 ? zp / 0.2 : zp > 0.7 ? (1 - zp) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = al * 0.85;
      ctx.fillStyle = PAL.grey;
      ctx.font = `900 ${Math.round(20 + zp * 14)}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('z', zx, zy);
      ctx.restore();
    }
  }

  ctx.restore(); // end rig transform
  return pivots;
}

// ---------------------------------------------------------------------------
// Old simple walk renderer (for Animation Lab "Old walk" comparison overlay!)
// ---------------------------------------------------------------------------
export function drawOldSimpleWalk(ctx: CanvasRenderingContext2D, walkPhase: number, bob: number, hasBow: boolean, hasQuiver: boolean) {
  const A = art();
  const legSwing = Math.sin(walkPhase) * 0.45;
  const armFront = RIG.ARM_REST_FRONT + legSwing;
  const armBack = RIG.ARM_REST_BACK - legSwing;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.translate(-RIG.FEET.x, -RIG.FEET.y);

  for (const [path, hx] of [
    [A.legL, 420],
    [A.legR, 538],
  ] as Array<[Path2D, number]>) {
    const sw = hx === 420 ? legSwing : -legSwing;
    ctx.save();
    ctx.translate(hx, 582);
    ctx.rotate(sw);
    ctx.translate(-hx, -582);
    ctx.fillStyle = PAL.brownDark;
    ctx.fill(path);
    ctx.restore();
  }

  ctx.translate(0, -bob);
  if (hasQuiver) {
    ctx.save();
    ctx.translate(612, 478);
    ctx.rotate(0.35);
    ctx.scale(0.6, 0.6);
    ctx.translate(-825, -650);
    drawQuiverArt(ctx);
    ctx.restore();
  }
  // Old stiff rear arm
  ctx.save();
  ctx.translate(RIG.BACK_PIVOT.x, RIG.BACK_PIVOT.y);
  ctx.rotate(armBack);
  ctx.translate(-RIG.BACK_PIVOT.x, -RIG.BACK_PIVOT.y);
  ctx.fillStyle = PAL.skin;
  ctx.fill(A.armR);
  ctx.restore();

  // Old torso + beard
  ctx.save();
  ctx.clip(A.bodyMask);
  for (const [p, c] of A.bodyFills) {
    ctx.fillStyle = c;
    ctx.fill(p);
  }
  ctx.restore();

  ctx.fillStyle = '#E6E1DC';
  ctx.fill(A.beard);
  ctx.fillStyle = PAL.skin;
  ctx.fill(A.face);
  ctx.fillStyle = '#272220';
  ctx.fill(A.eyeL);
  ctx.fill(A.eyeR);
  ctx.fillStyle = '#F29B70';
  ctx.fill(A.nose);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 48;
  ctx.lineCap = 'round';
  ctx.stroke(A.mustache);

  // Old stiff front arm
  ctx.save();
  ctx.translate(RIG.FRONT_PIVOT.x, RIG.FRONT_PIVOT.y);
  ctx.rotate(armFront);
  ctx.translate(-RIG.FRONT_PIVOT.x, -RIG.FRONT_PIVOT.y);
  ctx.fillStyle = PAL.skin;
  ctx.fill(A.armL);
  ctx.restore();

  if (hasBow) {
    const hx = RIG.FRONT_PIVOT.x - RIG.FRONT_LEN * Math.cos(armFront);
    const hy = RIG.FRONT_PIVOT.y - RIG.FRONT_LEN * Math.sin(armFront);
    ctx.save();
    ctx.translate(hx, hy);
    drawBowBodyAndString(ctx, 0, 0, 0, false, 'shortbow', null);
    ctx.restore();
  }

  ctx.restore();
}
