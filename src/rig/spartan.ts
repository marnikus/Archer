// The Spartan: same skeleton / IK rig as the hero (RigPose + solveSkeleton), with only the parts that
// differ drawn from his own art (SVG): head, bare chest, tunic, cape, round shield, sword, greaves.
// Legs are real two-bone legs (knee + jointed foot) with extra armour: thigh guards, bronze knee plate, greave,
// ankle strap. The shield is a FOREGROUND layer held in front of the body (as in the supplied guard pose).
// Draw order is the same user-editable layer system as the hero (character id 'spartan').
import { parseSvg, drawOps, type SvgArt } from '../game/svgArt';
import { SPARTAN_SVG, SP } from './spartanSvg';
import { stadium, clamp, type RigPose, type Skeleton, type Vec } from './rig';
import { registerCharacterLayers, drawLayered } from './layers';

export const SPARTAN = 'spartan';
export const SPARTAN_CTX = 'main';

registerCharacterLayers({
  id: SPARTAN,
  name: 'Spartan',
  parts: [
    { id: 'capeBack', label: 'Cape (flowing behind)' },
    { id: 'shieldBack', label: 'Shield carried BEHIND the body (idle / attacking)' },
    { id: 'armShieldBack', label: 'Shield arm (carried, behind)' },
    { id: 'handShieldBack', label: 'Shield hand (carried, behind)' },
    { id: 'legBack', label: 'Right leg + armour (back)' },
    { id: 'bootBack', label: 'Right foot (back)' },
    { id: 'legFront', label: 'Left leg + armour (front)' },
    { id: 'bootFront', label: 'Left foot (front)' },
    { id: 'torso', label: 'Bare chest' },
    { id: 'tunic', label: 'Tunic, straps and belt' },
    { id: 'shoulderCape', label: 'Shoulder drape' },
    { id: 'head', label: 'Head (ears, face, brows, mouth)' },
    { id: 'armBack', label: 'Sword arm (back)' },
    { id: 'sword', label: 'Sword' },
    { id: 'handBack', label: 'Sword fist' },
    { id: 'armFront', label: 'Shield arm (blocking, front)' },
    { id: 'handFront', label: 'Shield hand (blocking, front)' },
    { id: 'shield', label: 'Shield BLOCKING in the foreground' },
  ],
  contexts: [{ id: SPARTAN_CTX, label: 'Layer order', hint: 'Top of the list draws in front. The game uses exactly this order in every pose.' }],
  defaults: {
    [SPARTAN_CTX]: ['capeBack', 'shieldBack', 'armShieldBack', 'handShieldBack', 'legBack', 'bootBack', 'legFront', 'bootFront', 'torso', 'tunic', 'shoulderCape', 'head', 'armBack', 'sword', 'handBack', 'armFront', 'handFront', 'shield'],
  },
  scenarios: [
    { id: 'guard', label: 'Guarding', context: SPARTAN_CTX },
    { id: 'run', label: 'Running', context: SPARTAN_CTX },
    { id: 'notice', label: 'Noticing', context: SPARTAN_CTX },
    { id: 'windup', label: 'Sword raised', context: SPARTAN_CTX },
    { id: 'strike', label: 'Leap thrust', context: SPARTAN_CTX },
    { id: 'open', label: 'Open (panting)', context: SPARTAN_CTX },
    { id: 'pain', label: 'Pain', context: SPARTAN_CTX },
  ],
});

let art: SvgArt | null = null;
const A = () => (art ??= parseSvg(SPARTAN_SVG));

export interface LegDraw {
  knee: Vec;
  ankle: Vec;
  /** ankle rotation (+ = toes down) and toe bend at the ball of the foot */
  rot: number;
  toe: number;
}
export interface Expression {
  /** −1 lowered … +1 raised */
  lift: number;
  /** + angry (inner ends down) … − pained/sad (inner ends up) */
  tilt: number;
  /** eye openness multiplier (0.2 squint … 1.4 wide) */
  eye: number;
  /** mouth opening 0..1 */
  mouth: number;
  /** −1 grimace … +1 smirk */
  smile: number;
  /** raise one brow (taunt) */
  asym: number;
}
export interface SpartanLook {
  /** 'front': blocking, shield in the foreground. 'back': carried / attacking, shield behind the body */
  shieldMode: 'front' | 'back';
  /** cape trail (shear, − forward … + backward) / tunic follow-through (radians), driven by springs */
  capeSwing: number;
  tunicSway: number;
  /** pupil wander, in art units */
  eyeX: number;
  eyeY: number;
  legs?: { f: LegDraw; b: LegDraw };
  /** sword hand override while the thrust arm is stretched (as in the lunge pose of the artwork) */
  swordHand?: Vec | null;
  shieldRot: number;
  shieldScale: number;
  /** sword tip direction: 0 = up, -90° = forward (rig convention, same as hero weapons) */
  swordRot: number;
  expr: Expression;
  /** drawn inside the shield's frame (origin = shield centre) — used for arrows stuck in it */
  shieldExtras?: (ctx: CanvasRenderingContext2D) => void;
}

export const NEUTRAL: Expression = { lift: 0, tilt: 0.1, eye: 1, mouth: 0, smile: 0, asym: 0 };

const SKIN = '#FCB88A';
const SKIN_SHADE = '#F2A87B';
const BRONZE = '#C99A4B';
const BRONZE_DARK = '#8F6A2C';
const BRONZE_LIGHT = '#E8C47D';
const LEATHER = '#8B5A32';
const LEATHER_DARK = '#6B4423';
const SWORD_AXIS = Math.atan2(410 - 308, 283 - 55); // svg direction of the blade from the fist

function limb(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, w: number, color: string) {
  ctx.fillStyle = color;
  stadium(ctx, a, b, w / 2);
  ctx.fill();
}

/** a limb that narrows from radius ra (at a) to rb (at b) */
function taper(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, ra: number, rb: number, color: string) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * ra, a.y + ny * ra);
  ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
  ctx.lineTo(b.x - nx * rb, b.y - ny * rb);
  ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(a.x, a.y, ra, 0, Math.PI * 2);
  ctx.arc(b.x, b.y, rb, 0, Math.PI * 2);
  ctx.fill();
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSpartan(ctx: CanvasRenderingContext2D, p: RigPose, s: Skeleton, look: SpartanLook) {
  const art = A();
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.squash !== 1) ctx.scale(1 + (1 - p.squash) * 0.6, p.squash);
  ctx.lineJoin = 'round';

  const inTorso = (fn: () => void) => {
    ctx.save();
    ctx.translate(s.torso.o.x, s.torso.o.y);
    ctx.rotate(s.torso.a);
    fn();
    ctx.restore();
  };
  /** same, mirrored: the art was drawn facing right; the rig faces left, so back-side details (shoulder drape) must flip */
  const onTorsoFlip = (fn: () => void) =>
    inTorso(() => {
      ctx.translate(1, 0);
      ctx.scale(-1.3, 1.04);
      ctx.translate(-164, -322);
      fn();
    });
  /** torso frame, with the SVG body mapped onto the hero-sized rig torso */
  const onTorso = (fn: () => void) =>
    inTorso(() => {
      ctx.translate(1, 0);
      ctx.scale(1.3, 1.04);
      ctx.translate(-164, -322);
      fn();
    });

  /** a full leg: thigh guards, bending thigh + shin, bronze knee plate, greave, ankle strap */
  const leg = (hip: Vec, L: LegDraw, color: string) => {
    const th = Math.atan2(-(L.knee.x - hip.x), L.knee.y - hip.y); // thigh angle (0 = down)
    taper(ctx, hip, L.knee, 36, 31, color);
    taper(ctx, L.knee, L.ankle, 30, 25, color);
    // leather thigh guards (pteruges) hanging from the tunic
    ctx.save();
    ctx.translate(hip.x, hip.y);
    ctx.rotate(th);
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 21;
      ctx.fillStyle = i === 1 ? LEATHER_DARK : LEATHER;
      rr(ctx, ox - 9, 6, 18, 38 - Math.abs(i - 1) * 6, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      rr(ctx, ox - 9, 6, 18, 6, 3);
      ctx.fill();
    }
    ctx.restore();
    // greave on the shin (artwork), strapped at the ankle
    const sx = L.ankle.x - L.knee.x;
    const sy = L.ankle.y - L.knee.y;
    const sl = Math.max(24, Math.hypot(sx, sy));
    const sa = Math.atan2(-sx, sy);
    ctx.save();
    ctx.translate(L.knee.x, L.knee.y);
    ctx.rotate(sa);
    const g0 = sl * 0.2;
    const g1 = sl * 0.93;
    ctx.save();
    ctx.translate(0, g0);
    ctx.scale(0.92, (g1 - g0) / 61);
    ctx.translate(-114, -393);
    drawOps(ctx, art, SP.greave, SP.greaveHi);
    ctx.restore();
    ctx.fillStyle = LEATHER_DARK;
    rr(ctx, -27, sl - 15, 54, 8, 4);
    ctx.fill();
    ctx.restore();
    // bronze knee plate
    ctx.save();
    ctx.translate(L.knee.x, L.knee.y);
    ctx.rotate((th + sa) / 2);
    ctx.fillStyle = BRONZE_DARK;
    rr(ctx, -27, -24, 54, 48, 20);
    ctx.fill();
    ctx.fillStyle = BRONZE;
    rr(ctx, -23, -20, 46, 40, 17);
    ctx.fill();
    ctx.fillStyle = BRONZE_LIGHT;
    rr(ctx, -17, -15, 22, 9, 4);
    ctx.fill();
    ctx.fillStyle = BRONZE_DARK;
    ctx.beginPath();
    ctx.arc(0, 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /** jointed foot: heel/midfoot + toe block that bends at the ball, sole, instep straps */
  const foot = (ankle: Vec, rot: number, toe: number) => {
    ctx.save();
    ctx.translate(ankle.x, ankle.y);
    ctx.rotate(-rot);
    // heel + midfoot (toes point to -x)
    ctx.fillStyle = LEATHER_DARK;
    rr(ctx, -24, 12, 52, 8, 4);
    ctx.fill();
    ctx.fillStyle = SKIN;
    rr(ctx, -26, -8, 56, 26, 11);
    ctx.fill();
    ctx.fillStyle = LEATHER;
    rr(ctx, -12, -8, 9, 26, 3);
    ctx.fill();
    rr(ctx, 6, -8, 9, 26, 3);
    ctx.fill();
    // toe block, hinged at the ball of the foot
    ctx.save();
    ctx.translate(-24, 9);
    ctx.rotate(-toe);
    ctx.translate(24, -9);
    ctx.fillStyle = LEATHER_DARK;
    rr(ctx, -62, 12, 40, 8, 4);
    ctx.fill();
    ctx.fillStyle = SKIN;
    rr(ctx, -64, -2, 44, 20, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(-46, 2, 2, 12);
    ctx.restore();
    ctx.restore();
  };

  const hand = look.swordHand ?? s.handB;
  const swordFrame = (fn: () => void) => {
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(look.swordRot);
    ctx.rotate(-Math.PI / 2 - SWORD_AXIS);
    ctx.scale(0.9, 0.9);
    ctx.translate(-55, -308);
    fn();
    ctx.restore();
  };
  const ex = look.expr;

  const shieldDisc = () => {
    ctx.save();
    ctx.translate(s.handF.x, s.handF.y);
    ctx.rotate(look.shieldRot);
    ctx.save();
    ctx.scale(look.shieldScale, look.shieldScale);
    ctx.translate(-242, -272);
    drawOps(ctx, art, SP.shieldOuter, SP.shieldX2);
    ctx.restore();
    look.shieldExtras?.(ctx);
    ctx.restore();
  };
  const shieldArm = () => {
    limb(ctx, s.shoulderF, s.elbowF, 56, SKIN_SHADE);
    limb(ctx, s.elbowF, s.handF, 56, SKIN_SHADE);
  };
  const shieldHand = () => {
    ctx.save();
    ctx.translate(s.handF.x, s.handF.y);
    ctx.scale(0.9, 0.9);
    ctx.translate(-237, -307);
    drawOps(ctx, art, SP.palm, SP.fingers[2]);
    ctx.restore();
  };
  const front = look.shieldMode === 'front';

  const parts: Record<string, () => void> = {
    // the cape is cloth: it hangs behind the back from the shoulders and trails out (shears) with speed / lunges
    capeBack: () =>
      inTorso(() => {
        const k = clamp(look.capeSwing, -0.95, 0.95);
        ctx.translate(1, -196);
        ctx.transform(1, 0, k, 1, 0, 0);
        ctx.scale(-1.3, 0.99 / Math.sqrt(1 + k * k));
        ctx.translate(-163, -137);
        drawOps(ctx, art, SP.capeBack, SP.capeSide);
      }),
    shieldBack: () => {
      if (!front) shieldDisc();
    },
    armShieldBack: () => {
      if (!front) shieldArm();
    },
    handShieldBack: () => {
      if (!front) shieldHand();
    },
    shield: () => {
      if (front) shieldDisc();
    },
    armFront: () => {
      if (front) shieldArm();
    },
    handFront: () => {
      if (front) shieldHand();
    },
    legBack: () => {
      if (look.legs) leg(s.hipB, look.legs.b, SKIN_SHADE);
    },
    bootBack: () => {
      if (look.legs) foot(look.legs.b.ankle, look.legs.b.rot, look.legs.b.toe);
    },
    legFront: () => {
      if (look.legs) leg(s.hipF, look.legs.f, SKIN);
    },
    bootFront: () => {
      if (look.legs) foot(look.legs.f.ankle, look.legs.f.rot, look.legs.f.toe);
    },
    torso: () =>
      onTorso(() => {
        drawOps(ctx, art, SP.torso);
        drawOps(ctx, art, SP.emblem[0], SP.emblem[2]);
      }),
    tunic: () =>
      onTorso(() => {
        ctx.translate(164, 262);
        ctx.rotate(look.tunicSway);
        ctx.translate(-164, -262);
        // the skirt is shortened so the legs read below it like in the artwork
        ctx.save();
        ctx.translate(0, 262);
        ctx.scale(1, 0.78);
        ctx.translate(0, -262);
        drawOps(ctx, art, SP.skirt);
        drawOps(ctx, art, SP.straps[0], SP.straps[2]);
        ctx.restore();
        drawOps(ctx, art, SP.belt);
      }),
    // the drape's long wavy end hangs off the BACK shoulder and joins the cape (as in the artwork)
    shoulderCape: () => onTorsoFlip(() => drawOps(ctx, art, SP.shoulderCape)),
    head: () => {
      ctx.save();
      ctx.translate(s.head.o.x, s.head.o.y);
      ctx.rotate(s.head.a);
      ctx.translate(p.head.turn * 14, 0); // the head itself moves a little toward where he looks…
      ctx.translate(-26, -52);
      ctx.scale(1.2, 1.2);
      ctx.translate(-167, -133);
      drawOps(ctx, art, SP.earL, SP.head);
      // …the FEATURES move much further (3/4 view): eyes, brows and mouth slide to the front side and squeeze
      ctx.save();
      ctx.translate(167 + p.head.turn * 30, 0);
      ctx.scale(1 - 0.16 * Math.abs(p.head.turn), 1);
      ctx.translate(-167, 0);
      // eyes (blink × expression), pupils wander
      const open = Math.max(0.08, (1 - clamp(p.face.blink, 0, 1)) * ex.eye);
      for (const [idx, cx] of [
        [SP.eyeL, 151],
        [SP.eyeR, 194],
      ] as const) {
        ctx.save();
        ctx.translate(cx + look.eyeX, 70.5 + look.eyeY);
        ctx.scale(1, open);
        ctx.translate(-cx, -70.5);
        drawOps(ctx, art, idx);
        ctx.restore();
      }
      // brows: lift, angry/pained tilt, one-sided raise
      for (const [idx, cx, sign, asymK] of [
        [SP.browL, 153.5, 1, 1],
        [SP.browR, 191, -1, 0],
      ] as const) {
        ctx.save();
        ctx.translate(cx, 51 - ex.lift * 9 - ex.asym * 8 * asymK);
        ctx.rotate(sign * ex.tilt * 0.55);
        ctx.translate(-cx, -51);
        drawOps(ctx, art, idx);
        ctx.restore();
      }
      // mouth (not in the artwork): grimace / smirk when closed, shouting / panting when open
      const mx = 167;
      const my = 104;
      if (ex.mouth > 0.06) {
        const h = 5 + 30 * ex.mouth;
        ctx.fillStyle = '#4A1F18';
        rr(ctx, mx - 22 + ex.smile * 3, my - 4, 44 - ex.mouth * 4, h, Math.min(14, h / 2));
        ctx.fill();
        if (ex.mouth > 0.3) {
          ctx.fillStyle = '#FFFFFF';
          rr(ctx, mx - 17, my - 3, 34, 6, 3);
          ctx.fill();
        }
        if (ex.mouth > 0.55) {
          ctx.fillStyle = '#C45A4A';
          rr(ctx, mx - 10, my + h - 11, 20, 8, 4);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = '#A0523A';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mx - 20, my + 2 - ex.smile * 3);
        ctx.quadraticCurveTo(mx, my + 2 + ex.smile * 14, mx + 20, my + 2 - ex.smile * 3);
        ctx.stroke();
      }
      ctx.restore(); // features
      ctx.restore();
    },
    armBack: () => {
      if (look.swordHand) limb(ctx, s.shoulderB, look.swordHand, 56, SKIN); // stretched thrust arm
      else {
        limb(ctx, s.shoulderB, s.elbowB, 56, SKIN);
        limb(ctx, s.elbowB, s.handB, 56, SKIN);
      }
    },
    sword: () => swordFrame(() => drawOps(ctx, art, SP.swordHandle, SP.crossguard)),
    handBack: () => swordFrame(() => drawOps(ctx, art, SP.fist)),
  };

  drawLayered(ctx, SPARTAN, SPARTAN_CTX, parts);
  ctx.restore();
}
