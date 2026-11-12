// The desert location, built from the supplied SVG (src/game/desertSvg.ts).
//   • the SVG is used in place for the snow→desert opening and for the gate;
//   • a long middle section is assembled from the SVG's own dunes, cacti, bushes and tufts;
//   • the stone arch is split into BACK and FRONT layers; the hero is drawn between them.
// Scene space "u": 0 = left edge of the artwork, grows toward the gate (the direction the hero walks).
// u maps to world x as  x = X0 - u  (the game world is drawn mirrored, so it reads left → right on screen).
import { parseSvg, drawOps, type SvgArt } from './svgArt';
import { DESERT_SVG } from './desertSvg';

const EXT = 3400; // extra desert inserted between the SVG's opening and its gate section
export const DESERT = {
  X0: -100, // u = 0 sits just beyond the first stage's target; the world is ONE continuous walk
  W: 6800,
  EXT,
  DY: -62.757, // svg y → world y: the gate base (svg 713.757) sits on the game's ground line
  HERO_U: 620,
  ARCH_SRC_X: 1717, // gate left edge in the svg
  ARCH_BASE: 713.757,
  ARCH_SX: 1.9, // stretched wide so the hero fits through the doorway
  ARCH_SY: 1.05,
  OPEN_L: 1914.6,
  OPEN_R: 2071.75,
  SPLIT: 1215, // svg x where the extension is spliced in
};
export const ARCH_U0 = DESERT.ARCH_SRC_X + EXT;
/** u of the doorway centre */
export const GOAL_U = ARCH_U0 + ((DESERT.OPEN_L + DESERT.OPEN_R) / 2 - DESERT.ARCH_SRC_X) * DESERT.ARCH_SX;
/** u where the Spartan guards (in front of the left tower) */
export const FOE_U = ARCH_U0 + 150;
export const TOTAL_U = ARCH_U0 + 650 * DESERT.ARCH_SX;
/** the hero reaches the far side of the ruins here: level complete */
export const END_U = TOTAL_U + 140;
export const uToX = (u: number) => DESERT.X0 - u;
export const xToU = (x: number) => DESERT.X0 - x;

// svg element indices (document order)
const I = {
  clouds: [13, 14, 15, 16, 17],
  mountains: [18, 28],
  duneA: 30,
  duneB: [29, 31, 32, 33],
  sand: 34,
  snowPatch: [35, 47],
  pinesRocks: [48, 57],
  tuftsA: [58, 61],
  tuftsB: [62, 65],
  bushesA: [66, 68],
  bushesB: [69, 70],
  road: 71,
  cactusHouse: [72, 76],
  arch: [77, 93],
  archFront: [94, 95],
};

// bbox left x / width of the dune silhouettes (for scattering them)
const DUNES: Record<number, { x: number; w: number }> = {
  29: { x: 1215.47, w: 735 },
  30: { x: 852.469, w: 513 },
  32: { x: 2134.67, w: 839 },
  33: { x: 1720.42, w: 585 },
};
// tuft / bush anchors (bottom centre) in svg space
const TUFTS: Array<{ op: number; ax: number; ay: number }> = [
  { op: 58, ax: 785.5, ay: 715 },
  { op: 59, ax: 895, ay: 696 },
  { op: 60, ax: 916, ay: 766 },
  { op: 61, ax: 1135, ay: 681 },
  { op: 62, ax: 1230, ay: 778 },
  { op: 63, ax: 1322, ay: 659 },
  { op: 64, ax: 1673, ay: 660 },
  { op: 65, ax: 1888, ay: 661 },
];
const BUSHES: Array<{ op: number; ax: number; ay: number }> = [
  { op: 66, ax: 751, ay: 642 },
  { op: 67, ax: 818, ay: 666 },
  { op: 68, ax: 1155, ay: 747 },
  { op: 69, ax: 1247, ay: 704 },
  { op: 70, ax: 1300, ay: 782 },
];
const CLOUD_ANCHOR: Array<{ op: number; x: number; y: number }> = [
  { op: 13, x: 842, y: 329 },
  { op: 14, x: 1004, y: 216 },
  { op: 15, x: 1145, y: 294 },
  { op: 16, x: 1355, y: 363 },
  { op: 17, x: 1854, y: 229 },
];

const SKY_STOPS: Array<[number, [number, number, number]]> = [
  [0, [0xcb, 0xe0, 0xfa]],
  [0.32, [0xd8, 0xe9, 0xfc]],
  [0.5, [0xed, 0xec, 0xe6]],
  [0.68, [0xfc, 0xed, 0xc5]],
  [1, [0xff, 0xe7, 0xb0]],
];
function skyAt(t: number) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < SKY_STOPS.length; i++) {
    if (t <= SKY_STOPS[i][0]) {
      const [t0, c0] = SKY_STOPS[i - 1];
      const [t1, c1] = SKY_STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * k)},${Math.round(c0[1] + (c1[1] - c0[1]) * k)},${Math.round(c0[2] + (c1[2] - c0[2]) * k)})`;
    }
  }
  return 'rgb(255,231,176)';
}

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Placed {
  op: number;
  lu: number;
  flip: boolean;
  sy: number;
  yb: number;
  ax: number;
  ay: number;
}

export interface SceneEnv {
  /** set the world→screen transform for a parallax factor */
  setLayer: (f: number) => void;
  camX: number;
  visW: number;
  groundY: number;
  w: number;
  h: number;
  progress: number; // 0..1 along the level
  time: number;
}

export class DesertScene {
  readonly art: SvgArt = parseSvg(DESERT_SVG);
  private backDunes: Placed[] = [];
  private frontDunes: Placed[] = [];
  private clouds: Placed[] = [];
  private props: Placed[] = []; // extension: tufts, bushes, cactus
  private cactus: Placed[] = [];

  constructor() {
    const span = TOTAL_U + 2500;
    const gen = (f: number, ops: number[], list: Placed[], seed: number, overlap: number) => {
      let lu = -900;
      let i = 0;
      while (lu < span * f + 2400) {
        const op = ops[Math.floor(hash(seed + i * 3.1) * ops.length)];
        const d = DUNES[op];
        list.push({ op, lu, flip: hash(seed + i * 5.7) > 0.5, sy: 0.75 + hash(seed + i * 7.3) * 0.5, yb: 620, ax: d.x, ay: d.w });
        lu += d.w * (overlap + 0.35 * hash(seed + i * 9.9));
        i++;
      }
    };
    gen(0.55, [30, 33], this.backDunes, 11, 0.5);
    gen(0.8, [29, 32], this.frontDunes, 29, 0.55);
    // clouds
    for (let i = 0, lu = -600; lu < span * 0.15 + 2400; i++) {
      const c = CLOUD_ANCHOR[Math.floor(hash(70 + i) * CLOUD_ANCHOR.length)];
      this.clouds.push({ op: c.op, lu, flip: false, sy: 1, yb: (hash(80 + i) - 0.5) * 120, ax: c.x, ay: c.y });
      lu += 380 + hash(90 + i) * 520;
    }
    // extension props (u from the splice to the gate section)
    const u0 = DESERT.SPLIT + 120;
    const u1 = DESERT.SPLIT + EXT - 60;
    for (let u = u0, i = 0; u < u1; i++) {
      const r = hash(200 + i);
      if (r < 0.62) {
        const t = TUFTS[Math.floor(hash(300 + i) * TUFTS.length)];
        this.props.push({ op: t.op, lu: u, flip: hash(400 + i) > 0.5, sy: 0.9 + hash(500 + i) * 0.5, yb: 650 + hash(600 + i) * 130, ax: t.ax, ay: t.ay });
        u += 70 + hash(700 + i) * 160;
      } else if (r < 0.88) {
        const b = BUSHES[Math.floor(hash(800 + i) * BUSHES.length)];
        this.props.push({ op: b.op, lu: u, flip: hash(900 + i) > 0.5, sy: 0.85 + hash(1000 + i) * 0.4, yb: 655 + hash(1100 + i) * 125, ax: b.ax, ay: b.ay });
        u += 120 + hash(1200 + i) * 220;
      } else {
        this.cactus.push({ op: 72, lu: u, flip: hash(1300 + i) > 0.5, sy: 1, yb: 713.757, ax: 1607.7, ay: 713.757 });
        u += 520 + hash(1400 + i) * 500;
      }
    }
  }

  private visRange(f: number, env: SceneEnv) {
    const cx = env.camX * f;
    return { lo: DESERT.X0 * f - (cx + env.visW / 2) - 500, hi: DESERT.X0 * f - (cx - env.visW / 2) + 500 };
  }

  /** layer space: lu grows to the right on screen; svg y → world y */
  private enter(ctx: CanvasRenderingContext2D, env: SceneEnv, f: number) {
    env.setLayer(f);
    ctx.translate(DESERT.X0 * f, 0);
    ctx.scale(-1, 1);
    ctx.translate(0, DESERT.DY);
  }

  drawBack(ctx: CanvasRenderingContext2D, env: SceneEnv) {
    const { w, h } = env;
    const a = this.art;
    // ---- sky: the svg's horizontal blue → warm gradient, advancing as the hero walks
    const p = env.progress;
    const sg = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 4; i++) sg.addColorStop(i / 4, skyAt(p * 0.95 + (i / 4) * 0.3));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);

    // ---- clouds
    {
      this.enter(ctx, env, 0.15);
      const r = this.visRange(0.15, env);
      for (const c of this.clouds) {
        if (c.lu < r.lo - 300 || c.lu > r.hi + 300) continue;
        ctx.save();
        ctx.translate(c.lu - c.ax, c.yb);
        drawOps(ctx, a, c.op);
        ctx.restore();
      }
    }
    // ---- far snow mountains (the way back)
    {
      this.enter(ctx, env, 0.35);
      drawOps(ctx, a, I.mountains[0], I.mountains[1]);
    }
    // ---- scattered dunes, two parallax depths
    for (const [f, list] of [
      [0.55, this.backDunes],
      [0.8, this.frontDunes],
    ] as const) {
      this.enter(ctx, env, f);
      const r = this.visRange(f, env);
      for (const d of list) {
        const dn = DUNES[d.op];
        if (d.lu + dn.w < r.lo || d.lu > r.hi) continue;
        ctx.save();
        ctx.translate(d.lu, d.yb);
        ctx.scale(1, d.sy);
        ctx.translate(0, -d.yb);
        if (d.flip) {
          ctx.translate(dn.w, 0);
          ctx.scale(-1, 1);
        }
        ctx.translate(-dn.x, 0);
        drawOps(ctx, a, d.op);
        ctx.restore();
      }
    }

    // ---- ground layer
    this.enter(ctx, env, 1);
    const r1 = this.visRange(1, env);
    ctx.save();
    ctx.translate(0, 0);
    // dunes belonging to the original scene
    drawOps(ctx, a, I.duneA);
    ctx.save();
    ctx.translate(EXT, 0);
    for (const i of I.duneB) drawOps(ctx, a, i);
    ctx.restore();
    // sand (huge) + snow left of the artwork
    ctx.fillStyle = '#FAE0A8';
    ctx.fillRect(-4000, 605, TOTAL_U + 8000, 3000);
    ctx.fillStyle = '#D3E6FA';
    ctx.fillRect(-4000, 605, 4000, 3000);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-4000, 605, 4000, 113);
    drawOps(ctx, a, I.snowPatch[0], I.snowPatch[1]);
    drawOps(ctx, a, I.pinesRocks[0], I.pinesRocks[1]);
    // tufts / bushes of the opening
    drawOps(ctx, a, I.tuftsA[0], I.tuftsA[1]);
    drawOps(ctx, a, I.bushesA[0], I.bushesA[1]);
    ctx.restore();

    // extension props (back: behind the walking line)
    for (const c of this.cactus) {
      if (c.lu < r1.lo - 400 || c.lu > r1.hi + 400) continue;
      ctx.save();
      ctx.translate(c.lu, 0);
      if (c.flip) ctx.scale(-1, 1);
      ctx.translate(-1607.7, 0); // anchor = cactus/house group centre
      drawOps(ctx, a, I.cactusHouse[0], I.cactusHouse[1]);
      ctx.restore();
    }
    for (const q of this.props) {
      if (q.yb > DESERT.ARCH_BASE) continue;
      if (q.lu < r1.lo - 200 || q.lu > r1.hi + 200) continue;
      this.prop(ctx, q);
    }

    // the opening's own tufts + the gate section
    ctx.save();
    ctx.translate(EXT, 0);
    drawOps(ctx, a, I.tuftsB[0], I.tuftsB[1]);
    drawOps(ctx, a, I.bushesB[0], I.bushesB[1]);
    drawOps(ctx, a, I.road);
    drawOps(ctx, a, I.cactusHouse[0], I.cactusHouse[1]);
    ctx.restore();

    // ---- the path that runs BEHIND the ruins to the far side (the hero walks it, the gate stands in front)
    {
      const u0 = ARCH_U0 - 420;
      const u1 = TOTAL_U + 1300;
      ctx.fillStyle = '#EBD098';
      ctx.beginPath();
      ctx.moveTo(u0, 706);
      ctx.bezierCurveTo(u0 + 200, 706, u0 + 260, 668, u0 + 520, 668);
      ctx.lineTo(u1, 668);
      ctx.lineTo(u1, 708);
      ctx.lineTo(u0 + 520, 708);
      ctx.bezierCurveTo(u0 + 300, 708, u0 + 250, 722, u0, 722);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(190,150,90,0.25)';
      ctx.fillRect(u0 + 520, 668, u1 - u0 - 520, 4);
    }
  }

  private prop(ctx: CanvasRenderingContext2D, q: Placed) {
    ctx.save();
    ctx.translate(q.lu, q.yb);
    ctx.scale(q.flip ? -q.sy : q.sy, q.sy);
    ctx.translate(-q.ax, -q.ay);
    drawOps(ctx, this.art, q.op);
    ctx.restore();
  }

  /** the gate's own coordinates (svg, stretched) inside the ground layer */
  private archSpace(ctx: CanvasRenderingContext2D, fn: () => void) {
    ctx.save();
    ctx.translate(ARCH_U0, DESERT.ARCH_BASE);
    ctx.scale(DESERT.ARCH_SX, DESERT.ARCH_SY);
    ctx.translate(-DESERT.ARCH_SRC_X, -DESERT.ARCH_BASE);
    fn();
    ctx.restore();
  }

  /** The whole gate (stone body, doorway frame, rubble). Drawn over the hero while he walks the path behind it. */
  drawArch(ctx: CanvasRenderingContext2D, env: SceneEnv) {
    const a = this.art;
    this.enter(ctx, env, 1);
    this.archSpace(ctx, () => {
      drawOps(ctx, a, I.arch[0], I.arch[1]);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#B89B6A';
      ctx.lineWidth = 40;
      ctx.stroke(RING_PATH);
      ctx.strokeStyle = '#D4BA8A';
      ctx.lineWidth = 26;
      ctx.stroke(RING_PATH);
      ctx.strokeStyle = 'rgba(94,75,48,0.35)';
      ctx.lineWidth = 6;
      ctx.stroke(RING_PATH);
      drawOps(ctx, a, I.archFront[0], I.archFront[1]);
    });
  }

  /** Low foreground plants in front of the walking line. */
  drawFront(ctx: CanvasRenderingContext2D, env: SceneEnv) {
    this.enter(ctx, env, 1);
    const r1 = this.visRange(1, env);
    for (const q of this.props) {
      if (q.yb <= DESERT.ARCH_BASE) continue;
      if (q.lu < r1.lo - 200 || q.lu > r1.hi + 200) continue;
      this.prop(ctx, q);
    }
  }
}

// doorway contour (svg space): the frame drawn around the opening
const RING_PATH = new Path2D('M1921.22 713.757L1914.6 336.598C1914.6 273.738 1949.34 237.346 1994 237.346C2033.7 237.346 2071.75 273.738 2071.75 336.598V713.757');
