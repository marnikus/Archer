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
import { SpartanFoe, FOE } from './spartanFoe';
import { DesertScene, DESERT, uToX, xToU, FOE_U, TOTAL_U, END_U, type SceneEnv } from './desertScene';
import { drawRig, drawHatLoose, type WeaponKind } from '../rig/rig';

export type Mode = 'normal' | 'hard';
export type Phase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';
type Pose = 'idle' | 'walk' | 'aim' | 'draw' | 'release' | 'celebrate' | 'sad' | 'shake' | 'victory';

const W = CFG.world.width;
const LINES = {
  foe: {
    notice: ['Hm? A visitor!', 'Oh! Lunch arrived!'],
    attack: ['THIS... IS... MODERATELY SPARTA!', 'Come here, snack!', 'Hold still, crunchy!', 'AAARGH! (I practiced this!)'],
    sprint: ['Coming through!', 'Incoming Spartan!', 'Run, little beard!'],
    block: ['Tickles!', 'Is that all?', 'My shield says thanks.', 'Pointy stick? Cute.', 'Nope!'],
    hurt: ['OW! My pretty face!', 'Not the face!', 'Rude!', 'That one counted?!'],
    wound: ["Okay. NOW I'm angry-er!", 'You made me sweat!', 'Fine. No more Mr. Nice Spartan.'],
    die: ['Tell my shield... I loved it...', 'Worth it... for the cape...', 'I regret nothing. Except this.'],
    taunt: ['Gotcha!', 'Next!', 'Beard? Hah!'],
  },
  hero: {
    ouch: ['My beard!', 'Ow ow ow!', 'I need a bigger hat!'],
    hit: ['Gotcha!', 'Take that, shield-boy!', 'Beard power!'],
    block: ['Rude.', 'He blocked it?!', 'Hmph.'],
    win: ['Told you. Mostly beard.', 'Nothing personal.', "Where's my snack now?"],
  },
} as const;
const CUT_FOE = 'A tiny archer?! Finally — a snack!';
const CUT_HERO = "Snack? I'm mostly beard. You'll regret it.";
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

const smoothstep = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
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

/** user-adjustable shooting feel (UI: HUD 🎯 button and Settings) */
export interface ShotTuning {
  /** power-bar speed multiplier = how fast the bow is drawn */
  drawSpeed: number;
  /** speed multiplier of the arrow-fetch animation */
  reloadSpeed: number;
  /** pause (s) after a shot before the hand goes for the next arrow */
  reloadPause: number;
  /** minimum time (s) between two shots */
  shotDelay: number;
  /** allow the next shot while the previous arrow is still flying */
  fireInFlight: boolean;
}
export const DEFAULT_TUNING: ShotTuning = { drawSpeed: 1, reloadSpeed: 1, reloadPause: 0.15, shotDelay: 0, fireInFlight: true };

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
  stage: 'snow' | 'desert';
  /** Spartan state while he is on screen (desert), else null */
  foe: { hp: number; max: number; open: boolean; anger: number; angerMax: number; alive: boolean; state: string } | null;
  canSkip: boolean;
  cut: boolean;
  foeLives: number;
  worldMin: number;
  zoom: number;
  tune: ShotTuning;
  reloading: boolean;
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
  downT: number;
  introWalkT: number;
  kb: number;
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
    an.tune.loadSpeed = this.tune.reloadSpeed;
    an.tune.loadPause = this.tune.reloadPause;
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
    this.cam.x = CFG.archer.startX - 230;
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
      downT: 0,
      introWalkT: 0,
      kb: 0,
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
    this.stage = 'snow';
    this.foe = null;
    this.trans = null;
    this.finale = null;
    this.fade = 0;
    this.obst = 1;
    this.skipped = false;
    this.shakeT = 0;
    this.foeBlocks = 0;
    this.bubbles = [];
    this.barkCool = { hero: 0, foe: 0 };
    this.metDone = false;
    this.cut = null;
    this.minX = CFG.archer.minX;
    this.maxX = CFG.archer.maxX;
    this.worldW = W;
    this.wallX = 140;
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

  /** DEV: put the hero at the shooting line with 9/10 hits, so the next hit finishes the first challenge. */
  private spawnFinalShot() {
    const a = this.archer;
    a.hasBow = true;
    a.hasQuiver = true;
    this.weapon = 'bow';
    this.weaponReady = false;
    a.x = 2300;
    a.facing = -1;
    a.pose = 'aim';
    a.firedOnce = true;
    for (const p of this.pickups) {
      p.collected = true;
      p.fly = 1;
    }
    this.startArrowVisible = false;
    this.streak = 9;
    this.arrowsUsed = 9;
    this.score = 4200;
    this.pipKey++;
    this.setupStage(9);
    this.audio.setLayers(3);
    this.cam.x = a.x - 150;
    this.showBanner('FINAL SHOT!', 'final', 'DEV start · one hit finishes the first challenge');
  }

  /** DEV: same, from the pause menu. */
  devFinalShot() {
    if (this.stage !== 'snow' || this.phase === 'title' || this.phase === 'victory' || this.phase === 'gameover') return;
    if (this.phase === 'paused') this.togglePause();
    if (this.archer.charging) this.cancelCharge();
    this.audio.creakStop();
    this.arrows = [];
    this.spawnFinalShot();
  }

  start(mode: Mode, opts?: { skip?: boolean; finalShot?: boolean }) {
    this.mode = mode;
    this.best = this.loadBest();
    this.resetWorld();
    this.audio.unlock();
    this.audio.musicStart();
    this.setPhase('playing');
    if (opts?.skip) this.enterDesert(true);
    else if (opts?.finalShot) this.spawnFinalShot();
  }

  /** Jump straight to the desert (skip the first challenge). Works from the pause menu too. */
  skipToDesert() {
    if (this.stage !== 'snow' || this.phase === 'title' || this.phase === 'victory' || this.phase === 'gameover') return;
    if (this.phase === 'paused') this.togglePause();
    if (this.archer.charging) this.cancelCharge();
    this.audio.creakStop();
    this.enterDesert(true);
  }

  restart() {
    this.start(this.mode);
  }

  toTitle() {
    this.resetWorld();
    this.audio.musicStop();
    this.cam.x = CFG.archer.startX - 230;
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

  /** fire was pressed while the next arrow was still being fetched */
  private fireQueued = false;

  pressFire() {
    this.spaceDown = true;
    if (this.phase !== 'playing' || this.inputLocked()) return;
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
    if (a.pose === 'walk' || !this.canShootMore() || (this.arrowInFlight() && !this.tune.fireInFlight) || a.attackT > 0 || this.anim.seq) return;
    if (!this.shotReady()) {
      this.fireQueued = true; // raise the bow and fetch an arrow from the quiver; the draw starts as soon as it is nocked
      return;
    }
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
    this.fireQueued = false;
    if (this.phase !== 'playing') return;
    const a = this.archer;
    if (a.charging && !this.touchAim.active) this.fire(a.power / 100);
  }

  touchAimStart(px: number, py: number) {
    this.isTouch = true;
    if (this.phase !== 'playing' || this.inputLocked()) return;
    const a = this.archer;
    if (a.victory || a.charging) return;
    if (!this.armed()) {
      this.pressFire();
      this.spaceDown = false;
      return;
    }
    if (a.pose === 'walk' || !this.canShootMore() || (this.arrowInFlight() && !this.tune.fireInFlight) || !this.shotReady()) return;
    this.touchAim = { active: true, sx: px, sy: py };
    this.beginCharge();
  }

  touchAimMove(px: number, py: number) {
    if (!this.touchAim.active || !this.archer.charging) return;
    const dx = px - this.touchAim.sx;
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
    this.sinceShot = 0;
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
      this.heroBlowVsFoe(kind);
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
    if (this.stage === 'desert') {
      this.addFloat(x, y - 60, 'MISS', PAL.grey, 30);
      this.audio.womp();
      return;
    }
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
    this.showBanner('CHALLENGE COMPLETE!', 'great', '10 in a row · the desert awaits →');
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
    if (this.cut) {
      this.updateCutscene(dtr, dt);
      return;
    }
    this.updateArcher(dt);
    this.driveAnim(dt);
    this.updatePickups(dt);
    this.updateTarget(dt);
    this.updateWind(dt);
    if (this.stage === 'desert') this.updateDesert(dt);
    this.updateTransition(dtr);
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
      if (this.victoryT > 3 && this.phase === 'playing') {
        if (this.stage === 'snow') this.openRoad();
        else this.finishRun(true);
      }
    }
    if (this.gameoverT >= 0 && !this.archer.victory) {
      this.gameoverT += dtr;
      if (this.gameoverT > 1.6 && this.phase === 'playing' && !this.arrows.some((ar) => ar.state === 'fly')) {
        this.audio.gameOver();
        this.finishRun(false);
      }
    }
  }

  // ================================================================== stages: snow → desert → gate
  stage: 'snow' | 'desert' = 'snow';
  foe: SpartanFoe | null = null;
  private trans: { kind: 'restart' | 'fadeIn'; t: number } | null = null;
  private finale: { phase: 'out'; t: number } | null = null;
  private fade = 0;
  /** 1 = the first stage's line, target stand and cliff wall are there; fades to 0 when the road opens */
  private obst = 1;
  private skipped = false;
  /** shooting feel, adjustable in the UI and remembered */
  tune: ShotTuning = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('als-tune') ?? 'null');
      if (raw && typeof raw === 'object') return { ...DEFAULT_TUNING, ...raw } as ShotTuning;
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_TUNING };
  })();
  /** seconds since the last arrow left the bow */
  private sinceShot = 99;
  /** global camera zoom preference (user slider) */
  zoomPref = (() => {
    try {
      const v = parseFloat(localStorage.getItem('als-zoom') ?? '');
      return Number.isFinite(v) ? Math.min(1.3, Math.max(0.5, v)) : 0.7;
    } catch {
      return 0.7;
    }
  })();
  private shakeT = 0;
  private shakeX = 0;
  private shakeY = 0;
  private foeBlocks = 0;
  private slowFor: Arrow | null = null;
  // ---- story: speech bubbles + the first-meeting cutscene
  private bubbles: Array<{ who: 'hero' | 'foe'; text: string; t: number; dur: number }> = [];
  private barkCool = { hero: 0, foe: 0 };
  private metDone = false;
  private cut: { t: number; shot: 'foe' | 'hero' | 'heroWide'; fired: number; kind: 'meet' | 'defeat' } | null = null;
  get cutActive() {
    return this.cut !== null;
  }
  private minX = CFG.archer.minX;
  private maxX = CFG.archer.maxX;
  private worldW = W;
  private wallX = 140;
  private desertScene: DesertScene | null = null;

  /** DEV: set the Spartan's lives (1..20). Remembered; applies at once if he is on screen. */
  setFoeLives(n: number) {
    FOE.hp = Math.min(20, Math.max(1, Math.round(n)));
    try {
      localStorage.setItem('als-foe-lives', String(FOE.hp));
    } catch {
      /* ignore */
    }
    if (this.foe && this.foe.alive) this.foe.hp = FOE.hp;
  }

  setTune(p: Partial<ShotTuning>) {
    const c = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const t = { ...this.tune, ...p };
    t.drawSpeed = c(t.drawSpeed, 0.3, 3);
    t.reloadSpeed = c(t.reloadSpeed, 0.3, 4);
    t.reloadPause = c(t.reloadPause, 0, 2);
    t.shotDelay = c(t.shotDelay, 0, 3);
    this.tune = t;
    this.anim.tune.loadSpeed = t.reloadSpeed;
    this.anim.tune.loadPause = t.reloadPause;
    try {
      localStorage.setItem('als-tune', JSON.stringify(t));
    } catch {
      /* ignore */
    }
  }

  /** the arrow is on the string and the minimum shot delay has passed */
  private shotReady() {
    return this.anim.arrowReady && this.sinceShot >= this.tune.shotDelay;
  }

  setZoom(v: number) {
    this.zoomPref = Math.min(1.3, Math.max(0.5, v));
    try {
      localStorage.setItem('als-zoom', String(this.zoomPref));
    } catch {
      /* ignore */
    }
  }

  /** 0 = snow backdrop only … 1 = desert backdrop only; driven by where the hero walks (no teleport) */
  private blend() {
    if (this.stage === 'snow') return 0;
    if (this.skipped) return 1;
    return smoothstep((300 - this.archer.x) / 1600);
  }

  private scene() {
    return (this.desertScene ??= new DesertScene());
  }

  private sceneEnv(ctx: CanvasRenderingContext2D, w: number, h: number, visW: number, t: number): SceneEnv {
    return {
      setLayer: (f) => this.setCam(ctx, f),
      camX: this.cam.x,
      visW,
      groundY: G,
      w,
      h,
      progress: clamp(xToU(this.archer.x) / TOTAL_U, 0, 1),
      time: t,
    };
  }

  /** hero input is ignored while scripted things happen */
  private inputLocked() {
    const a = this.archer;
    return a.downT > 0 || a.introWalkT > 0 || this.trans?.kind === 'restart' || this.finale !== null || this.cut !== null;
  }

  private minXNow() {
    if (this.stage === 'snow') return this.minX;
    if (this.foe?.alive) return this.foe.x + 260;
    return uToX(END_U + 260);
  }

  /** The first challenge is won: the line, the target and the cliff wall dissolve and the hero simply keeps walking. */
  private openRoad() {
    const a = this.archer;
    this.victoryT = -1;
    a.victory = false;
    a.pose = 'idle';
    this.stage = 'desert';
    this.maxX = CFG.archer.maxX;
    this.wallX = uToX(END_U + 700);
    this.scene();
    this.streak = 0;
    this.arrows = [];
    this.wind = { cur: 0, goal: 0, max: 0, gust: false, gustT: 0 };
    this.arrowsLeft = Infinity;
    this.gameoverT = -1;
    this.finale = null;
    this.foeBlocks = 0;
    this.foe = new SpartanFoe(uToX(FOE_U));
    this.foe.onEvent = (e) => this.onFoeEvent(e);
    this.target.x = this.foe.worldX;
    a.introWalkT = 2.4;
    this.hintLast = '';
    this.hintT = 99;
    this.showBanner('THE ROAD OPENS', 'great', 'Keep walking → the desert gate is ahead');
    this.audio.pop();
  }

  private enterDesert(skip: boolean) {
    const a = this.archer;
    this.stage = 'desert';
    this.skipped = true;
    this.obst = 0;
    this.minX = uToX(END_U + 260);
    this.maxX = CFG.archer.maxX;
    this.wallX = uToX(END_U + 700);
    this.scene();
    a.x = uToX(DESERT.HERO_U);
    a.y = G;
    a.facing = -1;
    a.pose = 'idle';
    a.victory = false;
    a.charging = false;
    a.power = 0;
    a.downT = 0;
    a.kb = 0;
    a.hasBow = true;
    a.hasQuiver = true;
    this.weapon = 'bow';
    this.weaponReady = false;
    this.hold = null;
    for (const p of this.pickups) {
      p.collected = true;
      p.fly = 1;
    }
    this.startArrowVisible = false;
    this.streak = 0;
    this.arrows = [];
    this.particles = [];
    this.floats = [];
    this.wind = { cur: 0, goal: 0, max: 0, gust: false, gustT: 0 };
    this.arrowsLeft = Infinity;
    this.victoryT = -1;
    this.gameoverT = -1;
    this.finale = null;
    this.foeBlocks = 0;
    this.foe = new SpartanFoe(uToX(FOE_U));
    this.foe.onEvent = (e) => this.onFoeEvent(e);
    this.target.x = this.foe.worldX;
    a.introWalkT = skip ? 0 : 1.5;
    this.cam.x = a.x - 150;
    this.cam.zoom = 0.78;
    this.hintLast = '';
    this.hintT = 99;
    this.showBanner('THE DESERT GATE', 'great', 'A Spartan guards the arch · his shield blocks arrows');
    this.audio.pop();
  }

  private restartDesert() {
    const a = this.archer;
    this.skipped = true;
    this.obst = 0;
    a.x = uToX(DESERT.HERO_U);
    a.downT = 0;
    a.kb = 0;
    a.pose = 'idle';
    a.charging = false;
    a.power = 0;
    a.introWalkT = 0.8;
    this.arrows = [];
    this.particles = [];
    this.floats = [];
    this.foe?.reset(uToX(FOE_U));
    this.foeBlocks = 0;
    this.cam.x = a.x - 150;
    this.hintLast = '';
    this.hintT = 99;
    this.showBanner('TRY AGAIN', 'good', 'Back to the start of the desert');
  }

  /** The Spartan's sword touched the hero. */
  private heroHit() {
    const a = this.archer;
    if (a.charging) this.cancelCharge();
    this.audio.creakStop();
    a.downT = 1.3;
    a.pose = 'sad';
    a.poseT = 0;
    a.kb = 560;
    this.trans = { kind: 'restart', t: 0 };
    this.shakeT = 0.55;
    this.slowT = 0.3;
    this.slowScale = 0.3;
    this.audio.shake();
    this.audio.womp();
    this.addFloat(a.x, a.y - 480, 'OUCH!', PAL.red, 54);
    this.barkCool.hero = 0;
    this.bark('hero', 'ouch', 1, 0.2);
    this.bark('foe', 'taunt', 0.8, 0.9);
    this.burst(a.x, a.y - 250, 18, [PAL.red, '#FFFFFF', PAL.gold], 440, 's', 400);
    this.ring(a.x, a.y - 250, '#FFFFFF', 120);
  }

  /** The hero's own weapons against the Spartan: melee blows, punches, crossbow bolts. */
  private heroBlowVsFoe(kind: string) {
    const foe = this.foe;
    const a = this.archer;
    if (this.stage !== 'desert' || !foe || !foe.alive) return;
    if (kind === 'crossbow') {
      const tip = this.weaponTip();
      const dx = a.facing === -1 ? -1 : 1;
      this.arrows.push({ x: tip.x, y: tip.y, vx: dx * 1900, vy: -45, rot: dx === -1 ? Math.PI : 0, state: 'fly', stick: null, t: 0, trail: [], dist: 0, final: false, closeCalled: false });
      this.arrowsUsed++;
      return;
    }
    const tip = this.weaponTip();
    const res = foe.testMelee(a.x, tip.x, G);
    if (!res) return;
    if (res === 'shield') {
      const angry = foe.block(0, 0, 0, false);
      this.foeBlocks++;
      this.burst(tip.x, tip.y, 10, ['#FFFFFF', PAL.gold, '#D9A25B'], 330, 's', 300);
      this.audio.wallThud();
      this.addFloat(tip.x, tip.y - 110, 'CLANG!', PAL.grey, 34);
      if (angry) {
        this.addFloat(foe.worldX, G - 560, 'GRRR!', PAL.red, 40);
        this.shakeT = 0.25;
      } else this.addFloat(foe.worldX, G - 520, `${foe.anger}/${foe.angerMax}`, PAL.orange, 28);
      return;
    }
    const dmg: Record<string, number> = { unarmed: 0.5, sword: 1, spear: 1, staff: 1, axe: 1.5 };
    const dead = foe.damage(dmg[kind] ?? 1);
    this.burst(tip.x, tip.y, 18, [PAL.red, PAL.orange2, '#FFFFFF', PAL.gold], 420, 's', 450);
    this.ring(tip.x, tip.y, PAL.gold, 110);
    this.addFloat(tip.x, tip.y - 110, dead ? 'DOWN!' : `HIT! ${Math.ceil(foe.hp)} left`, PAL.gold, 40);
    this.audio.thud();
    this.shakeT = 0.3;
    this.slowT = 0.3;
    this.slowScale = 0.3;
    if (dead) this.onFoeDefeated();
  }

  // ---------------------------------------------------------------- dialogue + cutscene
  private speak(who: 'hero' | 'foe', text: string, dur = 2.4, delay = 0) {
    this.bubbles = this.bubbles.filter((b) => b.who !== who);
    this.bubbles.push({ who, text, t: -delay, dur });
  }

  private bark(who: 'hero' | 'foe', kind: string, prob = 1, delay = 0) {
    if (this.cut || this.phase !== 'playing' || this.stage !== 'desert' || this.barkCool[who] > 0 || Math.random() > prob) return;
    const bank = (LINES[who] as Record<string, readonly string[]>)[kind];
    if (!bank) return;
    this.speak(who, pick(bank), 2.4, delay);
    this.barkCool[who] = 2.8 + delay;
  }

  private onFoeEvent(e: string) {
    if (this.stage !== 'desert') return;
    switch (e) {
      case 'notice':
        if (!this.metDone) this.startCutscene();
        else this.bark('foe', 'notice');
        break;
      case 'attack':
        this.bark('foe', 'attack', 0.8);
        break;
      case 'sprint':
        this.bark('foe', 'sprint', 0.4);
        break;
      case 'block':
        this.bark('foe', 'block', 0.5);
        this.bark('hero', 'block', 0.25, 0.9);
        break;
      case 'hurt':
        this.bark('foe', 'hurt', 1);
        this.bark('hero', 'hit', 0.55, 1.1);
        break;
      case 'wound':
        this.barkCool.foe = 0;
        this.bark('foe', 'wound', 1);
        break;
      case 'die':
        this.startDefeatCutscene();
        break;
    }
  }

  private startCutscene() {
    const a = this.archer;
    if (!this.foe) return;
    if (a.charging) this.cancelCharge();
    this.audio.creakStop();
    this.bubbles = [];
    this.cut = { t: 0, shot: 'foe', fired: 0, kind: 'meet' };
    this.foe.hold = 'notice';
    this.foe.hunting = true;
    this.hold = null;
    this.peekDir = null;
  }

  /** The Spartan fell: his last words, then the hero's victory. */
  private startDefeatCutscene() {
    const a = this.archer;
    if (!this.foe || this.cut) return;
    if (a.charging) this.cancelCharge();
    this.audio.creakStop();
    this.bubbles = [];
    this.arrows = this.arrows.filter((ar) => ar.state !== 'fly');
    this.cut = { t: 0, shot: 'foe', fired: 0, kind: 'defeat' };
    this.hold = null;
    this.peekDir = null;
    this.slowT = 0;
  }

  skipCutscene() {
    if (this.cut) this.endCutscene();
  }

  private endCutscene() {
    const kind = this.cut?.kind;
    this.cut = null;
    this.metDone = true;
    this.bubbles = [];
    if (kind === 'defeat') {
      this.archer.pose = 'idle';
      this.showBanner('SPARTAN DOWN!', 'great', 'Follow the path past the ruins →');
    }
    if (this.foe) {
      this.foe.hold = null;
      this.foe.exprForce = null;
      this.foe.hunting = true;
    }
    this.anim.faceOverride = null;
    this.barkCool = { hero: 1.5, foe: 2.5 };
  }

  private updateCutscene(dtr: number, dt: number) {
    const c = this.cut!;
    const foe = this.foe!;
    const an = this.anim;
    const a = this.archer;
    c.t += dtr;
    const t = c.t;
    let script: Array<[number, () => void]>;
    if (c.kind === 'meet') {
      script = [
        [0.9, () => this.speak('foe', CUT_FOE, 3.4)],
        [4.6, () => {
          c.shot = 'hero';
          an.react('surprised');
        }],
        [5.2, () => this.speak('hero', CUT_HERO, 3.4)],
        [5.6, () => an.react('nod')],
        [9.0, () => (c.shot = 'foe')],
        [10.2, () => this.endCutscene()],
      ];
    } else {
      // DEFEAT: the Spartan's last words (camera on his face while he falls), then the hero's victory
      const last = pick(LINES.foe.die);
      const win1 = pick(['Told you. Mostly beard.', 'Nothing personal.']);
      script = [
        [0.3, () => this.speak('foe', last, 3.4)],
        [3.9, () => {
          c.shot = 'hero';
          a.pose = 'idle';
          an.react('victory');
          this.audio.fanfare();
          this.confetti(a.x, G - 380, 70);
        }],
        [4.4, () => this.speak('hero', win1, 3)],
        [5.4, () => (c.shot = 'heroWide')],
        [5.6, () => an.react('victory')],
        [7.3, () => this.speak('hero', "Now... where's my snack?", 2.8)],
        [7.6, () => an.react('celebrate')],
        [10.4, () => this.endCutscene()],
      ];
    }
    while (this.cut && c.fired < script.length && t >= script[c.fired][0]) script[c.fired++][1]();
    if (!this.cut) return;
    if (c.kind === 'meet') {
      // the Spartan sneers, laughs at the "snack" line, then glares; the hero goes from shock to a determined smirk
      if (t < 0.9) foe.exprForce = { lift: 0.2, tilt: 0.2, eye: 0.95, mouth: 0.1, smile: 0.5, asym: 1 };
      else if (t < 4.4) foe.exprForce = { lift: 0.35, tilt: 0.15, eye: 0.8, mouth: 0.5 + 0.28 * Math.sin(t * 13), smile: 0.9, asym: 1 };
      else if (t < 8.8) foe.exprForce = { lift: -0.2, tilt: 0.45, eye: 0.9, mouth: 0.05, smile: -0.5, asym: 0 };
      else foe.exprForce = { lift: -0.6, tilt: 0.75, eye: 0.7, mouth: 0.25, smile: -0.8, asym: 0 };
      if (t < 4.6) an.faceOverride = { brow: 0.1, smile: 0 };
      else if (t < 6.2) an.faceOverride = { brow: 0.95, smile: 0 };
      else an.faceOverride = { brow: -0.55, smile: 0.7 };
    } else {
      // the Spartan: a weak, rueful smile fading to closed eyes; the hero: wide-eyed joy, then a proud grin
      if (t < 3.9) foe.exprForce = { lift: 0.45, tilt: -0.5, eye: Math.max(0.15, 0.6 - 0.12 * t), mouth: 0.25 + 0.12 * Math.sin(t * 5), smile: -0.2, asym: 0 };
      if (t < 3.9) an.faceOverride = { brow: 0.1, smile: 0 };
      else if (t < 5.6) an.faceOverride = { brow: 0.95, smile: 1, blink: -0.2 };
      else if (t < 7.3) an.faceOverride = { brow: 0.4, smile: 1 };
      else an.faceOverride = { brow: -0.2, smile: 1 };
    }
    this.driveAnim(dt);
    foe.update(dt, a.x, true);
    for (const b of this.bubbles) b.t += dtr;
    this.bubbles = this.bubbles.filter((b) => b.t < b.dur);
    this.updateFx(dt);
    this.updateCamera(dtr);
  }

  private drawBubbles(ctx: CanvasRenderingContext2D) {
    if (!this.bubbles.length) return;
    const a = this.archer;
    const close = this.cut !== null;
    for (const b of this.bubbles) {
      if (b.t < 0) continue;
      const foe = this.foe;
      const fall = foe ? foe.fall : 0; // the bubble follows his head as he topples backwards
      const headY = b.who === 'hero' ? a.y - 330 : G + (foe ? foe.pose.y : 0) - 395 * Math.cos(fall);
      const x = b.who === 'hero' ? a.x - 20 : foe ? foe.worldX + 10 - 380 * Math.sin(fall) : a.x;
      const size = close ? 27 : 24;
      const maxW = close ? 560 : 400;
      const al = clamp(Math.min(b.t / 0.15, (b.dur - b.t) / 0.25), 0, 1);
      ctx.save();
      ctx.globalAlpha = al;
      ctx.translate(x, headY - (close ? 92 : 150));
      ctx.scale(-1, 1); // the world is drawn mirrored: keep text readable
      ctx.font = `800 ${size}px Nunito, "Segoe UI", system-ui, sans-serif`;
      // word wrap
      const words = b.text.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && cur) {
          lines.push(cur);
          cur = w;
        } else cur = test;
      }
      if (cur) lines.push(cur);
      const lw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bw = lw + 44;
      const bh = lines.length * (size + 6) + 26;
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, -bw / 2, -bh, bw, bh, 22);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-16, -2);
      ctx.lineTo(16, -2);
      ctx.lineTo(b.who === 'hero' ? 18 : -18, 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = b.who === 'foe' ? '#8E1B17' : PAL.brownDark;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((l, i) => ctx.fillText(l, 0, -bh + 13 + (size + 6) * i + (size + 6) / 2));
      ctx.restore();
    }
  }

  private onArrowFoe(ar: Arrow, hit: { kind: 'shield' | 'body'; x: number; y: number }) {
    const foe = this.foe!;
    if (hit.kind === 'shield') {
      const h = foe.skel.handF;
      let ox = foe.worldX - hit.x - h.x;
      let oy = hit.y - G - h.y;
      const r = Math.hypot(ox, oy);
      if (r > 80) {
        ox *= 80 / r;
        oy *= 80 / r;
      }
      const angry = foe.block(ox, oy, Math.PI - ar.rot);
      this.foeBlocks++;
      this.burst(hit.x, hit.y, 10, ['#FFFFFF', PAL.gold, '#D9A25B'], 330, 's', 300);
      this.ring(hit.x, hit.y, '#FFFFFF', 70);
      this.audio.wallThud();
      this.audio.thud();
      this.addFloat(hit.x, hit.y - 120, 'CLANG!', PAL.grey, 34);
      if (angry) {
        this.addFloat(foe.worldX, G - 560, 'GRRR!', PAL.red, 40);
        this.audio.shake();
        this.shakeT = 0.25;
      } else this.addFloat(foe.worldX, G - 520, `${foe.anger}/${foe.angerMax}`, PAL.orange, 28);
    } else {
      const gap = !foe.open;
      const dead = foe.damage();
      if (gap) this.addFloat(hit.x, hit.y - 170, 'THROUGH THE GAP!', PAL.orange, 32);
      this.burst(hit.x, hit.y, 18, [PAL.red, PAL.orange2, '#FFFFFF', PAL.gold], 420, 's', 450);
      this.ring(hit.x, hit.y, PAL.gold, 110);
      this.addFloat(hit.x, hit.y - 110, dead ? 'DOWN!' : `HIT! ${foe.hp} left`, PAL.gold, 40);
      this.audio.thud();
      this.audio.score(2);
      this.shakeT = 0.3;
      this.slowT = 0.35;
      this.slowScale = 0.3;
      if (dead) this.onFoeDefeated();
    }
  }

  private onFoeDefeated() {
    if (this.cut) return; // the defeat cutscene (started by the Spartan's 'die' event) handles the celebration
    const a = this.archer;
    this.showBanner('SPARTAN DOWN!', 'great', 'Follow the path past the ruins →');
    this.audio.fanfare();
    this.confetti(this.foe!.worldX, G - 400, 90);
    a.pose = 'celebrate';
    a.poseT = 0;
  }

  private updateDesert(dt: number) {
    const foe = this.foe!;
    const a = this.archer;
    if (this.obst > 0 && !this.skipped) this.obst = Math.max(0, this.obst - dt / 1.4);
    this.barkCool.hero = Math.max(0, this.barkCool.hero - dt);
    this.barkCool.foe = Math.max(0, this.barkCool.foe - dt);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.dur);
    // the shield reads incoming arrows: predicted impact height + time, so it can slide over and cover the hit
    foe.predY = null;
    foe.predT = 9;
    let nearest: Arrow | null = null;
    if (foe.alive) {
      const plane = foe.worldX + (-foe.skel.handF.x + 12);
      for (const ar of this.arrows) {
        if (ar.state !== 'fly' || ar.vx >= 0 || ar.x <= plane) continue;
        const tt = (ar.x - plane) / -ar.vx;
        if (tt > 0 && tt < foe.predT) {
          foe.predT = tt;
          foe.predY = ar.y + ar.vy * tt + 0.5 * CFG.shot.gravity * tt * tt - G;
          nearest = ar;
        }
      }
    }
    foe.update(dt, a.x, a.downT <= 0 && this.trans?.kind !== 'restart');
    // slow motion while the shield slides to cover an arrow, so the player can see it
    if (nearest && foe.tracking && foe.predT < 0.5 && this.slowFor !== nearest) {
      this.slowFor = nearest;
      this.slowT = 0.55;
      this.slowScale = 0.35;
    }
    this.target.x = foe.alive ? foe.worldX : uToX(END_U);
    if (foe.swordHits(a.x) && a.downT <= 0 && this.trans?.kind !== 'restart') {
      foe.struck = true;
      this.heroHit();
    }
    // the level ends when the hero has walked the path to the far side of the ruins (no auto-play)
    if (!foe.alive && !this.finale && xToU(a.x) >= END_U) {
      this.finale = { phase: 'out', t: 0 };
      this.showBanner('PATH CLEARED', 'great', 'You passed the ruins');
      this.audio.fanfare();
      this.confetti(a.x, G - 400, 60);
    }
    const fin = this.finale;
    if (fin) {
      fin.t += dt;
      if (fin.t > 1.2) this.fade = clamp((fin.t - 1.2) / 0.7, 0, 1);
      if (fin.t > 2.0) {
        this.finale = null;
        this.finishRun(true);
      }
    }
  }

  private updateTransition(dtr: number) {
    // camera shake
    if (this.shakeT > 0) {
      this.shakeT -= dtr;
      const k = Math.max(0, this.shakeT);
      this.shakeX = Math.sin(this.time * 90) * 22 * k;
      this.shakeY = Math.cos(this.time * 70) * 14 * k;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    const T = this.trans;
    if (!T) return;
    T.t += dtr;
    if (T.kind === 'restart') {
      this.fade = clamp((T.t - 0.65) / 0.35, 0, 1);
      if (T.t > 1.05) {
        this.restartDesert();
        this.trans = { kind: 'fadeIn', t: 0 };
        this.fade = 1;
      }
    } else if (T.kind === 'fadeIn') {
      this.fade = clamp(1 - T.t / 0.8, 0, 1);
      if (T.t > 0.8) {
        this.trans = null;
        this.fade = 0;
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
    return this.phase === 'playing' && !a.victory && a.pickupT <= 0 && a.attackT <= 0 && !this.anim.seq && !this.anim.attacking && !this.inputLocked();
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
    if (this.inputLocked()) return false;
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
    if (this.phase !== 'playing' || a.victory || a.pickupT > 0 || this.anim.seq || this.inputLocked()) return;
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
    if (this.phase !== 'playing' || a.victory || a.pickupT > 0 || a.attackT > 0 || a.charging || this.inputLocked()) return;
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
    p.x = clamp(a.x + (a.facing === -1 ? -reach : reach), this.minX + 40, this.maxX);
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
        armed && this.phase === 'playing' && !a.victory && a.pickupT <= 0 && !an.seq && !this.hold && (a.pose === 'aim' || a.pose === 'draw' || a.pose === 'release' || (this.fireQueued && a.pose === 'idle'));
      if (standingArmed) {
        an.shootAim(a.angle * DEG);
        if (a.charging) an.shootDraw(0.4 + 0.6 * (a.power / 100), true);
        an.showArrow = this.canShootMore() && a.pose !== 'release'; // the next arrow is fetched while the last one flies
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
    if (this.fireQueued) {
      if (!this.spaceDown || a.pose === 'walk') this.fireQueued = false;
      else if (this.shotReady()) {
        this.fireQueued = false;
        this.pressFire();
      }
    }
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
    this.sinceShot += dt;
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
    // scripted walking: leaving the first stage, entering the desert, walking through the gate
    if (a.downT > 0) a.downT -= dt;
    if (a.introWalkT > 0) {
      a.introWalkT -= dt;
      move = -1;
    }
    if (a.downT > 0 || this.trans?.kind === 'restart') move = 0;
    if (Math.abs(a.kb) > 1) {
      a.x = clamp(a.x + a.kb * dt, this.minXNow(), this.maxX);
      a.kb *= Math.exp(-6 * dt);
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
      a.x = clamp(a.x + move * this.moveSpeed() * dt, this.minXNow(), this.maxX);
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
      a.power += a.meterDir * 100 * (this.mode === 'hard' ? CFG.hard.meterSpeed : CFG.shot.meterSpeed) * this.tune.drawSpeed * dt;
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
        if (this.stage === 'snow' && px > T.x && ar.x <= T.x) {
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
        // the Spartan wakes when an arrow flies / lands anywhere near him
        if (this.stage === 'desert' && this.foe && this.foe.alive && !this.foe.hunting && Math.abs(ar.x - this.foe.worldX) < 1150) this.foe.provoke();
        // the Spartan: the shield covers what it is over; an open or fooled guard takes damage
        if (this.stage === 'desert' && this.foe) {
          const hit = this.foe.testArrow(px, py, ar.x, ar.y, G);
          if (hit) {
            this.onArrowFoe(ar, hit);
            this.arrows.splice(i, 1);
            continue;
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
        if (ar.x <= this.wallX) {
          ar.state = 'stuck';
          ar.x = this.wallX;
          ar.stick = { kind: 'wall', ox: this.wallX, oy: ar.y, rot: ar.rot };
          ar.trail = [];
          ar.t = 0;
          this.audio.wallThud();
          this.burst(ar.x, ar.y, 6, ['#FFFFFF', '#CADBF5'], 150, 'c', 500);
          this.onMiss(ar, ar.x, ar.y);
          continue;
        }
        if (ar.x > this.worldW + 300 || ar.y > G + 400) {
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
      const dirTo = (x: number) => (x < a.x ? '→' : '←'); // the world is mirrored on screen
      if (this.stage === 'desert' && this.foe?.alive) {
        const f = this.foe;
        if (f.state === 'windup' || f.state === 'strike' || f.state === 'recover') want = 'He is OPEN — shoot now!';
        else if (this.foeBlocks >= 1 && this.foeBlocks < 6) want = `Blocked ${f.anger}/${f.angerMax} — three hits to his shield and he attacks`;
        else if (f.state === 'idle' && !f.hunting) want = 'He has not noticed you — a shot from afar will wake him';
        else if (f.tracking) want = 'His shield follows your arrow — shoot when he attacks';
        else if (!this.arrowsUsed && a.x - f.x < 2400) want = 'His shield covers your arrows — make him angry, then shoot';
        if (want || this.stage === 'desert') {
          if (want !== this.hintLast) {
            this.hintLast = want;
            if (want) {
              this.hintText = want;
              this.hintT = 0;
            } else this.hintT = Math.max(this.hintT, 6.5);
          }
          this.hintT += dtr;
          return;
        }
      }
      if (this.stage === 'desert' && this.foe && !this.foe.alive) want = 'Follow the path past the ruins →';
      else if (a.hintUnarmedT > 0) want = this.hintMsg || 'Need bow + arrows!';
      else if (!a.hasBow && !a.hasQuiver) want = 'Head right → to find your gear';
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
    if (this.cut && this.foe) {
      // cutscene: close-ups of the two faces
      const shot = this.cut.shot;
      const onFoe = shot === 'foe';
      const tzc = (shot === 'heroWide' ? 1.15 : 1.65) / this.zoomPref;
      const f = this.foe.fall; // follow the head as he topples backwards
      const ttx = onFoe ? this.foe.worldX + 10 - 380 * Math.sin(f) : shot === 'heroWide' ? a.x - 30 : a.x - 20;
      const tty = onFoe ? G + this.foe.pose.y - 395 * Math.cos(f) : shot === 'heroWide' ? G - 250 : G - 330;
      this.cam.x = lerpRate(this.cam.x, ttx, 7, dtr);
      this.cam.y = lerpRate(this.cam.y, tty, 7, dtr);
      this.cam.zoom = lerpRate(this.cam.zoom, tzc, 5, dtr);
      return;
    }
    if (this.phase === 'title') {
      tx = CFG.archer.startX - 230; // mirrored world: puts the hero on the left, clear of the title card
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
    } else if (a.victory || this.finale) {
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
    // World space is unchanged (target at low x, hero starts at high x) but is drawn mirrored on
    // screen, so the hero starts on the left and walks right. Text must be flipped back (see MIRRORED).
    ctx.setTransform(-dpr * s, 0, 0, dpr * s, dpr * (w / 2 + (this.cam.x * f + this.shakeX) * s), dpr * (h / 2 - (this.cam.y + this.shakeY) * s));
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    const base = Math.min(h / 800, w / 900) * this.zoomPref;
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
    const blend = this.blend();

    if (blend > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.scene().drawBack(ctx, this.sceneEnv(ctx, w, h, visW, t));
      this.setCam(ctx, 1);
    }
    if (blend < 1) {
      ctx.save();
      if (blend > 0) ctx.globalAlpha = 1 - blend;
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
      if (left < 260 && this.obst > 0.01) {
        ctx.save();
        ctx.globalAlpha *= this.obst;
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
        ctx.restore();
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
      if (this.obst > 0.01 && CFG.fence.x > left - 200 && CFG.fence.x < right + 200) {
        ctx.save();
        ctx.globalAlpha *= this.obst;
        drawFence(ctx, CFG.fence.x, G);
        ctx.restore();
      }
      for (const fx of CFG.flags) {
        if (fx > left - 200 && fx < right + 200) drawFlag(ctx, fx, G, this.wind.cur, this.wind.max, t);
      }
      if (CFG.archer.startX > left - 700 && CFG.archer.startX < right + 700) {
        ctx.save();
        ctx.translate(CFG.archer.startX - 480, 0);
        drawPedestal(ctx);
        ctx.restore();
      }

      // target + its stand (they dissolve when the road opens)
      if (this.obst > 0.01) {
        ctx.save();
        ctx.globalAlpha *= this.obst;
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
            ctx.globalAlpha *= clamp(1 - (ar.t - 2) / 0.6, 0, 1);
            ctx.translate(ar.stick.ox + 14, ar.stick.oy);
            ctx.rotate(ar.stick.rot);
            drawArrowArt(ctx);
            ctx.restore();
          }
        }
        ctx.restore();
        ctx.restore();
      }

      ctx.restore();
      this.setCam(ctx, 1);
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

    // near lane (Spartan fight): the ruins stand BEHIND the hero. Far lane (the path past the ruins): the ruins are drawn OVER him
    const lane = this.stage === 'desert' ? smoothstep((xToU(this.archer.x) - (FOE_U - 150)) / 450) : 0;
    const heroBehind = lane > 0.5;
    if (this.stage === 'desert' && !heroBehind) {
      this.scene().drawArch(ctx, this.sceneEnv(ctx, w, h, visW, t));
      this.setCam(ctx, 1);
    }

    // archer (layered paper-rig, authored facing left)
    {
      const a = this.archer;
      ctx.save();
      ctx.translate(a.x, a.y);
      if (lane > 0) {
        // the path runs BEHIND the ruins: a little farther away (higher and smaller)
        ctx.translate(0, -40 * lane);
        ctx.scale(1 - 0.12 * lane, 1 - 0.12 * lane);
      }
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

      // the Spartan, then the gate's FRONT layer over both
      if (this.stage === 'desert') {
        this.foe?.drawWorld(ctx, G);
        if (heroBehind) this.scene().drawArch(ctx, this.sceneEnv(ctx, w, h, visW, t));
        this.scene().drawFront(ctx, this.sceneEnv(ctx, w, h, visW, t));
        this.setCam(ctx, 1);
      }

      // angle indicator + preview
      if (this.phase === 'playing' && this.armed() && (a.pose === 'aim' || a.pose === 'draw') && !a.victory && a.facing === -1 && (this.tune.fireInFlight || !this.arrowInFlight()) && a.pickupT <= 0) {
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
        ctx.translate(hx - 150 * Math.cos(th / 2), hy - 150 * Math.sin(th / 2));
        ctx.scale(-1, 1);
        ctx.fillText(`${Math.round(a.angle)}°`, 0, 0);
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
      ctx.scale(-sc, sc);
      ctx.font = `800 ${f.size}px Nunito, "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 8;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }

    // speech bubbles (barks + the cutscene)
    if (this.stage === 'desert') this.drawBubbles(ctx);

    // hint bubble
    if (this.hintText && this.hintT < 7 && !this.cut) {
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
        ctx.translate(bx, by + 1);
        ctx.scale(-1, 1);
        ctx.fillText(this.hintText, 0, 0);
        ctx.restore();
      }
    }

    // screen-space: snow + slow-mo tint
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#FFFFFF';
    const snowMul = 1 - blend;
    for (const f of this.snow) {
      if (snowMul <= 0) break;
      ctx.globalAlpha = f.a * 0.85 * snowMul;
      ctx.beginPath();
      ctx.arc(f.x * w, f.y * h, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (this.fade > 0) {
      ctx.fillStyle = `rgba(255,243,214,${Math.min(1, this.fade)})`;
      ctx.fillRect(0, 0, w, h);
    }
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
      worldW: CFG.archer.maxX - uToX(TOTAL_U),
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
      stage: this.stage,
      foe: this.foe ? { hp: Math.ceil(this.foe.hp), max: FOE.hp, open: this.foe.open && this.foe.state !== 'idle', anger: this.foe.anger, angerMax: this.foe.angerMax, alive: this.foe.alive, state: this.foe.state } : null,
      canSkip: this.stage === 'snow',
      cut: this.cut !== null,
      foeLives: FOE.hp,
      worldMin: uToX(TOTAL_U),
      zoom: this.zoomPref,
      tune: { ...this.tune },
      reloading: this.armed() && this.anim.shoot.stage !== 'none' && !this.anim.arrowReady,
    };
  }
}
