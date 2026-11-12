// Layered animator for the archer paper-rig. Produces a RigPose every frame from
// a small set of intents (base state, equipment, hat, weapon, shooting stage,
// reactions). Used by both the Animation Test Lab and the game.
import { gaitFoot } from './legs';
import { Inertia } from './inertia';
import {
  G,
  DEG,
  clamp,
  lerp,
  smooth,
  ik2,
  torsoFrame,
  applyFrame,
  solveSkeleton,
  defaultPose,
  bowGeom,
  rotV,
  type RigPose,
  type Skeleton,
  type Vec,
  type WeaponKind,
} from './rig';

const TAU = Math.PI * 2;
const LOAD_DUR = 0.74; // seconds to fetch + nock an arrow
const vlerp = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
const D = DEG;

export type GaitKey = 'walk-casual' | 'walk' | 'walk-power' | 'walk-brisk' | 'walk-tired' | 'run' | 'sneak' | 'creep';
export type IdleKey = 'idle' | 'idle-alert' | 'idle-tired' | 'idle-bored' | 'idle-armed';
export type SitKey = 'sit' | 'sit-look' | 'sit-shift';
export type HideKey = 'hide' | 'hide-idle' | 'peek-left' | 'peek-right';
export type BaseState = GaitKey | IdleKey | SitKey | HideKey | 'jump' | 'hop';
export type Reaction = 'nod' | 'shake' | 'wave' | 'look-item' | 'surprised' | 'disappointed' | 'victory' | 'celebrate';
export type ShootStage = 'none' | 'raise' | 'aim' | 'draw' | 'hold' | 'release' | 'recover';
export type SeqKind =
  | 'pickup-quiver'
  | 'pickup-bow'
  | 'armed-ready'
  | 'unequip-bow'
  | 'unequip-quiver'
  | 'hat-off'
  | 'hat-on'
  | 'hat-drop'
  | 'hat-pickup'
  | 'sit-down'
  | 'stand-up';

export interface AnimParams {
  walkSpeed: number;
  runSpeed: number;
  torsoTension: number;
  headLag: number;
  beardFollow: number;
  handStability: number;
  holdTension: number;
  releaseStrength: number;
  recoverSpeed: number;
  carryMode: 'slung' | 'hand';
}

export interface Prop {
  kind: 'quiver' | 'bow' | 'hat';
  x: number; // world x (lab space)
  y: number; // world y (0 = ground)
  rot: number;
  squash: number;
  vx: number;
  vy: number;
  vr: number;
  air: boolean;
}

export interface LabArrow {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  stuck: boolean;
}

interface GaitDef {
  speed: number;
  step: number;
  bob: number;
  bobPhase: number;
  lean: number;
  armF: number;
  armB: number;
  elbowF: number;
  elbowB: number;
  elbowSwing: number;
  lift: number;
  stance: number;
  hipSway: number;
  hipRot: number;
  headCalm: number;
  crouch: number;
  drop: number;
  armFwd: number;
}

/** per-gait extras that used to be hard `if (gait === ...)` switches; blended like every other gait number */
interface GaitExtra {
  headRot: number; // rad
  headX: number;
  headY: number;
  lookY: number;
  turn: number;
  brow: number;
}
const X0: GaitExtra = { headRot: 0, headX: 0, headY: 0, lookY: 0, turn: 0, brow: 0 };
const GAIT_EXTRA: Partial<Record<GaitKey, GaitExtra>> = {
  run: { ...X0, headRot: 6 * DEG, headX: -12 },
  'walk-tired': { ...X0, headRot: 10 * DEG, headX: -8, headY: 6, brow: -0.3 },
  sneak: { ...X0, lookY: 0.3, turn: -0.1 },
  creep: { ...X0, lookY: 0.3, turn: -0.1 },
};

const GAITS: Record<GaitKey, GaitDef> = {
  'walk-casual': { speed: 190, step: 80, bob: 5, bobPhase: 0.07, lean: 1, armF: 22, armB: 28, elbowF: 8, elbowB: 10, elbowSwing: 18, lift: 16, stance: 0.62, hipSway: 3, hipRot: 2.5, headCalm: 0.6, crouch: 0, drop: 0, armFwd: 0 },
  walk: { speed: 250, step: 88, bob: 6, bobPhase: 0.07, lean: 2.5, armF: 26, armB: 32, elbowF: 10, elbowB: 12, elbowSwing: 22, lift: 20, stance: 0.62, hipSway: 3, hipRot: 3, headCalm: 0.6, crouch: 0, drop: 0, armFwd: 0 },
  'walk-power': { speed: 330, step: 104, bob: 7.5, bobPhase: 0.07, lean: 6, armF: 36, armB: 44, elbowF: 20, elbowB: 24, elbowSwing: 26, lift: 24, stance: 0.6, hipSway: 4, hipRot: 4, headCalm: 0.65, crouch: 0, drop: 0, armFwd: 0 },
  'walk-brisk': { speed: 280, step: 92, bob: 6, bobPhase: 0.07, lean: 2, armF: 12, armB: 22, elbowF: 26, elbowB: 34, elbowSwing: 14, lift: 20, stance: 0.62, hipSway: 3, hipRot: 3, headCalm: 0.75, crouch: 0, drop: 0, armFwd: 0 },
  'walk-tired': { speed: 150, step: 70, bob: 7, bobPhase: 0.09, lean: 6, armF: 14, armB: 18, elbowF: 3, elbowB: 4, elbowSwing: 8, lift: 10, stance: 0.66, hipSway: 5, hipRot: 4, headCalm: 0.4, crouch: 4, drop: 6, armFwd: 0 },
  run: { speed: 520, step: 128, bob: 11, bobPhase: 0.2, lean: 13, armF: 46, armB: 54, elbowF: 78, elbowB: 84, elbowSwing: 14, lift: 30, stance: 0.42, hipSway: 4, hipRot: 5, headCalm: 0.7, crouch: 0, drop: 0, armFwd: 0 },
  sneak: { speed: 110, step: 58, bob: 3, bobPhase: 0.07, lean: 18, armF: 6, armB: 6, elbowF: 58, elbowB: 58, elbowSwing: 8, lift: 22, stance: 0.66, hipSway: 2, hipRot: 2, headCalm: 0.8, crouch: 26, drop: 0, armFwd: 30 },
  creep: { speed: 55, step: 42, bob: 2, bobPhase: 0.07, lean: 14, armF: 4, armB: 4, elbowF: 52, elbowB: 52, elbowSwing: 6, lift: 20, stance: 0.7, hipSway: 1.5, hipRot: 1.5, headCalm: 0.85, crouch: 22, drop: 0, armFwd: 26 },
};

// ---------------------------------------------------------------------------
// Weapon attacks. Keyframes are [u, degrees]; u runs 0..1 over `dur` seconds.
// Angles follow the rig convention: 0 = down, +90 = forward horizontal, 180 = up.
// `rot` is the weapon tip direction (0 = up, 270 = forward horizontal).
// ---------------------------------------------------------------------------
type KF = Array<[number, number]>;
interface AtkDef {
  dur: number;
  hit: number; // u at which the blow lands
  tilt: KF;
  lunge: KF;
  aUF?: KF;
  aFF?: KF;
  ik?: { x: KF; y: KF };
  rot?: KF;
  aUB?: KF; // free back arm swing (forearm = upper + 30)
  hold?: number; // back hand grips the weapon this far along its axis
}

export const ATTACKS: Partial<Record<WeaponKind, AtkDef>> = {
  unarmed: {
    dur: 0.55,
    hit: 0.36,
    aUF: [[0, 6], [0.18, 25], [0.36, 92], [0.5, 88], [1, 6]],
    aFF: [[0, 16], [0.18, 120], [0.36, 94], [0.5, 92], [1, 16]],
    aUB: [[0, -6], [0.18, 30], [0.36, -40], [1, -6]],
    tilt: [[0, 0], [0.18, -5], [0.36, 10], [1, 0]],
    lunge: [[0, 0], [0.18, 0], [0.36, 1], [0.6, 0.6], [1, 0]],
  },
  sword: {
    dur: 0.8,
    hit: 0.5,
    aUF: [[0, 52], [0.3, 150], [0.5, 92], [0.62, 72], [1, 52]],
    aFF: [[0, 148], [0.3, 188], [0.5, 104], [0.62, 86], [1, 148]],
    rot: [[0, -46], [0.3, 38], [0.5, -100], [0.62, -106], [1, -46]],
    aUB: [[0, -24], [0.3, -70], [0.5, 20], [1, -24]],
    tilt: [[0, 0], [0.3, -7], [0.5, 12], [0.62, 14], [1, 0]],
    lunge: [[0, 0], [0.3, 0], [0.5, 1], [0.75, 1], [1, 0]],
  },
  spear: {
    dur: 0.85,
    hit: 0.45,
    aUF: [[0, 82], [0.3, 52], [0.45, 94], [0.6, 90], [1, 82]],
    aFF: [[0, 88], [0.3, 70], [0.45, 96], [0.6, 94], [1, 88]],
    rot: [[0, 250], [0.3, 258], [0.45, 268], [0.6, 266], [1, 250]],
    hold: 118,
    tilt: [[0, 0], [0.3, -3], [0.45, 10], [0.6, 10], [1, 0]],
    lunge: [[0, 0], [0.3, 0.2], [0.45, 1], [0.7, 1], [1, 0]],
  },
  staff: {
    dur: 0.9,
    hit: 0.5,
    ik: {
      x: [[0, -128], [0.3, -60], [0.5, -195], [0.65, -180], [1, -128]],
      y: [[0, -216], [0.3, -350], [0.5, -185], [0.65, -175], [1, -216]],
    },
    rot: [[0, 308], [0.3, 375], [0.5, 235], [0.65, 242], [1, 308]],
    hold: 126,
    tilt: [[0, 0], [0.3, -5], [0.5, 11], [0.65, 12], [1, 0]],
    lunge: [[0, 0], [0.3, 0], [0.5, 1], [0.8, 1], [1, 0]],
  },
  axe: {
    dur: 0.85,
    hit: 0.5,
    aUF: [[0, 112], [0.3, 165], [0.5, 85], [0.65, 70], [1, 112]],
    aFF: [[0, 154], [0.3, 185], [0.5, 100], [0.65, 84], [1, 154]],
    rot: [[0, -32], [0.3, 45], [0.5, -118], [0.65, -125], [1, -32]],
    hold: 44,
    tilt: [[0, 0], [0.3, -8], [0.5, 14], [0.65, 15], [1, 0]],
    lunge: [[0, 0], [0.3, 0], [0.5, 1], [0.8, 1], [1, 0]],
  },
  crossbow: {
    dur: 0.95,
    hit: 0.22,
    aUF: [[0, 84], [0.12, 84], [0.22, 76], [0.5, 88], [1, 84]],
    aFF: [[0, 92], [0.22, 84], [0.5, 98], [1, 92]],
    rot: [[0, 274], [0.22, 262], [0.28, 258], [0.55, 285], [1, 274]],
    hold: 72,
    tilt: [[0, 0], [0.22, -5], [0.5, 2], [1, 0]],
    lunge: [[0, 0], [0.2, 0.5], [1, 0]],
  },
};

function kf(frames: KF, u: number) {
  if (u <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (u < frames[i][0]) {
      const [u0, v0] = frames[i - 1];
      const [u1, v1] = frames[i];
      return lerp(v0, v1, smooth((u - u0) / (u1 - u0)));
    }
  }
  return frames[frames.length - 1][1];
}

const REACT_DUR: Record<Reaction, number> = { nod: 0.9, shake: 0.8, wave: 1.7, 'look-item': 1.5, surprised: 1.0, disappointed: 1.7, victory: 1.4, celebrate: 1.0 };

export const isGait = (b: BaseState): b is GaitKey => b in GAITS;
export const isSit = (b: BaseState) => b === 'sit' || b === 'sit-look' || b === 'sit-shift';
export const isHide = (b: BaseState) => b === 'hide' || b === 'hide-idle' || b === 'peek-left' || b === 'peek-right';

class Spring {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public damp: number,
  ) {}
  step(dt: number, target = 0, force = 0) {
    const a = (target - this.x) * this.k - this.v * this.damp + force;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

/** angle interpolation along the shortest way round (IK solutions wrap at ±π, which must never look like a spin) */
const angLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
};

export interface AnimStatus {
  base: BaseState;
  seq: string;
  seqT: number;
  reaction: string;
  shoot: ShootStage;
  aim: number;
  draw: number;
  hat: string;
  weapon: WeaponKind;
  weaponReady: boolean;
  hasBow: boolean;
  hasQuiver: boolean;
  bowMode: string;
  facing: number;
  x: number;
  jumpPhase: string;
  speed: number;
}

export class Animator {
  params: AnimParams = {
    walkSpeed: 1,
    runSpeed: 1,
    torsoTension: 0.4,
    headLag: 0.5,
    beardFollow: 0.6,
    handStability: 0.6,
    holdTension: 0.5,
    releaseStrength: 0.7,
    recoverSpeed: 1,
    carryMode: 'slung',
  };

  pose: RigPose = defaultPose();
  skel: Skeleton = solveSkeleton(this.pose);
  time = 0;

  // locomotion
  base: BaseState = 'idle';
  prevIdle: BaseState = 'idle';
  x = 0;
  facing: -1 | 1 = -1;
  speed = 0;
  walkPhase = 0;
  external = false; // game mode: the caller moves the character
  driveSpeed = 0;
  auto: { x: number; then: () => void } | null = null;
  bounds: [number, number] = [-1100, 1100];

  // equipment
  hasQuiver = false;
  hasBow = false;
  weapon: WeaponKind = 'unarmed';
  weaponReady = false;
  hat: 'head' | 'hand' | 'ground' | 'none' = 'head';
  props: Prop[] = [];
  arrows: LabArrow[] = [];

  // shooting
  shoot = { stage: 'none' as ShootStage, aim: 20 * D, aimGoal: 20 * D, draw: 0, drawGoal: 0, t: 0, raise: 0, raiseDur: 0.5, unsling: false, returnTo: 'carry' as 'carry' | 'aim', directDraw: false, load: 0, loadWait: 0 };
  /** user tuning of the reload: speed multiplier and the pause (s) between the shot and fetching the next arrow */
  tune = { loadSpeed: 1, loadPause: 0.15 };
  /** hand-held arrow of the current load animation (copied into the pose) */
  private loadOut = { on: false, rot: 0, clip: 0, slide: 0 };
  /** true when an arrow sits on the string (or there is no quiver to load from) */
  get arrowReady() {
    return !this.hasQuiver || this.shoot.load >= 1;
  }

  // weapon attack in progress
  attackAnim: { t: number; dur: number; kind: WeaponKind; hit: boolean } | null = null;

  // sequences
  seq: { kind: SeqKind; t: number; dur: number; data: Record<string, number> } | null = null;
  reaction: { kind: Reaction; t: number; dur: number } | null = null;
  jump: { phase: 'none' | 'ready' | 'takeoff' | 'air' | 'fall' | 'land'; t: number; vy: number; y: number; hop: boolean } = { phase: 'none', t: 0, vy: 0, y: 0, hop: false };

  // smoothing state
  private inert = new Inertia();
  private lastGait: GaitKey = 'walk';
  private gaitCur: GaitDef = { ...GAITS.walk };
  private gx: GaitExtra = { ...X0 };
  private faceCur = { brow: 0, smile: 0, lookX: 0, lookY: 0 };
  private faceVel = { brow: 0, smile: 0, lookX: 0, lookY: 0 };
  sitAmt = 0;
  hideAmt = 0;
  peek = 0; // -1 left(forward) .. 1 right(back)
  crouch = 0;
  blinkT = 0;
  blinkNext = 2.5;
  eyeWander = 0;
  stepFlag = 0;
  cur = { aUF: 0.1, aFF: 0.25, aUB: -0.1, aFB: 0.1, tilt: 0, pelvisY: G.pelvisY, hipX: 0, headRot: 0, headX: 0, headY: 0, turn: 0, bowRot: -0.25, bsx: 0, sway: 0 };
  legCur = { f: { x: -26, y: -18, r: 0, toe: 0 }, b: { x: 26, y: -18, r: 0, toe: 0 } };
  beardSp = new Spring(140, 10);
  hatSp = new Spring(220, 12);
  quiverSp = new Spring(120, 8);
  quiverBounce = new Spring(260, 14);
  shoulderSp = new Spring(300, 16);
  prevHeadRot = 0;
  prevPelvisY = G.pelvisY;
  prevVx = 0;
  armedBlend = 0;
  handTremor = { x: 0, y: 0 };

  /** Cutscene acting: force parts of the hero's face (brow −1..1, smile 0..1, blink, lookX/lookY). */
  faceOverride: { brow?: number; smile?: number; blink?: number; lookX?: number; lookY?: number } | null = null;

  /** Game override for the nocked-arrow visibility (null = automatic). */
  showArrow: boolean | null = null;

  onStep?: (foot: 'front' | 'back') => void;
  onEvent?: (name: string) => void;

  // ------------------------------------------------------------------ commands
  setBase(b: BaseState) {
    if (b === this.base) return;
    const wasSit = isSit(this.base);
    const willSit = isSit(b);
    if (!wasSit && willSit) this.startSeq('sit-down', 0.95);
    if (wasSit && !willSit) this.startSeq('stand-up', 1.0);
    if (b === 'jump' || b === 'hop') {
      if (this.jump.phase === 'none') {
        this.jump = { phase: 'ready', t: 0, vy: 0, y: 0, hop: b === 'hop' };
      }
      return;
    }
    if (!isGait(b) && !willSit && !isHide(b)) this.prevIdle = b;
    this.base = b;
    this.auto = null;
  }
  react(r: Reaction) {
    this.reaction = { kind: r, t: 0, dur: REACT_DUR[r] };
  }
  startSeq(kind: SeqKind, dur: number, data: Record<string, number> = {}) {
    this.seq = { kind, t: 0, dur, data };
  }
  goTo(x: number, then: () => void) {
    this.auto = { x, then };
  }
  localToWorld(lx: number) {
    return this.x + (this.facing === -1 ? lx : -lx);
  }
  worldToLocal(wx: number) {
    return this.facing === -1 ? wx - this.x : this.x - wx;
  }
  private propOf(kind: Prop['kind']) {
    return this.props.find((p) => p.kind === kind) || null;
  }
  private placeProp(kind: Prop['kind'], lx: number, rot = 0) {
    this.props = this.props.filter((p) => p.kind !== kind);
    this.props.push({ kind, x: this.localToWorld(lx), y: 0, rot, squash: 1, vx: 0, vy: 0, vr: 0, air: false });
  }
  /** Lab: walk to the item on the ground (placing one if needed) and pick it up. */
  pickup(kind: 'quiver' | 'bow') {
    if (kind === 'quiver' && this.hasQuiver) return;
    if (kind === 'bow' && this.hasBow) return;
    if (this.external) {
      this.startSeq(kind === 'quiver' ? 'pickup-quiver' : 'pickup-bow', kind === 'quiver' ? 2.1 : 1.9);
      return;
    }
    let prop = this.propOf(kind);
    if (!prop) {
      this.placeProp(kind, -300, kind === 'bow' ? 0.2 : 0);
      prop = this.propOf(kind)!;
    }
    const lx = this.worldToLocal(prop.x);
    if (lx > 0) this.facing = this.facing === -1 ? 1 : -1;
    const stopAt = prop.x + (this.facing === -1 ? 92 : -92);
    this.goTo(stopAt, () => {
      this.startSeq(kind === 'quiver' ? 'pickup-quiver' : 'pickup-bow', kind === 'quiver' ? 2.3 : 2.1);
    });
  }
  unequip(kind: 'quiver' | 'bow') {
    if (kind === 'quiver' && !this.hasQuiver) return;
    if (kind === 'bow' && !this.hasBow) return;
    this.shootCancel();
    this.startSeq(kind === 'quiver' ? 'unequip-quiver' : 'unequip-bow', kind === 'quiver' ? 1.7 : 1.5);
  }
  armedReady() {
    this.startSeq('armed-ready', 0.9);
  }
  setEquip(quiver: boolean, bow: boolean) {
    this.hasQuiver = quiver;
    this.hasBow = bow;
    if (bow && this.weapon === 'unarmed') this.weapon = 'bow';
    if (!bow && this.weapon === 'bow') {
      this.weapon = 'unarmed';
      this.shootCancel();
    }
    this.props = this.props.filter((p) => (p.kind === 'quiver' && !quiver) || (p.kind === 'bow' && !bow) || p.kind === 'hat');
  }
  hatTakeOff() {
    if (this.hat !== 'head' || this.seq) return;
    this.shootCancel();
    this.startSeq('hat-off', 1.5);
  }
  hatPutOn() {
    if (this.hat !== 'hand' || this.seq) return;
    this.startSeq('hat-on', 1.4);
  }
  hatDrop() {
    if (this.hat !== 'hand' || this.seq) return;
    this.startSeq('hat-drop', 0.7);
  }
  hatPickUp() {
    if (this.hat !== 'ground' || this.seq) return;
    const prop = this.propOf('hat');
    if (!prop) {
      this.hat = 'head';
      return;
    }
    const lx = this.worldToLocal(prop.x);
    if (lx > 0) this.facing = this.facing === -1 ? 1 : -1;
    const stopAt = prop.x + (this.facing === -1 ? 80 : -80);
    this.goTo(stopAt, () => this.startSeq('hat-pickup', 1.5));
  }
  /** Start the equipped weapon's attack. Returns false if there is nothing to swing right now. */
  attack(): boolean {
    const def = ATTACKS[this.weapon];
    if (!def || this.attackAnim || this.seq || this.jump.phase !== 'none') return false;
    this.attackAnim = { t: 0, dur: def.dur, kind: this.weapon, hit: false };
    this.onEvent?.('attack-start:' + this.weapon);
    return true;
  }
  get attacking() {
    return this.attackAnim !== null;
  }
  setWeapon(k: WeaponKind) {
    if (k !== this.weapon) this.attackAnim = null;
    this.weapon = k;
    if (k === 'bow') this.hasBow = true;
    if (k !== 'bow') this.shootCancel();
  }
  // shooting
  shootRaise() {
    if (this.weapon !== 'bow' || !this.hasBow) return;
    if (this.shoot.stage === 'none' || this.shoot.stage === 'recover') {
      const wasRecover = this.shoot.stage === 'recover';
      this.shoot.stage = 'raise';
      this.shoot.t = 0;
      this.shoot.load = 0;
      this.shoot.loadWait = 0;
      // unsling only when the bow is actually on the back right now
      this.shoot.unsling = this.params.carryMode === 'slung' && (!wasRecover || this.shoot.raise < 0.05) && this.pose.bow.mode !== 'hand';
      this.shoot.raiseDur = this.shoot.unsling ? 0.85 : 0.5;
      // continue from the current raise amount when interrupting a recover
      this.shoot.raise = wasRecover && !this.shoot.unsling ? this.shoot.raise : 0;
      this.shoot.t = this.shoot.raise * this.shoot.raiseDur;
    }
  }
  shootAim(angle?: number) {
    if (angle !== undefined) this.shoot.aimGoal = angle;
    if (this.weapon !== 'bow' || !this.hasBow) return;
    const s = this.shoot.stage;
    if (s === 'none' || s === 'recover') this.shootRaise();
    else if (s === 'draw' || s === 'hold') {
      this.shoot.drawGoal = 0;
      this.shoot.stage = 'aim';
    }
  }
  shootDraw(amount: number, direct = false) {
    if (this.weapon !== 'bow' || !this.hasBow) return;
    this.shoot.drawGoal = clamp(amount, 0, 1);
    this.shoot.directDraw = direct;
    const s = this.shoot.stage;
    if (s === 'none' || s === 'recover') this.shootRaise();
    if (s === 'aim' || s === 'hold' || s === 'draw') this.shoot.stage = 'draw';
    if (s === 'raise') this.shoot.stage = 'raise';
  }
  shootHold() {
    if (this.shoot.stage === 'draw' || this.shoot.stage === 'aim') {
      if (this.shoot.drawGoal < 0.05) this.shoot.drawGoal = 1;
      this.shoot.stage = 'hold';
    }
  }
  shootRelease(returnTo: 'carry' | 'aim' = 'carry') {
    const s = this.shoot.stage;
    if (s !== 'draw' && s !== 'hold' && s !== 'aim') return;
    this.shoot.returnTo = returnTo;
    this.shoot.stage = 'release';
    this.shoot.t = 0;
    this.shoot.load = 0; // the next arrow has to come out of the quiver again
    this.shoot.loadWait = this.tune.loadPause;
    this.onEvent?.('release');
    if (!this.external) {
      const sk = this.skel;
      if (sk.tip) {
        const v = 900 + 800 * this.shoot.draw;
        const a = this.shoot.aim;
        const dx = -Math.cos(a) * v;
        const dy = -Math.sin(a) * v;
        this.arrows.push({ x: this.localToWorld(sk.tip.x), y: sk.tip.y + this.pose.y, vx: this.facing === -1 ? dx : -dx, vy: dy, t: 0, stuck: false });
      }
    }
    this.shoot.drawGoal = 0;
    this.shoulderSp.kick(-60 * this.params.releaseStrength);
  }
  shootRecover() {
    if (this.shoot.stage === 'none') return;
    this.shoot.returnTo = 'carry';
    this.shoot.stage = 'recover';
    this.shoot.t = 0;
    this.shoot.drawGoal = 0;
  }
  shootCancel() {
    this.shoot.stage = 'none';
    this.shoot.draw = 0;
    this.shoot.drawGoal = 0;
    this.shoot.raise = 0;
    this.shoot.load = 0;
  }
  /** Launch tip for the given aim angle with the string at rest (rig space). */
  launchTip(angle: number) {
    return bowGeom(this.skel.handF, angle, 0).tip;
  }

  status(): AnimStatus {
    return {
      base: this.base,
      seq: this.seq ? this.seq.kind : this.auto ? 'approach' : '',
      seqT: this.seq ? this.seq.t / this.seq.dur : 0,
      reaction: this.reaction ? this.reaction.kind : '',
      shoot: this.shoot.stage,
      aim: this.shoot.aim / D,
      draw: this.shoot.draw,
      hat: this.hat,
      weapon: this.weapon,
      weaponReady: this.weaponReady,
      hasBow: this.hasBow,
      hasQuiver: this.hasQuiver,
      bowMode: this.pose.bow.mode,
      facing: this.facing,
      x: this.x,
      jumpPhase: this.jump.phase,
      speed: this.speed,
    };
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    dt = clamp(dt, 0, 0.05);
    this.time += dt;
    const P = defaultPose();
    const t = this.time;
    const prm = this.params;

    // ---- timers
    if (this.seq) {
      this.seq.t += dt;
      if (this.seq.t >= this.seq.dur) this.finishSeq();
    }
    if (this.reaction) {
      this.reaction.t += dt;
      if (this.reaction.t >= this.reaction.dur) this.reaction = null;
    }
    if (this.attackAnim) {
      const A = this.attackAnim;
      A.t += dt;
      const def = ATTACKS[A.kind];
      if (!def || this.weapon !== A.kind) this.attackAnim = null;
      else {
        if (!A.hit && A.t / A.dur >= def.hit) {
          A.hit = true;
          this.onEvent?.('attack-hit:' + A.kind);
        }
        if (A.t >= A.dur) {
          this.attackAnim = null;
          this.onEvent?.('attack-end');
        }
      }
    }
    this.updateBlink(dt);
    this.updateProps(dt);
    this.updateArrows(dt);

    // ---- auto walk (lab)
    const busy = !!this.seq;
    let gait: GaitKey | null = isGait(this.base) ? this.base : null;
    let targetSpeed = 0;
    if (this.auto) {
      const d = this.auto.x - this.x;
      if (Math.abs(d) < 6) {
        this.x = this.auto.x;
        const then = this.auto.then;
        this.auto = null;
        this.base = this.prevIdle;
        then();
      } else {
        this.facing = d < 0 ? -1 : 1;
        gait = 'walk';
        targetSpeed = Math.min(GAITS.walk.speed, Math.max(70, Math.abs(d) * 2.6));
      }
    } else if (this.external) {
      targetSpeed = this.driveSpeed;
      if (targetSpeed > 1 && !gait) gait = 'walk';
    } else if (gait && !busy && this.jump.phase === 'none') {
      const g = GAITS[gait];
      targetSpeed = g.speed * (gait === 'run' ? prm.runSpeed : prm.walkSpeed);
    }
    if (busy && !this.external) targetSpeed = 0;
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.exp(-8 * dt));
    if (this.speed < 2 && targetSpeed === 0) this.speed = 0;
    // the gait keeps its character while slowing down to a stop, and gait numbers blend instead of switching
    if (gait) this.lastGait = gait;
    const gk: GaitKey = gait ?? this.lastGait;
    const gk2 = 1 - Math.exp(-7 * dt);
    const gt = GAITS[gk];
    const gcur = this.gaitCur as unknown as Record<string, number>;
    for (const key of Object.keys(gt) as Array<keyof GaitDef>) gcur[key] = lerp(gcur[key], gt[key], gk2);
    const gxt = GAIT_EXTRA[gk] ?? X0;
    const gxc = this.gx as unknown as Record<string, number>;
    for (const key of Object.keys(X0) as Array<keyof GaitExtra>) gxc[key] = lerp(gxc[key], gxt[key], gk2);
    const g = this.gaitCur;
    const step = g.step * (0.75 + 0.25 * clamp(this.speed / g.speed, 0, 1.4));
    if (this.speed > 0.5) {
      const prev = this.walkPhase;
      this.walkPhase += ((this.speed * g.stance) / step) * dt; // cadence that keeps the planted foot still
      // footstep events at contacts (front at 0, back at 0.5)
      const f0 = Math.floor(prev * 2);
      const f1 = Math.floor(this.walkPhase * 2);
      if (f1 !== f0) this.onStep?.(f1 % 2 === 0 ? 'front' : 'back');
      if (!this.external) {
        this.x += this.facing * this.speed * dt;
        if (!this.auto) {
          if (this.x < this.bounds[0]) {
            this.x = this.bounds[0];
            this.facing = 1;
          } else if (this.x > this.bounds[1]) {
            this.x = this.bounds[1];
            this.facing = -1;
          }
        }
      }
    } else {
      // settle the phase to the nearest standing pose
      const k = Math.round(this.walkPhase * 2) / 2;
      this.walkPhase = lerp(this.walkPhase, k, 1 - Math.exp(-10 * dt));
    }

    // ---- amounts
    const sitTarget = isSit(this.base) ? 1 : 0;
    if (this.seq?.kind === 'sit-down') this.sitAmt = smooth(this.seq.t / this.seq.dur);
    else if (this.seq?.kind === 'stand-up') this.sitAmt = 1 - smooth(this.seq.t / this.seq.dur);
    else this.sitAmt = lerp(this.sitAmt, sitTarget, 1 - Math.exp(-6 * dt));
    this.hideAmt = lerp(this.hideAmt, isHide(this.base) ? 1 : 0, 1 - Math.exp(-5 * dt));
    const peekGoal = this.base === 'peek-left' ? -1 : this.base === 'peek-right' ? 1 : 0;
    this.peek = lerp(this.peek, peekGoal, 1 - Math.exp(-5 * dt));
    this.armedBlend = lerp(this.armedBlend, this.hasBow && this.hasQuiver ? 1 : 0, 1 - Math.exp(-4 * dt));

    // ---- body targets
    const B = {
      tilt: 0,
      pelvisY: G.pelvisY,
      hipX: 0,
      hipRot: 0,
      torsoRot: 0,
      sway: 0,
      bsx: 0,
      breath: 0,
      headRot: 0,
      headX: 0,
      headY: 0,
      turn: 0,
      lookX: 0,
      lookY: 0,
      brow: 0,
      smile: 0,
      rootY: 0,
      squash: 1,
      aUF: 6 * D,
      aFF: 16 * D,
      aUB: -6 * D,
      aFB: 6 * D,
      legF: { x: -26, y: G.standAnkleY, r: 0 } as { x: number; y: number; r: number; toe?: number },
      legB: { x: 26, y: G.standAnkleY, r: 0 } as { x: number; y: number; r: number; toe?: number },
      bowRot: -14 * D,
      armRate: 14,
      legRate: 40,
      frontIK: null as Vec | null,
      backIK: null as Vec | null,
      frontBend: -1 as 1 | -1,
      backBend: -1 as 1 | -1,
      hatLift: 0,
      hatRot: 0,
    };

    const moving = this.speed > 0.5 && this.jump.phase === 'none'; // airborne: no stepping
    const speed01 = clamp(this.speed / g.speed, 0, 1.3);
    const bowInHand = this.hasBow && this.weapon === 'bow' && (prm.carryMode === 'hand' || this.shoot.stage !== 'none');
    const quiverMod = this.hasQuiver ? 1 : 0;
    const handBowMod = bowInHand ? 1 : 0;

    // ======================= 1. locomotion / idle base =======================
    if (moving) {
      const p = this.walkPhase;
      const bobU = 0.5 - 0.5 * Math.cos(2 * TAU * (p - g.bobPhase));
      // stride-aware hip height: the longer the step, the lower the hips, so the leg never over-stretches
      const legLen = G.thigh + G.shin;
      const hipAbove = -(G.pelvisY + 2) + G.standAnkleY;
      const strideCrouch = Math.max(0, hipAbove - Math.sqrt(Math.max(0, (0.94 * legLen) ** 2 - (step / 2 + 4) ** 2)));
      B.pelvisY = G.pelvisY + g.crouch + strideCrouch * clamp(speed01, 0, 1) + g.drop + g.bob * 0.5 - g.bob * bobU * (0.6 + 0.4 * speed01);
      B.hipX = g.hipSway * Math.sin(TAU * p);
      B.hipRot = g.hipRot * D * Math.sin(TAU * p);
      B.torsoRot = -B.hipRot * (0.7 - 0.4 * prm.torsoTension) * (1 - 0.15 * quiverMod);
      B.sway = -4 * Math.sin(TAU * p) * (1 - 0.3 * prm.torsoTension);
      B.tilt = g.lean * D * (1 - 0.3 * this.armedBlend) + 1.2 * D * Math.sin(2 * TAU * p);
      // heel strike → flat → heel-off with the toes bending → swing; cadence keeps the planted foot still
      const fF = gaitFoot(p, step, g.lift, g.stance);
      const fB = gaitFoot(p + 0.5, step, g.lift, g.stance);
      B.legF = { x: -G.hipOff + fF.x, y: G.standAnkleY + fF.y, r: fF.rot, toe: fF.toe };
      B.legB = { x: G.hipOff + fB.x, y: G.standAnkleY + fB.y, r: fB.rot, toe: fB.toe };
      // arms
      const sw = Math.cos(TAU * (p - 0.06));
      let ampF = g.armF * D;
      let ampB = g.armB * D;
      ampB *= 1 - 0.3 * quiverMod;
      ampF *= 1 - 0.85 * handBowMod;
      if (this.armedBlend > 0.5 && !handBowMod) ampB *= 0.75;
      const fwd = g.armFwd * D;
      B.aUF = fwd - ampF * sw;
      B.aUB = fwd + ampB * sw;
      const elF = g.elbowF * D + g.elbowSwing * D * (0.5 + 0.5 * Math.cos(TAU * p));
      const elB = g.elbowB * D + g.elbowSwing * D * (0.5 - 0.5 * Math.cos(TAU * p)) + 8 * D * quiverMod + 18 * D * this.armedBlend;
      B.aFF = B.aUF + elF;
      B.aFB = B.aUB + elB;
      // head: calmer than the body, lags direction changes
      const lagShift = 0.05 * prm.headLag;
      const bobLag = 0.5 - 0.5 * Math.cos(2 * TAU * (p - g.bobPhase - lagShift));
      B.headRot = -B.tilt * g.headCalm + this.gx.headRot;
      B.headX = -B.hipX * 0.8 * prm.headLag + this.gx.headX;
      B.headY = (bobLag - bobU) * g.bob * 0.6 * prm.headLag + this.gx.headY;
      B.turn = -0.15 * this.armedBlend + this.gx.turn;
      B.lookY = this.gx.lookY;
      B.bowRot = -14 * D + 3 * D * Math.sin(TAU * p * 2);
      B.legRate = 60;
      B.brow = this.gx.brow;
    } else {
      // standing idles
      const idle: BaseState = this.base;
      B.breath = 2.4 * Math.sin(t * 1.9);
      B.hipX = 3 * Math.sin(t * 0.5);
      B.hipRot = 1.5 * D * Math.sin(t * 0.5);
      B.torsoRot = -B.hipRot * 0.5;
      B.headRot = 1.5 * D * Math.sin(t * 0.7 + 1);
      B.aUF = 6 * D + 2 * D * Math.sin(t * 0.9);
      B.aFF = B.aUF + 12 * D;
      B.aUB = -6 * D + 2 * D * Math.sin(t * 0.9 + 1);
      B.aFB = B.aUB + 8 * D;
      B.legF = { x: -28, y: G.standAnkleY, r: 0 };
      B.legB = { x: 28, y: G.standAnkleY, r: 0 };
      if (idle === 'idle-alert' || (idle === 'idle-armed' && !isHide(idle))) {
        B.pelvisY = G.pelvisY - 2;
        B.tilt = -1 * D;
        B.breath = 1.6 * Math.sin(t * 3);
        B.turn = -0.22;
        B.bsx = -4;
        B.aUF = 10 * D;
        B.aFF = B.aUF + 22 * D;
        B.aUB = -10 * D;
        B.aFB = B.aUB + 20 * D;
        B.legF = { x: -36, y: G.standAnkleY, r: 0 };
        B.legB = { x: 34, y: G.standAnkleY, r: 0 };
        const snap = Math.max(0, Math.sin(t * 0.8)) ** 24;
        B.turn += 0.5 * snap;
        B.hipX = 1.5 * Math.sin(t * 0.7);
      } else if (idle === 'idle-tired') {
        B.hipX = 8;
        B.hipRot = 4 * D;
        B.torsoRot = -2 * D;
        B.pelvisY = G.pelvisY + 6;
        B.tilt = 5 * D;
        B.headRot = 9 * D + 2 * D * Math.sin(t * 1.1);
        B.headY = 6;
        B.aUF = -2 * D;
        B.aFF = B.aUF + 3 * D;
        B.aUB = -2 * D;
        B.aFB = B.aUB + 3 * D;
        B.breath = 3.6 * Math.sin(t * 1.2);
        B.brow = -0.4;
        B.lookY = 0.4;
        B.legF = { x: -20, y: G.standAnkleY, r: 0 };
        B.legB = { x: 36, y: G.standAnkleY, r: 0 };
      } else if (idle === 'idle-bored') {
        B.turn = 0.45 * Math.sin(t * 0.45);
        B.lookX = 0.8 * Math.sin(t * 0.6 + 0.4);
        B.lookY = 0.3 * Math.sin(t * 0.33);
        B.hipX = 6 * Math.sin(t * 0.35);
        B.hipRot = 2.5 * D * Math.sin(t * 0.35);
        B.aUB = -4 * D + 10 * D * Math.sin(t * 0.8);
        B.aFB = B.aUB + 30 * D + 20 * D * Math.sin(t * 0.8 + 1);
        const tap = Math.max(0, Math.sin(t * 6)) * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
        B.legF = { x: -28, y: G.standAnkleY, r: -0.3 * tap };
        B.headRot = 3 * D * Math.sin(t * 0.5);
      }
      B.bowRot = -14 * D + 1.5 * D * Math.sin(t * 1.9);
    }

    // sneak/creep standing (crouched stance while not moving)
    if (isGait(this.base) && (this.base === 'sneak' || this.base === 'creep') && !moving) {
      B.pelvisY += GAITS[this.base].crouch;
      B.tilt += GAITS[this.base].lean * D;
    }

    // ---- sitting
    if (this.sitAmt > 0.001) {
      const s = this.sitAmt;
      const seatY = -46;
      B.pelvisY = lerp(B.pelvisY, seatY, s);
      B.tilt = lerp(B.tilt, -3 * D, s);
      B.hipX = lerp(B.hipX, 4, s);
      B.legF = { x: lerp(B.legF.x, -98, s), y: lerp(B.legF.y, -14, s), r: lerp(B.legF.r, -1.25, s) };
      B.legB = { x: lerp(B.legB.x, -78, s), y: lerp(B.legB.y, -16, s), r: lerp(B.legB.r, -1.1, s) };
      B.breath = 2 * Math.sin(t * 1.6);
      // hands on lap
      B.aUF = lerp(B.aUF, 30 * D, s);
      B.aFF = lerp(B.aFF, 95 * D, s);
      B.aUB = lerp(B.aUB, 18 * D, s);
      B.aFB = lerp(B.aFB, 80 * D, s);
      if (this.base === 'sit-look') {
        B.turn = 0.75 * Math.sin(t * 0.9);
        B.headRot = -3 * D + 3 * D * Math.sin(t * 1.3);
        B.lookX = 0.6 * Math.sin(t * 0.9 + 0.6);
      } else if (this.base === 'sit-shift') {
        const ph = (t % 3.2) / 3.2;
        const bump = Math.sin(Math.PI * clamp(ph / 0.35, 0, 1));
        B.pelvisY += -8 * bump;
        B.hipX += 7 * bump;
        B.tilt += 6 * D * bump;
        B.torsoRot += -3 * D * bump;
      }
      B.headRot += 2 * D * s;
    }

    // ---- hiding
    if (this.hideAmt > 0.001) {
      const h = this.hideAmt;
      B.pelvisY = lerp(B.pelvisY, G.pelvisY + 42, h);
      B.tilt = lerp(B.tilt, 15 * D, h);
      B.headY = lerp(B.headY, 8, h);
      B.headRot = lerp(B.headRot, -4 * D, h);
      B.sway = lerp(B.sway, -6, h);
      B.aUF = lerp(B.aUF, 46 * D, h);
      B.aFF = lerp(B.aFF, 120 * D, h);
      B.aUB = lerp(B.aUB, 40 * D, h);
      B.aFB = lerp(B.aFB, 112 * D, h);
      B.legF = { x: lerp(B.legF.x, -34, h), y: lerp(B.legF.y, G.standAnkleY, h), r: B.legF.r };
      B.legB = { x: lerp(B.legB.x, 40, h), y: lerp(B.legB.y, G.standAnkleY, h), r: B.legB.r };
      B.breath = 1.2 * Math.sin(t * 2.6);
      B.lookX = this.base === 'hide-idle' ? 0.9 * Math.sin(t * 1.1) : 0;
      // peek
      const pk = this.peek;
      B.turn += pk > 0 ? 0.9 * pk : 0.45 * pk;
      B.headX += pk > 0 ? 10 * pk : 14 * pk;
      B.headRot += pk > 0 ? 6 * D * pk : -8 * D * pk;
      B.torsoRot += pk > 0 ? 5 * D * pk : -6 * D * pk;
      B.tilt += pk < 0 ? -5 * D * pk : 0;
    }

    // ---- jump
    this.updateJump(dt, B);

    // ======================= 2. weapon / carry layer =======================
    const seqArmOverride = { front: false, back: false };
    this.applyWeaponLayer(B, moving, t);
    this.applyAttack(B, moving);

    // ======================= 3. shooting layer =======================
    const shootW = this.applyShooting(dt, B, t);

    // ======================= 4/5. sequences (hat, pickups, equip) =======================
    this.applySequence(B, seqArmOverride);

    // ======================= 6. reactions =======================
    this.applyReaction(B, t);

    // ======================= resolve + smoothing =======================
    const rate = (k: number) => 1 - Math.exp(-k * dt);
    // every switch of a layer (gait <-> idle, weapon ready, bow raise, sit ...) is absorbed smoothly (see inertia.ts)
    const IN = this.inert;
    // thresholds sit above the largest acceleration a *steady* gait produces, so only real breaks are absorbed
    B.tilt = IN.apply('tilt', B.tilt, dt, 45, 0.3);
    B.pelvisY = IN.apply('pelvisY', B.pelvisY, dt, 9000, 40);
    B.hipX = IN.apply('hipX', B.hipX, dt, 3500, 30);
    B.hipRot = IN.apply('hipRot', B.hipRot, dt, 30, 0.2);
    B.torsoRot = IN.apply('torsoRot', B.torsoRot, dt, 30, 0.2);
    B.sway = IN.apply('sway', B.sway, dt, 2500, 20);
    B.bsx = IN.apply('bsx', B.bsx, dt, 3500, 30);
    B.headRot = IN.apply('headRot', B.headRot, dt, 45, 0.3);
    B.headX = IN.apply('headX', B.headX, dt, 6000, 20);
    B.headY = IN.apply('headY', B.headY, dt, 6000, 20);
    B.turn = IN.apply('turn', B.turn, dt, 25, 0.5);
    B.bowRot = IN.apply('bowRot', B.bowRot, dt, 60, 0.6, true);
    B.breath = IN.apply('breath', B.breath, dt, 3000, 6);
    B.legF.x = IN.apply('lfx', B.legF.x, dt, 45000, 50);
    B.legF.y = IN.apply('lfy', B.legF.y, dt, 45000, 40);
    B.legF.r = IN.apply('lfr', B.legF.r, dt, 300, 0.6);
    B.legB.x = IN.apply('lbx', B.legB.x, dt, 45000, 50);
    B.legB.y = IN.apply('lby', B.legB.y, dt, 45000, 40);
    B.legB.r = IN.apply('lbr', B.legB.r, dt, 300, 0.6);
    const c = this.cur;
    const bodyK = rate(16);
    c.tilt = lerp(c.tilt, B.tilt, bodyK);
    c.pelvisY = lerp(c.pelvisY, B.pelvisY, rate(this.jump.phase !== 'none' ? 40 : 18));
    c.hipX = lerp(c.hipX, B.hipX, bodyK);
    c.headRot = lerp(c.headRot, B.headRot, rate(12 + 10 * (1 - prm.headLag)));
    c.headX = lerp(c.headX, B.headX, rate(10 + 10 * (1 - prm.headLag)));
    c.headY = lerp(c.headY, B.headY, rate(12));
    c.turn = lerp(c.turn, B.turn, rate(10));
    c.bowRot = angLerp(c.bowRot, B.bowRot, rate(shootW > 0.5 ? 14 : 10));
    c.bsx = lerp(c.bsx, B.bsx, bodyK);
    c.sway = lerp(c.sway, B.sway, bodyK);

    P.tilt = c.tilt;
    P.pelvisY = c.pelvisY;
    P.hipX = c.hipX;
    P.hipRot = B.hipRot;
    P.torsoRot = B.torsoRot;
    P.breath = B.breath;
    P.shoulderSway = c.sway + this.shoulderSp.x * 0.1;
    P.backShoulderX = c.bsx;
    P.head = { rot: c.headRot, x: c.headX, y: c.headY, turn: c.turn };
    P.y = B.rootY;
    P.squash = B.squash;

    // legs
    const lk = rate(B.legRate);
    const L = this.legCur;
    L.f.x = lerp(L.f.x, B.legF.x, lk);
    L.f.y = lerp(L.f.y, B.legF.y, lk);
    L.f.r = lerp(L.f.r, B.legF.r, lk);
    L.f.toe = lerp(L.f.toe, B.legF.toe ?? 0, lk);
    L.b.x = lerp(L.b.x, B.legB.x, lk);
    L.b.y = lerp(L.b.y, B.legB.y, lk);
    L.b.r = lerp(L.b.r, B.legB.r, lk);
    L.b.toe = lerp(L.b.toe, B.legB.toe ?? 0, lk);
    P.frontLeg = { ankle: { x: L.f.x, y: L.f.y }, foot: L.f.r, toe: L.f.toe };
    P.backLeg = { ankle: { x: L.b.x, y: L.b.y }, foot: L.b.r, toe: L.b.toe };

    // arms: resolve IK targets against the final torso frame, then smooth angles
    const tf = torsoFrame(P);
    let aUF = B.aUF;
    let aFF = B.aFF;
    let aUB = B.aUB;
    let aFB = B.aFB;
    if (B.frontIK) {
      const r = ik2(tf.shoulderF, B.frontIK, G.upperArm, G.foreArm, B.frontBend);
      aUF = r.a1;
      aFF = r.a2;
    }
    if (B.backIK) {
      const r = ik2(tf.shoulderB, B.backIK, G.upperArm, G.foreArm, B.backBend);
      aUB = r.a1;
      aFB = r.a2;
    }
    aUF = IN.apply('aUF', aUF, dt, 260, 1.0, true);
    aFF = IN.apply('aFF', aFF, dt, 260, 1.0, true);
    aUB = IN.apply('aUB', aUB, dt, 260, 1.0, true);
    aFB = IN.apply('aFB', aFB, dt, 260, 1.0, true);
    const ak = rate(B.armRate);
    c.aUF = angLerp(c.aUF, aUF, ak);
    c.aFF = angLerp(c.aFF, aFF, ak);
    c.aUB = angLerp(c.aUB, aUB, ak);
    c.aFB = angLerp(c.aFB, aFB, ak);
    const ta = tf.torso.a;
    P.frontArm = { kind: 'fk', shoulder: c.aUF + ta, elbow: c.aFF - c.aUF };
    P.backArm = { kind: 'fk', shoulder: c.aUB + ta, elbow: c.aFB - c.aUB };

    // face
    P.face.blink = this.blinkT > 0 ? (this.blinkT > 0.06 ? 1 : this.blinkT / 0.06) : 0;
    if (this.base === 'idle-tired') P.face.blink = Math.max(P.face.blink, 0.35);
    // expression / eyes ease towards their target (never snap); cutscene acting overrides the target
    const fo = this.faceOverride;
    const fc = this.faceCur;
    const fv = this.faceVel;
    const damp = (k: 'brow' | 'smile' | 'lookX' | 'lookY', target: number, omega: number) => {
      // critically damped: eases in AND out (no sharp start)
      const x = fc[k] - target;
      const e = Math.exp(-omega * dt);
      const tmp = (fv[k] + omega * x) * dt;
      fc[k] = target + (x + tmp) * e;
      fv[k] = (fv[k] - omega * tmp) * e;
    };
    damp('brow', fo?.brow ?? B.brow, 13);
    damp('smile', fo?.smile ?? B.smile, 13);
    damp('lookX', fo?.lookX ?? B.lookX, 15);
    damp('lookY', fo?.lookY ?? B.lookY, 15);
    P.face.lookX = fc.lookX;
    P.face.lookY = fc.lookY;
    P.face.brow = fc.brow;
    P.face.smile = fc.smile;
    if (fc.brow > 0.5) P.face.blink = Math.min(P.face.blink, -0.15);
    if (fo?.blink !== undefined) P.face.blink = fo.blink;

    // ---- equipment visuals
    P.quiver.on = this.hasQuiver;
    P.weapon = { kind: this.weapon === 'bow' ? 'bow' : this.weapon, rot: this.weaponRot, backHand: this.weaponBackHand };
    this.applyBowVisual(P, c.bowRot, shootW);
    P.hat.where = this.hat === 'head' ? 'head' : this.hat === 'hand' ? 'hand' : 'none';
    P.layers.backArmFront = this.shoot.stage !== 'none' && this.shoot.stage !== 'raise' && this.shoot.stage !== 'recover';
    if (this.seq && (this.seq.kind === 'hat-off' || this.seq.kind === 'hat-on' || this.seq.kind === 'hat-pickup')) P.layers.frontArmBehindHead = false;
    P.carriedItem = this.carried;

    // ---- follow-through springs
    const headVel = (c.headRot - this.prevHeadRot) / Math.max(dt, 1e-3);
    const pelVel = (c.pelvisY - this.prevPelvisY) / Math.max(dt, 1e-3);
    const vx = this.speed * (moving ? 1 : 0);
    const ax = (vx - this.prevVx) / Math.max(dt, 1e-3);
    this.prevHeadRot = c.headRot;
    this.prevPelvisY = c.pelvisY;
    this.prevVx = vx;
    const bf = prm.beardFollow;
    P.beardSwing = this.beardSp.step(dt, 0, -headVel * 0.9 * bf - pelVel * 0.012 * bf - ax * 0.0025 * bf) * 1;
    P.beardSwing = clamp(P.beardSwing, -0.45, 0.45);
    const hatLift = this.hatSp.step(dt, 0, -pelVel * 0.08 - headVel * 2);
    P.hat.lift = clamp(hatLift, -6, 14) + B.hatLift;
    P.hat.rot = clamp(hatLift * 0.004, -0.06, 0.06) + B.hatRot;
    P.quiver.swing = clamp(this.quiverSp.step(dt, 0, -ax * 0.002 - (c.tilt - P.tilt) * 0), -0.35, 0.35);
    P.quiver.bounce = clamp(this.quiverBounce.step(dt, 0, pelVel * 0.25), -10, 10);
    this.shoulderSp.step(dt, 0, 0);

    // ---- finalize
    this.pose = P;
    this.skel = solveSkeleton(P);
  }

  private weaponRot: number | null = null;
  private weaponBackHand = false;
  private carried: RigPose['carriedItem'] = { kind: 'none', rot: 0, t: 0 };

  // ------------------------------------------------------------------ layers
  private applyWeaponLayer(B: BodyTargets, moving: boolean, t: number) {
    const w = this.weapon;
    const ready = this.weaponReady || this.attackAnim !== null;
    this.weaponRot = null;
    this.weaponBackHand = false;
    const swing = moving ? Math.cos(TAU * (this.walkPhase - 0.06)) : 0;
    const prm = this.params;
    if (w === 'bow' && this.hasBow) {
      if (prm.carryMode === 'hand' && this.shoot.stage === 'none' && this.sitAmt < 0.5 && this.hideAmt < 0.5) {
        // in-hand carry: stable forward-side position, wrist corrections
        B.aUF = 34 * D + 2 * D * swing;
        B.aFF = B.aUF + 26 * D - 3 * D * swing;
        B.bowRot = -16 * D + 3 * D * swing + 1.2 * D * Math.sin(t * 2.1);
      }
      return;
    }
    if (w === 'unarmed' || w === 'bow') return;
    const bodyMod = (tilt: number, pelvis: number, legF: number, legB: number, turn: number) => {
      if (this.sitAmt > 0.5 || this.hideAmt > 0.5) return;
      B.tilt += tilt;
      if (!moving) {
        B.pelvisY += pelvis;
        B.legF.x = legF;
        B.legB.x = legB;
      }
      B.turn += turn;
    };
    switch (w) {
      case 'crossbow':
        if (!ready) {
          B.aUF = 36 * D + 2 * D * swing;
          B.aFF = B.aUF + 62 * D;
          this.weaponRot = 45 * D + Math.PI; // pointing forward-down
          B.backIK = this.weaponPoint(B, 0, 84);
          B.backBend = -1;
          bodyMod(2 * D, 2, -34, 34, -0.05);
        } else {
          B.aUF = 84 * D;
          B.aFF = B.aUF + 8 * D;
          this.weaponRot = (90 + 4) * D + Math.PI;
          B.backIK = this.weaponPoint(B, 0, 72);
          B.backBend = -1;
          B.sway += 8;
          B.bsx += 20;
          bodyMod(7 * D, 6, -56, 48, -0.2);
          B.headRot += -2 * D;
        }
        break;
      case 'spear':
        if (!ready) {
          B.aUF = 22 * D + 2 * D * swing;
          B.aFF = B.aUF + 30 * D;
          this.weaponRot = 0 + 3 * D * swing;
          bodyMod(0, 0, -28, 30, 0);
        } else {
          B.aUF = 82 * D;
          B.aFF = B.aUF + 6 * D;
          this.weaponRot = 70 * D + Math.PI;
          B.backIK = this.weaponPoint(B, 0, 118);
          B.backBend = -1;
          bodyMod(9 * D, 10, -74, 54, -0.2);
        }
        break;
      case 'sword':
        if (!ready) {
          B.aUF = -4 * D + 3 * D * swing;
          B.aFF = B.aUF + 8 * D;
          this.weaponRot = -38 * D + Math.PI;
          bodyMod(0, 0, -28, 28, 0);
        } else {
          B.aUF = 52 * D;
          B.aFF = B.aUF + 96 * D;
          this.weaponRot = -46 * D;
          B.aUB = -24 * D;
          B.aFB = B.aUB + 62 * D;
          bodyMod(4 * D, 5, -30, 40, -0.15);
          B.headRot += 2 * D;
        }
        break;
      case 'staff':
        if (!ready) {
          B.frontIK = { x: -150, y: -182 };
          B.frontBend = -1;
          this.weaponRot = 0;
          bodyMod(0, 0, -30, 30, 0);
        } else {
          B.frontIK = { x: -128, y: -206 };
          B.frontBend = -1;
          this.weaponRot = 128 * D + Math.PI;
          B.backIK = this.weaponPoint(B, 0, 126);
          B.backBend = -1;
          B.sway += 6;
          bodyMod(5 * D, 12, -72, 66, -0.1);
        }
        break;
      case 'axe':
        if (!ready) {
          this.weaponBackHand = true;
          B.backIK = { x: 118, y: -176 };
          B.backBend = -1;
          this.weaponRot = 32 * D;
          B.hipRot += 3 * D;
          B.torsoRot += -3 * D;
          B.sway += -5;
          bodyMod(1 * D, 2, -26, 36, 0);
        } else {
          B.aUF = 112 * D;
          B.aFF = B.aUF + 42 * D;
          this.weaponRot = -32 * D;
          B.backIK = this.weaponPoint(B, 0, 44);
          B.backBend = -1;
          bodyMod(6 * D, 8, -58, 52, -0.15);
        }
        break;
      default:
        break;
    }
  }

  private applyAttack(B: BodyTargets, moving: boolean) {
    const A = this.attackAnim;
    if (!A) return;
    const d = ATTACKS[A.kind];
    if (!d) return;
    const u = clamp(A.t / A.dur, 0, 1);
    const w = smooth(u / 0.1) * (1 - smooth((u - 0.9) / 0.1));
    const k = (f: KF) => kf(f, u);
    const mix = (a: number, b: number) => lerp(a, b, w);
    if (d.ik) {
      const x = k(d.ik.x);
      const y = k(d.ik.y);
      B.frontIK = B.frontIK ? { x: mix(B.frontIK.x, x), y: mix(B.frontIK.y, y) } : { x, y };
      B.frontBend = -1;
    } else if (d.aUF && d.aFF) {
      B.frontIK = null;
      B.aUF = mix(B.aUF, k(d.aUF) * D);
      B.aFF = mix(B.aFF, k(d.aFF) * D);
    }
    if (d.rot) this.weaponRot = mix(this.weaponRot ?? B.aFF + Math.PI, k(d.rot) * D);
    B.tilt += k(d.tilt) * D * w;
    B.turn += -0.12 * w;
    const lunge = k(d.lunge) * w;
    if (!moving && this.sitAmt < 0.5 && this.hideAmt < 0.5) {
      B.legF.x = lerp(B.legF.x, -74, lunge);
      B.legB.x = lerp(B.legB.x, 50, lunge);
      B.pelvisY += 7 * lunge;
    }
    if (d.aUB) {
      const b = k(d.aUB) * D;
      B.backIK = null;
      B.aUB = mix(B.aUB, b);
      B.aFB = mix(B.aFB, b + 30 * D);
    }
    if (d.hold !== undefined) {
      B.backIK = this.weaponPoint(B, 0, d.hold);
      B.backBend = -1;
    }
  }

  /** A point on the front-hand weapon axis (local x, y) in rig space, using the *target* arm angles. */
  private weaponPoint(B: BodyTargets, lx: number, ly: number): Vec {
    const tmp = defaultPose();
    tmp.tilt = B.tilt;
    tmp.pelvisY = B.pelvisY;
    tmp.hipX = B.hipX;
    tmp.torsoRot = B.torsoRot;
    tmp.shoulderSway = B.sway;
    const tf = torsoFrame(tmp);
    let hand: Vec;
    if (B.frontIK) hand = B.frontIK;
    else {
      const d1 = { x: -Math.sin(B.aUF), y: Math.cos(B.aUF) };
      const d2 = { x: -Math.sin(B.aFF), y: Math.cos(B.aFF) };
      hand = { x: tf.shoulderF.x + d1.x * G.upperArm + d2.x * G.foreArm, y: tf.shoulderF.y + d1.y * G.upperArm + d2.y * G.foreArm };
    }
    const rot = this.weaponRot ?? B.aFF + Math.PI;
    const o = rotV({ x: lx, y: ly }, rot);
    return { x: hand.x + o.x, y: hand.y + o.y };
  }

  private applyShooting(dt: number, B: BodyTargets, t: number): number {
    const S = this.shoot;
    const prm = this.params;
    this.loadOut.on = false;
    if (S.stage !== 'none' && (this.weapon !== 'bow' || !this.hasBow)) this.shootCancel();
    if (S.stage === 'none') {
      S.load = 0;
      S.raise = lerp(S.raise, 0, 1 - Math.exp(-8 * dt));
      return 0;
    }
    S.aim = angLerp(S.aim, S.aimGoal, 1 - Math.exp(-10 * dt));
    S.t += dt;
    const aim = S.aim;
    // raise progress
    const raiseDur = S.raiseDur;
    if (S.stage === 'raise') {
      S.raise = clamp(S.t / raiseDur, 0, 1);
      if (S.raise >= 1) {
        S.stage = S.drawGoal > 0.01 ? 'draw' : 'aim';
        S.t = 0;
      }
    } else if (S.stage === 'recover') {
      const dur = 0.8 / prm.recoverSpeed;
      const u = clamp(S.t / dur, 0, 1);
      S.raise = 1 - smooth(clamp((u - 0.35) / 0.65, 0, 1));
      if (u >= 1) {
        S.stage = 'none';
        S.raise = 0;
        return 0;
      }
    } else S.raise = 1;
    // loading: the back hand fetches an arrow from the quiver and nocks it; the string can't be drawn before that
    // (the back hand starts fetching the arrow while the front hand is still bringing the bow up)
    const stageLoads = ((S.stage === 'aim' || S.stage === 'draw' || S.stage === 'hold') && S.raise > 0.98) || (S.stage === 'raise' && S.raise > 0.5);
    const wantsArrow = this.hasQuiver && (this.showArrow ?? true);
    if (stageLoads && wantsArrow && S.load < 1) {
      if (S.loadWait > 0) S.loadWait -= dt;
      else S.load = Math.min(1, S.load + (dt * Math.max(0.2, this.tune.loadSpeed)) / LOAD_DUR);
    }
    const loading = stageLoads && wantsArrow && S.load < 1;
    const drawGoal = loading ? 0 : S.drawGoal;
    // draw progress
    if (S.stage === 'draw') {
      if (S.directDraw) S.draw = lerp(S.draw, drawGoal, 1 - Math.exp(-18 * dt));
      else S.draw = clamp(S.draw + Math.sign(drawGoal - S.draw) * 1.1 * dt, 0, 1);
      if (!S.directDraw && Math.abs(S.draw - S.drawGoal) < 0.01 && S.drawGoal > 0.02) S.stage = 'hold';
      if (S.drawGoal < 0.01 && S.draw < 0.01) S.stage = 'aim';
    } else if (S.stage === 'hold') {
      S.draw = lerp(S.draw, drawGoal, 1 - Math.exp(-8 * dt));
    } else if (S.stage === 'release') {
      S.draw = lerp(S.draw, 0, 1 - Math.exp(-45 * dt));
      if (S.t > 0.34) {
        if (S.returnTo === 'aim') {
          S.stage = 'aim';
        } else S.stage = 'recover';
        S.t = 0;
      }
    } else if (S.stage === 'aim' || S.stage === 'raise') {
      S.draw = lerp(S.draw, 0, 1 - Math.exp(-20 * dt));
    }

    const w = smooth(S.raise);
    const draw = S.draw;
    // tremor
    const trem = (1 - prm.handStability) * (S.stage === 'hold' ? 0.5 + prm.holdTension : prm.holdTension * 0.4) * draw * draw;
    this.handTremor = { x: Math.sin(t * 31) * 1.6 * trem + Math.sin(t * 53) * 0.8 * trem, y: Math.cos(t * 37) * 1.5 * trem };

    // --- front (aim) arm
    const aimUp = 90 * D + aim;
    const armAng = aimUp + (S.stage === 'release' ? -6 * D * prm.releaseStrength * Math.exp(-S.t * 9) * Math.cos(S.t * 30) : 0);
    const frontUF = armAng - 2 * D;
    const frontFF = armAng + 2 * D + 2 * D * draw;
    const unslingCarry = prm.carryMode === 'slung';
    // raise path: from carry to aim
    let ru = w;
    if (S.stage === 'raise' && S.unsling) {
      // phase 1 (0..0.45): reach to the slung grip, phase 2 (0.45..0.55) grab, phase 3 extend
      const u = S.raise;
      if (u < 0.5) {
        const k = smooth(u / 0.45);
        const grip = { x: -70 - 20 * k, y: -236 - 40 * k };
        B.frontIK = grip;
        B.frontBend = -1;
        B.headRot = lerp(B.headRot, -6 * D, k);
        B.turn = lerp(B.turn, 0.25, k);
        B.armRate = 18;
        B.bowRot = -50 * D;
        return 0;
      }
      ru = smooth((u - 0.5) / 0.5);
      B.frontIK = null;
      B.bowRot = angLerp(-50 * D, aim, ru);
    } else if (S.stage === 'raise') {
      B.bowRot = angLerp(B.bowRot, aim, ru);
    } else if (S.stage === 'recover' && unslingCarry) {
      const dur = 0.8 / prm.recoverSpeed;
      const u = clamp(S.t / dur, 0, 1);
      if (u > 0.6) {
        const k = smooth((u - 0.6) / 0.4);
        B.frontIK = { x: -90 + 10 * k, y: -276 + 20 * k };
        B.frontBend = -1;
        B.bowRot = angLerp(aim, -50 * D, k);
        B.headRot = lerp(B.headRot, -4 * D, k);
        B.armRate = 16;
        return 1 - k;
      }
      B.bowRot = aim;
    } else {
      B.bowRot = aim + (S.stage === 'release' ? 7 * D * prm.releaseStrength * Math.exp(-S.t * 10) * Math.sin(S.t * 34) : 0);
    }
    B.aUF = angLerp(B.aUF, frontUF, ru);
    B.aFF = angLerp(B.aFF, frontFF, ru);
    B.frontIK = B.frontIK && ru < 0.99 ? B.frontIK : null;

    // body: lean back a little with aim & draw, chest opens, head on target
    B.tilt = lerp(B.tilt, -aim * 0.12 - 3 * D * draw + (S.stage === 'release' ? 3 * D * Math.exp(-S.t * 8) : 0), ru);
    B.headRot = lerp(B.headRot, -aim * 0.22 - 1 * D * draw, ru);
    B.turn = lerp(B.turn, -0.25, ru);
    B.sway = lerp(B.sway, 5 + 7 * draw, ru);
    B.bsx = lerp(B.bsx, 12 + 34 * draw, ru);
    B.breath = S.stage === 'hold' ? 0.8 * Math.sin(t * 3.2) * (0.5 + prm.holdTension) : B.breath * (1 - ru);
    if (this.sitAmt < 0.5 && this.hideAmt < 0.5 && this.speed < 1) {
      B.legF.x = lerp(B.legF.x, -44 - 6 * draw, ru);
      B.legB.x = lerp(B.legB.x, 44, ru);
    }
    B.brow = lerp(B.brow, 0.25 * draw, ru);

    // --- back (draw) arm
    const restUB = -10 * D;
    const restFB = restUB + 24 * D;
    if (loading) {
      this.applyLoad(B, S.load, aim, restUB, restFB);
      return ru;
    }
    if (S.stage === 'aim' || S.stage === 'raise') {
      B.aUB = angLerp(B.aUB, restUB, ru);
      B.aFB = angLerp(B.aFB, restFB, ru);
      B.backIK = null;
    } else {
      // target = nock, computed from the *target* front hand
      const nock = this.nockFor(B, aim, draw);
      nock.x += this.handTremor.x;
      nock.y += this.handTremor.y;
      if (S.stage === 'release') {
        const e = Math.exp(-S.t * 7);
        const fwd = 38 * prm.releaseStrength * (1 - Math.exp(-S.t * 40));
        nock.x -= fwd * e;
        nock.y += 10 * (1 - e);
        const k = smooth((S.t - 0.14) / 0.2);
        B.backIK = nock;
        B.backBend = 1;
        if (k > 0) {
          B.aUB = restUB;
          B.aFB = restFB + 10 * D;
          if (k > 0.5) B.backIK = null;
        }
        B.armRate = 30;
      } else if (S.stage === 'recover') {
        B.aUB = restUB;
        B.aFB = restFB;
        B.backIK = null;
      } else {
        B.backIK = nock;
        B.backBend = 1;
        B.armRate = S.stage === 'draw' ? 22 : 14;
      }
    }
    if (S.stage === 'release') {
      B.armRate = 36;
    }
    return ru;
  }

  /**
   * Back hand fetches an arrow: 0 to .32 reach over the shoulder to the quiver, .32 to .44 grab + pull it out,
   * .44 to 1 carry it forward while it swings round to point at the bow, then slide it onto the string.
   */
  private applyLoad(B: BodyTargets, u: number, aim: number, restUB: number, restFB: number) {
    const tmp = defaultPose();
    tmp.tilt = B.tilt;
    tmp.pelvisY = B.pelvisY;
    tmp.hipX = B.hipX;
    tmp.torsoRot = B.torsoRot;
    tmp.shoulderSway = B.sway;
    tmp.backShoulderX = B.bsx;
    const tf = torsoFrame(tmp);
    const sh = tf.shoulderB;
    const d1 = { x: -Math.sin(restUB), y: Math.cos(restUB) };
    const d2 = { x: -Math.sin(restFB), y: Math.cos(restFB) };
    const rest = { x: sh.x + d1.x * G.upperArm + d2.x * G.foreArm, y: sh.y + d1.y * G.upperArm + d2.y * G.foreArm };
    // quiver frame
    const phi = G.quiver.rot + tf.torso.a;
    const qAt = applyFrame(tf.torso, { x: G.quiver.ax, y: G.quiver.ay });
    const up = { x: Math.sin(phi), y: -Math.cos(phi) }; // quiver axis, pointing out of its mouth
    const along = (d: number): Vec => ({ x: qAt.x + up.x * d * G.quiver.scale, y: qAt.y + up.y * d * G.quiver.scale });
    const grab = along(50);
    const pulled = along(78);
    // where the bow's nock is, and how far the arm can carry the arrow towards it
    const nock = this.nockFor(B, aim, 0);
    const toN = { x: nock.x - sh.x, y: nock.y - sh.y };
    const dN = Math.hypot(toN.x, toN.y) || 1;
    const reach = Math.min(dN, 0.9 * (G.upperArm + G.foreArm));
    const far = { x: sh.x + (toN.x / dN) * reach, y: sh.y + (toN.y / dN) * reach };
    const thetaQ = Math.PI / 2 + phi; // arrow head pointing back into the quiver
    const thetaF = Math.PI + aim; // arrow head pointing along the bow
    let hand: Vec;
    let rot = thetaQ;
    let clip = 1;
    let slide = 0;
    let on = true;
    if (u < 0.3) {
      const k = smooth(u / 0.3);
      hand = vlerp(rest, grab, k);
      on = false;
    } else if (u < 0.58) {
      // closes on the arrow (a beat), then draws it out of the quiver
      const k = smooth((u - 0.38) / 0.2);
      hand = vlerp(grab, pulled, k);
    } else {
      const k = smooth((u - 0.58) / 0.42);
      hand = vlerp(pulled, far, k);
      hand.y -= 34 * Math.sin(Math.PI * k);
      rot = thetaQ + (thetaF - thetaQ) * smooth(clamp(k / 0.85, 0, 1));
      clip = 1 - smooth(clamp(k / 0.35, 0, 1));
      slide = clamp((k - 0.72) / 0.28, 0, 1);
    }
    B.backIK = { x: hand.x, y: hand.y };
    B.backBend = 1;
    B.armRate = 26;
    this.loadOut = { on, rot, clip, slide };
  }

  /** Nock position for the target front arm pose. */
  private nockFor(B: BodyTargets, aim: number, draw: number): Vec {
    const tmp = defaultPose();
    tmp.tilt = B.tilt;
    tmp.pelvisY = B.pelvisY;
    tmp.hipX = B.hipX;
    tmp.torsoRot = B.torsoRot;
    tmp.shoulderSway = B.sway;
    const tf = torsoFrame(tmp);
    const d1 = { x: -Math.sin(B.aUF), y: Math.cos(B.aUF) };
    const d2 = { x: -Math.sin(B.aFF), y: Math.cos(B.aFF) };
    const hand = { x: tf.shoulderF.x + d1.x * G.upperArm + d2.x * G.foreArm, y: tf.shoulderF.y + d1.y * G.upperArm + d2.y * G.foreArm };
    return bowGeom(hand, aim, draw).nock;
  }

  private applyBowVisual(P: RigPose, bowRot: number, shootW: number) {
    const S = this.shoot;
    const prm = this.params;
    P.loadArrow = { ...this.loadOut };
    this.carried = this.carried.kind === 'none' ? this.carried : this.carried;
    if (!this.hasBow) {
      P.bow.mode = 'none';
      return;
    }
    if (this.weapon !== 'bow') {
      // the bow rides on the back while something else is in hand
      const inSeq = this.seq && (this.seq.kind === 'unequip-bow' || this.seq.kind === 'pickup-bow');
      P.bow.mode = inSeq ? 'none' : 'slung';
      P.bow.slungT = 1;
      return;
    }
    if (this.seq && (this.seq.kind === 'unequip-bow' || this.seq.kind === 'pickup-bow')) {
      // sequences manage the carried item themselves
      if (this.seqBowMode) {
        P.bow.mode = this.seqBowMode;
        P.bow.slungT = this.seqBowMode === 'slung' ? 1 : 0;
        P.bow.rot = bowRot;
      } else P.bow.mode = 'none';
      return;
    }
    const inHandNow = prm.carryMode === 'hand' || S.stage !== 'none';
    if (!inHandNow) {
      P.bow.mode = 'slung';
      P.bow.slungT = 1;
      return;
    }
    P.bow.mode = 'hand';
    P.bow.rot = bowRot;
    P.bow.draw = S.draw;
    P.bow.recoil = S.stage === 'release' ? Math.exp(-S.t * 8) * prm.releaseStrength : 0;
    P.bow.arrow = (this.showArrow ?? ((S.stage === 'aim' || S.stage === 'draw' || S.stage === 'hold') && this.hasQuiver && S.raise > 0.98)) && this.arrowReady && !this.loadOut.on && S.raise > 0.98;
    // slung blend during raise / recover
    if (prm.carryMode === 'slung') {
      if (S.stage === 'raise') {
        P.bow.slungT = S.unsling && S.raise < 0.5 ? 1 : 0;
      } else if (S.stage === 'recover') {
        const dur = 0.8 / prm.recoverSpeed;
        const u = clamp(S.t / dur, 0, 1);
        P.bow.slungT = u > 0.92 ? 1 : 0;
      } else P.bow.slungT = 0;
    } else P.bow.slungT = 0;
    void shootW;
  }

  private seqBowMode: 'slung' | 'hand' | null = null;

  private applySequence(B: BodyTargets, _o: { front: boolean; back: boolean }) {
    const sq = this.seq;
    this.seqBowMode = null;
    if (!sq) {
      if (this.carried.kind !== 'none') this.carried = { kind: 'none', rot: 0, t: 0 };
      return;
    }
    const u = clamp(sq.t / sq.dur, 0, 1);
    const seg = (a: number, b: number) => smooth((u - a) / (b - a));
    const ev = (name: string, at: number) => {
      if (!sq.data[name] && u >= at) {
        sq.data[name] = 1;
        return true;
      }
      return false;
    };
    switch (sq.kind) {
      case 'hat-off': {
        // 0-0.3 reach, 0.3-0.37 close, 0.37-0.5 lift, 0.5-1 lower to hold
        const reach = seg(0, 0.3);
        const lift = seg(0.37, 0.5);
        const lower = seg(0.5, 1);
        const brim = { x: -118, y: -372 };
        if (u < 0.5) {
          B.frontIK = { x: lerp(-96, brim.x, reach) - 10 * lift, y: lerp(-150, brim.y, reach) - 26 * lift };
          B.frontBend = -1;
          B.headRot = -3 * D * Math.sin(Math.PI * seg(0.37, 0.55));
          B.hatLift = 26 * lift;
          B.hatRot = -0.1 * lift;
          B.armRate = 16;
          if (ev('detach', 0.47)) {
            this.hat = 'hand';
            this.onEvent?.('hat:hand');
          }
        } else {
          const hold = this.hatHoldTarget();
          B.frontIK = { x: lerp(brim.x - 10, hold.x, lower), y: lerp(brim.y - 26, hold.y, lower) };
          B.frontBend = -1;
          B.armRate = 12;
        }
        B.turn += 0.1 * Math.sin(Math.PI * u);
        break;
      }
      case 'hat-on': {
        const up = seg(0, 0.4);
        const appr = seg(0.4, 0.6);
        const away = seg(0.62, 1);
        const hold = this.hatHoldTarget();
        const above = { x: -74, y: -452 };
        const seat = { x: -92, y: -404 };
        if (u < 0.62) {
          const pA = { x: lerp(hold.x, above.x, up), y: lerp(hold.y, above.y, up) };
          B.frontIK = { x: lerp(pA.x, seat.x, appr), y: lerp(pA.y, seat.y, appr) };
          B.frontBend = -1;
          B.headRot = lerp(B.headRot, 3 * D, up);
          B.armRate = 16;
          if (ev('attach', 0.6)) {
            this.hat = 'head';
            this.hatSp.x = -8;
            this.hatSp.kick(-40);
            this.onEvent?.('hat:head');
          }
        } else {
          B.frontIK = { x: lerp(seat.x, -104, away), y: lerp(seat.y, -150, away) };
          B.frontBend = -1;
          B.headRot += -2 * D * (1 - away);
          B.armRate = 12;
        }
        break;
      }
      case 'hat-drop': {
        const hold = this.hatHoldTarget();
        const open = seg(0, 0.3);
        B.frontIK = { x: hold.x - 14 * open, y: hold.y + 10 * open };
        B.frontBend = -1;
        B.headRot += 8 * D * seg(0.2, 0.6);
        B.lookY += 0.5 * seg(0.2, 0.6);
        if (ev('release', 0.3)) {
          const h = this.skel.handF;
          this.hat = 'ground';
          this.props = this.props.filter((p) => p.kind !== 'hat');
          this.props.push({ kind: 'hat', x: this.localToWorld(h.x - 30), y: h.y + 18 + this.pose.y, rot: this.pose.hat.rot, squash: 1, vx: -110 * -this.facing, vy: -40, vr: -2.6, air: true });
          this.onEvent?.('hat:ground');
        }
        break;
      }
      case 'hat-pickup': {
        const prop = this.propOf('hat');
        const lx = prop ? this.worldToLocal(prop.x) : -80;
        const down = seg(0, 0.4);
        const upk = seg(0.5, 1);
        const hold = this.hatHoldTarget();
        const grab = { x: lx - 10, y: -30 };
        const ck = Math.sin(Math.PI * seg(0, 1));
        B.pelvisY += 46 * ck;
        B.tilt += 26 * D * ck;
        B.headRot += 18 * D * ck;
        B.frontIK = { x: lerp(-100, grab.x, down) + (hold.x - grab.x) * upk, y: lerp(-150, grab.y, down) + (hold.y - grab.y) * upk };
        B.frontBend = -1;
        B.aUB = -28 * D;
        B.aFB = B.aUB + 10 * D;
        B.legF.x -= 10 * Math.sin(Math.PI * u);
        if (ev('grab', 0.45)) {
          this.props = this.props.filter((p) => p.kind !== 'hat');
          this.hat = 'hand';
        }
        break;
      }
      case 'pickup-quiver': {
        // 0-0.13 turn to item, 0.13-0.33 reach down, 0.33 grab, 0.33-0.5 lift, 0.5-0.72 rotate behind shoulder, 0.72 attach, 0.72-1 settle
        const turn = seg(0, 0.13);
        const reach = seg(0.13, 0.33);
        const lift = seg(0.33, 0.5);
        const swing = seg(0.5, 0.72);
        const settle = seg(0.72, 1);
        const prop = this.propOf('quiver');
        const lx = this.external ? -92 : prop ? this.worldToLocal(prop.x) : -92;
        const crouchK = Math.sin(Math.PI * clamp((u - 0.1) / 0.5, 0, 1));
        B.pelvisY += 38 * crouchK;
        B.tilt += 8 * D * turn - 2 * D * lift + 20 * D * crouchK;
        B.headRot += 18 * D * turn * (1 - swing) - 6 * D * swing * (1 - settle);
        B.turn += -0.3 * turn * (1 - swing) + 0.25 * swing * (1 - settle);
        B.lookY += 0.5 * turn * (1 - lift);
        const grab = { x: lx - 4, y: this.external ? -70 : -74 };
        const up = { x: -96, y: -210 };
        const over = { x: -36, y: -352 };
        let tgt: Vec;
        if (u < 0.33) tgt = { x: lerp(-100, grab.x, reach), y: lerp(-152, grab.y, reach) };
        else if (u < 0.5) tgt = { x: lerp(grab.x, up.x, lift), y: lerp(grab.y, up.y, lift) };
        else if (u < 0.72) tgt = { x: lerp(up.x, over.x, swing), y: lerp(up.y, over.y, swing) };
        else tgt = { x: lerp(over.x, -98, settle), y: lerp(over.y, -150, settle) };
        B.frontIK = tgt;
        B.frontBend = -1;
        B.aUB = -26 * D * crouchK - 6 * D;
        B.aFB = B.aUB + 14 * D;
        B.legF.x -= 12 * crouchK;
        B.legB.x += 10 * crouchK;
        B.armRate = 16;
        if (ev('grab', 0.33)) {
          this.props = this.props.filter((p) => p.kind !== 'quiver');
          this.carried = { kind: 'quiver', rot: 0.5, t: 0 };
          this.onEvent?.('grab:quiver');
        }
        if (this.carried.kind === 'quiver') this.carried.rot = lerp(0.5, -0.6, swing) + 0.4 * lift * (1 - swing);
        if (ev('attach', 0.72)) {
          this.carried = { kind: 'none', rot: 0, t: 0 };
          this.hasQuiver = true;
          this.quiverSp.x = 0.35;
          this.quiverSp.kick(-3);
          this.quiverBounce.kick(90);
          this.onEvent?.('attach:quiver');
        }
        break;
      }
      case 'pickup-bow': {
        const reach = seg(0.1, 0.33);
        const lift = seg(0.35, 0.55);
        const settle = seg(0.55, 0.75);
        const sling = seg(0.75, 1);
        const prop = this.propOf('bow');
        const lx = this.external ? -100 : prop ? this.worldToLocal(prop.x) : -100;
        const crouchK = Math.sin(Math.PI * clamp((u - 0.05) / 0.55, 0, 1));
        B.pelvisY += 24 * crouchK;
        B.tilt += 14 * D * crouchK;
        B.headRot += 18 * D * crouchK;
        B.lookY += 0.5 * crouchK;
        const grab = this.external ? { x: lx, y: -122 } : { x: lx - 50, y: -106 };
        const carry = { x: -138, y: -168 };
        const over = { x: -40, y: -350 };
        let tgt: Vec;
        if (u < 0.35) tgt = { x: lerp(-100, grab.x, reach), y: lerp(-152, grab.y, reach) };
        else if (u < 0.55) tgt = { x: lerp(grab.x, carry.x, lift), y: lerp(grab.y, carry.y, lift) };
        else if (u < 0.75) tgt = { x: carry.x + 6 * Math.sin(settle * Math.PI), y: carry.y - 8 * Math.sin(settle * Math.PI) };
        else if (this.params.carryMode === 'slung') tgt = { x: lerp(carry.x, over.x, sling), y: lerp(carry.y, over.y, sling) };
        else tgt = { x: lerp(carry.x, -112, sling), y: lerp(carry.y, -150, sling) };
        B.frontIK = tgt;
        B.frontBend = -1;
        B.aUB = -22 * D * crouchK - 6 * D;
        B.aFB = B.aUB + 12 * D;
        B.legF.x -= 10 * crouchK;
        B.armRate = 16;
        if (ev('grab', 0.33)) {
          this.props = this.props.filter((p) => p.kind !== 'bow');
          this.carried = { kind: 'bow', rot: 1.35, t: 0 };
          this.onEvent?.('grab:bow');
        }
        if (this.carried.kind === 'bow') {
          const carryRot = -14 * D;
          this.carried.rot = u < 0.55 ? lerp(1.35, carryRot + 0.3, lift) : u < 0.75 ? lerp(carryRot + 0.3, carryRot, settle) : lerp(carryRot, -0.9, sling);
        }
        if (ev('attach', this.params.carryMode === 'slung' ? 0.93 : 0.78)) {
          this.carried = { kind: 'none', rot: 0, t: 0 };
          this.hasBow = true;
          this.weapon = 'bow';
          this.onEvent?.('attach:bow');
        }
        if (this.hasBow && sq.data.attach) this.seqBowMode = this.params.carryMode;
        if (sq.data.attach && this.params.carryMode === 'slung') {
          B.frontIK = { x: lerp(over.x, -100, seg(0.93, 1)), y: lerp(over.y, -150, seg(0.93, 1)) };
        }
        break;
      }
      case 'armed-ready': {
        const k = Math.sin(Math.PI * u);
        B.tilt += -3 * D * k;
        B.turn += -0.2 * k;
        B.sway += 6 * k;
        B.pelvisY += -3 * k;
        B.aUF = lerp(B.aUF, 14 * D, k);
        B.aFF = lerp(B.aFF, 40 * D, k);
        B.aUB = lerp(B.aUB, -12 * D, k);
        B.aFB = lerp(B.aFB, 16 * D, k);
        B.breath = 1.5 * Math.sin(this.time * 3.2);
        B.headRot += -2 * D * k;
        break;
      }
      case 'unequip-bow': {
        const slung = this.params.carryMode === 'slung';
        const reach = seg(0, 0.3);
        const down = seg(0.35, 0.7);
        const back = seg(0.75, 1);
        const over = { x: -70, y: -300 };
        const carry = { x: -138, y: -168 };
        const ground = { x: -170, y: -106 };
        let tgt: Vec;
        if (u < 0.35) tgt = slung ? { x: lerp(-100, over.x, reach), y: lerp(-152, over.y, reach) } : carry;
        else if (u < 0.75) tgt = { x: lerp(slung ? over.x : carry.x, ground.x, down), y: lerp(slung ? over.y : carry.y, ground.y, down) };
        else tgt = { x: lerp(ground.x, -100, back), y: lerp(ground.y, -152, back) };
        B.frontIK = tgt;
        B.frontBend = -1;
        const crouchK = Math.sin(Math.PI * clamp((u - 0.35) / 0.55, 0, 1));
        B.pelvisY += 24 * crouchK;
        B.tilt += 14 * D * crouchK;
        B.headRot += 14 * D * crouchK;
        B.armRate = 16;
        if (u < 0.33) this.seqBowMode = slung ? 'slung' : 'hand';
        if (ev('grab', 0.33)) {
          this.carried = { kind: 'bow', rot: -0.9, t: 0 };
        }
        if (this.carried.kind === 'bow') this.carried.rot = lerp(slung ? -0.9 : -14 * D, 1.35, down);
        if (ev('drop', 0.72)) {
          this.carried = { kind: 'none', rot: 0, t: 0 };
          this.hasBow = false;
          this.weapon = 'unarmed';
          if (!this.external) this.placeProp('bow', ground.x + 50, 0.2);
          this.onEvent?.('detach:bow');
        }
        break;
      }
      case 'unequip-quiver': {
        const reach = seg(0, 0.28);
        const over = seg(0.3, 0.55);
        const down = seg(0.55, 0.8);
        const back = seg(0.82, 1);
        const strap = { x: -60, y: -300 };
        const high = { x: -110, y: -330 };
        const ground = { x: -116, y: -74 };
        let tgt: Vec;
        if (u < 0.3) tgt = { x: lerp(-100, strap.x, reach), y: lerp(-152, strap.y, reach) };
        else if (u < 0.55) tgt = { x: lerp(strap.x, high.x, over), y: lerp(strap.y, high.y, over) };
        else if (u < 0.82) tgt = { x: lerp(high.x, ground.x, down), y: lerp(high.y, ground.y, down) };
        else tgt = { x: lerp(ground.x, -100, back), y: lerp(ground.y, -152, back) };
        B.frontIK = tgt;
        B.frontBend = -1;
        const crouchK = Math.sin(Math.PI * clamp((u - 0.5) / 0.45, 0, 1));
        B.pelvisY += 38 * crouchK;
        B.tilt += 20 * D * crouchK - 4 * D * over * (1 - down);
        B.headRot += 14 * D * crouchK - 6 * D * reach * (1 - down);
        B.turn += 0.25 * reach * (1 - over);
        B.armRate = 16;
        if (ev('grab', 0.3)) {
          this.hasQuiver = false;
          this.carried = { kind: 'quiver', rot: -0.6, t: 0 };
          this.onEvent?.('detach:quiver');
        }
        if (this.carried.kind === 'quiver') this.carried.rot = lerp(-0.6, 0.4, down);
        if (ev('drop', 0.8)) {
          this.carried = { kind: 'none', rot: 0, t: 0 };
          if (!this.external) this.placeProp('quiver', ground.x + 4, 0);
        }
        break;
      }
      case 'sit-down': {
        const k = Math.sin(Math.PI * u);
        B.tilt += 10 * D * k;
        B.headRot += 8 * D * k;
        // hands support briefly behind/below
        B.backIK = { x: 60 + 20 * k, y: lerp(-150, -14, seg(0.2, 0.7)) };
        B.backBend = -1;
        B.aUF = lerp(B.aUF, 40 * D, k);
        B.aFF = lerp(B.aFF, 60 * D, k);
        B.armRate = 12;
        if (u > 0.75) B.backIK = null;
        break;
      }
      case 'stand-up': {
        const k = Math.sin(Math.PI * u);
        B.tilt += 18 * D * k;
        B.headRot += 6 * D * k;
        B.frontIK = u < 0.6 ? { x: -70 - 20 * k, y: -60 - 20 * seg(0, 0.4) } : null;
        B.frontBend = -1;
        B.backIK = u < 0.5 ? { x: 56, y: -14 } : null;
        B.backBend = -1;
        B.armRate = 12;
        break;
      }
      default:
        break;
    }
  }

  private hatHoldTarget(): Vec {
    return { x: -118, y: -196 };
  }

  private applyReaction(B: BodyTargets, t: number) {
    const r = this.reaction;
    if (!r) return;
    const u = r.t / r.dur;
    const env = Math.sin(Math.PI * u);
    switch (r.kind) {
      case 'nod':
        B.headRot += 9 * D * Math.max(0, Math.sin(r.t * 13)) * (1 - u * 0.5) + 2 * D * env;
        B.tilt += 1 * D * Math.max(0, Math.sin(r.t * 13));
        break;
      case 'shake':
        B.turn += 0.55 * Math.sin(r.t * 20) * (1 - u);
        B.headX += 6 * Math.sin(r.t * 20) * (1 - u);
        B.sway += -2 * Math.sin(r.t * 20) * (1 - u);
        break;
      case 'wave': {
        const k = smooth(clamp(u / 0.2, 0, 1)) * (1 - smooth(clamp((u - 0.8) / 0.2, 0, 1)));
        B.aUF = lerp(B.aUF, 150 * D, k);
        B.aFF = lerp(B.aFF, 190 * D + 24 * D * Math.sin(t * 15), k);
        B.frontIK = null;
        B.headRot += -4 * D * k;
        B.turn += -0.1 * k;
        B.smile = Math.max(B.smile, 0.8 * k);
        B.tilt += -2 * D * k;
        break;
      }
      case 'look-item':
        B.headRot += 14 * D * env;
        B.turn += -0.35 * env;
        B.torsoRot += 4 * D * env;
        B.tilt += 4 * D * env;
        B.lookY += 0.6 * env;
        break;
      case 'surprised': {
        const k = 1 - smooth(clamp((u - 0.6) / 0.4, 0, 1));
        const snap = smooth(clamp(u / 0.1, 0, 1));
        B.headRot += -10 * D * snap * k;
        B.breath += 7 * snap * k;
        B.brow = 1 * snap * k;
        B.pelvisY += -4 * snap * k;
        B.aUF += 14 * D * snap * k;
        B.aUB += -14 * D * snap * k;
        break;
      }
      case 'disappointed': {
        const k = smooth(clamp(u / 0.3, 0, 1)) * (1 - smooth(clamp((u - 0.75) / 0.25, 0, 1)));
        B.pelvisY += 6 * k;
        B.tilt += 6 * D * k;
        B.headRot += 16 * D * k;
        B.aUF = lerp(B.aUF, 0, k);
        B.aFF = lerp(B.aFF, 2 * D, k);
        B.aUB = lerp(B.aUB, 0, k);
        B.aFB = lerp(B.aFB, 2 * D, k);
        B.brow = -0.7 * k;
        B.smile = -0.5 * k;
        B.lookY += 0.5 * k;
        break;
      }
      case 'victory': {
        const k = smooth(clamp(u / 0.15, 0, 1)) * (1 - smooth(clamp((u - 0.75) / 0.25, 0, 1)));
        const hop = Math.max(0, Math.sin(Math.PI * clamp(u / 0.55, 0, 1)));
        B.rootY += -60 * hop;
        B.aUF = lerp(B.aUF, 165 * D, k);
        B.aFF = lerp(B.aFF, 175 * D, k);
        B.aUB = lerp(B.aUB, -165 * D, k);
        B.aFB = lerp(B.aFB, -175 * D, k);
        B.frontIK = null;
        B.backIK = null;
        B.smile = Math.max(B.smile, k);
        B.headRot += -8 * D * k;
        B.legF.y -= 10 * hop;
        B.legB.y -= 10 * hop;
        B.squash = 1 - 0.05 * Math.max(0, Math.sin(Math.PI * clamp((u - 0.55) / 0.2, 0, 1)));
        B.hatLift += 10 * hop;
        break;
      }
      case 'celebrate': {
        const k = smooth(clamp(u / 0.15, 0, 1)) * (1 - smooth(clamp((u - 0.7) / 0.3, 0, 1)));
        const hop = Math.max(0, Math.sin(Math.PI * clamp(u / 0.6, 0, 1)));
        B.rootY += -50 * hop;
        B.aUB = lerp(B.aUB, -150 * D, k);
        B.aFB = lerp(B.aFB, -60 * D, k);
        B.backIK = null;
        B.smile = Math.max(B.smile, k);
        B.headRot += -6 * D * k;
        B.legF.y -= 8 * hop;
        B.legB.y -= 8 * hop;
        break;
      }
    }
  }

  private updateJump(dt: number, B: BodyTargets) {
    const J = this.jump;
    if (J.phase === 'none') return;
    J.t += dt;
    const hop = J.hop;
    const g = 2400;
    const peak = hop ? 42 : 112;
    switch (J.phase) {
      case 'ready': {
        const dur = hop ? 0.16 : 0.28;
        const k = smooth(J.t / dur);
        B.pelvisY += (hop ? 16 : 28) * k;
        B.tilt += 8 * D * k;
        B.aUF = lerp(B.aUF, -40 * D, k);
        B.aFF = lerp(B.aFF, -20 * D, k);
        B.aUB = lerp(B.aUB, -45 * D, k);
        B.aFB = lerp(B.aFB, -25 * D, k);
        B.frontIK = null;
        B.backIK = null;
        B.headRot += -4 * D * k;
        if (J.t >= dur) {
          J.phase = 'takeoff';
          J.t = 0;
          J.vy = -Math.sqrt(2 * g * peak);
          J.y = 0;
        }
        break;
      }
      case 'takeoff':
      case 'air':
      case 'fall': {
        J.vy += g * dt;
        J.y += J.vy * dt;
        if (J.phase === 'takeoff' && J.t > 0.1) J.phase = 'air';
        if (J.phase === 'air' && J.vy > 0) J.phase = 'fall';
        B.rootY = Math.min(0, J.y);
        const rising = clamp(-J.vy / Math.sqrt(2 * g * peak), 0, 1);
        const falling = clamp(J.vy / Math.sqrt(2 * g * peak), 0, 1);
        const stretch = J.phase === 'takeoff' ? smooth(J.t / 0.1) : 1;
        // legs: extend at takeoff, tuck in the air, prepare for landing
        const tuck = J.phase === 'takeoff' ? 0 : hop ? 0.4 : 0.8 * (1 - falling * 0.7);
        B.legF = { x: -30 + 10 * tuck, y: G.standAnkleY - 34 * tuck + 6 * (1 - stretch), r: J.phase === 'fall' ? 0.3 * falling : 0.6 * (1 - tuck) };
        B.legB = { x: 34 - 10 * tuck, y: G.standAnkleY - 28 * tuck, r: J.phase === 'fall' ? 0.3 * falling : 0.7 * (1 - tuck) };
        B.pelvisY += -6 * stretch;
        B.tilt += -4 * D * rising + 6 * D * falling;
        B.squash = 1 + 0.05 * stretch * rising;
        const armsUp = J.phase === 'takeoff' ? stretch : 1 - falling * 0.6;
        B.aUF = lerp(B.aUF, 120 * D, armsUp);
        B.aFF = lerp(B.aFF, 150 * D, armsUp);
        B.aUB = lerp(B.aUB, 110 * D - 60 * D * (1 - rising), armsUp);
        B.aFB = lerp(B.aFB, 140 * D, armsUp);
        if (J.phase === 'fall') {
          B.aUF = lerp(B.aUF, 50 * D, falling);
          B.aFF = lerp(B.aFF, 70 * D, falling);
          B.aUB = lerp(B.aUB, 40 * D, falling);
          B.aFB = lerp(B.aFB, 60 * D, falling);
        }
        B.frontIK = null;
        B.backIK = null;
        B.headRot += 3 * D * falling - 3 * D * rising;
        B.hatLift += 8 * rising * (hop ? 0.5 : 1);
        B.armRate = 20;
        B.legRate = 30;
        if (J.y >= 0 && J.vy > 0) {
          J.phase = 'land';
          J.t = 0;
          J.y = 0;
          this.hatSp.kick(-160 * (hop ? 0.5 : 1));
          this.quiverBounce.kick(240 * (hop ? 0.5 : 1));
          this.beardSp.kick(-3 * (hop ? 0.5 : 1));
          this.onEvent?.(hop ? 'hop-land' : 'land');
        }
        break;
      }
      case 'land': {
        const dur = hop ? 0.22 : 0.4;
        const u = clamp(J.t / dur, 0, 1);
        const absorb = Math.sin(Math.PI * Math.min(1, u * 1.15));
        const early = smooth(clamp(u / 0.25, 0, 1));
        B.pelvisY += (hop ? 16 : 32) * absorb;
        B.tilt += (hop ? 6 : 14) * D * absorb;
        B.headRot += (hop ? 4 : 8) * D * absorb * (1 - early * 0.3);
        B.squash = 1 - (hop ? 0.04 : 0.08) * absorb * (1 - early * 0.6);
        B.aUF = lerp(B.aUF, 50 * D, absorb);
        B.aFF = lerp(B.aFF, 70 * D, absorb);
        B.aUB = lerp(B.aUB, 40 * D, absorb);
        B.aFB = lerp(B.aFB, 60 * D, absorb);
        B.legF = { x: -40, y: G.standAnkleY, r: 0 };
        B.legB = { x: 40, y: G.standAnkleY, r: 0 };
        B.frontIK = null;
        B.backIK = null;
        B.legRate = 30;
        if (u >= 1) {
          J.phase = 'none';
        }
        break;
      }
      default:
        break;
    }
  }

  private finishSeq() {
    const sq = this.seq;
    if (!sq) return;
    this.seq = null;
    if (sq.kind === 'pickup-quiver' || sq.kind === 'pickup-bow') {
      if (this.hasBow && this.hasQuiver && !this.external) this.startSeq('armed-ready', 0.9);
    }
    if (sq.kind === 'stand-up') this.sitAmt = 0;
    if (sq.kind === 'sit-down') this.sitAmt = 1;
    this.onEvent?.('seq-end:' + sq.kind);
  }

  private updateBlink(dt: number) {
    this.blinkNext -= dt;
    if (this.blinkNext <= 0) {
      this.blinkT = 0.13;
      const slow = this.base === 'idle-tired' || this.base === 'walk-tired' ? 1.8 : 1;
      this.blinkNext = (2 + Math.random() * 3.5) * slow;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
  }

  private updateProps(dt: number) {
    for (const p of this.props) {
      if (!p.air) {
        p.squash = lerp(p.squash, 1, 1 - Math.exp(-10 * dt));
        continue;
      }
      p.vy += 1900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.vx *= 1 - 0.8 * dt;
      if (p.y >= 0) {
        p.y = 0;
        if (p.vy > 140) {
          p.vy = -p.vy * 0.32;
          p.vr *= 0.5;
          p.squash = 0.72;
          p.rot = lerp(p.rot, Math.round(p.rot / Math.PI) * Math.PI, 0.5);
        } else {
          p.air = false;
          p.vy = 0;
          p.squash = 0.82;
          p.rot = Math.round(p.rot / Math.PI) * Math.PI + 0.08 * Math.sign(p.vx || 1);
          this.onEvent?.('prop-land');
        }
      }
    }
  }

  private updateArrows(dt: number) {
    for (const a of this.arrows) {
      a.t += dt;
      if (a.stuck) continue;
      a.vy += 900 * dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.y >= -6) {
        a.y = -6;
        a.stuck = true;
      }
    }
    this.arrows = this.arrows.filter((a) => a.t < 6);
  }
}

type BodyTargets = {
  tilt: number;
  pelvisY: number;
  hipX: number;
  hipRot: number;
  torsoRot: number;
  sway: number;
  bsx: number;
  breath: number;
  headRot: number;
  headX: number;
  headY: number;
  turn: number;
  lookX: number;
  lookY: number;
  brow: number;
  smile: number;
  rootY: number;
  squash: number;
  aUF: number;
  aFF: number;
  aUB: number;
  aFB: number;
  legF: { x: number; y: number; r: number; toe?: number };
  legB: { x: number; y: number; r: number; toe?: number };
  bowRot: number;
  armRate: number;
  legRate: number;
  frontIK: Vec | null;
  backIK: Vec | null;
  frontBend: 1 | -1;
  backBend: 1 | -1;
  hatLift: number;
  hatRot: number;
};
