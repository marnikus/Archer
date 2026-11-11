import { CFG } from './config';
import {
  PAL,
  RIG,
  DEG,
  art,
  drawArrowArt,
  drawBowItem,
  drawQuiverItem,
  drawPedestal,
  drawTarget,
  drawPine,
  drawRock,
  drawMound,
  drawSignpost,
  drawCloud,
  drawFlag,
  drawFence,
  drawStar,
  roundRectPath,
  cliffGradient,
  TARGET_RED,
  TARGET_GOLD,
  TARGET_K,
  TARGET_CENTER_UP,
  TARGET_RY_ART,
} from './art';
import { AudioSys } from './audio';
import { Animator, ATTACKS, isHide, isSit, type BaseState, type GaitKey, type Reaction } from '../rig/animator';
import { HOTKEYS } from './hotkeys';
import { drawRig, drawHatLoose, type WeaponKind } from '../rig/rig';

export type Mode = 'normal' | 'hard';
export type Phase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';
type Pose = 'idle' | 'walk' | 'aim' | 'draw' | 'release' | 'celebrate' | 'sad' | 'shake' | 'victory';

const W = CFG.world.width;
const G = CFG.world.groundY;

export interface Banner {
  text: string;
  sub?: string;
  kind: 'info' | 'good' | 'great' | 'bad' | 'final';
  key: number;
}

export interface Result {
  score: number;
  arrows: number;
  time: number;
  stars: number;
  perfects: number;
  isBest: boolean;
  won: boolean;
}

export interface Best {
  score: number;
  arrows: number;
  time: number;
}

export interface HudState {
  phase: Phase;
  mode: Mode;
  streak: number;
  goal: number;
  score: number;
  arrowsUsed: number;
  arrowsLeft: number;
  hasBow: boolean;
  hasQuiver: boolean;
  armed: boolean;
  charging: boolean;
  power: number;
  sweet: number;
  angle: number;
  wind: number;
  windMax: number;
  distance: number;
  archerX: number;
  bowX: number;
  quiverX: number;
  targetX: number;
  worldW: number;
  banner: Banner | null;
  elapsed: number;
  muted: boolean;
  touch: boolean;
  bowKey: number;
  quiverKey: number;
  pipKey: number;
  slowmo: boolean;
  result: Result | null;
  best: Best | null;
  weapon: WeaponKind;
  weaponReady: boolean;
  stance: string;
}

interface Arrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  state: 'fly' | 'stuck';
  stick: { kind: 'ground' | 'target' | 'wall' | 'stand'; ox: number; oy: number; rot: number } | null;
  t: number;
  trail: number[];
  dist: number;
  final: boolean;
  closeCalled: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  shape: 'c' | 'r' | 's' | 'ring';
  rot: number;
  vr: number;
  g: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

interface Pickup {
  kind: 'bow' | 'quiver';
  x: number;
  collected: boolean;
  fly: number;
  fx: number;
  fy: number;
  phase: number;
}

interface Archer {
  x: number;
  y: number;
  facing: -1 | 1;
  pose: Pose;
  poseT: number;
  walkPhase: number;
  stepFlag: number;
  blinkT: number;
  blinkNext: number;
  armFront: number;
  armBack: number;
  bowRot: number;
  drawVis: number;
  across: number;
  hasBow: boolean;
  hasQuiver: boolean;
  angle: number;
  charging: boolean;
  power: number;
  meterDir: number;
  victory: boolean;
  firedOnce: boolean;
  hintUnarmedT: number;
  pickupT: number;
  attackT: number;
}

interface TargetState {
  x: number;
  scale: number;
  goalScale: number;
  platform: number;
  platformVis: number;
  moving: boolean;
  moveAmp: number;
  movePhase: number;
  movePeriod: number;
  moveOff: number;
  golden: boolean;
  wobble: number;
  wobbleVel: number;
  flash: number;
}

interface Decor {
  kind: 'pine' | 'rock' | 'mound';
  x: number;
  s: number;
  c: string;
}

const lerpRate = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export class Game {
  phase: Phase = 'title';
  mode: Mode = 'normal';
  audio: AudioSys;
  time = 0;
  elapsed = 0;
  timeScale = 1;
  slowT = 0;
  slowScale = 1;
  score = 0;
  streak = 0;
  arrowsUsed = 0;
  arrowsLeft = Infinity;
  perfects = 0;
  archer!: Archer;
  pickups: Pickup[] = [];
  target!: TargetState;
  wind = { cur: 0, goal: 0, max: 0, gust: false, gustT: 0 };
  arrows: Arrow[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  cam = { x: 0, y: 400, zoom: 1, impactT: 0, impactZoom: 0.9 };
  snow: Array<{ x: number; y: number; r: number; v: number; ph: number; a: number }> = [];
  clouds: Array<{ x: number; y: number; r: number; v: number; a: number }> = [];
  decor: Decor[] = [];
  keys = { left: false, right: false, up: false, down: false };
  keyHold = { up: 0, down: 0 };
  spaceDown = false;
  touchMove = 0;
  touchAim = { active: false, sx: 0, sy: 0 };
  isTouch = false;
  banner: Banner | null = null;
  bannerT = 0;
  bannerKey = 0;
  hintText = '';
  hintT = 99;
  hintLast = '';
  bowKey = 0;
  quiverKey = 0;
  pipKey = 0;
  victoryT = -1;
  gameoverT = -1;
  result: Result | null = null;
  best: Best | null = null;
  vp = { w: 1000, h: 800, dpr: 1, base: 1, s: 1 };
  onPhase: ((p: Phase) => void) | null = null;
  startArrowVisible = true;

  /** Layered paper-rig animator (shared with the Animation Test Lab). */
  anim: Animator;
  private lastAnimPose: Pose = 'idle';
  /** Demo animation playing on the game character (cancelled by gameplay input). */
  private animDemo: { name: string; fired: boolean } | null = null;

  private makeAnim() {
    const an = new Animator();
    an.external = true;
    an.params.carryMode = 'slung';
    an.onStep = (foot) => {
      if (this.phase === 'playing') this.audio.footstep(foot === 'front');
    };
    an.onEvent = (e) => this.onAnimEvent(e);
    return an;
  }

  constructor(audio: AudioSys) {
    this.audio = audio;
    this.anim = this.makeAnim();
    this.isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    this.buildDecor();
    for (let i = 0; i < 70; i++) {
      this.snow.push({
        x: Math.random(),
        y: Math.random(),
        r: 1.5 + Math.random() * 2.5,
        v: 0.02 + Math.random() * 0.045,
        ph: Math.random() * Math.PI * 2,
        a: 0.5 + Math.random() * 0.5,
      });
    }
    for (let i = 0; i < 14; i++) {
      this.clouds.push({
        x: -2200 + Math.random() * 5400,
        y: -500 + Math.random() * 640,
        r: 40 + Math.random() * 60,
        v: 4 + Math.random() * 8,
        a: 0.55 + Math.random() * 0.4,
      });
    }
    this.resetWorld();
    this.best = this.loadBest();
    this.cam.x = CFG.archer.startX + 60;
    this.cam.y = 400;
    this.cam.zoom = 1;
  }

  // ------------------------------------------------------------------ setup
  private buildDecor() {
    const d: Decor[] = [];
    const pines = [
      [3960, 150],
      [3160, 120],
      [2240, 140],
      [1040, 110],
      [610, 130],
      [3420, 95],
      [2060, 100],
      [1130, 85],
      [2580, 105],
    ];
    for (const [x, s] of pines) d.push({ kind: 'pine', x, s, c: hash(x) > 0.5 ? '#BBD0EF' : '#C7D8F2' });
    const rocks = [
      [3380, 70],
      [2620, 90],
      [1920, 60],
      [1160, 80],
      [470, 70],
      [3040, 50],
      [2400, 55],
      [1550, 65],
    ];
    for (const [x, s] of rocks) d.push({ kind: 'rock', x, s, c: hash(x * 3) > 0.5 ? PAL.groundDark : '#DCDFEF' });
    for (let x = 100; x < W + 400; x += 260) d.push({ kind: 'mound', x: x + hash(x) * 120, s: 160 + hash(x + 1) * 200, c: '#F5F6FB' });
    this.decor = d;
  }

  private loadBest(): Best | null {
    try {
      const raw = localStorage.getItem('als-best-' + this.mode);
      return raw ? (JSON.parse(raw) as Best) : null;
    } catch {
      return null;
    }
  }

  private saveBest(b: Best) {
    try {
      localStorage.setItem('als-best-' + this.mode, JSON.stringify(b));
    } catch {
      /* ignore */
    }
  }

  resetWorld() {
    this.archer = {
      x: CFG.archer.startX,
      y: G,
      facing: -1,
      pose: 'idle',
      poseT: 0,
      walkPhase: 0,
      stepFlag: 0,
      blinkT: 0,
      blinkNext: 2 + Math.random() * 3,
      armFront: RIG.ARM_REST_FRONT,
      armBack: RIG.ARM_REST_BACK,
      bowRot: 0,
      drawVis: 0,
      across: 0,
      hasBow: false,
      hasQuiver: false,
      angle: 40,
      charging: false,
      power: 0,
      meterDir: 1,
      victory: false,
      firedOnce: false,
      hintUnarmedT: 0,
      pickupT: 0,
      attackT: 0,
    };
    this.anim = this.makeAnim();
    this.lastAnimPose = 'idle';
    this.animDemo = null;
    this.weapon = 'unarmed';
    this.weaponReady = false;
    this.hold = null;
    this.peekDir = null;
    this.moveMode = 'normal';
    this.walkStyle = 'auto';
    this.autoWalk = null;
    this.runHeld = false;
    this.hintMsg = '';
    this.pickups = [
      { kind: 'bow', x: CFG.bow.x, collected: false, fly: 0, fx: 0, fy: 0, phase: 0 },
      { kind: 'quiver', x: CFG.quiver.x, collected: false, fly: 0, fx: 0, fy: 0, phase: 1.7 },
    ];
    this.target = {
      x: CFG.target.x,
      scale: 1,
      goalScale: 1,
      platform: 0,
      platformVis: 0,
      moving: false,
      moveAmp: 0,
      movePhase: 0,
      movePeriod: 3.4,
      moveOff: 0,
      golden: false,
      wobble: 0,
      wobbleVel: 0,
      flash: 0,
    };
    this.wind = { cur: 0, goal: 0, max: 0, gust: false, gustT: 0 };
    this.arrows = [];
    this.particles = [];
    this.floats = [];
    this.score = 0;
    this.streak = 0;
    this.arrowsUsed = 0;
    this.arrowsLeft = this.mode === 'hard' ? CFG.hard.arrows : Infinity;
    this.perfects = 0;
    this.elapsed = 0;
    this.time = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.banner = null;
    this.hintLast = '';
    this.hintText = '';
    this.hintT = 99;
    this.victoryT = -1;
    this.gameoverT = -1;
    this.result = null;
    this.startArrowVisible = true;
    this.cam.impactT = 0;
    this.keys = { left: false, right: false, up: false, down: false };
    this.touchMove = 0;
    this.touchAim.active = false;
    this.audio.setLayers(0);
    this.audio.duck(false);
    this.audio.creakStop();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.onPhase?.(p);
  }

  start(mode: Mode) {
    this.mode = mode;
    this.best = this.loadBest();
    this.resetWorld();
    this.audio.unlock();
    this.audio.musicStart();
    this.setPhase('playing');
  }

  restart() {
    this.start(this.mode);
  }

  toTitle() {
    this.resetWorld();
    this.audio.musicStop();
    this.cam.x = CFG.archer.startX + 60;
    this.cam.y = 400;
    this.cam.zoom = 1;
    this.setPhase('title');
  }

  togglePause() {
    if (this.phase === 'playing') {
      this.setPhase('paused');
      this.audio.creakStop();
    } else if (this.phase === 'paused') {
      this.setPhase('playing');
      if (this.archer.charging && !this.spaceDown && !this.touchAim.active) this.cancelCharge();
      else if (this.archer.charging) this.audio.creakStart();
    }
  }

  // ------------------------------------------------------------------ input
  setKey(k: keyof Game['keys'], down: boolean) {
    this.keys[k] = down;
    if (down && (k === 'up' || k === 'down')) {
      this.keyHold[k] = 0;
      if (this.phase === 'playing' && this.armed()) {
        this.archer.angle = clamp(this.archer.angle + (k === 'up' ? 1 : -1), CFG.shot.angleMin, CFG.shot.angleMax);
      }
    }
  }

  armed() {
    return this.archer.hasBow && this.archer.hasQuiver && this.weapon === 'bow';
  }

  canShootMore() {
    return this.mode === 'hard' ? this.arrowsLeft > 0 : true;
  }

  pressFire() {
    this.spaceDown = true;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.victory || a.charging) return;
    if (!this.armed()) {
      a.pose = 'shake';
      a.poseT = 0;
      a.hintUnarmedT = 1.6;
      this.hintMsg = a.hasBow && a.hasQuiver ? 'Press 1 to take out your bow' : '';
      this.audio.shake();
      return;
    }
    if (this.hold) {
      // stand up / come out of hiding first; press again to shoot
      this.hold = null;
      this.peekDir = null;
      return;
    }
    if (a.pose === 'walk' || !this.canShootMore() || this.arrowInFlight() || a.attackT > 0 || this.anim.seq) return;
    this.beginCharge();
  }

  arrowInFlight() {
    return this.arrows.some((ar) => ar.state === 'fly');
  }

  private beginCharge() {
    const a = this.archer;
    this.hold = null;
    this.peekDir = null;
    a.charging = true;
    a.power = 0;
    a.meterDir = 1;
    a.pose = 'draw';
    a.poseT = 0;
    a.facing = -1;
    this.audio.creakStart();
  }

  private cancelCharge() {
    const a = this.archer;
    a.charging = false;
    a.power = 0;
    this.touchAim.active = false;
    if (a.pose === 'draw') a.pose = 'aim';
    this.audio.creakStop();
    this.anim.shootAim();
  }

  releaseFire() {
    this.spaceDown = false;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.charging && !this.touchAim.active) this.fire(a.power / 100);
  }

  touchAimStart(px: number, py: number) {
    this.isTouch = true;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.victory || a.charging) return;
    if (!this.armed()) {
      this.pressFire();
      this.spaceDown = false;
      return;
    }
    if (a.pose === 'walk' || !this.canShootMore() || this.arrowInFlight()) return;
    this.touchAim = { active: true, sx: px, sy: py };
    this.beginCharge();
  }

  touchAimMove(px: number, py: number) {
    if (!this.touchAim.active || !this.archer.charging) return;
    const dx = this.touchAim.sx - px;
    const dy = this.touchAim.sy - py;
    const len = Math.hypot(dx, dy);
    const ang = (Math.atan2(-dy, Math.max(0.001, -dx)) * 180) / Math.PI;
    this.archer.angle = clamp(ang, CFG.shot.angleMin, CFG.shot.angleMax);
    this.archer.power = clamp(len / 200, 0, 1) * 100;
  }

  touchAimEnd() {
    if (!this.touchAim.active) return;
    const a = this.archer;
    this.touchAim.active = false;
    if (a.charging) {
      if (a.power > 4) this.fire(a.power / 100);
      else this.cancelCharge();
    }
  }

  setTouchMove(dir: number) {
    this.touchMove = dir;
  }

  // ------------------------------------------------------------------ helpers
  private showBanner(text: string, kind: Banner['kind'], sub?: string) {
    this.banner = { text, kind, sub, key: ++this.bannerKey };
    this.bannerT = 0;
  }

  private addFloat(x: number, y: number, text: string, color: string, size = 34) {
    this.floats.push({ x, y, text, color, life: 0, max: 1.4, size });
  }

  private burst(x: number, y: number, n: number, colors: string[], speed: number, shape: Particle['shape'] = 'c', g = 600) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - speed * 0.3,
        life: 0,
        max: 0.6 + Math.random() * 0.6,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 5 + Math.random() * 7,
        shape,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        g,
      });
    }
  }

  private ring(x: number, y: number, color: string, size: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.6, color, size, shape: 'ring', rot: 0, vr: 0, g: 0 });
  }

  private confetti(x: number, y: number, n: number) {
    const cols = [PAL.red, PAL.orange2, '#FFFFFF', PAL.gold, PAL.orange, '#CADBF5'];
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 500,
        y: y - Math.random() * 300,
        vx: (Math.random() - 0.5) * 300,
        vy: -200 - Math.random() * 300,
        life: 0,
        max: 2 + Math.random() * 1.5,
        color: cols[Math.floor(Math.random() * cols.length)],
        size: 8 + Math.random() * 8,
        shape: 'r',
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        g: 350,
      });
    }
  }

  faceCy() {
    return this.baseY() - TARGET_CENTER_UP * TARGET_K * this.target.scale;
  }
  baseY() {
    const T = this.target;
    return G - CFG.target.standLift - T.platformVis - T.moveOff;
  }
  faceRy() {
    return TARGET_RY_ART * TARGET_K * this.target.scale;
  }

  /** Launch point: arrow tip when the string is at rest, for the exact aim angle (independent of draw). */
  private launchPoint() {
    const a = this.archer;
    const tip = this.anim.launchTip(a.angle * DEG);
    return { x: a.x + tip.x, y: a.y + tip.y + this.anim.pose.y };
  }

  /** Power (0-100) needed to hit the target centre at the current angle, ignoring wind. -1 if unreachable. */
  sweetSpot(): number {
    if (this.mode === 'hard' || !this.armed()) return -1;
    const tip = this.launchPoint();
    const th = this.archer.angle * DEG;
    const dx = tip.x - this.target.x;
    const dy = this.faceCy() - tip.y;
    const D = dy + dx * Math.tan(th);
    if (D <= 0 || dx <= 0) return -1;
    const v2 = (CFG.shot.gravity * dx * dx) / (2 * Math.cos(th) * Math.cos(th) * D);
    const v = Math.sqrt(v2);
    const p = ((v - CFG.shot.speedMin) / (CFG.shot.speedMax - CFG.shot.speedMin)) * 100;
    if (p < 0 || p > 100) return -1;
    return p;
  }

  // ------------------------------------------------------------------ game actions
  private fire(power01: number) {
    const a = this.archer;
    const th = a.angle * DEG;
    const v = CFG.shot.speedMin + (CFG.shot.speedMax - CFG.shot.speedMin) * power01;
    const tip = this.launchPoint();
    const arrow: Arrow = {
      x: tip.x,
      y: tip.y,
      vx: -v * Math.cos(th),
      vy: -v * Math.sin(th),
      rot: Math.atan2(-Math.sin(th), -Math.cos(th)),
      state: 'fly',
      stick: null,
      t: 0,
      trail: [],
      dist: a.x - this.target.x,
      final: this.streak === CFG.streakGoal - 1,
      closeCalled: false,
    };
    this.arrows.push(arrow);
    this.arrowsUsed++;
    if (this.mode === 'hard') this.arrowsLeft--;
    a.charging = false;
    a.power = 0;
    a.pose = 'release';
    a.poseT = 0;
    a.firedOnce = true;
    this.anim.shootRelease('aim');
    this.touchAim.active = false;
    this.audio.creakStop();
    this.audio.twang(power01);
    this.audio.whoosh();
    if (arrow.final) {
      this.showBanner('FINAL SHOT!', 'final', 'Make it count');
      this.audio.duck(true);
    }
  }

  private collect(p: Pickup) {
    p.collected = true;
    p.fly = 0;
    p.fx = p.x;
    p.fy = G - 90;
    this.audio.pickup();
    this.burst(p.x, G - 90, 14, ['#FFFFFF', '#FFF4D6', '#CADBF5'], 260, 's', 200);
    this.ring(p.x, G - 90, '#FFFFFF', 60);
    // physical pickup: stop, face the item, reach down, lift and attach
    const a = this.archer;
    if (a.charging) this.cancelCharge();
    a.facing = p.x < a.x ? -1 : 1;
    a.pickupT = p.kind === 'quiver' ? 2.15 : 1.95;
    if (a.pose === 'walk') {
      a.pose = this.armed() ? 'aim' : 'idle';
      a.poseT = 0;
    }
    this.anim.pickup(p.kind);
  }

  private onAnimEvent(e: string) {
    const [what, kind] = e.split(':');
    if (what === 'attack-start') {
      this.audio.whoosh();
      return;
    }
    if (what === 'attack-hit') {
      const t = this.weaponTip();
      const steel = kind === 'sword' || kind === 'axe' || kind === 'spear';
      this.burst(t.x, t.y, kind === 'unarmed' ? 8 : 16, steel ? ['#FFFFFF', '#CDD6E6', PAL.gold] : ['#FFFFFF', PAL.orange2, PAL.gold], 360, 's', 300);
      this.ring(t.x, t.y, '#FFFFFF', kind === 'unarmed' ? 40 : 70);
      if (kind === 'crossbow') this.audio.twang(0.8);
      else this.audio.pop();
      return;
    }
    if (what === 'detach' && kind === 'bow') {
      this.archer.hasBow = false;
      if (this.weapon === 'bow') this.weapon = 'unarmed';
      this.dropPickup('bow');
      return;
    }
    if (what === 'detach' && kind === 'quiver') {
      this.archer.hasQuiver = false;
      return;
    }
    if (what === 'seq-end' && (kind === 'pickup-bow' || kind === 'pickup-quiver')) {
      if (this.armed()) this.anim.armedReady();
      return;
    }
    if (what === 'seq-end' && kind === 'unequip-quiver') {
      this.dropPickup('quiver');
      return;
    }
    if (kind !== 'bow' && kind !== 'quiver') return;
    const p = this.pickups.find((q) => q.kind === kind && q.collected);
    if (!p) return;
    if (what === 'grab') p.fly = 1;
    if (what === 'attach' && !(kind === 'bow' ? this.archer.hasBow : this.archer.hasQuiver)) {
      p.fly = 1;
      this.onAttach(p);
    }
  }

  private onAttach(p: Pickup) {
    const a = this.archer;
    if (p.kind === 'bow') {
      a.hasBow = true;
      this.bowKey++;
      this.addFloat(a.x, a.y - 540, 'Bow acquired!', PAL.orange, 32);
    } else {
      a.hasQuiver = true;
      this.quiverKey++;
      this.addFloat(a.x, a.y - 540, 'Arrows acquired!', PAL.orange, 32);
    }
    if (p.kind === 'bow' || (this.weapon === 'unarmed' && a.hasBow)) this.weapon = 'bow';
    this.audio.pop();
    this.ring(a.x, a.y - 250, '#FFFFFF', 90);
    if (this.armed()) {
      this.showBanner('ARMED!', 'good', this.isTouch ? 'Drag back on the right side to shoot' : 'Hold SPACE to draw · ↑↓ to aim');
      this.audio.armed();
      if (a.pose === 'idle') a.pose = 'aim';
      this.burst(a.x, a.y - 250, 24, [PAL.red, PAL.orange2, '#FFFFFF', PAL.gold], 380, 's', 500);
    }
  }

  private setupStage(streak: number) {
    const T = this.target;
    const shot = streak + 1;
    const hard = this.mode === 'hard';
    T.goalScale = shot >= 10 ? 0.6 : shot >= 6 ? 0.75 : 1;
    T.golden = shot >= 10;
    T.moving = shot >= 8;
    T.moveAmp = shot >= 10 ? 150 : 120;
    T.movePeriod = shot >= 10 ? 2.6 : 3.4;
    if (!T.moving) T.movePhase = 0;
    if (shot >= 2) {
      const opts = [0, 90, 180, 260].filter((v) => v !== T.platform);
      T.platform = opts[Math.floor(Math.random() * opts.length)];
    } else T.platform = 0;
    const wm = hard ? CFG.hard.windMul : 1;
    if (shot >= CFG.wind.startAtHit) {
      this.wind.max = (shot >= 10 ? 60 : shot >= 9 ? CFG.wind.max : shot >= 6 ? 90 : 50) * wm;
      this.wind.gust = shot === 9;
      const sign = Math.random() < 0.5 ? -1 : 1;
      this.wind.goal = sign * this.wind.max * (0.45 + 0.55 * Math.random());
      this.wind.gustT = 1.5;
    } else {
      this.wind.max = 0;
      this.wind.goal = 0;
      this.wind.gust = false;
    }
  }

  private onHit(arrow: Arrow, dyc: number) {
    const ry = this.faceRy();
    const f = Math.abs(dyc) / ry;
    const zone = f <= 0.17 ? 3 : f <= 0.4 ? 2 : f <= 0.7 ? 1 : 0;
    const ringPts = [50, 100, 150, 300][zone];
    this.streak++;
    this.pipKey++;
    const mult = 1 + 0.1 * this.streak;
    const bonus = Math.round(arrow.dist / 10);
    const pts = Math.round(ringPts * mult) + bonus;
    this.score += pts;
    const T = this.target;
    const cy = this.faceCy();
    const px = T.x;
    const py = cy + dyc;
    if (zone === 3) {
      this.perfects++;
      this.addFloat(px, py - 90, `+${pts} PERFECT!`, PAL.gold, 40);
      this.burst(px, py, 26, [PAL.gold, PAL.red, PAL.orange2, '#FFFFFF'], 420, 's');
      this.ring(px, py, PAL.gold, 140);
      this.audio.chime();
      this.slowT = 0.55;
      this.slowScale = 0.3;
      this.cam.impactT = 1.3;
      this.cam.impactZoom = 1.1;
    } else {
      this.addFloat(px, py - 90, `+${pts}`, zone >= 1 ? PAL.red : PAL.grey, 36);
      this.burst(px, py, 14, [PAL.red, PAL.orange2, '#FFFFFF'], 320, 'c');
      this.ring(px, py, '#FFFFFF', 100);
      this.cam.impactT = 0.9;
      this.cam.impactZoom = 0.9;
    }
    this.audio.thud();
    this.audio.score(zone);
    T.wobbleVel = -2.4 * (0.6 + 0.4 * Math.max(0, (ry - dyc) / (2 * ry)));
    T.flash = 0.8;
    const a = this.archer;
    a.pose = 'celebrate';
    a.poseT = 0;
    if (this.streak >= CFG.streakGoal) {
      this.win();
      return;
    }
    if (this.streak === 3 || this.streak === 5 || this.streak === 7) {
      this.showBanner(`STREAK ×${this.streak}!`, 'great', this.streak === 3 ? 'Keep it up' : this.streak === 5 ? 'Halfway there' : 'Almost!');
      this.audio.streak();
    } else if (this.streak === 9) {
      this.showBanner('ONE MORE!', 'final', 'Golden target incoming');
      this.audio.streak();
    } else if (this.streak >= 2) {
      this.addFloat(a.x, a.y - 470, `Streak x${this.streak}`, PAL.orange, 30);
    }
    this.audio.setLayers(this.streak >= 7 ? 3 : this.streak >= 5 ? 2 : this.streak >= 3 ? 1 : 0);
    this.setupStage(this.streak);
    if (this.mode === 'hard' && this.arrowsLeft <= 0) this.gameoverT = 0;
  }

  private onMiss(arrow: Arrow, x: number, y: number) {
    const a = this.archer;
    if (this.streak > 0) {
      this.addFloat(x, y - 60, 'MISS', PAL.grey, 36);
      this.addFloat(a.x, a.y - 470, `Streak lost (${this.streak})`, PAL.grey, 28);
      this.streak = 0;
      this.pipKey++;
      this.audio.womp();
      this.audio.setLayers(0);
      this.setupStage(0);
    } else {
      this.addFloat(x, y - 60, 'MISS', PAL.grey, 34);
      this.audio.womp();
    }
    if (arrow.final) this.audio.duck(false);
    a.pose = 'sad';
    a.poseT = 0;
    if (this.mode === 'hard' && this.arrowsLeft <= 0) this.gameoverT = 0;
  }

  private win() {
    const a = this.archer;
    a.victory = true;
    a.pose = 'victory';
    this.victoryT = 0;
    this.slowT = 0;
    this.showBanner('YOU DID IT!', 'great', '10 in a row');
    this.audio.duck(false);
    this.audio.setLayers(3);
    this.audio.fanfare();
    this.confetti(a.x, a.y - 400, 120);
    this.confetti(this.target.x, this.faceCy() - 200, 50);
    this.addFloat(a.x, a.y - 480, 'VICTORY!', PAL.gold, 48);
  }

  private finishRun(won: boolean) {
    const stars = won ? (this.arrowsUsed <= 12 ? 3 : this.arrowsUsed <= 20 ? 2 : 1) : 0;
    const prev = this.best;
    const isBest = won && (!prev || this.score > prev.score);
    if (isBest) {
      this.best = { score: this.score, arrows: this.arrowsUsed, time: this.elapsed };
      this.saveBest(this.best);
    }
    this.result = { score: this.score, arrows: this.arrowsUsed, time: this.elapsed, stars, perfects: this.perfects, isBest, won };
    this.setPhase(won ? 'victory' : 'gameover');
  }

  // ------------------------------------------------------------------ update
  update(dtr: number) {
    dtr = Math.min(dtr, 0.05);
    this.updateSnow(dtr);
    if (this.phase === 'paused') return;
    if (this.slowT > 0) {
      this.slowT -= dtr;
      this.timeScale = lerpRate(this.timeScale, this.slowScale, 12, dtr);
    } else this.timeScale = lerpRate(this.timeScale, 1, 8, dtr);
    const dt = dtr * this.timeScale;
    this.time += dt;
    if (this.phase === 'playing' && !this.archer.victory) this.elapsed += dtr;
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > 3400) c.x = -2400;
    }
    if (this.phase === 'title') {
      this.updateArcherIdle(dt);
      this.driveAnim(dt);
      this.updateCamera(dtr);
      return;
    }
    this.updateArcher(dt);
    this.driveAnim(dt);
    this.updatePickups(dt);
    this.updateTarget(dt);
    this.updateWind(dt);
    this.updateArrows(dt);
    this.updateFx(dt);
    this.updateCamera(dtr);
    if (this.banner) {
      this.bannerT += dtr;
      if (this.bannerT > 2.6) this.banner = null;
    }
    this.updateHint(dtr);
    if (this.victoryT >= 0) {
      this.victoryT += dtr;
      if (Math.random() < dtr * 10) this.confetti(this.archer.x, this.archer.y - 500, 3);
      if (this.victoryT > 3 && this.phase === 'playing') this.finishRun(true);
    }
    if (this.gameoverT >= 0 && !this.archer.victory) {
      this.gameoverT += dtr;
      if (this.gameoverT > 1.6 && this.phase === 'playing' && !this.arrows.some((ar) => ar.state === 'fly')) {
        this.audio.gameOver();
        this.finishRun(false);
      }
    }
  }

  private updateSnow(dt: number) {
    for (const f of this.snow) {
      f.y += f.v * dt;
      f.x += Math.sin(this.time * 1.3 + f.ph) * 0.012 * dt;
      if (f.y > 1.02) {
        f.y = -0.02;
        f.x = Math.random();
      }
      if (f.x > 1.02) f.x = -0.02;
      if (f.x < -0.02) f.x = 1.02;
    }
  }

  // ================================================================== animation control
  /** Equipped weapon (the bow needs the pickup first). */
  weapon: WeaponKind = 'unarmed';
  weaponReady = false;
  /** Sustained stand-still state chosen with the hotkeys (sit, hide, idle style…). Walking clears it. */
  private hold: BaseState | null = null;
  private peekDir: 'left' | 'right' | null = null;
  private moveMode: 'normal' | 'sneak' | 'creep' = 'normal';
  private walkStyle: 'auto' | GaitKey = 'auto';
  private runHeld = false;
  private autoWalk: { x: number; then: () => void } | null = null;
  private hintMsg = '';

  private static readonly GAIT_SPEED: Record<string, number> = {
    'walk-casual': 190, walk: 250, 'walk-power': 330, 'walk-brisk': 280, 'walk-tired': 150, run: 520, sneak: 110, creep: 55,
  };
  private static readonly WALK_STYLES: Array<'auto' | GaitKey> = ['auto', 'walk-casual', 'walk', 'walk-power', 'walk-brisk', 'walk-tired'];
  private static readonly HOLD_STATES = ['idle', 'idle-alert', 'idle-tired', 'idle-bored', 'idle-armed', 'sit', 'sit-look', 'sit-shift', 'hide', 'hide-idle', 'peek-left', 'peek-right'];
  private static readonly TIP_LEN: Partial<Record<WeaponKind, number>> = { unarmed: 50, sword: 190, spear: 340, staff: 300, axe: 150, crossbow: 150 };
  private static readonly STYLE_LABEL: Record<string, string> = {
    auto: 'Default walk', 'walk-casual': 'Casual walk', walk: 'Normal walk', 'walk-power': 'Power walk', 'walk-brisk': 'Brisk walk', 'walk-tired': 'Tired walk',
    sit: 'Sit', 'sit-look': 'Sit · look around', 'sit-shift': 'Sit · shift weight', hide: 'Hide', 'hide-idle': 'Hide · idle',
    idle: 'Idle · neutral', 'idle-alert': 'Idle · alert', 'idle-tired': 'Idle · tired', 'idle-bored': 'Idle · bored', 'idle-armed': 'Idle · armed',
  };

  private gait(): GaitKey {
    if (this.runHeld) return 'run';
    if (this.moveMode !== 'normal') return this.moveMode;
    if (this.walkStyle !== 'auto') return this.walkStyle;
    return this.armed() ? 'walk-brisk' : 'walk';
  }

  private moveSpeed() {
    if (!this.runHeld && this.moveMode === 'normal' && this.walkStyle === 'auto') return CFG.archer.walkSpeed;
    return Game.GAIT_SPEED[this.gait()];
  }

  /** Short label for the HUD describing the active stance / gait modifiers. */
  private stanceLabel() {
    const parts: string[] = [];
    if (this.hold) parts.push(Game.STYLE_LABEL[this.hold] ?? this.hold);
    if (this.runHeld) parts.push('Run');
    else if (this.moveMode !== 'normal') parts.push(this.moveMode === 'sneak' ? 'Sneak' : 'Creep');
    else if (this.walkStyle !== 'auto') parts.push(Game.STYLE_LABEL[this.walkStyle]);
    return parts.join(' · ');
  }

  private say(text: string) {
    const a = this.archer;
    this.addFloat(a.x, a.y - 560, text, PAL.orange, 26);
  }

  /** True when a player-triggered animation may start right now. */
  private canAct() {
    const a = this.archer;
    return this.phase === 'playing' && !a.victory && a.pickupT <= 0 && a.attackT <= 0 && !this.anim.seq && !this.anim.attacking;
  }

  private beginAction() {
    if (this.archer.charging) this.cancelCharge();
    this.autoWalk = null;
  }

  // ---- hotkeys ---------------------------------------------------------
  /** Returns true when the key was consumed. */
  hotkeyDown(code: string): boolean {
    if (code === 'ShiftLeft' || code === 'ShiftRight') {
      this.runHeld = true;
      return false; // do not swallow Shift
    }
    const hk = HOTKEYS.find((h) => h.code === code);
    if (!hk) return false;
    if (hk.action === 'help' || hk.action === 'shoot' || hk.action === 'pause' || hk.action === 'mute') return false;
    if (this.phase !== 'playing') return false;
    this.runAction(hk.action);
    return true;
  }

  hotkeyUp(code: string) {
    if (code === 'ShiftLeft' || code === 'ShiftRight') this.runHeld = false;
    if ((code === 'KeyQ' && this.peekDir === 'left') || (code === 'KeyE' && this.peekDir === 'right')) this.peekDir = null;
  }

  releaseAllKeys() {
    this.runHeld = false;
    this.peekDir = null;
  }

  runAction(action: string) {
    const [kind, arg] = action.split(':');
    switch (kind) {
      case 'play':
        this.playAnim(arg);
        break;
      case 'equip':
        this.equip(arg as WeaponKind);
        break;
      case 'ready':
        this.toggleReady();
        break;
      case 'attack':
        this.attack();
        break;
      case 'cycle':
        this.cycle(arg);
        break;
      case 'peek':
        this.peek(arg as 'left' | 'right');
        break;
      case 'hat':
        this.hatAction(arg);
        break;
      case 'drop':
        this.dropItem(arg as 'bow' | 'quiver');
        break;
    }
  }

  // ---- inventory -------------------------------------------------------
  equip(kind: WeaponKind) {
    const a = this.archer;
    if (this.phase !== 'playing' || a.victory || a.pickupT > 0 || this.anim.seq) return;
    if (kind === 'bow' && !a.hasBow) {
      this.say('Find the bow first');
      return;
    }
    if (kind === this.weapon) return;
    this.beginAction();
    this.animDemo = null;
    this.hold = null;
    this.peekDir = null;
    this.weapon = kind;
    this.weaponReady = false;
    if (a.pose === 'aim' || a.pose === 'draw') a.pose = 'idle';
    if (kind === 'bow') {
      a.facing = -1;
      if (this.armed()) a.pose = 'aim';
    }
    this.audio.pop();
    this.say(kind === 'unarmed' ? 'Hands free' : kind[0].toUpperCase() + kind.slice(1));
  }

  private toggleReady() {
    if (!this.canAct()) return;
    if (this.weapon === 'bow' || this.weapon === 'unarmed') return;
    this.weaponReady = !this.weaponReady;
    this.say(this.weaponReady ? 'Ready' : 'Carry');
  }

  attack() {
    const a = this.archer;
    if (this.phase !== 'playing' || a.victory || a.pickupT > 0 || a.attackT > 0 || a.charging) return;
    if (this.weapon === 'bow') {
      this.say(a.hasQuiver ? 'Hold SPACE to shoot' : 'No arrows yet');
      return;
    }
    if (this.hold && isSit(this.hold)) {
      this.hold = null; // stand up first
      return;
    }
    if (this.anim.seq || this.anim.attacking) return;
    this.hold = null;
    this.peekDir = null;
    this.autoWalk = null;
    this.animDemo = null;
    this.driveAnimInputs();
    if (this.anim.attack()) a.attackT = ATTACKS[this.weapon]?.dur ?? 0.8;
  }

  private dropItem(kind: 'bow' | 'quiver') {
    const a = this.archer;
    if (!this.canAct()) return;
    if (kind === 'bow') {
      if (!a.hasBow) return;
      if (this.weapon !== 'bow') {
        this.say('Take out the bow first (1)');
        return;
      }
    } else if (!a.hasQuiver) return;
    if (this.weapon !== 'bow' && this.weapon !== 'unarmed') {
      this.say('Put the weapon away first (0)');
      return;
    }
    this.beginAction();
    this.hold = null;
    this.peekDir = null;
    this.animDemo = null;
    this.driveAnimInputs();
    this.anim.unequip(kind);
  }

  /** The unequip animation finished: leave the item on the ground in front of the archer. */
  private dropPickup(kind: 'bow' | 'quiver') {
    const a = this.archer;
    const p = this.pickups.find((q) => q.kind === kind);
    if (!p) return;
    const reach = kind === 'bow' ? 128 : 112;
    p.x = clamp(a.x + (a.facing === -1 ? -reach : reach), CFG.archer.minX + 40, CFG.archer.maxX);
    p.collected = false;
    p.fly = 0;
  }

  // ---- stances / styles ------------------------------------------------
  private static nextIn<T>(list: T[], cur: T | null): T | null {
    const i = cur === null ? -1 : list.indexOf(cur);
    if (i < 0) return list[0];
    return i + 1 < list.length ? list[i + 1] : null;
  }

  private cycle(what: string) {
    if (!this.canAct()) return;
    this.beginAction();
    this.peekDir = null;
    switch (what) {
      case 'move':
        this.moveMode = this.moveMode === 'normal' ? 'sneak' : this.moveMode === 'sneak' ? 'creep' : 'normal';
        this.say(this.moveMode === 'normal' ? 'Normal pace' : this.moveMode === 'sneak' ? 'Sneaking' : 'Creeping');
        break;
      case 'walk': {
        const i = Game.WALK_STYLES.indexOf(this.walkStyle);
        this.walkStyle = Game.WALK_STYLES[(i + 1) % Game.WALK_STYLES.length];
        this.say(Game.STYLE_LABEL[this.walkStyle]);
        break;
      }
      case 'sit':
        this.hold = Game.nextIn(['sit', 'sit-look', 'sit-shift'] as BaseState[], this.hold && isSit(this.hold) ? this.hold : null);
        this.say(this.hold ? Game.STYLE_LABEL[this.hold] : 'Stand');
        break;
      case 'hide':
        this.hold = Game.nextIn(['hide', 'hide-idle'] as BaseState[], this.hold && isHide(this.hold) ? this.hold : null);
        this.say(this.hold ? Game.STYLE_LABEL[this.hold] : 'Stand');
        break;
      case 'idle': {
        const list = ['idle', 'idle-alert', 'idle-tired', 'idle-bored', 'idle-armed'] as BaseState[];
        this.hold = Game.nextIn(list, this.hold && list.includes(this.hold) ? this.hold : null);
        this.say(this.hold ? Game.STYLE_LABEL[this.hold] : 'Idle · automatic');
        break;
      }
    }
  }

  private peek(dir: 'left' | 'right') {
    if (!this.canAct()) return;
    this.beginAction();
    if (!this.hold || !isHide(this.hold)) this.hold = 'hide';
    this.peekDir = dir;
  }

  // ---- hat ---------------------------------------------------------------
  private hatAction(what: string) {
    if (!this.canAct()) return;
    const an = this.anim;
    if (an.hat === 'ground') {
      this.hatPickup();
      return;
    }
    if (this.weapon !== 'bow' && this.weapon !== 'unarmed') {
      this.say('Put the weapon away first (0)');
      return;
    }
    if (what === 'toggle') {
      if (an.hat === 'head') this.playAnim('hat-off');
      else if (an.hat === 'hand') this.playAnim('hat-on');
    } else if (what === 'drop') {
      if (an.hat === 'hand') this.playAnim('hat-drop');
      else this.say('Take the hat off first (T)');
    }
  }

  private hatPickup() {
    const a = this.archer;
    const an = this.anim;
    const prop = an.props.find((q) => q.kind === 'hat');
    if (!prop) {
      an.hat = 'head';
      return;
    }
    if (this.weapon !== 'bow' && this.weapon !== 'unarmed') {
      this.say('Put the weapon away first (0)');
      return;
    }
    this.beginAction();
    this.hold = null;
    this.peekDir = null;
    const facing: -1 | 1 = prop.x < a.x ? -1 : 1;
    this.autoWalk = {
      x: prop.x + (facing === -1 ? 80 : -80),
      then: () => {
        a.facing = facing;
        an.facing = facing;
        an.startSeq('hat-pickup', 1.5);
      },
    };
  }

  // ---- animation playback ---------------------------------------------
  /** Play any motion-library animation on the live character. Walking or shooting cancels demo ones. */
  playAnim(name: string) {
    if (this.phase !== 'playing' || !this.canAct()) return;
    // weapon names from the animation panel map onto the inventory
    const wk = name.replace(/-ready$/, '');
    if (['crossbow', 'spear', 'sword', 'staff', 'axe'].includes(wk)) {
      this.equip(wk as WeaponKind);
      this.weaponReady = name.endsWith('-ready');
      return;
    }
    this.beginAction();
    if (Game.HOLD_STATES.includes(name)) {
      this.animDemo = null;
      this.peekDir = null;
      this.hold = name as BaseState;
      return;
    }
    if (name === 'hat-pickup') {
      this.hatPickup();
      return;
    }
    if (name.startsWith('hat-') && this.weapon !== 'bow' && this.weapon !== 'unarmed') {
      this.say('Put the weapon away first (0)');
      return;
    }
    this.animDemo = { name, fired: false };
  }

  private applyDemo(an: Animator) {
    const d = this.animDemo!;
    const name = d.name;
    const speed = Game.GAIT_SPEED[name];
    if (speed !== undefined) {
      an.driveSpeed = speed;
      an.setBase(name as BaseState);
      return;
    }
    an.driveSpeed = 0;
    // one-shot motions: trigger once, release the override when they finish
    if (!d.fired) {
      if (name === 'jump' || name === 'hop') an.setBase(name);
      else if (name === 'hat-off') an.hatTakeOff();
      else if (name === 'hat-on') an.hatPutOn();
      else if (name === 'hat-drop') an.hatDrop();
      else an.react(name as Reaction);
      d.fired = true;
    } else if (!an.reaction && an.jump.phase === 'none' && !an.seq) {
      this.animDemo = null;
    }
  }

  private driveAnimInputs() {
    const a = this.archer;
    const an = this.anim;
    an.x = a.x; // keep animator space == world space (dropped hats live there)
    an.facing = a.facing;
    an.hasBow = a.hasBow;
    an.hasQuiver = a.hasQuiver;
    const w: WeaponKind = this.weapon === 'bow' && !a.hasBow ? 'unarmed' : this.weapon;
    if (an.weapon !== w) an.setWeapon(w);
    an.weaponReady = this.weaponReady;
  }

  /** World position of the weapon tip (or fist) for hit effects. */
  private weaponTip() {
    const a = this.archer;
    const an = this.anim;
    const h = an.skel.handF;
    const rot = an.pose.weapon.rot ?? an.skel.aFF + Math.PI;
    const len = Game.TIP_LEN[this.weapon] ?? 60;
    const lx = h.x + Math.sin(rot) * len;
    const ly = h.y - Math.cos(rot) * len + an.pose.y;
    return { x: a.x + (a.facing === -1 ? lx : -lx), y: a.y + ly };
  }

  /** Translate the game's archer state into animator intents, then step the rig. */
  private driveAnim(dt: number) {
    const a = this.archer;
    const an = this.anim;
    this.driveAnimInputs();
    const armed = this.armed();
    const walking = a.pose === 'walk';
    // real gameplay always wins over a demo animation
    if (walking || a.charging || a.pickupT > 0 || a.victory) this.animDemo = null;
    const demoing = this.animDemo !== null && this.phase === 'playing';
    if (demoing) {
      if (an.shoot.stage !== 'none') an.shootCancel();
      an.showArrow = false;
      this.applyDemo(an);
    } else {
      an.driveSpeed = walking ? this.moveSpeed() : 0;
      if (walking) an.setBase(this.gait());
      else if (this.peekDir) an.setBase(this.peekDir === 'left' ? 'peek-left' : 'peek-right');
      else if (this.hold) an.setBase(this.hold);
      else if (armed) an.setBase('idle-alert');
      else an.setBase(this.weapon !== 'unarmed' && this.weapon !== 'bow' && this.weaponReady ? 'idle-armed' : 'idle');
      const standingArmed =
        armed && this.phase === 'playing' && !a.victory && a.pickupT <= 0 && !an.seq && !this.hold && (a.pose === 'aim' || a.pose === 'draw' || a.pose === 'release');
      if (standingArmed) {
        an.shootAim(a.angle * DEG);
        if (a.charging) an.shootDraw(0.4 + 0.6 * (a.power / 100), true);
        an.showArrow = this.canShootMore() && a.pose !== 'release' && !this.arrowInFlight();
      } else {
        an.showArrow = false;
        const st = an.shoot.stage;
        if (st === 'raise' || st === 'aim' || st === 'draw' || st === 'hold') an.shootRecover();
      }
    }
    if (a.pose !== this.lastAnimPose) {
      if (a.pose === 'celebrate') an.react('celebrate');
      else if (a.pose === 'sad') an.react('disappointed');
      else if (a.pose === 'shake') an.react('shake');
      else if (a.pose === 'victory') an.react('victory');
      this.lastAnimPose = a.pose;
    }
    if (a.pose === 'victory' && !an.reaction) an.react('victory');
    an.update(dt);
  }

  private updateArcherIdle(dt: number) {
    const a = this.archer;
    a.blinkNext -= dt;
    if (a.blinkNext <= 0) {
      a.blinkT = 0.12;
      a.blinkNext = 2 + Math.random() * 3.5;
    }
    if (a.blinkT > 0) a.blinkT -= dt;
    a.armFront = lerpRate(a.armFront, RIG.ARM_REST_FRONT, 10, dt);
    a.armBack = lerpRate(a.armBack, RIG.ARM_REST_BACK, 10, dt);
  }

  private updateArcher(dt: number) {
    const a = this.archer;
    this.updateArcherIdle(dt);
    if (a.hintUnarmedT > 0) a.hintUnarmedT -= dt;
    const armed = this.armed();
    let move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.touchMove;
    move = clamp(move, -1, 1);
    if (a.victory || this.phase !== 'playing') move = 0;
    if (a.attackT > 0) a.attackT -= dt;
    if (a.pickupT > 0) {
      a.pickupT -= dt;
      move = 0;
    }
    // walking out of a sit / hide / idle-style hold ends it (sitting needs the stand-up animation first)
    if (move !== 0) {
      this.autoWalk = null;
      if (this.hold) {
        const wasSit = isSit(this.hold as BaseState);
        this.hold = null;
        this.peekDir = null;
        if (wasSit) move = 0;
      }
    } else if (this.autoWalk && this.phase === 'playing' && !a.victory) {
      const d = this.autoWalk.x - a.x;
      if (Math.abs(d) < 10) {
        const then = this.autoWalk.then;
        this.autoWalk = null;
        then();
      } else move = d < 0 ? -1 : 1;
    }
    // sequences (sit/stand, hat, equipment) and attacks plant the feet
    if (this.anim.seq || a.attackT > 0) move = 0;
    if (a.charging && move !== 0) this.cancelCharge();

    // transient pose timers
    a.poseT += dt;
    const base: Pose = armed ? 'aim' : 'idle';
    if (a.pose === 'release' && a.poseT > 0.35) a.pose = base;
    if (a.pose === 'celebrate' && a.poseT > 1.0) a.pose = base;
    if (a.pose === 'sad' && a.poseT > 0.9) a.pose = base;
    if (a.pose === 'shake' && a.poseT > 0.6) a.pose = base;

    if (move !== 0) {
      a.x = clamp(a.x + move * this.moveSpeed() * dt, CFG.archer.minX, CFG.archer.maxX);
      a.facing = move < 0 ? -1 : 1;
      a.walkPhase += dt * 9;
      if (a.pose !== 'walk') {
        a.pose = 'walk';
        a.walkPhase = 0;
      }
      this.startArrowVisible = false;
    } else if (a.pose === 'walk') {
      a.pose = base;
      a.poseT = 0;
      if (armed) a.facing = -1;
    }
    if (armed && a.pose === 'aim') a.facing = -1;

    // aim input (continuous after a short hold)
    if (armed && !a.victory) {
      for (const k of ['up', 'down'] as const) {
        if (this.keys[k]) {
          this.keyHold[k] += dt;
          if (this.keyHold[k] > 0.28) a.angle = clamp(a.angle + (k === 'up' ? 1 : -1) * 45 * dt, CFG.shot.angleMin, CFG.shot.angleMax);
        }
      }
    }

    // meter
    if (a.charging && !this.touchAim.active) {
      a.power += a.meterDir * 100 * (this.mode === 'hard' ? CFG.hard.meterSpeed : CFG.shot.meterSpeed) * dt;
      if (a.power > 100) {
        a.power = 200 - a.power;
        a.meterDir = -1;
      }
      if (a.power < 0) {
        a.power = -a.power;
        a.meterDir = 1;
      }
    }
    if (a.charging) this.audio.creakLevel(a.power / 100);

    // visual smoothing
    const walking = a.pose === 'walk';
    const standingArmed = armed && (a.pose === 'aim' || a.pose === 'draw' || a.pose === 'release');
    const frontGoal = standingArmed ? a.angle * DEG : RIG.ARM_REST_FRONT + (walking ? Math.sin(a.walkPhase) * 0.45 : 0);
    const backGoal = a.charging ? RIG.ARM_REST_BACK + 0.3 : RIG.ARM_REST_BACK + (walking ? -Math.sin(a.walkPhase) * 0.45 : 0);
    const bowGoal = standingArmed ? a.angle * DEG : 0;
    a.armFront = lerpRate(a.armFront, frontGoal, 12, dt);
    a.armBack = lerpRate(a.armBack, backGoal, 12, dt);
    a.bowRot = lerpRate(a.bowRot, bowGoal, 12, dt);
    a.drawVis = lerpRate(a.drawVis, a.charging ? 0.4 + 0.6 * (a.power / 100) : 0, a.charging ? 16 : 30, dt);
    a.across = lerpRate(a.across, a.charging ? 1 : 0, a.charging ? 10 : 20, dt);
  }

  private updatePickups(dt: number) {
    void dt;
    const a = this.archer;
    for (const p of this.pickups) {
      if (!p.collected && Math.abs(a.x - p.x) < 80 && !a.victory && a.pickupT <= 0 && !this.anim.seq) this.collect(p);
    }
  }

  private updateTarget(dt: number) {
    const T = this.target;
    T.scale = lerpRate(T.scale, T.goalScale, 4, dt);
    T.platformVis = lerpRate(T.platformVis, T.platform, 3, dt);
    if (T.moving) {
      T.movePhase += (dt * Math.PI * 2) / T.movePeriod;
      T.moveOff = lerpRate(T.moveOff, T.moveAmp * (0.5 + 0.5 * Math.sin(T.movePhase)), 6, dt);
    } else T.moveOff = lerpRate(T.moveOff, 0, 3, dt);
    T.wobbleVel += (-T.wobble * 70 - T.wobbleVel * 4.5) * dt;
    T.wobble += T.wobbleVel * dt;
    if (T.flash > 0) T.flash -= dt * 2.5;
  }

  private updateWind(dt: number) {
    const w = this.wind;
    if (w.gust && w.max > 0) {
      w.gustT -= dt;
      if (w.gustT <= 0) {
        w.goal = (Math.random() * 2 - 1) * w.max;
        w.gustT = 1 + Math.random() * 1.5;
      }
      w.cur = lerpRate(w.cur, w.goal, 1.6, dt);
    } else w.cur = lerpRate(w.cur, w.goal, 3, dt);
  }

  private updateArrows(dt: number) {
    const T = this.target;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const ar = this.arrows[i];
      if (ar.state === 'fly') {
        const px = ar.x;
        const py = ar.y;
        ar.vx += this.wind.cur * dt;
        ar.vy += CFG.shot.gravity * dt;
        ar.x += ar.vx * dt;
        ar.y += ar.vy * dt;
        ar.rot = Math.atan2(ar.vy, ar.vx);
        ar.trail.push(px, py);
        if (ar.trail.length > 32) ar.trail.splice(0, 2);
        ar.t += dt;

        // final-shot slow-mo approach
        if (ar.final && ar.x - T.x < 900 && ar.x > T.x) {
          this.slowT = 0.15;
          this.slowScale = 0.35;
        }

        // target plane crossing (from the right)
        if (px > T.x && ar.x <= T.x) {
          const f = (px - T.x) / (px - ar.x);
          const yc = py + (ar.y - py) * f;
          const cy = this.faceCy();
          const ry = this.faceRy();
          const dyc = yc - cy;
          if (Math.abs(dyc) <= ry) {
            ar.state = 'stuck';
            ar.x = T.x;
            ar.y = yc;
            ar.trail = [];
            ar.stick = { kind: 'target', ox: 0, oy: yc - this.baseY(), rot: ar.rot };
            ar.t = 0;
            this.onHit(ar, dyc);
            continue;
          } else if (yc > cy + ry && yc < G - 6) {
            ar.state = 'stuck';
            ar.x = T.x;
            ar.y = yc;
            ar.trail = [];
            ar.stick = { kind: 'stand', ox: 0, oy: yc - this.baseY(), rot: ar.rot };
            ar.t = 0;
            this.audio.wallThud();
            this.onMiss(ar, T.x, yc);
            continue;
          } else if (!ar.closeCalled && Math.abs(dyc) < ry * 2) {
            ar.closeCalled = true;
            this.addFloat(T.x + 40, yc - 40, 'So close!', PAL.orange, 28);
            this.audio.closeCall();
            this.slowT = 0.35;
            this.slowScale = 0.4;
          }
        }
        // ground
        if (ar.y >= G) {
          const f = (G - py) / (ar.y - py || 1);
          ar.x = px + (ar.x - px) * f;
          ar.y = G;
          ar.state = 'stuck';
          ar.stick = { kind: 'ground', ox: ar.x, oy: G, rot: ar.rot };
          ar.trail = [];
          ar.t = 0;
          this.audio.groundThud();
          this.burst(ar.x, G, 8, ['#FFFFFF', '#EBEDF8'], 150, 'c', 500);
          this.onMiss(ar, ar.x, G);
          continue;
        }
        // cliff wall
        if (ar.x <= 140) {
          ar.state = 'stuck';
          ar.x = 140;
          ar.stick = { kind: 'wall', ox: 140, oy: ar.y, rot: ar.rot };
          ar.trail = [];
          ar.t = 0;
          this.audio.wallThud();
          this.burst(ar.x, ar.y, 6, ['#FFFFFF', '#CADBF5'], 150, 'c', 500);
          this.onMiss(ar, ar.x, ar.y);
          continue;
        }
        if (ar.x > W + 300 || ar.y > G + 400) {
          this.arrows.splice(i, 1);
          this.onMiss(ar, this.archer.x, this.archer.y - 300);
        }
      } else {
        ar.t += dt;
        if (ar.t > 2.6) this.arrows.splice(i, 1);
      }
    }
  }

  private updateFx(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      if (p.shape === 'r') {
        p.vx *= 1 - 1.5 * dt;
        p.vy *= 1 - 1.2 * dt;
        p.vx += Math.sin(p.life * 6 + p.rot) * 40 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life += dt;
      f.y -= 40 * dt;
      if (f.life >= f.max) this.floats.splice(i, 1);
    }
  }

  private updateHint(dtr: number) {
    const a = this.archer;
    let want = '';
    if (this.phase === 'playing' && !a.victory) {
      const dirTo = (x: number) => (x < a.x ? '←' : '→');
      if (a.hintUnarmedT > 0) want = this.hintMsg || 'Need bow + arrows!';
      else if (!a.hasBow && !a.hasQuiver) want = 'Head left ← to find your gear';
      else if (!a.hasQuiver) want = `Find the arrows ${dirTo(CFG.quiver.x)}`;
      else if (!a.hasBow) want = `Find the bow ${dirTo(CFG.bow.x)}`;
      else if (!a.firedOnce && this.pickups.every((p) => p.fly >= 1))
        want = this.isTouch ? 'Drag back on the right side to aim & shoot' : 'Hold SPACE to draw · ↑↓ to aim';
    }
    if (want !== this.hintLast) {
      this.hintLast = want;
      if (want) {
        this.hintText = want;
        this.hintT = 0;
      } else this.hintT = Math.max(this.hintT, 6.5);
    }
    this.hintT += dtr;
  }

  private updateCamera(dtr: number) {
    const a = this.archer;
    const T = this.target;
    const visW = this.vp.w / this.vp.base;
    const visH1 = this.vp.h / this.vp.base;
    let tx: number;
    let ty: number;
    let tz: number;
    const flying = this.arrows.find((ar) => ar.state === 'fly');
    const walking = a.pose === 'walk';
    const groundFrac = 0.3;
    if (this.phase === 'title') {
      tx = CFG.archer.startX + 60;
      ty = 400;
      tz = 1;
    } else if (this.cam.impactT > 0) {
      this.cam.impactT -= dtr;
      tz = this.cam.impactZoom;
      tx = T.x + 260;
      ty = this.faceCy() - 20;
    } else if (flying) {
      tz = 0.62;
      tx = flying.x;
      const visH = visH1 / tz;
      ty = Math.min(G - visH * groundFrac, flying.y + 100);
    } else if (a.victory) {
      tz = 1;
      tx = a.x;
      ty = G - (visH1 / tz) * groundFrac;
    } else if (this.armed() && !walking) {
      const dist = a.x - T.x;
      tz = clamp(visW / (dist + 800), 0.42, 0.75);
      const half = visW / tz / 2;
      tx = Math.max((a.x + T.x) / 2, a.x - half + 300);
      ty = G - (visH1 / tz) * groundFrac;
    } else {
      tz = 0.78;
      tx = a.x + a.facing * 140;
      ty = G - (visH1 / tz) * groundFrac;
    }
    const kx = flying ? 9 : 4;
    this.cam.x = lerpRate(this.cam.x, tx, kx, dtr);
    this.cam.y = lerpRate(this.cam.y, ty, flying ? 7 : 4, dtr);
    this.cam.zoom = lerpRate(this.cam.zoom, tz, 3, dtr);
  }

  // ------------------------------------------------------------------ render
  private setCam(ctx: CanvasRenderingContext2D, f: number) {
    const { w, h, dpr, s } = this.vp;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - this.cam.x * f * s), dpr * (h / 2 - this.cam.y * s));
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    const base = Math.min(h / 800, w / 900);
    const s = base * this.cam.zoom;
    this.vp = { w, h, dpr, base, s };
    const cam = this.cam;
    const visW = w / s;
    const visH = h / s;
    const left = cam.x - visW / 2;
    const right = cam.x + visW / 2;
    const top = cam.y - visH / 2;
    const bottom = cam.y + visH / 2;
    const t = this.time;
    const A = art();

    // sky
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sy = (wy: number) => (wy - cam.y) * s + h / 2;
    const grad = ctx.createLinearGradient(0, sy(-1800), 0, sy(575));
    grad.addColorStop(0, '#BFD3F2');
    grad.addColorStop(0.5, PAL.sky);
    grad.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // clouds
    this.setCam(ctx, 0.12);
    for (const c of this.clouds) drawCloud(ctx, c.x, c.y, c.r, c.a);

    // far cliffs
    this.setCam(ctx, 0.2);
    {
      const P = 1300;
      const l = cam.x * 0.2 - visW / 2;
      const r = cam.x * 0.2 + visW / 2;
      for (let i = Math.floor(l / P) - 1; i <= Math.floor(r / P) + 1; i++) {
        const ox = i * P;
        const h1 = hash(i * 7 + 1);
        const h2 = hash(i * 7 + 2);
        const h3 = hash(i * 7 + 3);
        const h4 = hash(i * 7 + 4);
        ctx.save();
        ctx.translate(ox + h1 * 220, 575);
        ctx.scale(0.9 + 0.5 * h2, 0.85 + 0.6 * h2);
        ctx.translate(-7, -575);
        ctx.fillStyle = cliffGradient(ctx, 224, PAL.cliffNear);
        ctx.fill(A.cliffL);
        ctx.restore();
        ctx.save();
        ctx.translate(ox + 600 + h3 * 200, 575);
        ctx.scale(0.85 + 0.5 * h4, 0.8 + 0.6 * h4);
        ctx.translate(-672, -575);
        ctx.fillStyle = cliffGradient(ctx, 237, PAL.cliffFar);
        ctx.fill(A.cliffR);
        ctx.restore();
      }
    }

    // near layer: pines + mounds
    this.setCam(ctx, 0.45);
    {
      const P = 800;
      const l = cam.x * 0.45 - visW / 2;
      const r = cam.x * 0.45 + visW / 2;
      const cols = ['#C3D6F2', '#CDDDF5', '#D7E3F7'];
      for (let i = Math.floor(l / P) - 1; i <= Math.floor(r / P) + 1; i++) {
        const ox = i * P;
        drawMound(ctx, ox + 400 + hash(i) * 200, 614, 520 + hash(i + 9) * 300, 26 + hash(i + 3) * 18, '#F3F5FB');
        const n = 2 + Math.floor(hash(i + 5) * 2);
        for (let k = 0; k < n; k++) {
          const hx = ox + 100 + k * (P / n) + hash(i * 11 + k) * 160;
          const hh = 110 + hash(i * 13 + k) * 90;
          drawPine(ctx, hx, 614, hh, cols[(i + k + 300) % 3], '#B7C3E3');
        }
      }
    }

    // world layer
    this.setCam(ctx, 1);
    ctx.fillStyle = PAL.ground;
    ctx.fillRect(left - 10, G, visW + 20, 70);
    ctx.fillStyle = PAL.groundSide;
    ctx.fillRect(left - 10, G + 70, visW + 20, Math.max(0, bottom - (G + 70)) + 20);
    ctx.fillStyle = '#F6F7FC';
    ctx.fillRect(left - 10, G - 2, visW + 20, 9);

    // left cliff wall
    if (left < 260) {
      const wallTop = Math.min(top, -3000) - 200;
      const wg = ctx.createLinearGradient(-200, 0, 140, 0);
      wg.addColorStop(0, '#CCDBF4');
      wg.addColorStop(1, '#DDE7F8');
      ctx.fillStyle = wg;
      ctx.fillRect(-3000, wallTop, 3140, G + 4 - wallTop);
      ctx.fillStyle = '#E8EFFA';
      ctx.fillRect(104, wallTop, 36, G + 4 - wallTop);
      // rock strata + snow ledges for texture
      for (let k = 0; k < 14; k++) {
        const ly = G - 120 - k * 240 - hash(k + 40) * 140;
        if (ly < top - 100 || ly > bottom + 100) continue;
        const lw = 70 + hash(k + 41) * 90;
        ctx.fillStyle = '#C4D5F1';
        roundRectPath(ctx, 140 - lw - 10, ly + 12, lw + 10, 14, 7);
        ctx.fill();
        ctx.fillStyle = '#F7F9FE';
        roundRectPath(ctx, 140 - lw, ly, lw + 6, 18, 9);
        ctx.fill();
      }
      // snow drift at the foot of the wall
      drawMound(ctx, 140, G + 2, 260, 46, '#F6F7FC');
      drawMound(ctx, 60, G + 2, 300, 70, '#F6F7FC');
    }

    // decor (1x)
    for (const d of this.decor) {
      if (d.x < left - 400 || d.x > right + 400) continue;
      if (d.kind === 'mound') drawMound(ctx, d.x, G + 2, d.s, 14, d.c);
    }
    for (const d of this.decor) {
      if (d.x < left - 400 || d.x > right + 400) continue;
      if (d.kind === 'pine') drawPine(ctx, d.x, G + 2, d.s, d.c, '#B7C3E3');
      else if (d.kind === 'rock') drawRock(ctx, d.x, G + 2, d.s, d.s * 0.45, d.c);
    }
    for (const sx of CFG.signposts) {
      if (sx > left - 200 && sx < right + 200) drawSignpost(ctx, sx, G, `${sx - CFG.target.x} m`);
    }
    if (CFG.fence.x > left - 200 && CFG.fence.x < right + 200) drawFence(ctx, CFG.fence.x, G);
    for (const fx of CFG.flags) {
      if (fx > left - 200 && fx < right + 200) drawFlag(ctx, fx, G, this.wind.cur, this.wind.max, t);
    }
    if (CFG.archer.startX > left - 700 && CFG.archer.startX < right + 700) {
      ctx.save();
      ctx.translate(CFG.archer.startX - 480, 0);
      drawPedestal(ctx);
      ctx.restore();
    }

    // target
    {
      const T = this.target;
      const by = this.baseY();
      const lift = CFG.target.standLift;
      // permanent snow base under the target
      ctx.fillStyle = '#E4E7F3';
      ctx.beginPath();
      ctx.ellipse(T.x, G + 30, 250, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.groundSide;
      roundRectPath(ctx, T.x - 200, G - lift + 16, 400, lift + 14, 28);
      ctx.fill();
      ctx.fillStyle = PAL.ground;
      roundRectPath(ctx, T.x - 200, G - lift - 6, 400, 44, 22);
      ctx.fill();
      ctx.fillStyle = PAL.groundDark;
      roundRectPath(ctx, T.x - 130, G - lift + 2, 260, 20, 10);
      ctx.fill();
      if (T.platformVis + T.moveOff > 4) {
        const ph = G - lift - by;
        ctx.fillStyle = PAL.groundSide;
        roundRectPath(ctx, T.x - 150, by + 16, 300, ph + 10, 22);
        ctx.fill();
        ctx.fillStyle = PAL.ground;
        roundRectPath(ctx, T.x - 150, by - 2, 300, 34, 17);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(T.x, by);
      ctx.rotate(T.wobble);
      drawTarget(ctx, T.scale, T.golden ? TARGET_GOLD : TARGET_RED, T.flash);
      for (const ar of this.arrows) {
        if (ar.state === 'stuck' && ar.stick && (ar.stick.kind === 'target' || ar.stick.kind === 'stand')) {
          ctx.save();
          ctx.globalAlpha = clamp(1 - (ar.t - 2) / 0.6, 0, 1);
          ctx.translate(ar.stick.ox + 14, ar.stick.oy);
          ctx.rotate(ar.stick.rot);
          drawArrowArt(ctx);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // pickups
    for (const p of this.pickups) {
      if (!p.collected) {
        const bob = Math.sin(t * 2.5 + p.phase) * 8;
        const cx = p.x;
        const cy = G - 95 + bob;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + p.phase);
        const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 140);
        rg.addColorStop(0, 'rgba(255,255,255,0.75)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, 140, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * pulse})`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, 96 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        for (let k = 0; k < 3; k++) {
          const ang = t * 1.2 + k * 2.094 + p.phase;
          drawStar(ctx, cx + Math.cos(ang) * 115, cy + Math.sin(ang) * 115 * 0.6, 9 + 4 * Math.sin(t * 5 + k), ang);
        }
        ctx.save();
        ctx.translate(p.x, G - 6 + bob);
        if (p.kind === 'bow') drawBowItem(ctx);
        else drawQuiverItem(ctx);
        ctx.restore();
      } else if (p.fly < 1) {
        ctx.save();
        ctx.translate(p.x, G - 6);
        if (p.kind === 'bow') drawBowItem(ctx);
        else drawQuiverItem(ctx);
        ctx.restore();
      }
    }

    // arrows stuck in ground / wall
    for (const ar of this.arrows) {
      if (ar.state === 'stuck' && ar.stick && (ar.stick.kind === 'ground' || ar.stick.kind === 'wall')) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - (ar.t - 2) / 0.6, 0, 1);
        ctx.translate(ar.x, ar.y);
        ctx.rotate(ar.stick.rot);
        ctx.translate(14, 0);
        drawArrowArt(ctx);
        ctx.restore();
      }
    }

    // start hint arrow
    if (this.startArrowVisible && this.phase === 'playing' && !this.archer.hasBow && !this.archer.hasQuiver) {
      const a = this.archer;
      const ax = a.x - 250 + Math.sin(t * 4) * 16;
      const ay = a.y - 230;
      ctx.fillStyle = PAL.red;
      ctx.beginPath();
      ctx.moveTo(ax - 34, ay);
      ctx.lineTo(ax + 6, ay - 28);
      ctx.lineTo(ax + 6, ay + 28);
      ctx.closePath();
      ctx.fill();
      roundRectPath(ctx, ax + 4, ay - 11, 46, 22, 8);
      ctx.fill();
    }

    // archer (layered paper-rig, authored facing left)
    {
      const a = this.archer;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(a.facing === -1 ? 1 : -1, 1);
      drawRig(ctx, this.anim.pose, this.anim.skel, { arrowsInQuiver: this.mode === 'hard' ? clamp(this.arrowsLeft, 0, 3) : 3 });
      ctx.restore();
      // a hat lying on the ground
      for (const hp of this.anim.props) {
        if (hp.kind !== 'hat') continue;
        ctx.save();
        ctx.translate(hp.x, G + hp.y);
        ctx.rotate(hp.rot);
        ctx.scale(1 + (1 - hp.squash) * 0.5, hp.squash);
        drawHatLoose(ctx);
        ctx.restore();
      }

      // angle indicator + preview
      if (this.phase === 'playing' && this.armed() && (a.pose === 'aim' || a.pose === 'draw') && !a.victory && a.facing === -1 && !this.arrowInFlight() && a.pickupT <= 0) {
        const hf = this.anim.skel.handF;
        const hx = a.x + hf.x;
        const hy = a.y + hf.y + this.anim.pose.y;
        const th = a.angle * DEG;
        ctx.save();
        ctx.strokeStyle = 'rgba(114,98,93,0.45)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(hx, hy, 120, Math.PI, Math.PI + th, false);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(hx - 140, hy);
        ctx.lineTo(hx - 100, hy);
        ctx.stroke();
        ctx.fillStyle = PAL.grey;
        ctx.font = 'bold 26px Nunito, "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(a.angle)}°`, hx - 150 * Math.cos(th / 2), hy - 150 * Math.sin(th / 2));
        ctx.restore();
        if (a.charging && this.mode === 'normal') {
          const tip = this.launchPoint();
          const v = CFG.shot.speedMin + (CFG.shot.speedMax - CFG.shot.speedMin) * (a.power / 100);
          for (let k = 1; k <= 4; k++) {
            const tt = k * 0.14;
            const px = tip.x - v * Math.cos(th) * tt;
            const py = tip.y - v * Math.sin(th) * tt + 0.5 * CFG.shot.gravity * tt * tt;
            ctx.fillStyle = `rgba(255,255,255,${0.95 - k * 0.17})`;
            ctx.beginPath();
            ctx.arc(px, py, 8 - k, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(114,98,93,${0.5 - k * 0.1})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    }

    // flying arrows
    for (const ar of this.arrows) {
      if (ar.state !== 'fly') continue;
      const n = ar.trail.length / 2;
      if (n > 1) {
        ctx.lineCap = 'round';
        for (let k = 1; k < n; k++) {
          const al = (k / n) * 0.6;
          ctx.strokeStyle = `rgba(178,196,236,${al})`;
          ctx.lineWidth = 2 + (k / n) * 7;
          ctx.beginPath();
          ctx.moveTo(ar.trail[(k - 1) * 2], ar.trail[(k - 1) * 2 + 1]);
          ctx.lineTo(ar.trail[k * 2], ar.trail[k * 2 + 1]);
          ctx.stroke();
        }
      }
      ctx.save();
      ctx.translate(ar.x, ar.y);
      ctx.rotate(ar.rot);
      drawArrowArt(ctx);
      ctx.restore();
    }

    // particles
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      if (p.shape === 'c') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * k), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'r') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.life * 7 + p.rot)) * 0.8 + 0.2);
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      } else if (p.shape === 's') {
        drawStar(ctx, p.x, p.y, p.size * (0.5 + 0.5 * k), p.rot);
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 6 * k + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k) * 2 + 10, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      const k = f.life / f.max;
      const al = k < 0.1 ? k / 0.1 : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const sc = k < 0.15 ? 0.6 + (k / 0.15) * 0.4 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, al);
      ctx.translate(f.x, f.y);
      ctx.scale(sc, sc);
      ctx.font = `800 ${f.size}px Nunito, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }

    // hint bubble
    if (this.hintText && this.hintT < 7) {
      const k = this.hintT;
      const al = k < 0.25 ? k / 0.25 : k > 6.3 ? Math.max(0, 1 - (k - 6.3) / 0.7) : 1;
      if (al > 0) {
        const a = this.archer;
        const bx = a.x;
        const by = a.y - 520 + this.anim.pose.y + Math.sin(t * 3) * 4;
        ctx.save();
        ctx.globalAlpha = al;
        ctx.font = '700 26px Nunito, "Segoe UI", system-ui, sans-serif';
        const tw = ctx.measureText(this.hintText).width + 48;
        ctx.fillStyle = '#FFFFFF';
        roundRectPath(ctx, bx - tw / 2, by - 28, tw, 56, 20);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx - 14, by + 26);
        ctx.lineTo(bx + 14, by + 26);
        ctx.lineTo(bx, by + 44);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = PAL.brownDark;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.hintText, bx, by + 1);
        ctx.restore();
      }
    }

    // screen-space: snow + slow-mo tint
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    for (const f of this.snow) {
      ctx.globalAlpha = f.a * 0.85;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.timeScale < 0.9) {
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(90,110,170,0)');
      vg.addColorStop(1, `rgba(90,110,170,${(1 - this.timeScale) * 0.35})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ------------------------------------------------------------------ HUD snapshot
  snapshot(): HudState {
    const a = this.archer;
    const bow = this.pickups[0];
    const quiver = this.pickups[1];
    return {
      phase: this.phase,
      mode: this.mode,
      streak: this.streak,
      goal: CFG.streakGoal,
      score: this.score,
      arrowsUsed: this.arrowsUsed,
      arrowsLeft: this.mode === 'hard' ? this.arrowsLeft : -1,
      hasBow: a.hasBow,
      hasQuiver: a.hasQuiver,
      armed: this.armed(),
      charging: a.charging,
      power: a.power,
      sweet: a.charging ? this.sweetSpot() : -1,
      angle: Math.round(a.angle),
      wind: this.wind.cur,
      windMax: this.wind.max,
      distance: Math.max(0, Math.round(a.x - this.target.x)),
      archerX: a.x,
      bowX: bow.collected ? -1 : bow.x,
      quiverX: quiver.collected ? -1 : quiver.x,
      targetX: this.target.x,
      worldW: W,
      banner: this.banner,
      elapsed: this.elapsed,
      muted: this.audio.muted,
      touch: this.isTouch,
      bowKey: this.bowKey,
      quiverKey: this.quiverKey,
      pipKey: this.pipKey,
      slowmo: this.timeScale < 0.9,
      result: this.result,
      best: this.best,
      weapon: this.weapon === 'bow' && !a.hasBow ? 'unarmed' : this.weapon,
      weaponReady: this.weaponReady,
      stance: this.stanceLabel(),
    };
  }
}
