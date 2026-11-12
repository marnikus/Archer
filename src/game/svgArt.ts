// Minimal SVG → canvas renderer for the supplied artwork (<path>/<rect> with solid or
// userSpaceOnUse linear-gradient fills and optional strokes). The SVG text is kept as data, so the art
// can be swapped by replacing the string. Ops keep document order, so index ranges are stable "layers".

export interface Grad {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: Array<[number, string]>;
}
export interface SvgOp {
  path: Path2D;
  fill: string | Grad | null;
  stroke: string | null;
  sw: number;
  cap: CanvasLineCap;
}
export interface SvgArt {
  w: number;
  h: number;
  ops: SvgOp[];
}

export function parseSvg(text: string): SvgArt {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  const grads = new Map<string, Grad>();
  doc.querySelectorAll('linearGradient').forEach((g) => {
    const stops: Array<[number, string]> = [];
    g.querySelectorAll('stop').forEach((s) => stops.push([parseFloat(s.getAttribute('offset') ?? '0'), s.getAttribute('stop-color') ?? '#000']));
    grads.set(g.getAttribute('id') ?? '', {
      x1: parseFloat(g.getAttribute('x1') ?? '0'),
      y1: parseFloat(g.getAttribute('y1') ?? '0'),
      x2: parseFloat(g.getAttribute('x2') ?? '0'),
      y2: parseFloat(g.getAttribute('y2') ?? '0'),
      stops,
    });
  });
  const ops: SvgOp[] = [];
  doc.querySelectorAll('path, rect').forEach((el) => {
    if (el.closest('defs')) return;
    let path: Path2D;
    if (el.tagName === 'rect') {
      path = new Path2D();
      path.rect(parseFloat(el.getAttribute('x') ?? '0'), parseFloat(el.getAttribute('y') ?? '0'), parseFloat(el.getAttribute('width') ?? '0'), parseFloat(el.getAttribute('height') ?? '0'));
    } else path = new Path2D(el.getAttribute('d') ?? '');
    const stroke = el.getAttribute('stroke');
    let fillAttr = el.getAttribute('fill');
    let fill: string | Grad | null;
    if (fillAttr === null) fill = stroke ? null : '#000000'; // SVG default is black; stroke-only lines have no fill area
    else if (fillAttr === 'none') fill = null;
    else if (fillAttr.startsWith('url(#')) fill = grads.get(fillAttr.slice(5, -1)) ?? '#000000';
    else fill = fillAttr;
    fillAttr = null;
    ops.push({
      path,
      fill,
      stroke: stroke && stroke !== 'none' ? stroke : null,
      sw: parseFloat(el.getAttribute('stroke-width') ?? '1'),
      cap: (el.getAttribute('stroke-linecap') as CanvasLineCap) ?? 'butt',
    });
  });
  return { w: parseFloat(root.getAttribute('width') ?? '0'), h: parseFloat(root.getAttribute('height') ?? '0'), ops };
}

function paint(ctx: CanvasRenderingContext2D, op: SvgOp) {
  if (op.fill) {
    if (typeof op.fill === 'string') ctx.fillStyle = op.fill;
    else {
      const g = ctx.createLinearGradient(op.fill.x1, op.fill.y1, op.fill.x2, op.fill.y2);
      for (const [o, c] of op.fill.stops) g.addColorStop(o, c);
      ctx.fillStyle = g;
    }
    ctx.fill(op.path);
  }
  if (op.stroke) {
    ctx.strokeStyle = op.stroke;
    ctx.lineWidth = op.sw;
    ctx.lineCap = op.cap;
    ctx.stroke(op.path);
  }
}

/** Draw ops[from..to] (inclusive) in the current user space. */
export function drawOps(ctx: CanvasRenderingContext2D, art: SvgArt, from: number, to = from) {
  for (let i = from; i <= to; i++) paint(ctx, art.ops[i]);
}
