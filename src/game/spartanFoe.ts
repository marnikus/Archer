// The Spartan opponent: behaviour + procedural pose on the shared hero rig.
//   idle    – unaware, shield low; walks back to his post. WAKES UP when an arrow lands near him (even from a
//             long distance), when he is hit, or when the hero comes close.
//   notice  – he spots the hero: surprise → anger (face + head snap)
//   raise/guard – shield up in FRONT of his body, bobbing; he hunts the hero: walk, RUN when far, short SPRINTS
//             when closing in. The shield predicts where an incoming arrow will arrive and slides to cover it.
//   windup → strike → recover – angry (blocked hits) or hero too close. Windup (sword raised), then a CHARGE with a
//             stretched thrust (a LEAP after his first wound), then OPEN for a while.
//   dying/dead
// Each lost hit point makes him tougher (tier 0..2): faster, shorter windup/cooldown, fewer blocks to anger him,
// longer charges, a shorter open window.
// World convention (same as the hero): x grows toward the START, the hero comes from +x, so the Spartan faces +x
// (dir = 1). The rig is authored facing -x, so it is drawn flipped.
import { defaultPose, solveSkeleton, DEG, G as RG, lerp, smooth, clamp, type RigPose, type Skeleton, type Vec } from '../rig/rig';
import { drawSpartan, SPARTAN, NEUTRAL, type SpartanLook, type LegDraw, type Expression } from '../rig/spartan';
import { solveLeg, gaitFoot, plantedRate } from '../rig/legs';
import { registerPreview } from '../rig/layers';
import { drawArrowArt } from './art';

export type FoeState = 'idle' | 'notice' | 'guard' | 'windup' | 'strike' | 'recover' | 'raise' | 'dying' | 'dead';

export const FOE = {
  hp: 3, // lives (hit points). Change this number; the HUD hearts and the difficulty tiers follow.
  aggroDist: 1500,
  huntLeash: 3300,
  strikeDist: 760,
  advanceStop: 640,
  walk: [150, 185, 220],
  run: [380, 440, 500],
  sprint: [760, 840, 920], // sprinting he carries NO shield in front: he is uncovered
  runDist: 800,
  sprintMin: 600,
  sprintMax: 2100,
  sprintLen: 0.9,
  sprintCool: [1.8, 1.3, 0.9],
  retreatSpeed: 260,
  notice: 0.75,
  windup: [0.7, 0.55, 0.45],
  strike: 0.75,
  leap: 0.95,
  recover: [2.0, 1.8, 1.5], // OPEN window after the thrust
  raise: 0.25,
  cooldown: [0.7, 0.5, 0.3],
  angerMax: [3, 2, 2],
  chargeMax: [780, 900, 1000],
  chargeStop: 300,
  swordLen: 225,
  shieldR: 108,
  /** the shield starts moving to cover an arrow this long before it arrives; limited speed (units/s) */
  trackStart: 0.85,
  trackSpeed: [900, 1250, 1600],
};

/** the Spartan is taller than the hero: longer legs and a higher pelvis (his legs show below the tunic) */
const THIGH = 58;
const SHIN = 56;
const PELVIS = -128;

/** first intersection of the segment p→n with a circle (or p itself when it starts inside) */
function segCircle(px: number, py: number, nx: number, ny: number, cx: number, cy: number, r: number) {
  const dx = nx - px;
  const dy = ny - py;
  const fx = px - cx;
  const fy = py - cy;
  if (fx * fx + fy * fy <= r * r) return { x: px, y: py };
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = (-b - sq) / (2 * a);
  if (t < 0 || t > 1) return null;
  return { x: px + dx * t, y: py + dy * t };
}

// DEV: the Spartan's lives can be set from the UI; the choice is remembered
try {
  const v = parseInt(typeof localStorage !== 'undefined' ? (localStorage.getItem('als-foe-lives') ?? '') : '', 10);
  if (Number.isFinite(v)) FOE.hp = Math.min(20, Math.max(1, v));
} catch {
  /* ignore */
}

const approach = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

class Spring {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public d: number,
  ) {}
  step(dt: number, target = 0, force = 0) {
    const a = (target - this.x) * this.k - this.v * this.d + force;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number) {
    this.v += v;
  }
}

export interface StuckArrow {
  ox: number;
  oy: number;
  rot: number;
}

const EXPR_KEYS: Array<keyof Expression> = ['lift', 'tilt', 'eye', 'mouth', 'smile', 'asym'];

export class SpartanFoe {
  x = 0;
  homeX = 0;
  readonly dir = 1;
  hp = FOE.hp;
  anger = 0;
  state: FoeState = 'idle';
  t = 0;
  time = 0;
  shieldAmt = 0;
  bobPhase = 0;
  hurtT = 0;
  fall = 0;
  alpha = 1;
  cool = 0;
  hunting = false;
  stuck: StuckArrow[] = [];
  /** the thrust already hit (one hit per strike) */
  struck = false;
  /** called for story moments (dialogue, cutscene): 'notice' | 'attack' | 'strike' | 'sprint' | 'block' | 'hurt' | 'wound' | 'die' */
  onEvent: ((e: string) => void) | null = null;
  /** cutscene: force a facial expression */
  exprForce: Expression | null = null;
  /** editor preview helpers */
  hold: FoeState | null = null;
  forcePain = false;
  shieldKick = 0;
  speed = 0;
  /** incoming arrow prediction, set by the game each frame: impact height (rig y, up is negative) and time to impact */
  predY: number | null = null;
  predT = 9;
  /** true while the shield is sliding to cover a predicted arrow */
  tracking = false;
  pose: RigPose = defaultPose();
  skel: Skeleton = solveSkeleton(this.pose);
  look: SpartanLook = { shieldMode: 'back', capeSwing: 0, tunicSway: 0, eyeX: 0, eyeY: 0, shieldRot: 0, shieldScale: 1.15, swordRot: -2.6, expr: { ...NEUTRAL } };

  // attack bookkeeping
  private chargeFrom = 0;
  private chargeDist = 0;
  private lastDist = 2000;
  private windDur = FOE.windup[0];
  private recDur = FOE.recover[0];
  private strikeDur = FOE.strike;
  private leapAttack = false;
  private sprintT = 0;
  private sprintCool = 1.5;
  private blockT = 0;
  // pose / micro-animation state
  private sw = { x: 30, y: -170, rot: -150 * DEG };
  private shieldY = -195;
  private tilt = 0;
  private turn = -0.35;
  private lunge = 0;
  private air = 0;
  private walkPhase = 0;
  private walkAmt = 0;
  private runAmt = 0;
  private blinkT = 0;
  private blinkNext = 2.2;
  private shiftT = 3;
  private shiftSide = 0;
  private shiftAmt = 0;
  private lookT = 1;
  private eyeGoal = { x: 0, y: 0 };
  private eye = { x: 0, y: 0 };
  private tapT = 5;
  private expr: Expression = { ...NEUTRAL };
  private capeSp = new Spring(100, 6.5);
  private bodySp = new Spring(280, 15);
  private headSp = new Spring(240, 12);

  constructor(x = 0) {
    this.reset(x);
  }

  reset(x: number) {
    this.x = x;
    this.homeX = x;
    this.hp = FOE.hp;
    this.anger = 0;
    this.state = 'idle';
    this.t = 0;
    this.cool = 0;
    this.hunting = false;
    this.shieldAmt = 0.25;
    this.hurtT = 0;
    this.fall = 0;
    this.alpha = 1;
    this.stuck = [];
    this.struck = false;
    this.sw = { x: 30, y: -170, rot: -150 * DEG };
    this.shieldY = -195;
    this.tilt = 0;
    this.lunge = 0;
    this.air = 0;
    this.speed = 0;
    this.sprintT = 0;
    this.sprintCool = 1.5;
    this.predY = null;
    this.expr = { ...NEUTRAL };
  }

  get alive() {
    return this.state !== 'dying' && this.state !== 'dead';
  }
  /** 0 fresh … 2 badly wounded: he gets faster and meaner */
  get tier() {
    // by the FRACTION of lives lost, so any FOE.hp spreads the difficulty over the whole fight
    return clamp(Math.floor((1 - Math.ceil(this.hp - 1e-6) / FOE.hp) * 3 + 1e-6), 0, 2);
  }
  get angerMax() {
    return FOE.angerMax[this.tier];
  }
  /** can arrows / blows hurt him right now? (shield up covers only the part the shield is over) */
  get open() {
    return this.state === 'idle' || this.state === 'notice' || this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || this.sprintT > 0;
  }
  get worldX() {
    return this.x;
  }
  /** x of the shield face, relative to him (toward the hero) */
  private get shieldFront() {
    return -this.skel.handF.x + 12;
  }
  /** shield centre, world space */
  shieldWorld(groundY: number) {
    const h = this.skel.handF;
    return { x: this.worldX - h.x * this.dir, y: groundY + h.y + this.pose.y };
  }

  private enter(s: FoeState) {
    this.state = s;
    this.t = 0;
    if (s === 'notice') this.onEvent?.('notice');
    else if (s === 'windup') this.onEvent?.('attack');
    else if (s === 'strike') this.onEvent?.('strike');
    else if (s === 'dying') this.onEvent?.('die');
  }

  /** Something woke him up (an arrow landed near him, or hit him): he is hunting now. */
  provoke() {
    this.hunting = true;
    if (this.state === 'idle') {
      this.headSp.kick(-90);
      this.bodySp.kick(-60);
      this.capeSp.kick(2);
      this.enter('notice');
    }
  }

  /** Begin the attack (windup → charging thrust → open recovery). */
  attack() {
    if (this.state === 'windup' || this.state === 'strike' || this.state === 'recover' || !this.alive) return;
    const tier = this.tier;
    this.anger = 0;
    this.struck = false;
    this.windDur = FOE.windup[tier];
    this.recDur = FOE.recover[tier];
    this.leapAttack = tier >= 1;
    this.strikeDur = this.leapAttack ? FOE.leap : FOE.strike;
    this.capeSp.kick(-2.5);
    this.enter('windup');
  }

  /** A hit was stopped by the shield. Returns true when this made him attack. */
  block(ox: number, oy: number, rot: number, stick = true) {
    if (stick) {
      this.stuck.push({ ox, oy, rot });
      if (this.stuck.length > 7) this.stuck.shift();
    }
    this.anger++;
    this.shieldKick = 1;
    this.blockT = 0.9;
    this.onEvent?.('block');
    this.bodySp.kick(-70);
    this.hunting = true;
    if (this.anger >= this.angerMax && this.state === 'guard') {
      this.attack();
      return true;
    }
    return false;
  }

  /** Damage in hit points (arrows/bolts/blows). Returns true if that killed him. */
  damage(amount = 1) {
    const tier0 = this.tier;
    this.hp -= amount;
    this.hurtT = 0.55;
    this.hunting = true;
    this.bodySp.kick(120);
    this.headSp.kick(-120);
    this.capeSp.kick(3);
    if (this.state === 'idle' || this.state === 'notice') this.enter('raise');
    if (this.hp > 0.001) this.onEvent?.(this.tier > tier0 ? 'wound' : 'hurt');
    if (this.hp <= 0.001) {
      this.hp = 0;
      this.enter('dying');
      return true;
    }
    return false;
  }

  /**
   * Arrow segment test (world space, arrow travelling toward -x). Swept against the actual shapes, so an arrow can never
   * slip through him when his guard changes mid-flight:
   *   1. the shield disc, when it is held in front of him → blocked, exactly where it touches the disc;
   *   2. otherwise the body slab (head to feet) → a hit (through the "gap" if he was guarding).
   */
  testArrow(px: number, py: number, nx: number, ny: number, groundY: number): { kind: 'shield' | 'body'; x: number; y: number } | null {
    if (!this.alive) return null;
    const lift = this.pose.y; // leaping raises him
    if (this.look.shieldMode === 'front' && !this.open) {
      const c = this.shieldWorld(groundY);
      const hit = segCircle(px, py, nx, ny, c.x, c.y, FOE.shieldR);
      if (hit) return { kind: 'shield', x: hit.x, y: hit.y };
    }
    const top = groundY + lift - 520;
    const bot = groundY + lift - 4;
    const xFront = this.worldX + 60;
    const xBack = this.worldX - 70;
    if (px > xFront && nx <= xFront) {
      const f = (px - xFront) / (px - nx || 1);
      const y = py + (ny - py) * f;
      if (y >= top && y <= bot) return { kind: 'body', x: xFront, y };
    } else if (px <= xFront && px >= xBack && py >= top && py <= bot) {
      return { kind: 'body', x: px, y: py };
    }
    return null;
  }

  private covers(y: number, groundY: number) {
    return Math.abs(y - (groundY + this.skel.handF.y + this.pose.y)) <= FOE.shieldR;
  }

  /** A melee blow reaching world x = tipX (toward -x), at hero height. */
  testMelee(heroX: number, tipX: number, groundY: number): 'shield' | 'body' | null {
    if (!this.alive || heroX < this.worldX) return null;
    const guarded = !this.open;
    const plane = this.worldX + this.dir * (guarded ? this.shieldFront : 45);
    if (tipX > plane + 25) return null;
    if (guarded) return this.covers(groundY - 230, groundY) ? 'shield' : 'body';
    return 'body';
  }

  /** Is the sword tip touching a hero standing at heroX? (only during the thrust) */
  swordHits(heroX: number): boolean {
    if (this.state !== 'strike' || this.struck) return false;
    const u = this.t / this.strikeDur;
    if (u < 0.15 || u > 0.95) return false;
    const hand = this.look.swordHand ?? this.skel.handB;
    const tipRigX = hand.x + Math.sin(this.sw.rot) * FOE.swordLen;
    const tipWorld = this.worldX - tipRigX * this.dir;
    return heroX <= tipWorld + 70 && heroX >= this.worldX - 40;
  }

  update(dt: number, heroX: number, heroAlive = true) {
    this.time += dt;
    this.t += dt;
    this.blinkNext -= dt;
    if (this.blinkNext <= 0) {
      this.blinkT = 0.13;
      this.blinkNext = 1.6 + Math.random() * 3.2;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    if (this.forcePain) this.hurtT = 0.3;
    else if (this.hurtT > 0) this.hurtT -= dt;
    if (this.blockT > 0) this.blockT -= dt;
    this.shieldKick = Math.max(0, this.shieldKick - dt * 5);
    if (this.cool > 0) this.cool -= dt;
    const dist = heroX - this.x;
    this.lastDist = dist;
    const prevX = this.x;
    const tier = this.tier;

    if (this.hold) {
      if (this.hold === 'guard') this.bobPhase += dt * 2.4;
      this.state = this.hold;
      this.t =
        this.hold === 'windup' ? 0.55 : this.hold === 'strike' ? 0.4 : this.hold === 'recover' ? 0.8 : this.hold === 'notice' ? 0.25 : 0.2;
    } else {
      switch (this.state) {
        case 'idle':
          if (Math.abs(this.x - this.homeX) > 3) this.x += Math.sign(this.homeX - this.x) * Math.min(Math.abs(this.homeX - this.x), FOE.retreatSpeed * dt);
          if (heroAlive && (this.hunting || dist < FOE.aggroDist)) {
            this.hunting = true;
            this.headSp.kick(-90);
            this.bodySp.kick(-60);
            this.enter('notice');
          }
          break;
        case 'notice':
          if (this.t >= FOE.notice) this.enter('raise');
          break;
        case 'raise':
          this.bobPhase += dt * 2.4;
          if (this.t >= FOE.raise) this.enter('guard');
          break;
        case 'guard': {
          this.bobPhase += dt * 2.4;
          if (heroAlive && dist > FOE.advanceStop) {
            let sp: number;
            if (this.sprintT > 0) {
              sp = FOE.sprint[tier];
              this.sprintT -= dt;
            } else {
              sp = dist > FOE.runDist ? FOE.run[tier] : FOE.walk[tier];
              this.sprintCool -= dt;
              if (this.sprintCool <= 0 && dist < FOE.sprintMax && dist > FOE.sprintMin) {
                this.sprintT = FOE.sprintLen;
                this.sprintCool = FOE.sprintCool[tier];
                this.capeSp.kick(-3);
                this.onEvent?.('sprint');
              }
            }
            this.x += this.dir * sp * dt;
          }
          if (heroAlive && dist < FOE.strikeDist && this.cool <= 0) this.attack();
          if (dist > FOE.huntLeash) {
            this.hunting = false;
            this.enter('idle');
          }
          break;
        }
        case 'windup':
          if (this.t >= this.windDur) {
            this.chargeFrom = this.x;
            this.chargeDist = clamp(this.lastDist - FOE.chargeStop, 0, FOE.chargeMax[tier]);
            this.enter('strike');
          }
          break;
        case 'strike': {
          const u = clamp(this.t / this.strikeDur, 0, 1);
          const e = 1 - Math.pow(1 - u, 3);
          this.x = this.chargeFrom + this.dir * this.chargeDist * e;
          if (this.t >= this.strikeDur) this.enter('recover');
          break;
        }
        case 'recover':
          if (this.t >= this.recDur) {
            this.cool = FOE.cooldown[tier];
            this.enter('raise');
          }
          break;
        case 'dying':
          this.fall = Math.min(1.5, this.fall + dt * 1.6);
          if (this.t > 1.7) this.enter('dead');
          break;
        case 'dead':
          if (this.t > 2.6) this.alpha = Math.max(0, this.alpha - dt * 1.4); // lies there while he says his last words
          break;
      }
    }

    // locomotion bookkeeping for the walk / run cycle and the cape
    const vx = dt > 0 ? (this.x - prevX) / dt : 0;
    this.speed = approach(this.speed, vx, 12, dt);
    const sp = Math.abs(this.speed);
    this.walkAmt = approach(this.walkAmt, clamp(sp / 60, 0, 1), 10, dt);
    this.runAmt = approach(this.runAmt, clamp((sp - 160) / 300, 0, 1), 8, dt);
    const step = lerp(74, 132, this.runAmt) + 34 * clamp((sp - 450) / 400, 0, 1);
    this.walkPhase += plantedRate(Math.min(sp, 1100), step) * dt;
    this.buildPose(dt, step);
  }

  /** target facial expression for the current state (+ pain / taunt overlays) */
  private exprTarget(): Expression {
    if (this.exprForce) return this.exprForce;
    const st = this.state;
    const t = this.time;
    let e: Expression = { lift: 0, tilt: 0.08, eye: 1, mouth: 0, smile: -0.1, asym: 0 };
    if (st === 'notice') {
      const k = this.t / FOE.notice;
      e = k < 0.55 ? { lift: 1, tilt: -0.15, eye: 1.4, mouth: 0.45, smile: 0, asym: 0 } : { lift: -0.3, tilt: 0.5, eye: 0.9, mouth: 0.1, smile: -0.5, asym: 0 };
    } else if (st === 'raise' || st === 'guard') {
      e = { lift: -0.25, tilt: 0.42, eye: 0.9, mouth: 0.05, smile: -0.5, asym: 0 };
      if (this.runAmt > 0.3) e = { lift: -0.4, tilt: 0.55, eye: 0.82, mouth: 0.22 + 0.06 * Math.sin(t * 14), smile: -0.7, asym: 0 };
    } else if (st === 'windup') {
      e = { lift: -0.5, tilt: 0.6, eye: 0.75, mouth: 1, smile: -0.2, asym: 0 };
    } else if (st === 'strike') {
      e = { lift: -0.6, tilt: 0.72, eye: 0.6, mouth: 0.55, smile: -0.8, asym: 0 };
    } else if (st === 'recover') {
      e = { lift: 0.15, tilt: 0.1, eye: 0.85, mouth: 0.3 + 0.2 * Math.sin(t * 9), smile: -0.2, asym: 0 };
    } else if (st === 'dying' || st === 'dead') {
      e = { lift: 0.3, tilt: -0.6, eye: 0.25, mouth: 0.5, smile: -1, asym: 0 };
    } else if (st === 'idle') {
      // calm: occasional brow flick and a bored lip twitch
      e.lift = 0.12 * Math.max(0, Math.sin(t * 0.9)) ** 8;
      e.smile = -0.1 + 0.15 * Math.sin(t * 0.4);
    }
    if (this.hurtT > 0 && this.alive) {
      const w = Math.pow(clamp(this.hurtT / 0.55, 0, 1), 0.6);
      const pain: Expression = { lift: 0.5, tilt: -0.6, eye: 0.3, mouth: 0.7, smile: -1, asym: 0 };
      for (const k of EXPR_KEYS) e[k] = lerp(e[k], pain[k], w);
    } else if (this.blockT > 0 && st === 'guard') {
      const w = smooth(this.blockT / 0.3);
      const taunt: Expression = { lift: 0, tilt: 0.2, eye: 0.95, mouth: 0, smile: 0.9, asym: 1 };
      for (const k of EXPR_KEYS) e[k] = lerp(e[k], taunt[k], w);
    }
    return e;
  }

  private buildPose(dt: number, step: number) {
    const st = this.state;
    const P = defaultPose();
    const tier = this.tier;
    const upTarget = this.sprintT > 0 ? 0 : st === 'guard' || st === 'raise' ? 1 : st === 'idle' || st === 'notice' ? 0.25 : 0;
    this.shieldAmt = approach(this.shieldAmt, upTarget, st === 'raise' ? 9 : 12, dt);
    const open = this.open && st !== 'idle';
    const hurt = this.hurtT > 0 ? this.hurtT / 0.55 : 0;
    const guard = this.shieldAmt;
    const t = this.time;

    // ---- micro animation drivers
    this.shiftT -= dt;
    if (this.shiftT <= 0) {
      this.shiftSide = Math.random() < 0.5 ? -1 : 1;
      this.shiftT = 3.5 + Math.random() * 4;
    }
    this.shiftAmt = approach(this.shiftAmt, this.shiftT > 2.4 ? 0 : this.shiftSide, 2.5, dt);
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.eyeGoal = { x: (Math.random() - 0.5) * 7, y: (Math.random() - 0.5) * 4 };
      this.lookT = 1.4 + Math.random() * 2.2;
    }
    const focus = st !== 'idle';
    this.eye.x = approach(this.eye.x, focus ? -6 : this.eyeGoal.x - 2, 8, dt);
    this.eye.y = approach(this.eye.y, focus ? 0 : this.eyeGoal.y, 8, dt);
    this.tapT -= dt;
    const tap = this.tapT < 0 && this.tapT > -0.6 ? Math.max(0, Math.sin(-this.tapT * 22)) : 0;
    if (this.tapT < -0.6) this.tapT = 4 + Math.random() * 5;
    const capeFollow = this.capeSp.step(dt, clamp(this.speed * 0.0016, -0.9, 0.9) + (0.04 + 0.1 * this.runAmt) * Math.sin(t * 7.5), 0);
    const shoulder = this.bodySp.step(dt, 0, 0);
    const headKick = this.headSp.step(dt, 0, 0);
    const et = this.exprTarget();
    for (const k of EXPR_KEYS) this.expr[k] = approach(this.expr[k], et[k], 13, dt);

    // ---- leap / lunge profile
    const u = st === 'strike' ? clamp(this.t / this.strikeDur, 0, 1) : 0;
    const leaping = st === 'strike' && this.leapAttack;
    const jumpH = leaping && u > 0.1 && u < 0.9 ? 170 * Math.pow(Math.sin(Math.PI * ((u - 0.1) / 0.8)), 0.85) : 0;
    this.air = approach(this.air, jumpH, 30, dt);
    const crouchLeap = leaping ? (u < 0.12 ? smooth(u / 0.12) * 22 : u > 0.88 ? smooth((u - 0.88) / 0.12) * 26 : 0) : 0;

    // ---- body
    const heavy = open ? 2.4 : 1;
    P.breath = Math.sin(t * 1.9) * 2.4 * heavy;
    P.y = -this.air;
    const walkBob = Math.abs(Math.sin(this.walkPhase * Math.PI * 2)) * lerp(6, 11, this.runAmt) * this.walkAmt;
    // hip height needed so a stride of `step` is reachable without stretching the leg (longer strides crouch more)
    const hipAbove = -(PELVIS + 2) + RG.standAnkleY; // vertical hip→ankle gap at the rest height
    const strideCrouch = Math.max(0, hipAbove - Math.sqrt(Math.max(0, (0.93 * (THIGH + SHIN)) ** 2 - (step / 2 + 8) ** 2))) * this.walkAmt;
    P.pelvisY =
      PELVIS +
      strideCrouch +
      5 * guard +
      3 * hurt +
      30 * this.lunge * (leaping ? 0.4 : 1) +
      crouchLeap -
      walkBob +
      (st === 'windup' ? 8 * smooth(this.t / this.windDur) : 0);
    P.hipX = 3 * Math.sin(t * 0.5) + 6 * this.shiftAmt;
    P.hipRot = 1.6 * DEG * Math.sin(t * 0.5) + 2.5 * DEG * this.shiftAmt + (2 + 3 * this.runAmt) * DEG * Math.sin(this.walkPhase * Math.PI * 2) * this.walkAmt;
    P.torsoRot = -P.hipRot * 0.55;
    P.shoulderSway = shoulder * 0.1;

    // ---- sword hand / tip per state (rig space; forward = -x, tip angle 0 = up, -90° = forward)
    let tx = 62;
    let ty = -238 + Math.sin(t * 1.7) * 3 + 6 * this.runAmt * Math.sin(this.walkPhase * Math.PI * 2);
    let tr = 7 * DEG + Math.sin(t * 1.3) * 0.03;
    let rate = 12;
    let tiltT = (-2 + 9 * this.runAmt) * DEG;
    let lungeT = 0;
    let ext = 0;
    if (st === 'idle' || st === 'notice') {
      tx = 30;
      ty = -170 + Math.sin(t * 1.4) * 3;
      tr = -150 * DEG;
      rate = 6;
      if (st === 'notice') {
        tx = 50;
        ty = -215;
        tr = -40 * DEG;
        rate = 14;
        tiltT = -6 * DEG;
      }
    } else if (st === 'windup') {
      const w = smooth(this.t / this.windDur);
      tx = lerp(62, 84, w);
      ty = lerp(-238, -378, w);
      tr = lerp(7, 10, w) * DEG;
      tiltT = lerp(-2, -11, w) * DEG;
      rate = 14;
    } else if (st === 'strike') {
      const e = 1 - Math.pow(1 - clamp(u / 0.4, 0, 1), 3);
      tx = lerp(84, -26, e);
      ty = lerp(-378, -250, e);
      tr = lerp(10, -92, e) * DEG;
      tiltT = lerp(-11, 15, e) * DEG;
      rate = 46;
      lungeT = Math.pow(Math.sin(Math.PI * clamp(u * 1.05, 0, 1)), 0.6);
      ext = smooth(u / 0.4);
    } else if (st === 'recover') {
      const w = smooth(this.t / 0.7);
      tx = lerp(-26, 50, w);
      ty = lerp(-250, -165, w);
      tr = lerp(-92, -150, w) * DEG;
      tiltT = lerp(10, 4, w) * DEG;
      rate = 9;
      ext = 1 - smooth(this.t / 0.55);
    } else if (st === 'dying' || st === 'dead') {
      tx = 60;
      ty = -150;
      tr = -170 * DEG;
      tiltT = -8 * DEG;
    }
    this.lunge = approach(this.lunge, lungeT, 14, dt);
    this.sw.x = approach(this.sw.x, tx, rate, dt);
    this.sw.y = approach(this.sw.y, ty, rate, dt);
    this.sw.rot = approach(this.sw.rot, tr, rate, dt);
    this.tilt = approach(this.tilt, tiltT, 12, dt);
    P.tilt = this.tilt - 0.22 * hurt + 0.5 * DEG * Math.sin(t * 0.9);
    P.backArm = { kind: 'ik', target: { x: this.sw.x, y: this.sw.y }, bend: -1 };

    // ---- shield (FOREGROUND, in front of the chest): bobs up/down, slides to cover a predicted arrow
    const bob = Math.sin(this.bobPhase) * 40;
    const wantCover = guard > 0.6 && this.predY !== null && this.predT < FOE.trackStart;
    this.tracking = wantCover;
    if (wantCover) {
      const goal = clamp(this.predY as number, -340, -95);
      const vmax = FOE.trackSpeed[tier];
      this.shieldY += clamp(goal - this.shieldY, -vmax * dt, vmax * dt);
    } else this.shieldY = approach(this.shieldY, -195 + bob, 7, dt);
    const kick = this.shieldKick * 14;
    const fx = lerp(-98, -117, guard) + kick + Math.sin(t * 1.1) * 2;
    const fy = lerp(-176, this.shieldY, guard) + Math.sin(t * 1.6) * 1.5;
    P.frontArm = { kind: 'ik', target: { x: fx, y: fy }, bend: -1 };

    // ---- head
    const turnGoal = st === 'idle' ? -0.35 + 0.12 * Math.sin(t * 0.5) : st === 'notice' ? -0.65 : st === 'windup' || st === 'strike' ? -0.9 : st === 'recover' ? -0.5 : st === 'dying' || st === 'dead' ? -0.2 : -0.75 - 0.15 * this.runAmt;
    this.turn = approach(this.turn, hurt > 0.3 ? -0.3 : turnGoal, 9, dt);
    P.head.turn = this.turn;
    P.head.x = -8 * this.runAmt - 6 * (st === 'strike' ? 1 : 0);
    P.head.rot = -0.14 * hurt + 0.025 * Math.sin(t * 0.8) + 0.02 * Math.sin(this.walkPhase * Math.PI * 4) * this.walkAmt + headKick * 0.004;
    P.head.y = -walkBob * 0.4;
    P.face.blink = this.blinkT > 0 ? 1 : 0;

    P.frontLeg = { ankle: { x: -40, y: RG.standAnkleY }, foot: 0 };
    P.backLeg = { ankle: { x: 40, y: RG.standAnkleY }, foot: 0 };
    this.pose = P;
    this.skel = solveSkeleton(P);

    // ---- legs: planted stance + walk/run gait (heel-strike → heel-off → toe bend) + lunge + leap tuck, then robust IK
    const wa = this.walkAmt * (1 - this.lunge * 0.7);
    const lift = lerp(22, 40, this.runAmt);
    const gF = gaitFoot(this.walkPhase, step, lift);
    const gB = gaitFoot(this.walkPhase + 0.5, step, lift);
    const airK = clamp(this.air / 60, 0, 1);
    // the stance narrows while moving so a long stride stays within the leg's reach
    const baseF = lerp(-40 - 16 * guard, -30, this.walkAmt);
    const baseB = lerp(40, 30, this.walkAmt);
    const stanceF = lerp(baseF, -112, this.lunge) + 6 * this.shiftAmt;
    const stanceB = lerp(baseB, 66, this.lunge) - 6 * this.shiftAmt;
    const tgtF = {
      x: stanceF + gF.x * wa - 24 * airK,
      y: RG.standAnkleY + gF.y * wa - 16 * this.lunge * (leaping ? 0 : 1) - 62 * airK,
    };
    const tgtB = { x: stanceB + gB.x * wa + 18 * airK, y: RG.standAnkleY + gB.y * wa - 38 * airK };
    const hipF = this.skel.hipF;
    const hipB = this.skel.hipB;
    const LF = solveLeg(hipF, tgtF, THIGH, SHIN, { maxStretch: 1.12 });
    const LB = solveLeg(hipB, tgtB, THIGH, SHIN, { maxStretch: 1.12 });
    const legs: { f: LegDraw; b: LegDraw } = {
      f: { knee: LF.knee, ankle: LF.ankle, rot: gF.rot * wa + this.lunge * 0.25 + airK * 0.5, toe: gF.toe * wa + airK * 0.6 },
      b: { knee: LB.knee, ankle: LB.ankle, rot: gB.rot * wa - tap * 0.35 + airK * 0.4, toe: gB.toe * wa + this.lunge * 0.5 + airK * 0.5 },
    };

    // ---- stretched thrust arm (the lunge pose of the artwork)
    const sh = this.skel.shoulderB;
    const swordHand: Vec | null = ext > 0.02 ? { x: sh.x - (124 + 170 * ext), y: sh.y + 8 - 18 * (1 - ext) } : null;

    this.look = {
      shieldMode: guard > 0.55 && this.sprintT <= 0 && (st === 'guard' || st === 'raise') ? 'front' : 'back',
      capeSwing: clamp(capeFollow, -0.95, 0.95),
      tunicSway: clamp(capeFollow * 0.35, -0.25, 0.25) + 0.015 * Math.sin(t * 1.3),
      eyeX: this.eye.x,
      eyeY: this.eye.y,
      legs,
      swordHand,
      shieldRot: Math.cos(this.bobPhase) * 0.05 * guard - this.shieldKick * 0.12,
      shieldScale: 1.15,
      swordRot: this.sw.rot,
      expr: { ...this.expr },
      shieldExtras: (ctx) => {
        for (const a of this.stuck) {
          ctx.save();
          ctx.translate(a.ox, a.oy);
          ctx.rotate(a.rot);
          ctx.translate(-34, 0);
          ctx.scale(0.9, 0.9);
          drawArrowArt(ctx);
          ctx.restore();
        }
      },
    };
  }

  /** Draw in WORLD space; groundY = ground line. Faces +x. */
  drawWorld(ctx: CanvasRenderingContext2D, groundY: number) {
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.translate(this.worldX, groundY);
    if (this.fall) ctx.rotate(-this.fall * this.dir);
    ctx.globalAlpha = this.alpha;
    ctx.scale(-this.dir, 1);
    drawSpartan(ctx, this.pose, this.skel, this.look);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- live preview for Settings → Layers
const previews = new Map<string, SpartanFoe>();
registerPreview(SPARTAN, (ctx, scenario, dt) => {
  let f = previews.get(scenario);
  if (!f) {
    f = new SpartanFoe(0);
    f.stuck = [
      { ox: 30, oy: -34, rot: 3.3 },
      { ox: -20, oy: 28, rot: 2.9 },
    ];
    if (scenario === 'run') {
      f.hunting = true;
      f.state = 'guard';
    } else if (scenario === 'pain') {
      f.hold = 'guard';
      f.forcePain = true;
    } else f.hold = scenario === 'windup' ? 'windup' : scenario === 'strike' ? 'strike' : scenario === 'open' ? 'recover' : scenario === 'notice' ? 'notice' : 'guard';
    previews.set(scenario, f);
  }
  if (scenario === 'strike') f.hp = 2; // show the leap
  f.update(Math.min(dt, 0.05), scenario === 'run' ? f.x + 2500 : 99999, scenario === 'run');
  drawSpartan(ctx, f.pose, f.skel, f.look);
});
