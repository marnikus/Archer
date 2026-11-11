import { ANIM_CFG, CFG } from './config';
import {
  PAL,
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
import { RigAnimator, type AnimatorInput } from './animator';
import { RIG_NEW, bowWeaponGeom, drawRigArcher, type HatId } from './rig';

export type Mode = 'normal' | 'hard';
export type Phase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';
type Pose = 'idle' | 'walk' | 'run' | 'aim' | 'draw' | 'release' | 'celebrate' | 'sad' | 'shake' | 'victory';

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
  hat: HatId;
  hatWearing: boolean;
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

interface Footprint {
  x: number;
  life: number;
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
  hasBow: boolean;
  hasQuiver: boolean;
  angle: number;
  charging: boolean;
  power: number;
  meterDir: number;
  victory: boolean;
  firedOnce: boolean;
  hintUnarmedT: number;
  idleNoInputT: number;
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
  anim = new RigAnimator();
  selectedHat: HatId = 'wool';
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
  footprints: Footprint[] = [];
  floats: FloatText[] = [];
  cam = { x: 0, y: 400, zoom: 1, impactT: 0, impactZoom: 0.9 };
  snow: Array<{ x: number; y: number; r: number; v: number; ph: number; a: number }> = [];
  clouds: Array<{ x: number; y: number; r: number; v: number; a: number }> = [];
  decor: Decor[] = [];
  keys = { left: false, right: false, up: false, down: false, shift: false };
  keyHold = { up: 0, down: 0 };
  spaceDown = false;
  touchMove = 0;
  touchRun = false;
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
  private lastArcherHand = { x: CFG.archer.startX - 100, y: G - 260 };

  constructor(audio: AudioSys) {
    this.audio = audio;
    this.isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    try {
      const savedHat = localStorage.getItem('als-hat') as HatId | null;
      if (savedHat && ['none', 'wool', 'archer', 'fur'].includes(savedHat)) this.selectedHat = savedHat;
    } catch {
      /* ignore */
    }
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

  setHatChoice(h: HatId) {
    this.selectedHat = h;
    try {
      localStorage.setItem('als-hat', h);
    } catch {
      /* ignore */
    }
    this.anim.setHatStyle(h, this.phase === 'title');
  }

  toggleHatInGame() {
    if (this.phase !== 'playing') return;
    if (this.anim.hat === 'none') this.anim.hat = 'wool';
    this.anim.triggerHat(!this.anim.hatWearing);
  }

  triggerHop() {
    if (this.phase !== 'playing' || this.archer.victory || this.archer.charging) return;
    this.archer.idleNoInputT = 0;
    this.anim.triggerJump(false);
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
    this.anim.reset();
    this.anim.hat = this.selectedHat;
    this.anim.hatWearing = this.selectedHat !== 'none';
    this.anim.weapon = 'none';
    this.archer = {
      x: CFG.archer.startX,
      y: G,
      facing: -1,
      pose: 'idle',
      poseT: 0,
      hasBow: false,
      hasQuiver: false,
      angle: 40,
      charging: false,
      power: 0,
      meterDir: 1,
      victory: false,
      firedOnce: false,
      hintUnarmedT: 0,
      idleNoInputT: 0,
    };
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
    this.footprints = [];
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
    this.keys = { left: false, right: false, up: false, down: false, shift: false };
    this.touchMove = 0;
    this.touchRun = false;
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
    if (down) this.archer.idleNoInputT = 0;
    if (down && (k === 'up' || k === 'down')) {
      this.keyHold[k] = 0;
      if (this.phase === 'playing' && this.armed()) {
        this.archer.angle = clamp(this.archer.angle + (k === 'up' ? 1 : -1), CFG.shot.angleMin, CFG.shot.angleMax);
      }
    }
  }

  armed() {
    return this.archer.hasBow && this.archer.hasQuiver;
  }

  canShootMore() {
    return this.mode === 'hard' ? this.arrowsLeft > 0 : true;
  }

  pressFire() {
    this.spaceDown = true;
    this.archer.idleNoInputT = 0;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.victory || a.charging) return;
    if (!this.armed()) {
      a.pose = 'shake';
      a.poseT = 0;
      a.hintUnarmedT = 1.6;
      this.anim.triggerUnarmedFail(a.hasBow, a.hasQuiver);
      this.audio.shake();
      return;
    }
    if (a.pose === 'walk' || a.pose === 'run' || !this.canShootMore() || this.arrowInFlight()) return;
    this.beginCharge();
  }

  arrowInFlight() {
    return this.arrows.some((ar) => ar.state === 'fly');
  }

  private beginCharge() {
    const a = this.archer;
    a.charging = true;
    a.power = 0;
    a.meterDir = 1;
    a.pose = 'draw';
    a.poseT = 0;
    a.facing = -1;
    this.anim.desiredFacing = -1;
    if (this.anim.shootPhase === 'none') this.anim.beginShoot(false);
    this.audio.creakStart();
  }

  private cancelCharge() {
    const a = this.archer;
    a.charging = false;
    a.power = 0;
    this.touchAim.active = false;
    if (a.pose === 'draw') a.pose = 'aim';
    this.anim.cancelShoot();
    this.audio.creakStop();
  }

  releaseFire() {
    this.spaceDown = false;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.charging && !this.touchAim.active) this.fire(a.power / 100);
  }

  touchAimStart(px: number, py: number) {
    this.isTouch = true;
    this.archer.idleNoInputT = 0;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.victory || a.charging) return;
    if (!this.armed()) {
      this.pressFire();
      this.spaceDown = false;
      return;
    }
    if (a.pose === 'walk' || a.pose === 'run' || !this.canShootMore() || this.arrowInFlight()) return;
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
    if (dir !== 0) this.archer.idleNoInputT = 0;
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

  private animatorInput(): AnimatorInput {
    const a = this.archer;
    let move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.touchMove;
    move = clamp(move, -1, 1);
    if (a.victory || this.phase !== 'playing' || a.charging) move = 0;

    // Notice nearby uncollected pickups from 150 units away!
    let noticeDir = 0;
    if (this.phase === 'playing' && !a.victory) {
      for (const pk of this.pickups) {
        if (!pk.collected && Math.abs(pk.x - a.x) < 150) {
          noticeDir = pk.x < a.x ? -1 : 1;
          break;
        }
      }
    }

    const flying = this.arrows.find((ar) => ar.state === 'fly');

    return {
      moveDir: move,
      runHeld: this.keys.shift || this.touchRun,
      aimAngleDeg: a.angle,
      power01: a.power / 100,
      drawing: a.charging,
      hasQuiver: a.hasQuiver,
      noticeDir,
      trackFlyingY: flying ? flying.y - (a.y - 250) : null,
      bowCarryStyle: 'slung',
    };
  }

  /** Exact launch point matching the visible arrow tip along the aim angle (for facing = -1). */
  private launchPoint() {
    const a = this.archer;
    const th = a.angle * DEG;
    const lean = 8 * DEG * clamp(a.angle / 80, 0, 1);
    const handX = RIG_NEW.LEAD_SHOULDER.x - RIG_NEW.LEAD_ARM_LEN * Math.cos(th);
    const handY = RIG_NEW.LEAD_SHOULDER.y - RIG_NEW.LEAD_ARM_LEN * Math.sin(th);
    const g = bowWeaponGeom(handX, handY, th, 0, this.anim.weapon);
    // Apply body lean around (480, 590) and drop of 4 units
    const dx = g.tip.x - 480;
    const dy = g.tip.y - 590;
    const c = Math.cos(lean);
    const s = Math.sin(lean);
    const lx = 480 + dx * c - dy * s;
    const ly = 590 + dx * s + dy * c + 4;
    return { x: a.x + (lx - RIG_NEW.FEET.x), y: a.y + (ly - RIG_NEW.FEET.y) };
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
    this.touchAim.active = false;
    this.anim.releaseShoot(a.angle, power01);
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
    this.anim.triggerPickup(p.kind, p.x < this.archer.x ? -1 : 1);
    this.audio.pickup();
    this.burst(p.x, G - 90, 14, ['#FFFFFF', '#FFF4D6', '#CADBF5'], 260, 's', 200);
    this.ring(p.x, G - 90, '#FFFFFF', 60);
  }

  private onAttach(p: Pickup) {
    const a = this.archer;
    if (p.kind === 'bow') {
      a.hasBow = true;
      this.anim.setWeapon('shortbow', true);
      this.bowKey++;
      this.addFloat(a.x, a.y - 540, 'Bow acquired!', PAL.orange, 32);
    } else {
      a.hasQuiver = true;
      this.quiverKey++;
      this.addFloat(a.x, a.y - 540, 'Arrows acquired!', PAL.orange, 32);
    }
    this.audio.pop();
    this.ring(a.x, a.y - 250, '#FFFFFF', 90);
    if (this.armed()) {
      this.showBanner('ARMED!', 'good', this.isTouch ? 'Drag back on the right side to shoot' : 'Hold SPACE to draw · ↑↓ to aim · Shift Run');
      this.audio.armed();
      this.anim.triggerArmedMoment();
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
    this.anim.triggerReaction('hit');
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
    this.anim.triggerReaction('miss');
    if (this.mode === 'hard' && this.arrowsLeft <= 0) this.gameoverT = 0;
  }

  private win() {
    const a = this.archer;
    a.victory = true;
    a.pose = 'victory';
    this.victoryT = 0;
    this.slowT = 0;
    this.anim.triggerReaction('win');
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
      this.updateArcherTitle(dt);
      this.updateCamera(dtr);
      return;
    }
    this.updateArcher(dt);
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

  private updateArcherTitle(dt: number) {
    // On title screen: calm stand breathing + fidgets (and gentle auto-sit after 12s)
    if (this.time > 12 && this.anim.baseState !== 'sit') {
      this.anim.toggleSit();
    }
    this.anim.update(dt, {
      moveDir: 0,
      runHeld: false,
      aimAngleDeg: 40,
      power01: 0,
      drawing: false,
      hasQuiver: false,
      bowCarryStyle: 'slung',
    });
  }

  private updateArcher(dt: number) {
    const a = this.archer;
    if (a.hintUnarmedT > 0) a.hintUnarmedT -= dt;
    const armed = this.armed();
    let move = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) + this.touchMove;
    move = clamp(move, -1, 1);
    const runHeld = this.keys.shift || this.touchRun;
    if (a.victory || this.phase !== 'playing') move = 0;
    if (a.charging && move !== 0) this.cancelCharge();

    // transient pose timers
    a.poseT += dt;
    const base: Pose = armed ? 'aim' : 'idle';
    if (a.pose === 'release' && a.poseT > 0.35) a.pose = base;
    if (a.pose === 'celebrate' && a.poseT > 1.0) a.pose = base;
    if (a.pose === 'sad' && a.poseT > 0.9) a.pose = base;
    if (a.pose === 'shake' && a.poseT > 0.6) a.pose = base;

    let dx = 0;
    if (move !== 0) {
      a.idleNoInputT = 0;
      const spd = runHeld ? ANIM_CFG.runSpeed : CFG.archer.walkSpeed;
      const prevX = a.x;
      a.x = clamp(a.x + move * spd * dt, CFG.archer.minX, CFG.archer.maxX);
      dx = a.x - prevX;
      a.facing = move < 0 ? -1 : 1;
      a.pose = runHeld ? 'run' : 'walk';
      this.startArrowVisible = false;
    } else {
      if (a.pose === 'walk' || a.pose === 'run') {
        a.pose = base;
        a.poseT = 0;
        if (armed) a.facing = -1;
      }
      if (!a.charging && !a.victory && !this.arrowInFlight() && !this.keys.up && !this.keys.down) {
        a.idleNoInputT += dt;
        if (a.idleNoInputT >= ANIM_CFG.autoSitWait && this.anim.baseState !== 'sit') {
          this.anim.shootPhase = 'none';
          this.anim.toggleSit();
        }
      } else {
        a.idleNoInputT = 0;
      }
    }

    if (armed && a.pose === 'aim' && this.anim.baseState !== 'sit') {
      a.facing = -1;
      this.anim.desiredFacing = -1;
      if (this.anim.facing !== -1 && this.anim.turnT <= 0) this.anim.requestTurn(-1);
    }

    // aim input (continuous after a short hold)
    if (armed && !a.victory) {
      for (const k of ['up', 'down'] as const) {
        if (this.keys[k]) {
          a.idleNoInputT = 0;
          if (this.anim.baseState === 'sit') this.anim.toggleSit();
          this.keyHold[k] += dt;
          if (this.keyHold[k] > 0.28) a.angle = clamp(a.angle + (k === 'up' ? 1 : -1) * 45 * dt, CFG.shot.angleMin, CFG.shot.angleMax);
        }
      }
    }

    // Keep RigAnimator synchronized in shooting stance when armed & standing ready!
    const readyToAim =
      armed &&
      move === 0 &&
      !a.victory &&
      this.anim.baseState !== 'sit' &&
      this.anim.jumpPhase === 'none' &&
      !this.anim.reaction &&
      this.canShootMore() &&
      !this.arrowInFlight() &&
      this.anim.armedMomentT <= 0;

    if (readyToAim && this.anim.shootPhase === 'none' && (a.pose === 'aim' || a.pose === 'draw')) {
      this.anim.beginShoot(false);
    } else if ((!readyToAim || move !== 0) && this.anim.shootPhase !== 'none' && this.anim.shootPhase !== 'release' && this.anim.shootPhase !== 'follow' && this.anim.shootPhase !== 'recover') {
      this.anim.shootPhase = 'none';
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

    // Update 4-layer RigAnimator
    const inp = this.animatorInput();
    this.anim.update(dt, inp, dx);

    // Consume anim events (footsteps, snow puffs, footprints, breath clouds)
    for (const ev of this.anim.events) {
      if (ev.type === 'footstep') {
        this.audio.footstep(ev.alt);
      } else if (ev.type === 'snowPuff') {
        this.burst(a.x + (Math.random() - 0.5) * 30, G - 4, ev.count, ['#FFFFFF', '#EBEDF8'], 120, 'c', 450);
      } else if (ev.type === 'footprint') {
        this.footprints.push({ x: a.x, life: 0 });
      } else if (ev.type === 'breathCloud') {
        this.particles.push({
          x: a.x + a.facing * 42,
          y: G - 235,
          vx: a.facing * 32,
          vy: -20,
          life: 0,
          max: 0.9,
          color: 'rgba(255,255,255,0.75)',
          size: 16,
          shape: 'c',
          rot: 0,
          vr: 0,
          g: -8,
        });
      }
    }
  }

  private updatePickups(dt: number) {
    const a = this.archer;
    for (const p of this.pickups) {
      if (!p.collected) {
        if (Math.abs(a.x - p.x) < 80 && !a.victory) this.collect(p);
      } else if (p.fly < 1) {
        p.fly += dt / 0.45;
        if (p.fly >= 1) {
          p.fly = 1;
          this.onAttach(p);
        }
      }
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
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      this.footprints[i].life += dt;
      if (this.footprints[i].life > 3.5) this.footprints.splice(i, 1);
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
      if (a.hintUnarmedT > 0) want = 'Need bow + arrows!';
      else if (!a.hasBow && !a.hasQuiver) want = 'Head left ← to find your gear';
      else if (!a.hasQuiver) want = `Find the arrows ${dirTo(CFG.quiver.x)}`;
      else if (!a.hasBow) want = `Find the bow ${dirTo(CFG.bow.x)}`;
      else if (!a.firedOnce && this.pickups.every((p) => p.fly >= 1))
        want = this.isTouch ? 'Drag back on the right side to aim & shoot' : 'Hold SPACE to draw · ↑↓ to aim · Shift Run';
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
    const walking = a.pose === 'walk' || a.pose === 'run';
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

    // snow footprints
    for (const fp of this.footprints) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - fp.life / 3.5) * 0.55;
      ctx.fillStyle = PAL.groundDark;
      ctx.beginPath();
      ctx.ellipse(fp.x, G + 5, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // target
    {
      const T = this.target;
      const by = this.baseY();
      const lift = CFG.target.standLift;
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
        const near = Math.abs(this.archer.x - p.x) < 150;
        const pulse = 0.5 + 0.5 * Math.sin(t * (near ? 8 : 3) + p.phase);
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
          const ang = t * (near ? 2.6 : 1.2) + k * 2.094 + p.phase;
          drawStar(ctx, cx + Math.cos(ang) * 115, cy + Math.sin(ang) * 115 * 0.6, 9 + 4 * Math.sin(t * 5 + k), ang);
        }
        ctx.save();
        ctx.translate(p.x, G - 6 + bob);
        if (p.kind === 'bow') drawBowItem(ctx);
        else drawQuiverItem(ctx);
        ctx.restore();
      } else if (p.fly < 1) {
        const e = p.fly * p.fly * (3 - 2 * p.fly);
        const a = this.archer;
        const tx = a.x;
        const ty = a.y - 250;
        const x = p.fx + (tx - p.fx) * e;
        const y = p.fy + (ty - p.fy) * e;
        const sc = 1 - 0.75 * e;
        ctx.save();
        ctx.globalAlpha = 1 - e * e;
        ctx.translate(x, y + 90 * sc);
        if (p.kind === 'bow') drawBowItem(ctx, 0.65 * sc);
        else drawQuiverItem(ctx, 0.65 * sc);
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

    // archer (upgraded 4-layer rig!)
    {
      const a = this.archer;
      const pose = this.anim.evaluatePose(this.animatorInput());

      // ground shadow shrinking with height
      if (this.phase !== 'title') {
        const shadowA = Math.max(0.15, 0.65 - pose.jumpY / 240);
        ctx.fillStyle = `rgba(180,188,210,${shadowA})`;
        ctx.beginPath();
        ctx.ellipse(a.x, a.y + 6, Math.max(40, 110 - pose.jumpY * 0.35), 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(this.anim.facing === -1 ? 1 : -1, 1);
      const localPivots = drawRigArcher(ctx, pose);
      ctx.restore();

      const f = this.anim.facing === -1 ? 1 : -1;
      this.lastArcherHand = { x: a.x + localPivots.leadHand.x * f, y: a.y + localPivots.leadHand.y };

      // angle indicator + preview
      if (
        this.phase === 'playing' &&
        this.armed() &&
        (a.pose === 'aim' || a.pose === 'draw') &&
        this.anim.baseState !== 'sit' &&
        this.anim.shootPhase !== 'none' &&
        !a.victory &&
        this.anim.facing === -1 &&
        !this.arrowInFlight()
      ) {
        const hx = this.lastArcherHand.x;
        const hy = this.lastArcherHand.y;
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
        const by = a.y - 440 - this.anim.jumpY + Math.sin(t * 3) * 4;
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
      hat: this.anim.hat,
      hatWearing: this.anim.hatWearing,
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
    };
  }
}
