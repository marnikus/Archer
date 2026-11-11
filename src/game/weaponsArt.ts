// Vector art for the Hat prop, Camp Seat, and the Weapon Test Set (Section 7 & 8):
// Unarmed, Bow, Quiver Only, Crossbow, Spear, Sword, Staff, and Throwing Axe.
import { PAL, roundRectPath, drawBowHeld, drawBowItem, drawQuiverArt, drawQuiverItem, drawArrowArt } from './art';

export type WeaponKind = 'unarmed' | 'bow' | 'quiverOnly' | 'crossbow' | 'spear' | 'sword' | 'staff' | 'axe';
export type WeaponStance = 'carry' | 'ready';

export const WEAPON_INFO: Record<
  WeaponKind,
  {
    label: string;
    posture: string;
    checks: string;
  }
> = {
  unarmed: {
    label: 'Unarmed',
    posture: 'Relaxed and open',
    checks: 'Baseline idle and walk with natural pendulum arm swing',
  },
  bow: {
    label: 'Bow',
    posture: 'Focused archer stance',
    checks: 'Main game posture — stable front carrier, controlled draw arm',
  },
  quiverOnly: {
    label: 'Quiver Only',
    posture: 'Traveler with back equipment',
    checks: 'Back weight, strap resistance, and asymmetrical walk arm correction',
  },
  crossbow: {
    label: 'Crossbow',
    posture: 'Wider, heavier brace',
    checks: 'Front arm push forward, chest-forward brace, and both shoulders working',
  },
  spear: {
    label: 'Spear',
    posture: 'Long reach stance',
    checks: 'Extended front arm, rear counterbalance, and forward balance',
  },
  sword: {
    label: 'Sword',
    posture: 'Compact ready stance',
    checks: 'Raised front elbow and tighter guard shape',
  },
  staff: {
    label: 'Staff',
    posture: 'Wide grounded stance',
    checks: 'Broad shoulder spacing and lower center of balance',
  },
  axe: {
    label: 'Throwing Axe',
    posture: 'Strong side carry',
    checks: 'Asymmetrical shoulder and hip tension with heavy head weight',
  },
};

/**
 * Draw the Archer's Hat in local hat coordinates:
 * Origin (0, 0) is the crown/brim seating center on the head (around x=480, y=262 in archer space).
 * Facing left = -x is front brim, +x is back brim + feather.
 */
export function drawHatArt(ctx: CanvasRenderingContext2D, squash = 1, featherWave = 0) {
  ctx.save();
  ctx.scale(2 - squash, squash);

  // Back feather (red/orange ranger plume)
  ctx.save();
  ctx.translate(78, -28);
  ctx.rotate(0.28 + featherWave);
  ctx.fillStyle = PAL.red2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(48, -56, 112, -44);
  ctx.quadraticCurveTo(74, -8, 0, 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PAL.orange2;
  ctx.beginPath();
  ctx.moveTo(8, -2);
  ctx.quadraticCurveTo(52, -34, 98, -32);
  ctx.quadraticCurveTo(64, -6, 6, 4);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(46, -26, 94, -34);
  ctx.stroke();
  ctx.restore();

  // Crown of the hat (warm woodland brown / olive-russet matching palette)
  ctx.fillStyle = '#5D4031';
  ctx.beginPath();
  ctx.moveTo(-128, 6);
  ctx.quadraticCurveTo(-118, -58, -24, -68);
  ctx.quadraticCurveTo(54, -74, 118, -28);
  ctx.quadraticCurveTo(138, -12, 134, 8);
  ctx.closePath();
  ctx.fill();

  // Crown highlight fold
  ctx.fillStyle = '#73503E';
  ctx.beginPath();
  ctx.moveTo(-98, 2);
  ctx.quadraticCurveTo(-82, -46, -8, -54);
  ctx.quadraticCurveTo(48, -58, 96, -20);
  ctx.quadraticCurveTo(30, -24, -98, 2);
  ctx.closePath();
  ctx.fill();

  // Leather hat band + gold buckle
  ctx.fillStyle = PAL.orangeDark;
  roundRectPath(ctx, -130, -10, 262, 18, 8);
  ctx.fill();
  ctx.fillStyle = PAL.gold;
  roundRectPath(ctx, -56, -13, 24, 22, 5);
  ctx.fill();
  ctx.fillStyle = '#5D4031';
  roundRectPath(ctx, -50, -8, 12, 12, 3);
  ctx.fill();

  // Wide sculpted brim
  ctx.fillStyle = PAL.brownDark;
  ctx.beginPath();
  ctx.moveTo(-172, 2);
  ctx.quadraticCurveTo(-90, -12, 0, -4);
  ctx.quadraticCurveTo(96, 4, 166, -8);
  ctx.quadraticCurveTo(176, 8, 152, 16);
  ctx.quadraticCurveTo(20, 24, -158, 16);
  ctx.quadraticCurveTo(-180, 12, -172, 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw Crossbow in local weapon frame:
 * Origin (0,0) = front grip under the stock. Facing left (-x is bolt tip direction).
 */
export function drawCrossbowArt(ctx: CanvasRenderingContext2D, ready = false, draw = 0) {
  ctx.save();
  // Heavy wooden stock (tiller)
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, -110, -14, 230, 28, 10);
  ctx.fill();

  // Cheek piece / rear stock
  ctx.fillStyle = PAL.brownDark;
  ctx.beginPath();
  ctx.moveTo(60, 0);
  ctx.lineTo(132, 6);
  ctx.lineTo(126, 36);
  ctx.lineTo(44, 14);
  ctx.closePath();
  ctx.fill();

  // Metal Flight groove & trigger mechanism
  ctx.fillStyle = '#8C96A8';
  roundRectPath(ctx, -106, -18, 165, 8, 4);
  ctx.fill();
  ctx.strokeStyle = PAL.brownDark;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(28, 14);
  ctx.quadraticCurveTo(34, 38, 16, 44);
  ctx.stroke();

  // Steel prod (bow limbs at front)
  const bend = (ready ? 0.65 : 0.2) + draw * 0.35;
  ctx.strokeStyle = '#636D80';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-98, -78 + bend * 14);
  ctx.quadraticCurveTo(-118, 0, -98, 78 - bend * 14);
  ctx.stroke();

  // Foot stirrup at front nose
  ctx.strokeStyle = PAL.grey;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-110, -8);
  ctx.lineTo(-142, -18);
  ctx.lineTo(-142, 18);
  ctx.lineTo(-110, 8);
  ctx.stroke();

  // Bowstring
  const nockX = -96 + bend * 115;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-98, -74 + bend * 14);
  ctx.lineTo(nockX, -14);
  ctx.lineTo(-98, 74 - bend * 14);
  ctx.stroke();

  // Loaded quarrel / bolt
  if (ready || draw > 0.05) {
    ctx.save();
    ctx.translate(nockX - 135, -18);
    ctx.rotate(Math.PI);
    drawArrowArt(ctx, 145);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Draw Spear in local weapon frame:
 * Origin (0,0) = front hand grip. Facing left (-x is spearhead).
 */
export function drawSpearArt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Long ash wood shaft
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, -230, -8, 440, 16, 7);
  ctx.fill();

  // Leather grip wraps
  ctx.fillStyle = PAL.brownDark;
  roundRectPath(ctx, -28, -10, 56, 20, 6);
  ctx.fill();
  roundRectPath(ctx, 90, -9, 44, 18, 5);
  ctx.fill();

  // Butt cap (ferrule)
  ctx.fillStyle = '#7E8798';
  ctx.beginPath();
  ctx.moveTo(206, -9);
  ctx.lineTo(234, 0);
  ctx.lineTo(206, 9);
  ctx.closePath();
  ctx.fill();

  // Red tassel below spearhead
  ctx.fillStyle = PAL.red2;
  ctx.beginPath();
  ctx.moveTo(-218, 4);
  ctx.quadraticCurveTo(-206, 36, -188, 42);
  ctx.quadraticCurveTo(-202, 18, -206, 4);
  ctx.closePath();
  ctx.fill();

  // Steel socket & broad leaf spearhead
  ctx.fillStyle = '#9BA6BA';
  roundRectPath(ctx, -242, -10, 26, 20, 5);
  ctx.fill();

  ctx.fillStyle = '#DCE4F2';
  ctx.beginPath();
  ctx.moveTo(-236, -6);
  ctx.quadraticCurveTo(-270, -24, -332, 0);
  ctx.quadraticCurveTo(-270, 24, -236, 6);
  ctx.closePath();
  ctx.fill();

  // Center ridge on blade
  ctx.strokeStyle = '#8C96A8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-236, 0);
  ctx.lineTo(-322, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Sword in local weapon frame:
 * Origin (0,0) = hilt grip. Blade extends along -x / -y.
 */
export function drawSwordArt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Pommel
  ctx.fillStyle = PAL.gold;
  ctx.beginPath();
  ctx.arc(46, 0, 13, 0, Math.PI * 2);
  ctx.fill();

  // Leather-wrapped grip
  ctx.fillStyle = PAL.brownDark;
  roundRectPath(ctx, -12, -9, 52, 18, 7);
  ctx.fill();

  // Crossguard
  ctx.fillStyle = PAL.gold;
  roundRectPath(ctx, -24, -44, 16, 88, 7);
  ctx.fill();

  // Steel double-edged blade (top half light, bottom half shaded)
  ctx.fillStyle = '#E8EEF8';
  ctx.beginPath();
  ctx.moveTo(-22, -18);
  ctx.lineTo(-218, -13);
  ctx.lineTo(-258, 0);
  ctx.lineTo(-22, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#B8C4D9';
  ctx.beginPath();
  ctx.moveTo(-22, 0);
  ctx.lineTo(-258, 0);
  ctx.lineTo(-218, 13);
  ctx.lineTo(-22, 18);
  ctx.closePath();
  ctx.fill();

  // Fuller groove
  ctx.strokeStyle = '#8E9BB2';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.lineTo(-175, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Wooden Staff in local weapon frame:
 * Origin (0,0) = center/upper grip.
 */
export function drawStaffArt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Carved hardwood shaft
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, -11, -210, 22, 410, 10);
  ctx.fill();

  // Highlight stripe
  ctx.fillStyle = '#9A4E38';
  roundRectPath(ctx, -7, -200, 7, 390, 3);
  ctx.fill();

  // Cloth grip wrap
  ctx.fillStyle = '#E6E1DC';
  roundRectPath(ctx, -13, -48, 26, 96, 8);
  ctx.fill();
  ctx.strokeStyle = PAL.grey;
  ctx.lineWidth = 3;
  for (let y = -34; y <= 34; y += 17) {
    ctx.beginPath();
    ctx.moveTo(-12, y);
    ctx.lineTo(12, y + 6);
    ctx.stroke();
  }

  // Decorative top finial ring / amber orb
  ctx.fillStyle = PAL.gold;
  roundRectPath(ctx, -15, -188, 30, 14, 6);
  ctx.fill();
  ctx.fillStyle = PAL.orange2;
  ctx.beginPath();
  ctx.arc(0, -216, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.brown;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(0, -216, 22, 0.2, Math.PI * 1.65);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draw Throwing / Hand Axe in local weapon frame:
 * Origin (0,0) = handle grip.
 */
export function drawAxeArt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  // Curved ash handle
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, -95, -9, 155, 18, 8);
  ctx.fill();

  // Leather grip wrap + pommel swell
  ctx.fillStyle = PAL.brownDark;
  roundRectPath(ctx, -18, -11, 64, 22, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(56, 0, 13, 0, Math.PI * 2);
  ctx.fill();

  // Bearded steel axe head
  ctx.fillStyle = '#8E9BB2';
  roundRectPath(ctx, -88, -18, 34, 36, 6);
  ctx.fill();

  ctx.fillStyle = '#C7D2E6';
  ctx.beginPath();
  ctx.moveTo(-64, -14);
  ctx.quadraticCurveTo(-92, -32, -108, -72);
  ctx.quadraticCurveTo(-52, -78, -32, -52);
  ctx.quadraticCurveTo(-50, -26, -54, -14);
  ctx.closePath();
  ctx.fill();

  // Sharp cutting bevel highlight
  ctx.fillStyle = '#EEF3FC';
  ctx.beginPath();
  ctx.moveTo(-108, -72);
  ctx.quadraticCurveTo(-52, -78, -32, -52);
  ctx.quadraticCurveTo(-60, -64, -102, -58);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a wooden camp log / stone seat behind the archer during Sitting states.
 */
export function drawCampSeatProp(ctx: CanvasRenderingContext2D, alpha = 1) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Shadow
  ctx.fillStyle = 'rgba(114, 98, 93, 0.16)';
  ctx.beginPath();
  ctx.ellipse(505, 653, 86, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Warm hewn wooden camp log
  ctx.fillStyle = PAL.brownDark;
  roundRectPath(ctx, 436, 588, 138, 63, 24);
  ctx.fill();
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, 436, 588, 126, 54, 22);
  ctx.fill();

  // Log end-grain rings
  ctx.fillStyle = '#D5A784';
  ctx.beginPath();
  ctx.ellipse(456, 619, 18, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PAL.brown;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(456, 619, 10, 15, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Snow cap on log
  ctx.fillStyle = '#F6F7FC';
  roundRectPath(ctx, 452, 584, 112, 13, 6);
  ctx.fill();
  ctx.restore();
}

export { drawBowHeld, drawBowItem, drawQuiverArt, drawQuiverItem, drawArrowArt };
