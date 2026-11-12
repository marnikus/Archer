// All vector art for the game. Paths are lifted 1:1 from the source SVG so the
// in-game look matches the original flat style exactly.
import { CFG } from './config';

export const DEG = Math.PI / 180;

export const PAL = {
  sky: '#DAE5F7',
  skyDeep: '#C9DBF6',
  cliffFar: ['#C3D6F2', '#E1ECFA'],
  cliffNear: ['#CADBF5', '#E3EDFB'],
  ground: '#EBEDF8',
  groundSide: '#DCDFEF',
  groundDark: '#D4D7E3',
  skin: '#FBA97E',
  orange: '#D37330',
  orangeDark: '#B55B1E',
  red: '#D92B27',
  red2: '#D93829',
  orange2: '#EA6227',
  brown: '#813F2E',
  brownDark: '#4C372A',
  grey: '#72625D',
  gold: '#F2B134',
};

function rr(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rad = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rad, y);
  p.arcTo(x + w, y, x + w, y + h, rad);
  p.arcTo(x + w, y + h, x, y + h, rad);
  p.arcTo(x, y + h, x, y, rad);
  p.arcTo(x, y, x + w, y, rad);
  p.closePath();
  return p;
}

function ell(cx: number, cy: number, rx: number, ry: number): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  return p;
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

type Fill = [Path2D, string];

interface ArtSet {
  cliffL: Path2D;
  cliffR: Path2D;
  pedShadow: Path2D;
  pedSide: Path2D;
  pedTop: Path2D;
  pedInner: Path2D;
  armL: Path2D;
  armR: Path2D;
  legL: Path2D;
  legR: Path2D;
  bodyMask: Path2D;
  bodyFills: Fill[];
  beard: Path2D;
  face: Path2D;
  eyeL: Path2D;
  eyeR: Path2D;
  nose: Path2D;
  mustache: Path2D;
  quiverFills: Fill[];
  quiverStrokes: Array<[Path2D, string, number]>;
  quiverStrap: Path2D;
  quiverRim: Path2D;
  quiverBody: Path2D;
  bowString: Path2D;
  bowBody: Path2D;
  bowTipTop: Path2D;
  bowTipBot: Path2D;
  tShadow: Path2D;
  tLegs: Fill[];
  tSide: Path2D;
  tFace: Path2D;
  tRing1: Path2D;
  tRing2: Path2D;
  tRing3: Path2D;
  tBull: Path2D;
}

let _art: ArtSet | null = null;

export function art(): ArtSet {
  if (_art) return _art;
  _art = {
    cliffL: new Path2D(
      'M7 575V425C7 419.667 9.66667 417 15 417H93C98.3333 417 101 419.667 101 425V466L132 428V276L178 224H234C240 224 243 227 243 233V355L276 395V496L304 532V575H7Z',
    ),
    cliffR: new Path2D(
      'M672 575V518L740 438V342L769 305C773.667 300.333 776 301.333 776 308V350L793 372V438L829 398V246C829 240 832 237 838 237H878L936 302V388L956 412V440H973C977.667 440 980 442.333 980 447V516H1000V575H672Z',
    ),
    pedShadow: ell(480, 715, 308, 64),
    pedSide: new Path2D(
      'M204 645L189 704C189 721.504 219.659 738.292 274.232 750.669C328.805 763.046 402.822 770 480 770C557.178 770 631.195 763.046 685.768 750.669C740.341 738.292 771 721.504 771 704L756 645H204Z',
    ),
    pedTop: ell(480, 645, 276, 56),
    pedInner: ell(481, 642, 178, 31),
    armL: rr(226, 403, 155, 52, 26),
    armR: rr(590, 403, 146, 52, 26),
    legL: rr(388, 575, 64, 76, 16),
    legR: rr(506, 575, 64, 76, 16),
    bodyMask: rr(340, 255, 282, 335, 32),
    bodyFills: [
      [rr(340, 255, 282, 335, 0), PAL.skin],
      [rr(340, 403, 282, 187, 0), PAL.orange],
      [rr(340, 403, 52, 45, 0), PAL.orangeDark],
      [new Path2D('M397 450L445 500L397 522V450Z'), PAL.orangeDark],
      [ell(515, 515, 28, 28), PAL.orangeDark],
      [ell(622, 482, 28, 28), PAL.orangeDark],
      [rr(423, 553, 61, 55, 26), PAL.orangeDark],
      [rr(536, 553, 61, 55, 26), PAL.orangeDark],
      [new Path2D('M565 485L630 510V538L565 513V485Z'), '#723F2A'],
    ],
    beard: new Path2D(
      'M538 255H590C598.487 255 606.626 258.371 612.627 264.373C618.629 270.374 622 278.513 622 287V425C622 465 600 492 578 504V530C578 537.161 575.155 544.028 570.092 549.092C565.028 554.155 558.161 557 551 557C543.839 557 536.972 554.155 531.908 549.092C526.845 544.028 524 537.161 524 530V508H490V530C490 537.161 487.155 544.028 482.092 549.092C477.028 554.155 470.161 557 463 557C455.839 557 448.972 554.155 443.908 549.092C438.845 544.028 436 537.161 436 530V504C412 492 388 465 388 425V316C388 309.104 390.739 302.491 395.615 297.615C400.491 292.739 407.104 290 414 290H573C573 280.717 569.312 271.815 562.749 265.251C556.185 258.687 547.283 255 538 255Z',
    ),
    face: new Path2D(
      'M452 304H556C563.426 304 570.548 306.95 575.799 312.201C581.05 317.452 584 324.574 584 332V356C584 374.035 576.836 391.331 564.083 404.083C551.331 416.836 534.035 424 516 424H492C473.965 424 456.669 416.836 443.917 404.083C431.164 391.331 424 374.035 424 356V332C424 324.574 426.95 317.452 432.201 312.201C437.452 306.95 444.574 304 452 304Z',
    ),
    eyeL: rr(453, 340, 24, 37, 12),
    eyeR: rr(535, 340, 24, 37, 12),
    nose: rr(485, 410, 46, 36, 14),
    mustache: new Path2D('M493 400L445 434M523 400L571 434'),
    quiverFills: [
      [new Path2D('M840.002 510L816.002 498C810.002 495 807.002 500 808.002 507L810.002 522L840.002 532V510Z'), PAL.red2],
      [new Path2D('M840 532L810 522L812 534C813 540 816 543 822 546L840 554V532Z'), PAL.orange2],
      [new Path2D('M840 515L862 507C868 505 872 509 871 516L869 532L840 540V515Z'), PAL.red2],
      [new Path2D('M840 540L869 532L867 542C866 547 862 551 856 553L840 558V540Z'), PAL.orange2],
    ],
    quiverStrokes: [
      [new Path2D('M840 495L841 535'), '#BD4A36', 16],
      [new Path2D('M841 532L842 575'), PAL.grey, 16],
      [new Path2D('M804 490L806 530'), '#BD4A36', 16],
      [new Path2D('M806 528L808 575'), PAL.grey, 16],
    ],
    quiverStrap: new Path2D('M782 602C770 612 765 635 748 658C732 680 740 714 782 714'),
    quiverRim: rr(780, 564, 89, 45, 12),
    quiverBody: rr(774, 592, 103, 140, 28),
    bowString: new Path2D('M110.191 409.281L69.4715 704.12'),
    bowBody: new Path2D(
      'M109.912 394.109C111.398 374.802 133.928 373.151 142.481 391.861C176.238 464.247 187.995 561.617 156.755 646.086C139.751 691.116 109.638 720.226 78.8063 738.645C61.5508 748.197 50.0026 733.85 56.8497 716.084C86.2561 691.854 118.577 668.36 136.524 607.931C155.241 544.82 134.887 446.559 109.912 394.109Z',
    ),
    bowTipTop: new Path2D('M110.195 409.282L159.549 425.254'),
    bowTipBot: new Path2D('M63.9844 705.08L120.752 707.105'),
    tShadow: ell(1440.76, 592, 248, 37),
    tLegs: [
      [new Path2D('M1415.76 535L1420.76 580C1421.42 584.667 1424.09 587 1428.76 587H1458.76L1451.76 530L1415.76 535Z'), '#7C3F2A'],
      [new Path2D('M1451.76 530L1458.76 587L1472.76 580C1476.76 578 1478.09 574.667 1476.76 570L1468.76 525L1451.76 530Z'), '#8F4A32'],
      [new Path2D('M1300.76 502L1268.76 582C1266.76 586.667 1268.09 590 1272.76 592L1297.76 601C1300.43 601.667 1302.43 601.667 1303.76 601L1335.76 520L1300.76 502Z'), '#914C33'],
      [new Path2D('M1335.76 520L1303.76 601L1323.76 594C1327.09 592.667 1329.42 590 1330.76 586L1353.76 528L1335.76 520Z'), '#7C3E29'],
      [new Path2D('M1495.76 515L1524.76 595C1526.09 599 1528.76 601.333 1532.76 602L1557.76 605L1519.76 502L1495.76 515Z'), '#87452E'],
      [new Path2D('M1519.76 502L1557.76 605C1559.76 605 1561.76 604.667 1563.76 604L1575.76 598C1579.76 596 1580.76 592.667 1578.76 588L1541.76 490L1519.76 502Z'), '#985035'],
    ],
    tSide: new Path2D(
      'M1380.76 201.146C1410.76 196.246 1445.76 198.206 1473.76 205.066C1550.76 224.666 1602.76 295.225 1602.76 377.543C1602.76 453.982 1553.76 515.721 1480.76 538.26C1455.76 546.1 1430.76 550.02 1406.76 551V201.146H1380.76Z',
    ),
    tFace: new Path2D(
      'M1411.37 550.94C1503.29 548.533 1575.75 467.811 1573.2 370.642C1570.66 273.473 1494.08 196.653 1402.15 199.06C1310.23 201.468 1237.77 282.19 1240.32 379.359C1242.86 476.527 1319.44 553.347 1411.37 550.94Z',
    ),
    tRing1: new Path2D(
      'M1411.3 509.928C1481.41 508.092 1536.67 446.182 1534.72 371.65C1532.77 297.117 1474.35 238.184 1404.23 240.02C1334.11 241.856 1278.86 303.766 1280.81 378.298C1282.76 452.831 1341.18 511.764 1411.3 509.928Z',
    ),
    tRing2: new Path2D(
      'M1409.7 467.955C1457.73 466.697 1495.58 424.278 1494.24 373.209C1492.91 322.141 1452.89 281.761 1404.85 283.019C1356.82 284.276 1318.97 326.695 1320.3 377.764C1321.64 428.833 1361.66 469.213 1409.7 467.955Z',
    ),
    tRing3: new Path2D(
      'M1410.23 430.929C1438.94 430.177 1461.57 405.175 1460.78 375.086C1459.99 344.997 1436.08 321.214 1407.37 321.966C1378.66 322.718 1356.03 347.719 1356.82 377.808C1357.61 407.898 1381.52 431.68 1410.23 430.929Z',
    ),
    tBull: new Path2D(
      'M1409.35 397.44C1419.56 397.173 1427.6 387.781 1427.31 376.463C1427.01 365.145 1418.49 356.187 1408.27 356.454C1398.06 356.722 1390.02 366.113 1390.32 377.431C1390.61 388.749 1399.13 397.708 1409.35 397.44Z',
    ),
  };
  return _art;
}

// ---------------------------------------------------------------------------
// Archer rig constants & geometry (all in source-SVG coordinates; feet at 480,651)
// ---------------------------------------------------------------------------
export const RIG = {
  FEET: { x: 480, y: 651 },
  FRONT_PIVOT: { x: 356, y: 429 },
  FRONT_LEN: 104,
  BACK_PIVOT: { x: 604, y: 429 },
  ACROSS_PIVOT: { x: 498, y: 442 },
  ARM_REST_FRONT: -75 * DEG,
  ARM_REST_BACK: 75 * DEG,
  BOW_SCALE: 0.65,
  BOW_STRING_X: 45,
  BOW_TIP_Y: 97,
  DRAW_MAX: 160,
  ARROW_LEN: 230,
};

// Rotation that makes the bow's string vertical (the art is drawn slightly tilted)
export const BOW_TILT = Math.atan2(69.4715 - 110.191, 704.12 - 409.281);
const BOW_GRIP = { x: 235, y: 539 }; // grip point in the tilt-corrected art frame

export interface ArcherVis {
  bob: number;
  jump: number;
  squash: number;
  headShake: number;
  headTilt: number;
  eyeScale: number;
  legSwing: number;
  armFront: number;
  armBack: number;
  bowRot: number;
  draw: number;
  across: number;
  showArrow: boolean;
  hasBow: boolean;
  hasQuiver: boolean;
  smile: number;
  spinX: number;
}

export function rot(x: number, y: number, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Hand / nock / arrow-tip positions in the archer's local (SVG) frame. */
export function archerGeom(v: { armFront: number; bowRot: number; draw: number }) {
  const hand = {
    x: RIG.FRONT_PIVOT.x - RIG.FRONT_LEN * Math.cos(v.armFront),
    y: RIG.FRONT_PIVOT.y - RIG.FRONT_LEN * Math.sin(v.armFront),
  };
  const bx = 1 + 0.35 * v.draw;
  const nx = RIG.BOW_STRING_X * bx + RIG.DRAW_MAX * v.draw;
  const ny = 4;
  const n = rot(nx, ny, v.bowRot);
  const nock = { x: hand.x + n.x, y: hand.y + n.y };
  const t = rot(-RIG.ARROW_LEN, 0, v.bowRot);
  const tip = { x: nock.x + t.x, y: nock.y + t.y };
  return { hand, nock, tip, nx, ny, bx };
}

function stadium(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x1, y1, r, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
  ctx.fill();
}

function drawArm(ctx: CanvasRenderingContext2D, path: Path2D, px: number, py: number, angle: number) {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.translate(-px, -py);
  ctx.fillStyle = PAL.skin;
  ctx.fill(path);
  ctx.restore();
}

export function drawArrowArt(ctx: CanvasRenderingContext2D, L = RIG.ARROW_LEN) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = PAL.grey;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(-L + 6, 0);
  ctx.lineTo(-16, 0);
  ctx.stroke();
  ctx.strokeStyle = '#BD4A36';
  ctx.beginPath();
  ctx.moveTo(-L + 6, 0);
  ctx.lineTo(-L + 40, 0);
  ctx.stroke();
  ctx.fillStyle = PAL.red2;
  ctx.beginPath();
  ctx.moveTo(-L + 6, -3);
  ctx.lineTo(-L + 14, -17);
  ctx.lineTo(-L + 46, -17);
  ctx.lineTo(-L + 34, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.orange2;
  ctx.beginPath();
  ctx.moveTo(-L + 6, 3);
  ctx.lineTo(-L + 14, 17);
  ctx.lineTo(-L + 46, 17);
  ctx.lineTo(-L + 34, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5B4F4A';
  ctx.beginPath();
  ctx.moveTo(2, 0);
  ctx.lineTo(-28, -9);
  ctx.lineTo(-28, 9);
  ctx.closePath();
  ctx.fill();
}

/** Bow in its local frame: origin = grip, +x toward the archer, limbs along y. */
export function drawBowHeld(ctx: CanvasRenderingContext2D, draw: number, showArrow: boolean) {
  const A = art();
  const k = RIG.BOW_SCALE;
  const bx = 1 + 0.35 * draw;
  const by = 1 - 0.05 * draw;
  ctx.save();
  ctx.scale(bx, by);
  ctx.scale(-k, k);
  ctx.translate(-BOW_GRIP.x, -BOW_GRIP.y);
  ctx.rotate(BOW_TILT);
  ctx.fillStyle = PAL.red;
  ctx.fill(A.bowBody);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.stroke(A.bowTipTop);
  ctx.stroke(A.bowTipBot);
  ctx.restore();
  const sx = RIG.BOW_STRING_X * bx;
  const ty = RIG.BOW_TIP_Y * by;
  const nx = sx + RIG.DRAW_MAX * draw;
  const ny = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, -ty);
  ctx.lineTo(nx, ny);
  ctx.lineTo(sx, ty);
  ctx.stroke();
  if (showArrow) {
    ctx.save();
    ctx.translate(nx - RIG.ARROW_LEN, ny);
    ctx.rotate(Math.PI);
    drawArrowArt(ctx);
    ctx.restore();
  }
}

/** Standalone bow, bottom at origin (pickup / title display). */
export function drawBowItem(ctx: CanvasRenderingContext2D, scale = RIG.BOW_SCALE) {
  const A = art();
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-110, -746);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.stroke(A.bowString);
  ctx.fillStyle = PAL.red;
  ctx.fill(A.bowBody);
  ctx.lineWidth = 8;
  ctx.stroke(A.bowTipTop);
  ctx.stroke(A.bowTipBot);
  ctx.restore();
}

export function drawQuiverArt(ctx: CanvasRenderingContext2D) {
  const A = art();
  ctx.lineCap = 'round';
  for (const [p, c] of A.quiverFills) {
    ctx.fillStyle = c;
    ctx.fill(p);
  }
  for (const [p, c, w] of A.quiverStrokes) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.stroke(p);
  }
  ctx.strokeStyle = PAL.brown;
  ctx.lineWidth = 20;
  ctx.stroke(A.quiverStrap);
  ctx.fillStyle = PAL.brown;
  ctx.fill(A.quiverRim);
  ctx.fill(A.quiverBody);
}

/** Standalone quiver, bottom-center at origin. */
export function drawQuiverItem(ctx: CanvasRenderingContext2D, scale = 0.65) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-825, -732);
  drawQuiverArt(ctx);
  ctx.restore();
}

/** Draw the archer. Expects ctx translated to the feet position and flipped for facing (unflipped = facing left). */
export function drawArcher(ctx: CanvasRenderingContext2D, v: ArcherVis) {
  const A = art();
  ctx.save();
  ctx.translate(0, -v.jump);
  ctx.scale(v.spinX, v.squash);
  ctx.translate(-RIG.FEET.x, -RIG.FEET.y);

  // legs
  for (const [path, hx] of [
    [A.legL, 420],
    [A.legR, 538],
  ] as Array<[Path2D, number]>) {
    const sw = hx === 420 ? v.legSwing : -v.legSwing;
    ctx.save();
    ctx.translate(hx, 582);
    ctx.rotate(sw);
    ctx.translate(-hx, -582);
    ctx.fillStyle = PAL.brownDark;
    ctx.fill(path);
    ctx.restore();
  }

  // body group (bobs)
  ctx.translate(0, -v.bob);

  if (v.hasQuiver) {
    ctx.save();
    ctx.translate(612, 478);
    ctx.rotate(0.35);
    ctx.scale(0.6, 0.6);
    ctx.translate(-825, -650);
    drawQuiverArt(ctx);
    ctx.restore();
  }

  drawArm(ctx, A.armR, RIG.BACK_PIVOT.x, RIG.BACK_PIVOT.y, v.armBack);

  // torso (masked)
  ctx.save();
  ctx.clip(A.bodyMask);
  for (const [p, c] of A.bodyFills) {
    ctx.fillStyle = c;
    ctx.fill(p);
  }
  ctx.restore();

  // drawing hand reaching across to the string
  const g = archerGeom(v);
  if (v.across > 0.01 && v.hasBow) {
    const px = RIG.ACROSS_PIVOT.x;
    const py = RIG.ACROSS_PIVOT.y;
    const hx = px + (g.nock.x - px) * v.across;
    const hy = py + (g.nock.y - py) * v.across;
    ctx.fillStyle = PAL.skin;
    stadium(ctx, px, py, hx, hy, 24);
  }

  // head group
  ctx.save();
  ctx.translate(480 + v.headShake, 403);
  ctx.rotate(v.headTilt);
  ctx.translate(-480, -403);
  ctx.fillStyle = '#E6E1DC';
  ctx.fill(A.beard);
  ctx.fillStyle = PAL.skin;
  ctx.fill(A.face);
  ctx.fillStyle = '#272220';
  for (const [p, cx] of [
    [A.eyeL, 465],
    [A.eyeR, 547],
  ] as Array<[Path2D, number]>) {
    ctx.save();
    ctx.translate(cx, 358.5);
    ctx.scale(1, v.eyeScale);
    ctx.translate(-cx, -358.5);
    ctx.fill(p);
    ctx.restore();
  }
  ctx.fillStyle = '#F29B70';
  ctx.fill(A.nose);
  ctx.save();
  ctx.translate(508, 417 - 5 * v.smile);
  ctx.scale(1 + 0.08 * v.smile, 1 - 0.14 * v.smile);
  ctx.translate(-508, -417);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 48;
  ctx.lineCap = 'round';
  ctx.stroke(A.mustache);
  ctx.restore();
  ctx.restore();

  drawArm(ctx, A.armL, RIG.FRONT_PIVOT.x, RIG.FRONT_PIVOT.y, v.armFront);

  if (v.hasBow) {
    ctx.save();
    ctx.translate(g.hand.x, g.hand.y);
    ctx.rotate(v.bowRot);
    drawBowHeld(ctx, v.draw, v.showArrow);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pedestal / cliffs
// ---------------------------------------------------------------------------
export function drawPedestal(ctx: CanvasRenderingContext2D) {
  const A = art();
  ctx.fillStyle = '#F2F3F7';
  ctx.fill(A.pedShadow);
  ctx.fillStyle = PAL.groundSide;
  ctx.fill(A.pedSide);
  ctx.fillStyle = PAL.ground;
  ctx.fill(A.pedTop);
  ctx.fillStyle = PAL.groundDark;
  ctx.fill(A.pedInner);
}

export function cliffGradient(ctx: CanvasRenderingContext2D, top: number, colors: string[]) {
  const g = ctx.createLinearGradient(0, top, 0, 575);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.78, colors[1]);
  g.addColorStop(1, '#FFFFFF');
  return g;
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------
export interface TargetPal {
  face: [string, string];
  ring: [string, string];
  bull: string;
  side: string;
}
export const TARGET_RED: TargetPal = {
  face: ['#E43E30', '#D83427'],
  ring: ['#F6F0E6', '#ECE5D8'],
  bull: '#DC2F26',
  side: '#C21E15',
};
export const TARGET_GOLD: TargetPal = {
  face: ['#F5C04E', '#E8A62A'],
  ring: ['#FFF9E8', '#F7EDD2'],
  bull: '#E39A12',
  side: '#B8791A',
};
export const TARGET_K = CFG.target.baseRadius / 166.5;
export const TARGET_CENTER_UP = 225; // art units from the stand base to the face centre
export const TARGET_RY_ART = 176;

/** Draw target with the stand base at origin. Flipped so the board's depth faces away from the archer. */
export function drawTarget(ctx: CanvasRenderingContext2D, scale: number, pal: TargetPal, flash: number) {
  const A = art();
  ctx.save();
  ctx.scale(-TARGET_K * scale, TARGET_K * scale);
  ctx.translate(-1406.76, -600);
  ctx.fillStyle = '#EBEEF9';
  ctx.fill(A.tShadow);
  for (const [p, c] of A.tLegs) {
    ctx.fillStyle = c;
    ctx.fill(p);
  }
  ctx.fillStyle = pal.side;
  ctx.fill(A.tSide);
  const g1 = ctx.createLinearGradient(1303, 237, 1524, 501);
  g1.addColorStop(0, pal.face[0]);
  g1.addColorStop(1, pal.face[1]);
  ctx.fillStyle = g1;
  ctx.fill(A.tFace);
  const g2 = ctx.createLinearGradient(1328, 269, 1498, 471);
  g2.addColorStop(0, pal.ring[0]);
  g2.addColorStop(1, pal.ring[1]);
  ctx.fillStyle = g2;
  ctx.fill(A.tRing1);
  ctx.fillStyle = g1;
  ctx.fill(A.tRing2);
  ctx.fillStyle = g2;
  ctx.fill(A.tRing3);
  ctx.fillStyle = pal.bull;
  ctx.fill(A.tBull);
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill(A.tFace);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// New stylized scenery objects
// ---------------------------------------------------------------------------
export function drawPine(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, color: string, trunk: string) {
  const w = h * 0.62;
  ctx.fillStyle = trunk;
  roundRectPath(ctx, x - h * 0.05, baseY - h * 0.16, h * 0.1, h * 0.16, h * 0.03);
  ctx.fill();
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const ty = baseY - h * 0.1 - i * h * 0.27;
    const tw = w * (1 - i * 0.24);
    const th = h * 0.44;
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, ty);
    ctx.lineTo(x + tw / 2, ty);
    ctx.lineTo(x, ty - th);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(x - w * 0.12, y - h * 0.55, w * 0.22, h * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawMound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
}

export function drawSignpost(ctx: CanvasRenderingContext2D, x: number, groundY: number, text: string) {
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, x - 7, groundY - 150, 14, 150, 6);
  ctx.fill();
  ctx.fillStyle = '#F7F8FC';
  roundRectPath(ctx, x - 82, groundY - 186, 164, 58, 16);
  ctx.fill();
  ctx.fillStyle = PAL.groundSide;
  roundRectPath(ctx, x - 82, groundY - 136, 164, 8, 4);
  ctx.fill();
  // arrow pointing left
  ctx.fillStyle = PAL.red2;
  ctx.beginPath();
  ctx.moveTo(x - 66, groundY - 157);
  ctx.lineTo(x - 46, groundY - 170);
  ctx.lineTo(x - 46, groundY - 144);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PAL.grey;
  ctx.font = 'bold 28px Nunito, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(x + 12, groundY - 156);
  ctx.scale(-1, 1); // the world is drawn mirrored; keep text readable
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.95, y + r * 0.15, r * 0.75, 0, Math.PI * 2);
  ctx.arc(x - r * 0.95, y + r * 0.2, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y - r * 0.35, r * 0.65, 0, Math.PI * 2);
  ctx.fill();
  roundRectPath(ctx, x - r * 1.5, y + r * 0.1, r * 3, r * 0.8, r * 0.4);
  ctx.fill();
  ctx.restore();
}

export function drawFlag(ctx: CanvasRenderingContext2D, x: number, groundY: number, wind: number, windMax: number, t: number) {
  const top = groundY - 230;
  ctx.strokeStyle = PAL.grey;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, top);
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x, top - 4, 8, 0, Math.PI * 2);
  ctx.fill();
  const str = windMax > 0 ? Math.min(1, Math.abs(wind) / Math.max(1, windMax)) : 0;
  const dir = wind >= 0 ? 1 : -1;
  const len = 26 + 74 * str;
  const droop = (1 - str) * 70;
  const wave = Math.sin(t * (6 + 8 * str)) * (3 + 7 * str);
  ctx.fillStyle = PAL.red2;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.quadraticCurveTo(x + dir * len * 0.5, top + droop * 0.5 + wave, x + dir * len, top + droop + wave * 1.5);
  ctx.lineTo(x + dir * len * 0.85, top + droop + 22 + wave);
  ctx.quadraticCurveTo(x + dir * len * 0.45, top + 44 + droop * 0.4 - wave * 0.5, x, top + 56);
  ctx.closePath();
  ctx.fill();
}

export function drawFence(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  ctx.fillStyle = '#C9CFE6';
  for (const px of [x - 60, x + 60]) {
    roundRectPath(ctx, px - 8, groundY - 86, 16, 86, 7);
    ctx.fill();
  }
  ctx.strokeStyle = PAL.red2;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 60, groundY - 76);
  ctx.quadraticCurveTo(x, groundY - 40, x + 60, groundY - 76);
  ctx.stroke();
  ctx.fillStyle = '#F7F8FC';
  roundRectPath(ctx, x - 50, groundY - 150, 100, 44, 12);
  ctx.fill();
  ctx.fillStyle = PAL.grey;
  ctx.font = 'bold 20px Nunito, "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(x, groundY - 127);
  ctx.scale(-1, 1);
  ctx.fillText('LINE', 0, 0);
  ctx.restore();
  ctx.fillStyle = PAL.brown;
  roundRectPath(ctx, x - 5, groundY - 110, 10, 110, 4);
  ctx.fill();
}

export function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = rot + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}
