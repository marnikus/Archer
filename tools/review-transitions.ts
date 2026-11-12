// Automatic transition review for the hero rig.  Run:  npm run review:transitions
// Every scenario drives the Animator the way the game does (external movement) and records, every frame, ~two dozen
// tracked points + angles + face parameters.  Then it measures
//   • POPS     – second difference (acceleration) of a channel in one frame: a visible snap / sharp start
//   • FREEZES  – the whole body stands still for several frames in the middle of motion
// and prints the worst offender per scenario.  Exit code 1 if anything FAILs.
import { Animator, type BaseState } from '../src/rig/animator';

type Vec = { x: number; y: number };
const DT = 1 / 60;
const D = Math.PI / 180;

interface Frame {
  t: number;
  ch: Record<string, number[]>; // channel -> [x] or [x, y]
}

function sample(a: Animator): Frame {
  const s = a.skel;
  const p = a.pose;
  const pt = (v: Vec) => [v.x, v.y];
  const ch: Record<string, number[]> = {
    handF: pt(s.handF),
    handB: pt(s.handB),
    elbowF: pt(s.elbowF),
    elbowB: pt(s.elbowB),
    ankleF: pt(s.ankleF),
    ankleB: pt(s.ankleB),
    kneeF: pt(s.kneeF),
    kneeB: pt(s.kneeB),
    head: pt(s.head.o),
    pelvis: pt(s.pelvis),
    torsoAng: [s.torso.a * 150],
    headAng: [s.head.a * 150],
    brow: [p.face.brow * 30],
    smile: [p.face.smile * 30],
    lookX: [p.face.lookX * 30],
    lookY: [p.face.lookY * 30],
    headTurn: [p.head.turn * 60],
    footF: [p.frontLeg.foot * 40],
    footB: [p.backLeg.foot * 40],
  };
  if (p.bow.mode === 'hand') {
    ch.bowRot = [p.bow.rot * 150];
    ch.draw = [p.bow.draw * 60];
  }
  if (s.nock && p.bow.arrow) ch.nock = pt(s.nock);
  return { t: a.time, ch };
}

interface Result {
  name: string;
  pop: number;
  popAt: string;
  freeze: number;
  freezeAt: string;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  notes: string[];
}

const POP_WARN = 7; // a steady walk cycle already reaches ~5, so anything clearly above that is a snap
const POP_FAIL = 12;

function analyse(name: string, frames: Frame[], from = 0, ignore: string[] = []): Result {
  const notes: string[] = [];
  let pop = 0;
  let popAt = '';
  const chans = Object.keys(frames[0].ch);
  const spikes: Array<{ m: number; label: string }> = [];
  for (const c of chans) {
    if (ignore.includes(c)) continue;
    for (let i = Math.max(2, Math.round(from / DT) + 2); i < frames.length; i++) {
      const a = frames[i - 2].ch[c];
      const b = frames[i - 1].ch[c];
      const d = frames[i].ch[c];
      if (!a || !b || !d) continue; // channel appeared / disappeared: not a motion
      let acc = 0;
      for (let k = 0; k < d.length; k++) acc += (d[k] - 2 * b[k] + a[k]) ** 2;
      acc = Math.sqrt(acc);
      spikes.push({ m: acc, label: `${c}@${frames[i].t.toFixed(2)}s` });
      if (acc > pop) {
        pop = acc;
        popAt = `${c}@${frames[i].t.toFixed(2)}s`;
      }
    }
  }
  // freezes: total motion
  const motion: number[] = [0];
  for (let i = 1; i < frames.length; i++) {
    let sum = 0;
    for (const c of chans) {
      if (ignore.includes(c)) continue;
      const a = frames[i - 1].ch[c];
      const b = frames[i].ch[c];
      if (!a || !b) continue;
      let d = 0;
      for (let k = 0; k < b.length; k++) d += (b[k] - a[k]) ** 2;
      sum += Math.sqrt(d);
    }
    motion.push(sum);
  }
  let freeze = 0;
  let freezeAt = '';
  const LOW = 0.3;
  const HIGH = 2.2;
  let i = Math.max(1, Math.round(from / DT));
  while (i < motion.length) {
    if (motion[i] < LOW) {
      let j = i;
      while (j < motion.length && motion[j] < LOW) j++;
      const len = j - i;
      const before = motion.slice(Math.max(0, i - 10), i).some((m) => m > HIGH);
      const after = motion.slice(j, j + 10).some((m) => m > HIGH);
      if (len >= 7 && before && after && len > freeze) {
        freeze = len;
        freezeAt = `${frames[i].t.toFixed(2)}s`;
      }
      i = j;
    } else i++;
  }
  let verdict: Result['verdict'] = 'PASS';
  if (pop > POP_WARN) verdict = 'WARN';
  if (pop > POP_FAIL) verdict = 'FAIL';
  if (freeze >= 7) {
    verdict = verdict === 'FAIL' ? 'FAIL' : 'WARN';
    notes.push(`stands still for ${freeze} frames (${Math.round(freeze * DT * 1000)} ms)`);
  }
  if (freeze >= 14) verdict = 'FAIL';
  spikes.sort((x, y) => y.m - x.m);
  if (pop > POP_WARN) notes.push('worst: ' + spikes.slice(0, 3).map((s) => `${s.label} ${s.m.toFixed(1)}`).join(', '));
  return { name, pop: +pop.toFixed(2), popAt, freeze, freezeAt, verdict, notes };
}

// ---------------------------------------------------------------------------------------------------------------
// scenario helpers
function hero(opts: { weapon?: 'bow' | 'sword' | 'unarmed'; quiver?: boolean } = {}) {
  const a = new Animator();
  a.external = true;
  a.hasBow = true;
  a.hasQuiver = opts.quiver ?? true;
  a.weapon = opts.weapon ?? 'bow';
  a.bounds = [-1e7, 1e7];
  return a;
}

type Script = (a: Animator, t: number) => void;
function run(name: string, setup: (a: Animator) => void, script: Script, seconds: number, from: number, a0 = hero(), ignore: string[] = []) {
  const a = a0;
  setup(a);
  const frames: Frame[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    script(a, t);
    a.update(DT);
    frames.push(sample(a));
  }
  return analyse(name, frames, from, ignore);
}

const results: Result[] = [];
const add = (r: Result) => results.push(r);

// the game's locomotion driver: walk gait while moving, idle otherwise
function drive(a: Animator, speed: number, gait: BaseState, idle: BaseState = 'idle') {
  a.driveSpeed = speed;
  if (speed > 0) a.setBase(gait);
  else a.setBase(idle);
}

// --- baselines: the gait cycles themselves (a transition may not be worse than this)
for (const [gait, sp] of [['walk', 250], ['run', 520], ['sneak', 110]] as Array<[BaseState, number]>) add(run(`baseline: steady ${gait}`, () => {}, (a) => drive(a, sp, gait), 6, 2));
add(run('baseline: steady idle-alert', () => {}, (a) => drive(a, 0, 'walk', 'idle-alert'), 6, 2));

// --- locomotion
for (const [gait, sp] of [['walk', 250], ['walk-power', 330], ['run', 520], ['sneak', 110]] as Array<[BaseState, number]>) {
  for (const idle of ['idle', 'idle-alert'] as BaseState[]) {
    add(run(`${gait} -> stop (${idle})`, () => {}, (a, t) => drive(a, t < 2.5 ? sp : 0, gait, idle), 5, 2.5));
    add(run(`stop (${idle}) -> ${gait}`, () => {}, (a, t) => drive(a, t < 2 ? 0 : sp, gait, idle), 5, 2));
  }
}
add(run('walk -> run', () => {}, (a, t) => drive(a, t < 2.5 ? 250 : 520, t < 2.5 ? 'walk' : 'run'), 5, 2.5));
add(run('run -> walk', () => {}, (a, t) => drive(a, t < 2.5 ? 520 : 250, t < 2.5 ? 'run' : 'walk'), 5, 2.5));
add(run('walk -> sneak', () => {}, (a, t) => drive(a, t < 2.5 ? 250 : 110, t < 2.5 ? 'walk' : 'sneak'), 5, 2.5));
add(run('stop-start-stop jitter', () => {}, (a, t) => drive(a, Math.floor(t / 0.7) % 2 ? 0 : 250, 'walk'), 5, 1));
add(run('run -> stop -> idle-alert (armed)', () => {}, (a, t) => drive(a, t < 2.5 ? 520 : 0, 'run', 'idle-alert'), 5, 2.5));

// --- shooting
const aimDeg = 18 * D;
function standAim(a: Animator, t: number, tStart: number) {
  if (t >= tStart) a.shootAim(aimDeg);
}
add(run('idle -> raise bow -> load', () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle-alert'); standAim(a, t, 1); }, 4, 1));
add(run('full shot (raise, load, draw, release)', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle-alert');
  standAim(a, t, 1);
  if (t > 2.6 && t < 3.8) a.shootDraw(0.4 + 0.6 * Math.min(1, (t - 2.6) / 1.0), true);
  if (Math.abs(t - 3.8) < DT / 2) a.shootRelease('aim');
}, 7, 1));
add(run('shot, reload, then fold bow', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle-alert');
  standAim(a, t, 0.5);
  if (t > 2.0 && t < 2.7) a.shootDraw(1, true);
  if (Math.abs(t - 2.7) < DT / 2) a.shootRelease('aim');
  if (t > 5.2) a.shootRecover();
}, 8, 2.7));
add(run('shot -> fold bow immediately', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle-alert');
  standAim(a, t, 0.5);
  if (t > 2.0 && t < 2.7) a.shootDraw(1, true);
  if (Math.abs(t - 2.7) < DT / 2) a.shootRelease('carry');
}, 6, 2.7));
add(run('aim -> walk away (fold while walking)', () => {}, (a, t) => {
  standAim(a, t, 0.5);
  if (t < 3) { a.driveSpeed = 0; a.setBase('idle-alert'); }
  else { a.shootRecover(); drive(a, 250, 'walk'); }
}, 6, 3));
add(run('walk -> aim (stop and raise bow)', () => {}, (a, t) => {
  if (t < 2.5) drive(a, 250, 'walk');
  else { drive(a, 0, 'walk', 'idle-alert'); a.shootAim(aimDeg); }
}, 6, 2.5));
add(run('draw cancelled (draw -> aim)', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle-alert');
  standAim(a, t, 0.5);
  if (t > 2.2 && t < 3) a.shootDraw(0.9, true);
  if (t >= 3) a.shootDraw(0, true);
}, 5, 2.2));
add(run('aim angle sweep', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle-alert');
  a.shootAim((10 + 30 * Math.min(1, Math.max(0, (t - 2) / 0.6))) * D);
}, 4, 2));

// --- weapons
for (const w of ['sword', 'unarmed'] as const) {
  add(run(`bow -> ${w}`, () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle'); if (t > 1.5) a.setWeapon(w); }, 4, 1.5));
  add(run(`${w} -> bow`, () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle'); if (t > 1.5) a.setWeapon('bow'); }, 4, 1.5, hero({ weapon: w })));
  add(run(`${w} ready toggle`, () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle'); a.weaponReady = t > 1.5 && t < 3.2; }, 5, 1.5, hero({ weapon: w })));
}
add(run('sword attack', () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle'); if (Math.abs(t - 1.5) < DT / 2) a.attack(); }, 4, 1.5, hero({ weapon: 'sword' })));
add(run('sword walk -> attack -> walk', () => {}, (a, t) => { drive(a, 250, 'walk'); if (Math.abs(t - 2) < DT / 2) a.attack(); }, 5, 2, hero({ weapon: 'sword' })));

// --- other
add(run('sit down / stand up', () => {}, (a, t) => { a.driveSpeed = 0; a.setBase(t < 1 ? 'idle' : t < 4 ? 'sit' : 'idle'); }, 7, 1));
add(run('hide / unhide', () => {}, (a, t) => { a.driveSpeed = 0; a.setBase(t < 1 ? 'idle' : t < 3.5 ? 'hide' : 'idle'); }, 6, 1));
add(run('jump from idle', () => {}, (a, t) => { a.driveSpeed = 0; a.setBase(t > 1 && t < 1.05 ? 'jump' : 'idle'); }, 4, 1));
add(run('jump while running', () => {}, (a, t) => { a.driveSpeed = 520; a.setBase(t > 2 && t < 2.05 ? 'jump' : 'run'); }, 5, 2));
for (const r of ['nod', 'shake', 'surprised', 'victory', 'celebrate', 'disappointed'] as const) {
  add(run(`reaction ${r}`, () => {}, (a, t) => { a.driveSpeed = 0; a.setBase('idle'); if (Math.abs(t - 1) < DT / 2) a.react(r); }, 6, 1));
}
add(run('face override on/off (cutscene)', () => {}, (a, t) => {
  a.driveSpeed = 0; a.setBase('idle');
  a.faceOverride = t > 1 && t < 2.5 ? { brow: 0.95, smile: 1 } : null;
}, 4, 1));

// ---------------------------------------------------------------------------------------------------------------
const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log('\nTRANSITION REVIEW  (pop = one-frame acceleration, px/frame²;  warn > ' + POP_WARN + ', fail > ' + POP_FAIL + ')');
console.log(pad('scenario', 46) + pad('pop', 7) + pad('where', 20) + pad('freeze', 8) + 'result');
for (const r of results) console.log(pad(r.name, 46) + pad(r.pop, 7) + pad(r.popAt, 20) + pad(r.freeze ? r.freeze + 'f' : '-', 8) + r.verdict + (r.notes.length ? '  – ' + r.notes.join('; ') : ''));
const fails = results.filter((r) => r.verdict === 'FAIL').length;
const warns = results.filter((r) => r.verdict === 'WARN').length;
console.log(`\n${results.length} scenarios: ${results.length - fails - warns} pass, ${warns} warn, ${fails} fail\n`);
process.exit(fails ? 1 : 0);
