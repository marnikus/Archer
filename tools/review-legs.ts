// Automatic leg review for every character in the game.  Run:  npm run review:legs
// For each character + gait it simulates the rig and checks, per frame:
//   • stride direction – the planted foot must travel BACKWARD relative to the body (a "backward cycle" is a FAIL)
//   • foot planting – foot sliding on the ground (world velocity of a planted foot ÷ body speed)
//   • knee direction – the knee must bend forward
//   • ground penetration – the sole must never go below the ground
//   • leg stretch – bone length actually used ÷ rest length
// Exit code 1 if anything FAILs, so it can be wired into CI / a pre-commit hook.
import { Animator, type BaseState } from '../src/rig/animator';
import { G } from '../src/rig/rig';
import { SpartanFoe, FOE } from '../src/game/spartanFoe';

type Row = { who: string; gait: string; speed: number; slip: number; dir: string; knee: string; pen: number; stretch: number; verdict: 'PASS' | 'WARN' | 'FAIL'; notes: string[] };
const rows: Row[] = [];

interface Sample {
  bodyX: number; // world x of the body
  worldDir: 1 | -1; // +1: rig x maps to world +x
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  ankleX: number;
  ankleY: number;
  len: number; // rest length of the leg (thigh + shin)
  t: number;
}

function analyse(who: string, gait: string, frames: Array<{ f: Sample; b: Sample }>, groundY: number, dt: number): Row {
  const notes: string[] = [];
  let slipSum = 0;
  let slipN = 0;
  let signedSum = 0;
  let spdSum = 0;
  let kneeBad = 0;
  let kneeN = 0;
  let pen = 0;
  let maxStretch = 0;
  let moving = 0;
  for (let i = 1; i < frames.length; i++) {
    for (const side of ['f', 'b'] as const) {
      const a = frames[i - 1][side];
      const b = frames[i][side];
      if (b.t - a.t > dt * 1.5 || b.t <= a.t) continue; // only contiguous frames can be differenced
      const bodyV = (b.bodyX - a.bodyX) / dt;
      const wa = a.bodyX + a.worldDir * a.ankleX;
      const wb = b.bodyX + b.worldDir * b.ankleX;
      const footV = (wb - wa) / dt;
      const contact = a.ankleY >= groundY - 3 && b.ankleY >= groundY - 3;
      if (Math.abs(bodyV) > 25) moving++;
      if (contact && Math.abs(bodyV) > 25) {
        slipSum += Math.abs(footV) / Math.abs(bodyV);
        signedSum += footV * Math.sign(bodyV);
        spdSum += Math.abs(bodyV);
        slipN++;
      }
      // knee must bend forward (-x in rig space) of the hip→ankle line, unless the leg is straight
      const dx = b.ankleX - b.hipX;
      const dy = b.ankleY - b.hipY;
      const L = Math.hypot(dx, dy);
      if (L < b.len * 0.97) {
        const t = ((b.kneeX - b.hipX) * dx + (b.kneeY - b.hipY) * dy) / (L * L);
        const px = b.hipX + dx * t;
        kneeN++;
        if (b.kneeX > px + 0.5) kneeBad++; // knee behind the line = backward bend
      }
      if (b.ankleY > groundY + 2.5) pen++;
      const kl = Math.hypot(b.kneeX - b.hipX, b.kneeY - b.hipY) + Math.hypot(b.ankleX - b.kneeX, b.ankleY - b.kneeY);
      maxStretch = Math.max(maxStretch, kl / b.len);
    }
  }
  const slip = slipN ? slipSum / slipN : 0;
  const signed = slipN ? signedSum / Math.max(1e-6, spdSum) : 0; // −1 would be a perfectly planted foot moving backward… see below
  let dir = 'n/a';
  let verdict: Row['verdict'] = 'PASS';
  if (slipN > 10) {
    // planted foot: worldVel ≈ 0.  Foot moving FORWARD faster than the body ⇒ signed slip ≈ +bodySpeed·k (k>0.6)
    dir = signed > 0.6 ? 'BACKWARD CYCLE' : 'ok';
    if (signed > 0.6) {
      verdict = 'FAIL';
      notes.push('stance foot travels forward relative to the body (backward cycle)');
    }
    if (slip > 0.35) {
      verdict = 'FAIL';
      notes.push(`foot slides ${Math.round(slip * 100)}% of body speed`);
    } else if (slip > 0.18 && verdict !== 'FAIL') {
      verdict = 'WARN';
      notes.push(`foot slides ${Math.round(slip * 100)}% of body speed`);
    }
  }
  if (moving > 60 && slipN < 10) {
    verdict = 'FAIL';
    notes.push('moving, but the feet never touch the ground (floating legs)');
  }
  const knee = kneeN ? (kneeBad / kneeN > 0.02 ? 'BACKWARD' : 'ok') : 'n/a';
  if (knee === 'BACKWARD') {
    verdict = 'FAIL';
    notes.push('knee bends backward');
  }
  if (pen > 2) {
    verdict = 'FAIL';
    notes.push(`sole below ground in ${pen} samples`);
  }
  if (maxStretch > 1.16) {
    verdict = 'FAIL';
    notes.push(`leg stretches to ${maxStretch.toFixed(2)}x`);
  }
  const speed = slipN ? spdSum / slipN : 0;
  return { who, gait, speed: Math.round(speed), slip: +slip.toFixed(2), dir, knee, pen, stretch: +maxStretch.toFixed(2), verdict, notes };
}

// ------------------------------------------------------------------ hero (Animator)
function reviewHero() {
  const gaits: BaseState[] = ['walk-casual', 'walk', 'walk-power', 'walk-brisk', 'walk-tired', 'run', 'sneak', 'creep'];
  const dt = 1 / 60;
  for (const gait of gaits) {
    const a = new Animator();
    a.hasBow = true;
    a.hasQuiver = true;
    a.weapon = 'bow';
    a.bounds = [-1e7, 1e7]; // never turn around at the lab edge
    a.setBase(gait);
    const frames: Array<{ f: Sample; b: Sample }> = [];
    for (let i = 0; i < 60 * 9; i++) {
      a.update(dt);
      if (i < 60 * 2) continue; // settle into the gait
      const s = a.skel;
      const mk = (hip: { x: number; y: number }, knee: { x: number; y: number }, ankle: { x: number; y: number }): Sample => ({
        bodyX: a.x,
        worldDir: a.facing === -1 ? 1 : -1,
        hipX: hip.x,
        hipY: hip.y,
        kneeX: knee.x,
        kneeY: knee.y,
        ankleX: ankle.x,
        ankleY: ankle.y,
        len: G.thigh + G.shin,
        t: a.time,
      });
      frames.push({ f: mk(s.hipF, s.kneeF, s.ankleF), b: mk(s.hipB, s.kneeB, s.ankleB) });
    }
    rows.push(analyse('hero', gait, frames, G.standAnkleY, dt));
  }
  // jump: only geometry (no planted-foot test)
  {
    const a = new Animator();
    a.setBase('jump');
    const frames: Array<{ f: Sample; b: Sample }> = [];
    for (let i = 0; i < 60 * 2; i++) {
      a.update(dt);
      const s = a.skel;
      const mk = (hip: { x: number; y: number }, knee: { x: number; y: number }, ankle: { x: number; y: number }): Sample => ({ bodyX: 0, worldDir: 1, hipX: hip.x, hipY: hip.y, kneeX: knee.x, kneeY: knee.y, ankleX: ankle.x, ankleY: ankle.y, len: G.thigh + G.shin, t: a.time });
      frames.push({ f: mk(s.hipF, s.kneeF, s.ankleF), b: mk(s.hipB, s.kneeB, s.ankleB) });
    }
    rows.push(analyse('hero', 'jump', frames, G.standAnkleY, dt));
  }
}

// ------------------------------------------------------------------ Spartan (SpartanFoe)
function reviewSpartan() {
  const dt = 1 / 60;
  const L = 58 + 56; // THIGH + SHIN in spartanFoe.ts
  const buckets: Array<[string, (v: number) => boolean]> = [
    ['walk', (v) => v > 120 && v < 260],
    ['run', (v) => v > 320 && v < 600],
    ['sprint', (v) => v > 680 && v < 1050],
  ];
  for (const tier of [0, 1, 2]) {
    const f = new SpartanFoe(0);
    f.hp = FOE.hp - tier;
    f.hunting = true;
    f.cool = 1e9; // never attack: pure locomotion
    const all: Array<{ f: Sample; b: Sample; v: number }> = [];
    const LOCO = new Set(['guard', 'raise', 'idle']);
    let heroX = 6000;
    for (let i = 0; i < 60 * 40; i++) {
      // keep the hero far so he runs/walks; bring him in so all gaits appear
      heroX = f.x + (i % 900 < 450 ? 2500 : 1200);
      f.update(dt, heroX, true);
      const legs = f.look.legs;
      if (!legs || i < 30 || !LOCO.has(f.state)) continue; // attacks are checked separately
      const hips = f.skel;
      const mk = (hip: { x: number; y: number }, l: { knee: { x: number; y: number }; ankle: { x: number; y: number } }): Sample => ({
        bodyX: f.x,
        worldDir: -1,
        hipX: hip.x,
        hipY: hip.y,
        kneeX: l.knee.x,
        kneeY: l.knee.y,
        ankleX: l.ankle.x,
        ankleY: l.ankle.y,
        len: L,
        t: f.time,
      });
      all.push({ f: mk(hips.hipF, legs.f), b: mk(hips.hipB, legs.b), v: Math.abs(f.speed) });
    }
    for (const [name, inBucket] of buckets) {
      const frames = all.filter((s) => inBucket(s.v));
      if (frames.length < 40) continue;
      // contiguous runs only (the analysis differences consecutive frames)
      rows.push(analyse(`spartan t${tier}`, name, frames, -18, dt));
    }
  }
  // attack legs (lunge / leap): geometry only
  for (const tier of [0, 1]) {
    const f = new SpartanFoe(0);
    f.hp = FOE.hp - tier;
    f.hunting = true;
    f.state = 'guard';
    const frames: Array<{ f: Sample; b: Sample }> = [];
    f.attack();
    for (let i = 0; i < 60 * 5; i++) {
      f.update(dt, 700, true);
      const legs = f.look.legs;
      if (!legs) continue;
      const mk = (hip: { x: number; y: number }, l: { knee: { x: number; y: number }; ankle: { x: number; y: number } }): Sample => ({ bodyX: 0, worldDir: -1, hipX: hip.x, hipY: hip.y, kneeX: l.knee.x, kneeY: l.knee.y, ankleX: l.ankle.x, ankleY: l.ankle.y, len: L, t: f.time });
      frames.push({ f: mk(f.skel.hipF, legs.f), b: mk(f.skel.hipB, legs.b) });
    }
    rows.push(analyse(`spartan t${tier}`, tier ? 'leap attack' : 'lunge attack', frames, -18, dt));
  }
}

reviewHero();
reviewSpartan();

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log('\nLEG REVIEW');
console.log(pad('character', 12) + pad('gait', 14) + pad('speed', 7) + pad('slip', 6) + pad('stride', 16) + pad('knee', 10) + pad('under', 7) + pad('stretch', 8) + 'result');
for (const r of rows) console.log(pad(r.who, 12) + pad(r.gait, 14) + pad(r.speed, 7) + pad(r.slip, 6) + pad(r.dir, 16) + pad(r.knee, 10) + pad(r.pen, 7) + pad(r.stretch, 8) + r.verdict + (r.notes.length ? '  – ' + r.notes.join('; ') : ''));
const fails = rows.filter((r) => r.verdict === 'FAIL').length;
const warns = rows.filter((r) => r.verdict === 'WARN').length;
console.log(`\n${rows.length} checks: ${rows.length - fails - warns} pass, ${warns} warn, ${fails} fail\n`);
process.exit(fails ? 1 : 0);
