// 4-Layer Rig Animator & State Machine (GDD sections 14–23).
// Shared identically by the main Game and the Animation Lab test window.
import { ANIM_CFG, CFG } from './config';
import { DEG } from './art';
import {
  RIG_NEW,
  bowWeaponGeom,
  createDefaultPose,
  type CarryPose,
  type HatId,
  type RigPose,
  type WeaponId,
} from './rig';

export type BaseState = 'stand' | 'walk' | 'run' | 'sit' | 'hide' | 'jump';
export type ReactionKind = 'hit' | 'miss' | 'shrug' | 'win';
export type ShootPhase = 'none' | 'stance' | 'nock' | 'aim' | 'draw' | 'hold' | 'release' | 'follow' | 'recover' | 'reload';
export type BowCarryStyle = 'slung' | 'low';
export type FidgetKind = 'none' | 'beard' | 'hands' | 'shoulder' | 'sky' | 'quiver' | 'bowstring' | 'hatTip';

export type AnimEvent =
  | { type: 'footstep'; x: number; run: boolean; alt: boolean }
  | { type: 'snowPuff'; x: number; y: number; count: number; spread: number }
  | { type: 'footprint'; x: number }
  | { type: 'breathCloud'; x: number; y: number }
  | { type: 'confetti'; x: number; y: number; count: number }
  | { type: 'fireProjectile'; weapon: WeaponId; angleDeg: number; power01: number };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
const lerpRate = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export interface AnimatorInput {
  moveDir: number; // -1 left, 0 none, +1 right
  runHeld: boolean;
  aimAngleDeg: number; // 5..80
  power01: number; // 0..1
  drawing: boolean;
  hasQuiver: boolean;
  sitOnStump?: boolean;
  inCoverRock?: boolean;
  peeking?: boolean;
  noticeDir?: number; // -1..1 direction toward nearby pickup
  trackFlyingY?: number | null; // relative Y of flying arrow for eye tracking
  walkSpeedOverride?: number;
  walkStrideOverride?: number;
  bowCarryStyle?: BowCarryStyle;
}

export class RigAnimator {
  // Primary state
  baseState: BaseState = 'stand';
  facing: -1 | 1 = -1; // -1 = left, +1 = right
  desiredFacing: -1 | 1 = -1;
  turnT = 0; // >0 while turning (0..0.18s)
  turnDir: -1 | 1 = -1;
  pendingTurn: -1 | 1 | null = null;
  skidStopT = 0;
  walkStopT = 0;
  walkStartT = 0;
  runStartT = 0;

  // Walk / run kinematics (distance-driven!)
  walkDist = 0; // total distance walked in units
  stepCount = 0;
  lastStepIndex = 0;
  stepsPerSec = 0;
  private stepTimerAcc = 0;
  private stepEventsRecent: number[] = [];

  // Sit & Hide
  sitBlend = 0; // 0..1
  sitT = 0;
  sitFidgetKind: 'none' | 'sneeze' | 'warm' | 'nap' = 'none';
  sitFidgetT = 0;
  sitWakeT = 0;
  sitIdleSinceFidget = 0;
  standingUpT = 0;
  pendingMoveAfterStand: number | null = null;

  hideBlend = 0; // 0..1
  hidePeekT = 0;
  hideAutoPeekTimer = 3.2;

  // Jump
  jumpPhase: 'none' | 'anticipation' | 'air' | 'landing' | 'recover' = 'none';
  jumpT = 0;
  jumpMaxH = ANIM_CFG.jumpHoldHeight;
  jumpY = 0;
  jumpVy = 0;
  jumpRunning = false;
  jumpHolding = false;
  jumpAirTotal = ANIM_CFG.jumpAirTime;
  jumpReturnState: BaseState = 'stand';

  // Stand idle & fidgets
  time = 0;
  standIdleT = 0;
  fidgetKind: FidgetKind = 'none';
  fidgetT = 0;
  fidgetDur = 0;
  nextFidgetWait = 7;
  weightShiftPhase = 0;
  blinkT = 0;
  nextBlinkT = 2.6;

  // Equipment & Hats
  weapon: WeaponId = 'none';
  pendingWeapon: WeaponId | null = null;
  swapT = 0; // 0..0.35s
  hat: HatId = 'none';
  hatWearing = false;
  hatAnim: 'none' | 'putOn' | 'takeOff' = 'none';
  hatAnimT = 0;
  pendingHatAction: 'putOn' | 'takeOff' | null = null;
  baldShineT = 0;

  // Pickup & Equip sequences
  pickupAnim: { kind: 'bow' | 'quiver' | 'hat'; t: number; dir: number; isRemove: boolean } | null = null;
  armedMomentT = 0;
  unarmedFailAnim: { kind: 'bowOnly' | 'quiverOnly' | 'empty'; t: number } | null = null;

  // Shooting / Attack sequence (Layer 2)
  shootPhase: ShootPhase = 'none';
  shootT = 0;
  arrowNocked = false;
  holdDuration = 0;
  cancelT = 0;
  popupShotReturnHide = false;
  lastReleasePower = 0;
  lastReleaseAngle = 40;
  aimAngleSmoothed = 40;
  stringVibT = 0;
  bowKickT = 0;

  // Reactions (Layer 4)
  reaction: ReactionKind | null = null;
  reactionT = 0;
  winLoop = false;

  // Buffered input (0.2 s memory per GDD 21)
  bufferedAction: { kind: 'jump' | 'hatToggle'; ttl: number; hold?: boolean } | null = null;

  // Layer 3 secondary springs
  private prevBodyX = 0;
  private bodyVelX = 0;
  private beardLagX = 0;
  private beardLagVel = 0;
  private hatLagX = 0;
  private hatLagVel = 0;
  private hatWobble = 0;
  private hatWobbleVel = 0;
  private quiverBounce = 0;
  private quiverBounceVel = 0;
  private arrowRattle = 0;
  private breathPuffEmitCooldown = 0;

  // Telemetry & Foot-lock tracking
  lastLeftFootWorldX: number | null = null;
  lastRightFootWorldX: number | null = null;
  lastLeadSlip = 0;
  lastRearSlip = 0;
  activeCarryPose: CarryPose = 'stand';
  subPoseLabel = 'Idle';
  events: AnimEvent[] = [];

  reset() {
    this.baseState = 'stand';
    this.facing = -1;
    this.desiredFacing = -1;
    this.turnT = 0;
    this.pendingTurn = null;
    this.skidStopT = 0;
    this.walkStopT = 0;
    this.walkStartT = 0;
    this.runStartT = 0;
    this.walkDist = 0;
    this.stepCount = 0;
    this.lastStepIndex = 0;
    this.stepsPerSec = 0;
    this.stepEventsRecent = [];
    this.sitBlend = 0;
    this.sitT = 0;
    this.sitFidgetKind = 'none';
    this.sitIdleSinceFidget = 0;
    this.standingUpT = 0;
    this.hideBlend = 0;
    this.hidePeekT = 0;
    this.jumpPhase = 'none';
    this.jumpY = 0;
    this.standIdleT = 0;
    this.fidgetKind = 'none';
    this.swapT = 0;
    this.pendingWeapon = null;
    this.hatAnim = 'none';
    this.pickupAnim = null;
    this.armedMomentT = 0;
    this.unarmedFailAnim = null;
    this.shootPhase = 'none';
    this.shootT = 0;
    this.arrowNocked = false;
    this.holdDuration = 0;
    this.cancelT = 0;
    this.popupShotReturnHide = false;
    this.stringVibT = 0;
    this.bowKickT = 0;
    this.reaction = null;
    this.reactionT = 0;
    this.winLoop = false;
    this.bufferedAction = null;
    this.beardLagX = 0;
    this.beardLagVel = 0;
    this.hatLagX = 0;
    this.hatLagVel = 0;
    this.hatWobble = 0;
    this.hatWobbleVel = 0;
    this.quiverBounce = 0;
    this.quiverBounceVel = 0;
    this.events = [];
  }

  // ------------------------------------------------------------------ Triggers
  requestTurn(dir: -1 | 1) {
    if (dir === this.desiredFacing) return;
    this.desiredFacing = dir;
    if (this.baseState === 'walk') {
      // Wait for next Contact pose so legs never cross
      this.pendingTurn = dir;
    } else if (this.baseState === 'run') {
      // Skid turn (0.3s)
      this.turnDir = dir;
      this.turnT = 0.3;
      this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 6, spread: 70 });
    } else {
      this.turnDir = dir;
      this.turnT = ANIM_CFG.turnTime;
    }
  }

  triggerJump(fullHold: boolean) {
    if (this.shootPhase === 'draw' || this.shootPhase === 'hold') return; // blocked during draw
    if (this.jumpPhase !== 'none') {
      this.bufferedAction = { kind: 'jump', ttl: ANIM_CFG.inputMemory, hold: fullHold };
      return;
    }
    this.cancelFidget();
    if (this.baseState === 'sit' && this.sitBlend > 0.1) {
      this.standingUpT = 0.35;
      this.baseState = 'stand';
      this.bufferedAction = { kind: 'jump', ttl: 0.45, hold: fullHold };
      return;
    }
    this.hideBlend = 0;
    this.jumpReturnState = this.baseState === 'run' || this.baseState === 'walk' ? this.baseState : 'stand';
    this.jumpRunning = this.baseState === 'run';
    this.jumpHolding = fullHold;
    this.jumpMaxH = fullHold ? ANIM_CFG.jumpHoldHeight : ANIM_CFG.jumpTapHeight;
    this.jumpAirTotal = fullHold ? ANIM_CFG.jumpAirTime : 0.36;
    this.jumpPhase = 'anticipation';
    this.jumpT = 0;
    this.baseState = 'jump';
  }

  extendJumpHold(holding: boolean) {
    if (this.jumpPhase === 'anticipation' || (this.jumpPhase === 'air' && this.jumpT < 0.15)) {
      if (holding && !this.jumpHolding) {
        this.jumpHolding = true;
        this.jumpMaxH = ANIM_CFG.jumpHoldHeight;
        this.jumpAirTotal = ANIM_CFG.jumpAirTime;
        if (this.jumpPhase === 'air') {
          this.jumpVy = Math.max(this.jumpVy, (4 * this.jumpMaxH) / this.jumpAirTotal);
        }
      }
    }
  }

  toggleSit() {
    this.cancelFidget();
    if (this.jumpPhase !== 'none' || this.shootPhase === 'draw' || this.shootPhase === 'hold') return;
    if (this.baseState === 'sit') {
      this.standingUpT = 0.35;
      this.baseState = 'stand';
      this.sitFidgetKind = 'none';
    } else {
      this.hideBlend = 0;
      this.baseState = 'sit';
      this.sitT = 0;
      this.sitIdleSinceFidget = 0;
      this.sitFidgetKind = 'none';
      this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 4, spread: 40 });
    }
  }

  toggleHide() {
    this.cancelFidget();
    if (this.jumpPhase !== 'none' || this.shootPhase === 'draw' || this.shootPhase === 'hold') return;
    if (this.baseState === 'hide') {
      this.baseState = 'stand';
      this.hidePeekT = 0;
    } else {
      this.sitBlend = 0;
      this.baseState = 'hide';
      this.hideAutoPeekTimer = 3.2;
    }
  }

  triggerPeek() {
    if (this.baseState === 'hide' && this.hidePeekT <= 0) {
      this.hidePeekT = 0.75;
    }
  }

  triggerHat(on: boolean, instant = false) {
    if (this.hat === 'none' && on) this.hat = 'wool';
    if (on === this.hatWearing && this.hatAnim === 'none') return;
    if (instant) {
      this.hatWearing = on;
      this.hatAnim = 'none';
      if (!on) this.baldShineT = 0.45;
      return;
    }
    if (this.jumpPhase !== 'none' || this.shootPhase === 'draw' || this.shootPhase === 'hold') {
      this.pendingHatAction = on ? 'putOn' : 'takeOff';
      return;
    }
    this.cancelFidget();
    this.hatAnim = on ? 'putOn' : 'takeOff';
    this.hatAnimT = 0;
    if (on) this.hatWearing = true;
  }

  setHatStyle(style: HatId, instant = false) {
    if (style === 'none') {
      this.triggerHat(false, instant);
      return;
    }
    this.hat = style;
    if (!this.hatWearing) {
      this.triggerHat(true, instant);
    } else if (!instant) {
      this.hatWobbleVel += 6;
    }
  }

  setWeapon(w: WeaponId, instant = false) {
    if (w === this.weapon && !this.pendingWeapon) return;
    this.cancelFidget();
    this.shootPhase = 'none';
    this.arrowNocked = false;
    if (instant || this.weapon === 'none') {
      this.weapon = w;
      this.pendingWeapon = null;
      this.swapT = 0;
    } else {
      this.pendingWeapon = w;
      this.swapT = 0.35;
    }
  }

  triggerPickup(kind: 'bow' | 'quiver' | 'hat', dir: number) {
    this.pickupAnim = { kind, t: 0, dir, isRemove: false };
    this.cancelFidget();
  }

  triggerRemove(kind: 'bow' | 'quiver' | 'hat') {
    this.pickupAnim = { kind, t: 0, dir: 0, isRemove: true };
    this.cancelFidget();
  }

  triggerArmedMoment() {
    this.armedMomentT = 0.55;
    this.hatWobbleVel -= 8;
  }

  triggerUnarmedFail(hasBow: boolean, hasQuiver: boolean) {
    this.cancelFidget();
    this.unarmedFailAnim = {
      kind: hasBow && !hasQuiver ? 'bowOnly' : !hasBow && hasQuiver ? 'quiverOnly' : 'empty',
      t: 0,
    };
  }

  triggerReaction(r: ReactionKind) {
    this.cancelFidget();
    this.reaction = r;
    this.reactionT = 0;
    this.winLoop = false;
    if (r === 'hit') {
      this.hatWobbleVel -= 7;
    } else if (r === 'miss') {
      this.events.push({ type: 'breathCloud', x: -35, y: -230 });
    } else if (r === 'win') {
      this.events.push({ type: 'confetti', x: 0, y: -380, count: 60 });
    }
  }

  beginShoot(fromHide = false) {
    this.cancelFidget();
    if (this.weapon === 'none') {
      this.triggerReaction('shrug');
      return;
    }
    this.popupShotReturnHide = fromHide || this.baseState === 'hide';
    if (this.baseState === 'sit') {
      this.standingUpT = 0.25;
      this.baseState = 'stand';
    }
    if (this.baseState === 'hide') {
      this.hidePeekT = 1.2;
    }
    this.shootPhase = 'stance';
    this.shootT = 0;
    this.holdDuration = 0;
  }

  releaseShoot(angleDeg: number, power01: number) {
    if (this.shootPhase === 'none' || this.shootPhase === 'release' || this.shootPhase === 'follow' || this.shootPhase === 'recover') {
      return;
    }
    this.lastReleaseAngle = angleDeg;
    this.lastReleasePower = power01;
    this.shootPhase = 'release';
    this.shootT = 0;
    this.arrowNocked = false;
    this.stringVibT = 0.28;
    this.bowKickT = 0.16;
    this.beardLagVel += 28;
    this.hatLagVel += 22;
    this.hatWobbleVel += 9;
    this.events.push({ type: 'fireProjectile', weapon: this.weapon, angleDeg, power01 });
  }

  cancelShoot() {
    if (this.shootPhase === 'draw' || this.shootPhase === 'hold') {
      this.cancelT = 0.15;
      this.shootPhase = 'aim';
      this.shootT = 0;
      this.holdDuration = 0;
    } else if (this.shootPhase === 'stance' || this.shootPhase === 'nock' || this.shootPhase === 'aim') {
      this.shootPhase = 'none';
      this.shootT = 0;
    }
  }

  cancelFidget() {
    this.standIdleT = 0;
    if (this.fidgetKind !== 'none') {
      this.fidgetKind = 'none';
      this.fidgetT = 0;
    }
    if (this.sitFidgetKind === 'nap') {
      this.sitFidgetKind = 'none';
      this.sitWakeT = 0.28;
    }
    this.sitIdleSinceFidget = 0;
  }

  // ------------------------------------------------------------------ Update
  update(dt: number, input: AnimatorInput, dxMoved = 0) {
    this.events = [];
    this.time += dt;
    if (this.breathPuffEmitCooldown > 0) this.breathPuffEmitCooldown -= dt;
    this.aimAngleSmoothed = lerpRate(this.aimAngleSmoothed, input.aimAngleDeg, 18, dt);

    // Clear expired buffered actions
    if (this.bufferedAction) {
      this.bufferedAction.ttl -= dt;
      if (this.bufferedAction.ttl <= 0) this.bufferedAction = null;
    }

    // Input cancels fidgets immediately
    if (Math.abs(input.moveDir) > 0.01 || input.drawing) {
      this.cancelFidget();
    }

    // Turn progress
    if (this.turnT > 0) {
      const prevMid = this.turnT > ANIM_CFG.turnTime * 0.5;
      this.turnT -= dt;
      const nowMid = this.turnT <= ANIM_CFG.turnTime * 0.5;
      if (prevMid && nowMid) {
        this.facing = this.turnDir;
      }
      if (this.turnT <= 0) {
        this.turnT = 0;
        this.facing = this.turnDir;
      }
    }

    // Weapon swap
    if (this.swapT > 0) {
      const before = this.swapT > 0.175;
      this.swapT -= dt;
      if (before && this.swapT <= 0.175 && this.pendingWeapon !== null) {
        this.weapon = this.pendingWeapon;
        this.pendingWeapon = null;
      }
      if (this.swapT <= 0) this.swapT = 0;
    }

    // Hat animation
    if (this.hatAnim !== 'none') {
      this.hatAnimT += dt;
      const dur = this.hatAnim === 'putOn' ? 0.7 : 0.6;
      if (this.hatAnim === 'takeOff' && this.hatAnimT > 0.2 && this.baldShineT <= 0) {
        this.baldShineT = 0.4;
      }
      if (this.hatAnimT >= dur) {
        if (this.hatAnim === 'takeOff') this.hatWearing = false;
        this.hatAnim = 'none';
        this.hatAnimT = 0;
      }
    } else if (this.pendingHatAction && this.jumpPhase === 'none' && this.shootPhase !== 'draw' && this.shootPhase !== 'hold') {
      const act = this.pendingHatAction;
      this.pendingHatAction = null;
      this.triggerHat(act === 'putOn');
    }
    if (this.baldShineT > 0) this.baldShineT = Math.max(0, this.baldShineT - dt);

    // Pickup / remove animation
    if (this.pickupAnim) {
      this.pickupAnim.t += dt;
      if (this.pickupAnim.t > 0.78) this.pickupAnim = null;
    }
    if (this.armedMomentT > 0) this.armedMomentT = Math.max(0, this.armedMomentT - dt);
    if (this.unarmedFailAnim) {
      this.unarmedFailAnim.t += dt;
      if (this.unarmedFailAnim.t > 0.75) this.unarmedFailAnim = null;
    }

    // Reaction (Layer 4)
    if (this.reaction) {
      this.reactionT += dt;
      const dur = this.reaction === 'win' ? 2.5 : this.reaction === 'shrug' ? 0.5 : 0.6;
      if (this.reaction === 'win') {
        if (this.reactionT >= dur) this.winLoop = true;
      } else if (this.reactionT >= dur) {
        this.reaction = null;
        this.reactionT = 0;
      }
    }

    // Blink & Stand Fidgets (Layer 3)
    this.nextBlinkT -= dt;
    if (this.nextBlinkT <= 0) {
      this.blinkT = 0.12;
      this.nextBlinkT = Math.random() < 0.2 ? 0.26 : 3 + Math.random() * 3;
    }
    if (this.blinkT > 0) this.blinkT -= dt;
    this.weightShiftPhase += dt * 0.65;

    // Lower body movement & gait (Layer 1)
    const moving = Math.abs(input.moveDir) > 0.01 && this.shootPhase !== 'draw' && this.shootPhase !== 'hold' && !this.reaction;
    if (moving && this.baseState === 'sit') {
      if (this.standingUpT <= 0) {
        this.standingUpT = 0.35;
        this.pendingMoveAfterStand = input.moveDir;
        this.baseState = 'stand';
      }
    }
    if (this.standingUpT > 0) {
      this.standingUpT -= dt;
      if (this.standingUpT <= 0) {
        this.standingUpT = 0;
        this.pendingMoveAfterStand = null;
      }
    }

    const canWalk = this.jumpPhase === 'none' && this.standingUpT <= 0 && !this.reaction;
    const stride = input.walkStrideOverride ?? ANIM_CFG.walkStride;
    const runStride = ANIM_CFG.runStride;

    if (canWalk && moving) {
      this.hideBlend = lerpRate(this.hideBlend, 0, 14, dt);
      const wantState: BaseState = input.runHeld ? 'run' : 'walk';
      if (this.baseState !== wantState) {
        if (wantState === 'walk' && this.baseState === 'stand') this.walkStartT = 0.12;
        if (wantState === 'run' && this.baseState !== 'run') {
          this.runStartT = 0.1;
          this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 5, spread: 50 });
        }
        this.baseState = wantState;
      }
      const dir = input.moveDir < 0 ? -1 : 1;
      if (dir !== this.desiredFacing) this.requestTurn(dir);

      const stepLen = wantState === 'run' ? runStride : stride;
      const distStep = Math.abs(dxMoved);
      this.walkDist += distStep;

      const idx = Math.floor(this.walkDist / stepLen);
      if (idx !== this.lastStepIndex) {
        this.lastStepIndex = idx;
        this.stepCount++;
        this.stepEventsRecent.push(this.time);
        // Execute pending walk turn right on Contact pose
        if (this.pendingTurn !== null) {
          this.turnDir = this.pendingTurn;
          this.turnT = ANIM_CFG.turnTime;
          this.pendingTurn = null;
        }
        this.events.push({ type: 'footstep', x: 0, run: wantState === 'run', alt: this.stepCount % 2 === 0 });
        if (wantState === 'run') {
          this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 4, spread: 35 });
          this.quiverBounceVel -= 18;
          this.hatWobbleVel += (this.stepCount % 2 === 0 ? 1 : -1) * 3.5;
        } else {
          this.events.push({ type: 'footprint', x: 0 });
          this.quiverBounceVel -= 6;
          this.hatWobbleVel += (this.stepCount % 2 === 0 ? 1 : -1) * 1.6;
        }
      }
    } else if (this.jumpPhase === 'none') {
      if (this.baseState === 'run') {
        this.skidStopT = 0.25;
        this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 7, spread: 70 });
        if (this.breathPuffEmitCooldown <= 0) {
          this.events.push({ type: 'breathCloud', x: -35, y: -230 });
          this.breathPuffEmitCooldown = 2.5;
        }
        this.baseState = 'stand';
      } else if (this.baseState === 'walk') {
        this.walkStopT = 0.15;
        this.baseState = 'stand';
      }
    }

    // Track steps/s over 0.7s sliding window
    this.stepTimerAcc += dt;
    while (this.stepEventsRecent.length && this.time - this.stepEventsRecent[0] > 0.9) {
      this.stepEventsRecent.shift();
    }
    this.stepsPerSec =
      this.baseState === 'walk' || this.baseState === 'run'
        ? (input.walkSpeedOverride ?? (this.baseState === 'run' ? ANIM_CFG.runSpeed : CFG.archer.walkSpeed)) /
          (this.baseState === 'run' ? runStride : stride)
        : 0;

    if (this.walkStartT > 0) this.walkStartT = Math.max(0, this.walkStartT - dt);
    if (this.runStartT > 0) this.runStartT = Math.max(0, this.runStartT - dt);
    if (this.walkStopT > 0) this.walkStopT = Math.max(0, this.walkStopT - dt);
    if (this.skidStopT > 0) this.skidStopT = Math.max(0, this.skidStopT - dt);

    // Stand idle fidget timer
    if (this.baseState === 'stand' && this.shootPhase === 'none' && !this.reaction && !this.pickupAnim && this.hatAnim === 'none' && this.standingUpT <= 0) {
      this.standIdleT += dt;
      if (this.fidgetKind === 'none') {
        if (this.standIdleT >= this.nextFidgetWait) {
          const opts: FidgetKind[] = ['beard', 'hands', 'shoulder', 'sky'];
          if (input.hasQuiver) opts.push('quiver');
          if (this.weapon === 'shortbow' || this.weapon === 'longbow') opts.push('bowstring');
          if (this.hatWearing && this.hat !== 'none') opts.push('hatTip');
          this.fidgetKind = opts[Math.floor(Math.random() * opts.length)];
          this.fidgetT = 0;
          this.fidgetDur = this.fidgetKind === 'hands' ? 1.5 : 1.1;
          if (this.fidgetKind === 'hands') {
            this.events.push({ type: 'breathCloud', x: -35, y: -230 });
          }
        }
      } else {
        this.fidgetT += dt;
        if (this.fidgetT >= this.fidgetDur) {
          this.fidgetKind = 'none';
          this.fidgetT = 0;
          this.standIdleT = 0;
          this.nextFidgetWait = ANIM_CFG.fidgetWaitMin + Math.random() * (ANIM_CFG.fidgetWaitMax - ANIM_CFG.fidgetWaitMin);
        }
      }
    } else {
      this.standIdleT = 0;
      this.fidgetKind = 'none';
    }

    // Sit blend & fidgets
    this.sitBlend = lerpRate(this.sitBlend, this.baseState === 'sit' ? 1 : 0, 9, dt);
    if (this.baseState === 'sit') {
      this.sitT += dt;
      this.sitIdleSinceFidget += dt;
      if (this.sitWakeT > 0) this.sitWakeT = Math.max(0, this.sitWakeT - dt);
      if (this.sitFidgetKind === 'none') {
        if (this.sitIdleSinceFidget >= ANIM_CFG.napWait) {
          this.sitFidgetKind = 'nap';
          this.sitFidgetT = 0;
        } else if (this.sitT > 4.5 && Math.floor(this.sitT) % 7 === 0 && Math.random() < dt * 2) {
          this.sitFidgetKind = Math.random() < 0.5 ? 'sneeze' : 'warm';
          this.sitFidgetT = 0;
        }
      } else {
        this.sitFidgetT += dt;
        if (this.sitFidgetKind === 'sneeze' && this.sitFidgetT > 0.6 && this.sitFidgetT - dt <= 0.6) {
          this.events.push({ type: 'snowPuff', x: -30, y: -150, count: 3, spread: 30 });
        }
        if (this.sitFidgetKind === 'nap') {
          if (this.sitFidgetT > 5.5) {
            this.sitFidgetKind = 'none';
            this.sitWakeT = 0.25;
            this.sitIdleSinceFidget = 0;
          }
        } else if (this.sitFidgetT > 1.3) {
          this.sitFidgetKind = 'none';
          this.sitFidgetT = 0;
        }
      }
    }

    // Hide blend & peek
    this.hideBlend = lerpRate(this.hideBlend, this.baseState === 'hide' ? 1 : 0, 14, dt);
    if (this.baseState === 'hide') {
      if (this.hidePeekT > 0) {
        this.hidePeekT = Math.max(0, this.hidePeekT - dt);
      } else {
        this.hideAutoPeekTimer -= dt;
        if (this.hideAutoPeekTimer <= 0) {
          this.hidePeekT = 0.7;
          this.hideAutoPeekTimer = 3.2 + Math.random() * 2;
        }
      }
    }

    // Jump state machine
    if (this.jumpPhase !== 'none') {
      this.jumpT += dt;
      if (this.jumpPhase === 'anticipation') {
        if (this.jumpT >= 0.085) {
          this.jumpPhase = 'air';
          this.jumpT = 0;
          this.jumpVy = (4 * this.jumpMaxH) / this.jumpAirTotal;
          this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 5, spread: 45 });
        }
      } else if (this.jumpPhase === 'air') {
        const g = (8 * this.jumpMaxH) / (this.jumpAirTotal * this.jumpAirTotal);
        this.jumpY += this.jumpVy * dt;
        this.jumpVy -= g * dt;
        if (this.jumpY <= 0) {
          this.jumpY = 0;
          this.jumpPhase = 'landing';
          this.jumpT = 0;
          this.quiverBounceVel += 24;
          this.hatWobbleVel -= 9;
          this.events.push({ type: 'snowPuff', x: 0, y: 0, count: 8, spread: 75 });
        }
      } else if (this.jumpPhase === 'landing') {
        if (this.jumpT >= 0.08) {
          this.jumpPhase = 'recover';
          this.jumpT = 0;
        }
      } else if (this.jumpPhase === 'recover') {
        if (this.jumpT >= 0.15) {
          this.jumpPhase = 'none';
          this.jumpT = 0;
          this.baseState = moving ? (input.runHeld ? 'run' : 'walk') : 'stand';
          if (this.bufferedAction?.kind === 'jump') {
            const h = !!this.bufferedAction.hold;
            this.bufferedAction = null;
            this.triggerJump(h);
          }
        }
      }
    }

    // Shooting / attack state machine (Layer 2)
    if (this.cancelT > 0) this.cancelT = Math.max(0, this.cancelT - dt);
    if (this.stringVibT > 0) this.stringVibT = Math.max(0, this.stringVibT - dt);
    if (this.bowKickT > 0) this.bowKickT = Math.max(0, this.bowKickT - dt);

    if (this.shootPhase !== 'none') {
      const rate = input.drawing && (this.shootPhase === 'stance' || this.shootPhase === 'nock') ? 4.5 : 1;
      this.shootT += dt * rate;
      if (this.shootPhase === 'stance' && this.shootT >= 0.12) {
        this.shootPhase = this.weapon === 'shortbow' || this.weapon === 'longbow' ? (this.arrowNocked ? 'aim' : 'nock') : 'aim';
        this.shootT = 0;
      } else if (this.shootPhase === 'nock' && this.shootT >= 0.25) {
        this.arrowNocked = true;
        this.shootPhase = input.drawing ? 'draw' : 'aim';
        this.shootT = 0;
      } else if ((this.shootPhase === 'aim' || this.shootPhase === 'draw' || this.shootPhase === 'hold') && input.drawing) {
        if (this.shootPhase === 'aim') {
          this.shootPhase = 'draw';
          this.shootT = 0;
        }
        this.holdDuration += dt;
        if (this.holdDuration > 1.0 && this.shootPhase === 'draw') {
          this.shootPhase = 'hold';
        }
      } else if ((this.shootPhase === 'draw' || this.shootPhase === 'hold') && !input.drawing) {
        this.holdDuration = 0;
      } else if (this.shootPhase === 'release' && this.shootT >= 0.08) {
        this.shootPhase = 'follow';
        this.shootT = 0;
      } else if (this.shootPhase === 'follow' && this.shootT >= 0.3) {
        this.shootPhase = this.weapon === 'crossbow' ? 'reload' : 'recover';
        this.shootT = 0;
      } else if (this.shootPhase === 'reload' && this.shootT >= 0.5) {
        this.shootPhase = 'recover';
        this.shootT = 0;
      } else if (this.shootPhase === 'recover' && this.shootT >= 0.3) {
        this.shootPhase = 'none';
        this.shootT = 0;
        if (this.popupShotReturnHide) {
          this.baseState = 'hide';
          this.popupShotReturnHide = false;
        }
      }
    }

    // Secondary springs (0.08–0.10 s delayed follow-through!)
    const targetVel = (dxMoved / Math.max(0.001, dt)) * this.facing; // positive when moving forward
    this.bodyVelX = lerpRate(this.bodyVelX, clamp(targetVel, -500, 500), 14, dt);
    const omega = 22;
    const damp = 9;

    const beardTarget = clamp(-this.bodyVelX * 0.045, -24, 24);
    this.beardLagVel += ((beardTarget - this.beardLagX) * omega * omega - damp * this.beardLagVel) * dt;
    this.beardLagX += this.beardLagVel * dt;

    const hatTarget = clamp(-this.bodyVelX * 0.032, -16, 16);
    this.hatLagVel += ((hatTarget - this.hatLagX) * (omega * 1.1) ** 2 - damp * this.hatLagVel) * dt;
    this.hatLagX += this.hatLagVel * dt;

    const wobbleTarget = clamp(-this.bodyVelX * 0.0022, -0.9, 0.9);
    this.hatWobbleVel += ((wobbleTarget - this.hatWobble) * 180 - 7 * this.hatWobbleVel) * dt;
    this.hatWobble += this.hatWobbleVel * dt;

    this.quiverBounceVel += (-this.quiverBounce * 260 - 11 * this.quiverBounceVel) * dt;
    this.quiverBounce += this.quiverBounceVel * dt;
    this.arrowRattle = Math.sin(this.time * 18) * clamp(Math.abs(this.quiverBounce) * 0.008, 0, 0.055);
    this.prevBodyX += dxMoved;
  }

  // ------------------------------------------------------------------ Pose Evaluation
  evaluatePose(input: AnimatorInput, silhouetteColor: string | null = null): RigPose {
    const p = createDefaultPose();
    p.silhouetteColor = silhouetteColor;
    p.weapon = this.weapon;
    p.quiverOn = input.hasQuiver;
    p.hat = this.hatWearing ? this.hat : 'none';
    p.sitOnStump = !!input.sitOnStump;
    p.sitProgress = this.sitBlend;
    p.hideProgress = this.hideBlend;
    p.jumpY = this.jumpY;

    // 1. Determine active carry pose name for status bar
    this.activeCarryPose =
      this.jumpPhase !== 'none'
        ? 'air'
        : this.baseState === 'sit' || this.baseState === 'hide'
          ? 'low'
          : this.baseState === 'run'
            ? 'run'
            : this.baseState === 'walk'
              ? 'walk'
              : 'stand';

    // 2. Turn compression (0.85 width at midpoint of 0.18s turn)
    if (this.turnT > 0) {
      const dur = this.baseState === 'run' ? 0.3 : ANIM_CFG.turnTime;
      const u = 1 - this.turnT / dur;
      p.turnScaleX = Math.max(0.18, Math.abs(Math.cos(u * Math.PI)) * 0.15 + 0.85 * Math.abs(Math.cos(u * Math.PI)));
      p.faceSlideX = Math.sin(u * Math.PI) * 16;
    }

    // 3. Lower body pose (Layer 1)
    const stride = input.walkStrideOverride ?? ANIM_CFG.walkStride;
    const isMovingState = this.baseState === 'walk' || this.baseState === 'run';
    let stepU = 0; // 0..1 within current step
    let stepParity = 0; // 0 = lead planted, 1 = rear planted

    if (this.baseState === 'walk') {
      const totalSteps = this.walkDist / stride;
      stepParity = Math.floor(totalSteps) % 2;
      stepU = totalSteps - Math.floor(totalSteps);
      // 0% Contact mid, 25% Down (-8), 50% Passing mid, 75% Up (+8)
      const exactBob = -Math.sin(stepU * Math.PI * 2) * ANIM_CFG.walkBob;
      p.bodyY = exactBob;
      p.squashY = 1 + Math.sin(stepU * Math.PI * 2) * 0.025;
      p.squashX = 1 / p.squashY;
      p.lean = -0.045 - Math.cos(stepU * Math.PI * 2) * 0.015; // ~3 deg forward
      p.roll = Math.sin(stepU * Math.PI * 2) * (stepParity === 0 ? -0.04 : 0.04);

      // Distance-locked legs: planted foot MUST cancel body translation!
      const plantedFootDx = -stride / 2 + stepU * stride; // -stride/2 -> +stride/2
      const plantedAng = Math.asin(clamp(-plantedFootDx / 69, -0.82, 0.82));
      const plantedSlide = -(69 - 69 * Math.cos(plantedAng)); // keep sole flush at y=0

      // Free leg lifts up (18u at Passing u=0.5), passes forward (+stride/2 -> -stride/2)
      const freeFootDx = Math.cos(stepU * Math.PI) * (stride / 2);
      const freeAng = Math.asin(clamp(-freeFootDx / 69, -0.82, 0.82));
      const freeLift = Math.sin(stepU * Math.PI) * 18;
      const freeTilt = stepU < 0.3 ? -0.22 * (1 - stepU / 0.3) : stepU > 0.65 ? 0.22 * ((stepU - 0.65) / 0.35) : 0;

      if (stepParity === 0) {
        p.legLead = { hipX: 420, ang: plantedAng, slideUp: plantedSlide, bootTilt: 0, planted: true };
        p.legRear = { hipX: 538, ang: freeAng, slideUp: freeLift, bootTilt: freeTilt, planted: false };
      } else {
        p.legRear = { hipX: 538, ang: plantedAng, slideUp: plantedSlide, bootTilt: 0, planted: true };
        p.legLead = { hipX: 420, ang: freeAng, slideUp: freeLift, bootTilt: freeTilt, planted: false };
      }

      if (this.walkStartT > 0) {
        const s = 1 - this.walkStartT / 0.12;
        p.lean *= s;
        p.lean -= (1 - s) * 0.08;
      }
      this.subPoseLabel = stepU < 0.25 ? 'Contact' : stepU < 0.5 ? 'Down' : stepU < 0.75 ? 'Passing' : 'Up';
    } else if (this.baseState === 'run') {
      const rStride = ANIM_CFG.runStride;
      const totalSteps = this.walkDist / rStride;
      stepParity = Math.floor(totalSteps) % 2;
      stepU = totalSteps - Math.floor(totalSteps);
      // 75% ground stance (0..0.75), 25% flight (0.75..1.0)!
      const inAir = stepU >= 0.75;
      const stanceU = clamp(stepU / 0.75, 0, 1);
      const stanceSpan = rStride * 0.75; // ~84 units covered while planted!
      const airPhase = inAir ? (stepU - 0.75) / 0.25 : 0;

      p.lean = -ANIM_CFG.runLeanDeg * DEG;
      p.bodyY = inAir ? 14 : -Math.sin(stanceU * Math.PI) * 10;
      p.jumpY += inAir ? Math.sin(airPhase * Math.PI) * 18 : 0;
      p.squashY = inAir ? 1.03 : 1 - Math.sin(stanceU * Math.PI) * 0.04;
      p.squashX = 1 / p.squashY;

      // Planted foot locked during stance (0..0.75), airborne during 0.75..1.0
      const plantedDx = -stanceSpan / 2 + (inAir ? stanceSpan : stanceU * stanceSpan);
      const plantedAng = Math.asin(clamp(-plantedDx / 69, -0.85, 0.85));
      const plantedSlide = inAir ? Math.sin(airPhase * Math.PI) * 12 : -(69 - 69 * Math.cos(plantedAng));

      const freeDx = Math.cos(stepU * Math.PI) * (stanceSpan / 2);
      const freeAng = Math.asin(clamp(-freeDx / 69, -0.85, 0.85));
      const freeLift = Math.sin(stepU * Math.PI) * 22;
      const freeTilt = inAir ? 0.25 : -0.15;

      if (stepParity === 0) {
        p.legLead = { hipX: 420, ang: plantedAng, slideUp: plantedSlide, bootTilt: inAir ? -0.25 : 0, planted: !inAir };
        p.legRear = { hipX: 538, ang: freeAng, slideUp: freeLift, bootTilt: freeTilt, planted: false };
      } else {
        p.legRear = { hipX: 538, ang: plantedAng, slideUp: plantedSlide, bootTilt: inAir ? -0.25 : 0, planted: !inAir };
        p.legLead = { hipX: 420, ang: freeAng, slideUp: freeLift, bootTilt: freeTilt, planted: false };
      }
      this.subPoseLabel = inAir ? 'Air' : stepU < 0.35 ? 'Drive' : 'Push';
    } else if (this.baseState === 'jump') {
      if (this.jumpPhase === 'anticipation') {
        const u = smoothstep(this.jumpT / 0.085);
        p.squashY = lerp(1, 0.88, u);
        p.squashX = 1 / p.squashY;
        p.legLead.slideUp = 16 * u;
        p.legRear.slideUp = 16 * u;
        this.subPoseLabel = 'Anticipation';
      } else if (this.jumpPhase === 'air') {
        const apex = Math.abs(this.jumpVy) < 160;
        const rising = this.jumpVy > 0;
        p.squashY = rising ? 1.09 : apex ? 1.0 : 1.05;
        p.squashX = 1 / p.squashY;
        const tuck = apex ? 22 : rising ? 14 : 6;
        p.legLead.slideUp = tuck;
        p.legRear.slideUp = tuck;
        p.legLead.planted = false;
        p.legRear.planted = false;
        if (this.jumpRunning) {
          p.lean = -0.18;
          p.legLead.ang = 0.42;
          p.legRear.ang = -0.42;
        } else {
          p.legLead.bootTilt = rising ? -0.28 : 0.15;
          p.legRear.bootTilt = rising ? -0.28 : 0.15;
        }
        p.beardLiftY = rising ? -8 : 10;
        p.hatOffY = apex ? -ANIM_CFG.hatFloatApex : rising ? 2 : -4;
        this.subPoseLabel = apex ? 'Apex' : rising ? 'Rise' : 'Fall';
      } else if (this.jumpPhase === 'landing') {
        const u = smoothstep(this.jumpT / 0.08);
        p.squashY = lerp(0.85, 0.92, u);
        p.squashX = 1 / p.squashY;
        p.legLead.slideUp = 14 * (1 - u);
        p.legRear.slideUp = 14 * (1 - u);
        p.hatOffY = 6 * Math.sin(u * Math.PI);
        this.subPoseLabel = 'Landing';
      } else {
        const u = smoothstep(this.jumpT / 0.15);
        p.squashY = lerp(0.92, 1, u);
        p.squashX = 1 / p.squashY;
        this.subPoseLabel = 'Recover';
      }
    } else if (this.baseState === 'sit') {
      const sitIn = clamp(this.sitT / 0.45, 0, 1);
      p.sitProgress = smoothstep(sitIn);
      const breath = Math.sin((this.time * Math.PI * 2) / 3.2);
      p.squashY = 1 + breath * 0.015;
      p.bodyY = breath * 2;
      p.headTilt = Math.sin(this.time * 0.9) * 0.04;
      p.legLead.ang = Math.sin(this.time * 2.2) * 0.08;
      p.legRear.ang = -Math.sin(this.time * 2.2) * 0.08;
      if (this.sitFidgetKind === 'sneeze') {
        p.eyeExpr = this.sitFidgetT < 0.55 ? 'cross' : 'squint';
        p.headTilt = this.sitFidgetT < 0.55 ? 0.15 : -0.22;
        p.squashY = this.sitFidgetT < 0.55 ? 1.03 : 0.93;
        this.subPoseLabel = 'Sneeze';
      } else if (this.sitFidgetKind === 'nap') {
        p.eyeExpr = 'happy';
        p.headTilt = -0.18;
        p.hatOffY = 18;
        p.hatRot = -0.18;
        p.zzzPhase = this.sitFidgetT;
        this.subPoseLabel = 'Nap';
      } else if (this.sitWakeT > 0) {
        p.eyeExpr = 'wide';
        this.subPoseLabel = 'Awake!';
      } else {
        this.subPoseLabel = sitIn < 1 ? 'Sitting down' : input.sitOnStump ? 'Stump' : 'Ground';
      }
    } else if (this.baseState === 'hide') {
      const breath = Math.sin(this.time * 2.1);
      p.squashY = 0.9 + breath * 0.01;
      p.squashX = 1.08;
      const peekAmt = this.hidePeekT > 0 ? Math.sin(clamp(1 - this.hidePeekT / 0.75, 0, 1) * Math.PI) : 0;
      p.hideProgress = 1 - peekAmt * 0.52;
      p.eyeLookX = Math.sin(this.time * 3.1) * 1.1;
      p.hatOffY = 6;
      this.subPoseLabel = peekAmt > 0.1 ? 'Peek' : input.inCoverRock ? 'Behind rock' : 'Duck';
    } else {
      // Stand (2.4s breathing loop + weight shift + stop transitions)
      const breath = Math.sin((this.time * Math.PI * 2) / 2.4);
      const holdPause = this.shootPhase === 'hold' ? 0 : 1;
      p.squashY = 1 + breath * 0.015 * holdPause;
      p.bodyY = breath * 2.2 * holdPause;
      const shift = Math.sin(this.weightShiftPhase) > 0.65 ? (Math.sin(this.weightShiftPhase) - 0.65) * 10 : 0;
      p.bodyX = shift;
      if (shift > 1) p.legLead.bootTilt = 0.08;
      if (this.walkStopT > 0) {
        const u = this.walkStopT / 0.15;
        p.lean = -0.04 * Math.sin(u * Math.PI);
      }
      if (this.skidStopT > 0) {
        const u = this.skidStopT / 0.25;
        p.lean = 0.17 * u; // lean back 10 deg on skid
        p.legLead.ang = 0.28 * u;
        p.legRear.ang = 0.22 * u;
      }
      this.subPoseLabel = this.fidgetKind !== 'none' ? `Fidget: ${this.fidgetKind}` : 'Idle';
    }

    // 4. Arms & Equipment Carry Pose (Layer 2)
    this.applyCarryArms(p, isMovingState, stepParity, stepU, input);

    // 5. Shooting / Attack Overlay (Layer 2)
    this.applyShootOverlay(p, input);

    // 6. Stand Fidgets Overlay
    this.applyStandFidget(p);

    // 7. Pickup / Armed / Unarmed Fail Overlay
    this.applyPickupOverlay(p, input);

    // 8. Hat On/Off Overlay
    this.applyHatOverlay(p);

    // 9. Eye Blink & Look Notice
    if (this.blinkT > 0 && p.eyeExpr === 'normal') p.eyeExpr = 'blink';
    if (input.noticeDir && Math.abs(input.noticeDir) > 0.01 && this.shootPhase === 'none') {
      const localLook = input.noticeDir * this.facing; // + = ahead, - = behind
      p.eyeLookX = clamp(localLook * 1.1, -1, 1);
      p.faceSlideX += localLook * 8;
    }
    if (input.trackFlyingY !== null && input.trackFlyingY !== undefined && this.shootPhase === 'follow') {
      p.eyeLookY = clamp(input.trackFlyingY / 300, -1, 1);
      p.headTilt += clamp(-input.trackFlyingY / 900, -0.2, 0.2);
    }

    // 10. Secondary motion delays (Layer 3)
    p.beardSwayX += this.beardLagX;
    p.hatLagX += this.hatLagX;
    p.hatWobble += this.hatWobble;
    p.quiverBounce += this.quiverBounce;
    p.arrowRattle += this.arrowRattle;
    if (this.baseState === 'run') {
      p.hatRot -= 0.1; // tilts back 6 deg
      p.mustacheBack = 0.18;
    }

    // 11. Reactions (Layer 4 - highest priority!)
    this.applyReactionOverlay(p);

    return p;
  }

  private applyCarryArms(p: RigPose, isMoving: boolean, stepParity: number, stepU: number, input: AnimatorInput) {
    const bowLowMode = input.bowCarryStyle === 'low';
    const armPhase = (stepParity === 0 ? stepU : stepU + 1) * Math.PI; // 0..2pi across 2 steps
    const swing = isMoving ? Math.sin(armPhase) : 0;

    // Default idle/walk arms matching image-1.png:
    // Near/rear arm (582, 425) hangs in front of torso; Far/lead arm (358, 425) tucked behind torso!
    p.leadArmInFront = false;
    p.rearArmInFront = true;

    if (this.baseState === 'run') {
      // Empty / slung arms bend ~90 deg and pump!
      p.leadArm = {
        shoulderX: 358,
        shoulderY: 425,
        upperLen: 60,
        foreLen: 56,
        elbowDir: -1,
        upperAng: Math.PI / 2 - swing * 0.7,
        foreAng: Math.PI / 2 - swing * 0.7 + 1.25,
      };
      p.rearArm = {
        shoulderX: 582,
        shoulderY: 425,
        upperLen: 82,
        foreLen: 82,
        elbowDir: -1,
        upperAng: Math.PI / 2 + swing * 0.75,
        foreAng: Math.PI / 2 + swing * 0.75 + 1.35,
      };
    } else if (this.baseState === 'jump' && this.jumpPhase === 'air' && Math.abs(this.jumpVy) < 160) {
      // Apex nod to T-pose (arms out wide!)
      p.leadArmInFront = true;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, upperAng: Math.PI + 0.15, foreAng: Math.PI + 0.25 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, upperAng: -0.15, foreAng: -0.25 };
    } else if (this.baseState === 'sit') {
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 56, foreLen: 56, elbowDir: -1, upperAng: Math.PI / 2 + 0.35, foreAng: Math.PI / 2 + 0.75 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, upperAng: Math.PI / 2 + 0.22, foreAng: Math.PI / 2 + 0.85 };
    } else if (this.baseState === 'hide' && !input.inCoverRock) {
      // Arms over head "nobody can see me"
      p.leadArmInFront = true;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 56, elbowDir: -1, handX: 430, handY: 280 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 495, handY: 282 };
    } else {
      // Stand & Walk (two-part arms with elbow lag!)
      const uSwing = swing * 0.44;
      const fLag = swing > 0 ? 0.52 : 0.18; // elbow bends 30 deg forward, 10 deg back!
      p.leadArm = {
        shoulderX: 358,
        shoulderY: 425,
        upperLen: 56,
        foreLen: 56,
        elbowDir: -1,
        upperAng: Math.PI / 2 - 0.08 - uSwing,
        foreAng: Math.PI / 2 + 0.05 - uSwing + fLag,
      };
      p.rearArm = {
        shoulderX: 582,
        shoulderY: 425,
        upperLen: 82,
        foreLen: 82,
        elbowDir: 1,
        upperAng: Math.PI / 2 + uSwing,
        foreAng: Math.PI / 2 + uSwing + (swing < 0 ? 0.52 : 0.18),
      };
    }

    // Weapon-specific carry pose
    if (this.weapon === 'shortbow' || this.weapon === 'longbow') {
      if (bowLowMode && this.baseState !== 'sit' && this.baseState !== 'hide') {
        p.weaponMode = 'leadHand';
        p.leadArmInFront = true;
        p.leadArm.upperAng = Math.PI / 2 + 0.42 - swing * 0.18;
        p.leadArm.foreAng = Math.PI / 2 + 0.65 - swing * 0.18;
        p.weaponRot = -0.35 + Math.sin(this.time * 3) * 0.04;
      } else {
        // Slung diagonally across body (matches image-1.png!)
        p.weaponMode = 'slung';
      }
    } else if (this.weapon === 'crossbow') {
      p.weaponMode = 'bothHands';
      p.leadArmInFront = true;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 56, foreLen: 56, elbowDir: -1, handX: 392, handY: 486 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 432, handY: 492 };
      p.weaponRot = isMoving ? Math.sin(armPhase) * 0.07 : 0;
      p.showArrow = true;
    } else if (this.weapon === 'javelin') {
      if (this.baseState === 'sit' || this.baseState === 'hide') {
        p.weaponMode = 'back';
      } else {
        p.weaponMode = 'rearHand';
        const tapBob = isMoving ? Math.abs(Math.sin(armPhase * 0.5)) * 0.08 : 0;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 555, handY: 505 };
        p.weaponRot = this.baseState === 'run' ? 0.08 : Math.PI / 2 - 0.12 + tapBob;
      }
    } else if (this.weapon === 'slingshot') {
      p.weaponMode = 'belt';
    } else if (this.weapon === 'snowball') {
      p.weaponMode = 'hidden';
      p.snowballSize = 0;
    }
  }

  private applyShootOverlay(p: RigPose, input: AnimatorInput) {
    if (this.shootPhase === 'none') return;
    const th = (this.shootPhase === 'release' || this.shootPhase === 'follow' ? this.lastReleaseAngle : this.aimAngleSmoothed) * DEG;
    const isLong = this.weapon === 'longbow';
    const isCross = this.weapon === 'crossbow';
    const isJav = this.weapon === 'javelin';
    const isSling = this.weapon === 'slingshot';
    const isSnow = this.weapon === 'snowball';

    // Extra weapon attacks
    if (isCross) {
      p.leadArmInFront = true;
      p.weaponMode = 'bothHands';
      const cTh = clamp(this.aimAngleSmoothed, 0, 45) * DEG;
      if (this.shootPhase === 'reload') {
        p.weaponRot = -0.7;
        p.showArrow = this.shootT > 0.35;
        p.bowDraw = smoothstep(this.shootT / 0.45);
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 56, foreLen: 56, elbowDir: -1, handX: 360, handY: 500 };
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 390, handY: 495 };
        this.subPoseLabel = 'Reload';
      } else {
        const kick = this.shootPhase === 'release' ? 0.12 : 0;
        p.weaponRot = cTh + kick;
        p.bowDraw = this.shootPhase === 'release' || this.shootPhase === 'follow' ? 0 : 1;
        p.showArrow = this.shootPhase !== 'release' && this.shootPhase !== 'follow';
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 355 - Math.cos(cTh) * 70, handY: 425 - Math.sin(cTh) * 70 };
        p.rearArm = { shoulderX: 475, shoulderY: 426, upperLen: 86, foreLen: 86, elbowDir: -1, handX: 355 - Math.cos(cTh) * 20, handY: 425 - Math.sin(cTh) * 20 };
        this.subPoseLabel = this.shootPhase === 'release' ? 'Kick' : 'Crossbow Aim';
      }
      return;
    }

    if (isJav) {
      p.weaponMode = 'rearHand';
      p.leadArmInFront = true;
      const p01 = this.shootPhase === 'draw' || this.shootPhase === 'hold' ? input.power01 : this.shootPhase === 'release' ? 1 : 0.4;
      if (this.shootPhase === 'draw' || this.shootPhase === 'hold' || this.shootPhase === 'aim') {
        p.lean = 0.17 * p01; // lean back 10 deg
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 255, handY: 360 };
        p.rearArm = { shoulderX: 540, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: -1, handX: 540 + p01 * 55, handY: 318 };
        p.weaponRot = th * 0.55;
        this.subPoseLabel = 'Cock back';
      } else if (this.shootPhase === 'release' || this.shootPhase === 'follow') {
        p.lean = -0.2;
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 320, handY: 455 };
        p.rearArm = { shoulderX: 520, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: -1, handX: 375, handY: 390 };
        p.weaponMode = 'hidden';
        this.subPoseLabel = 'Throw';
      } else if (this.shootPhase === 'recover') {
        p.weaponMode = 'back';
        p.rearArm = { shoulderX: 560, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: -1, handX: 590, handY: 320 };
        this.subPoseLabel = 'Draw spare';
      }
      return;
    }

    if (isSling) {
      p.leadArmInFront = true;
      const drawAmt = this.shootPhase === 'draw' || this.shootPhase === 'hold' ? input.power01 : 0;
      p.weaponMode = 'leadHand';
      p.bowDraw = drawAmt;
      p.weaponRot = th * 0.4;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 260, handY: 375 };
      p.rearArm = { shoulderX: 480, shoulderY: 426, upperLen: 86, foreLen: 86, elbowDir: -1, handX: 280 + drawAmt * 95, handY: 365 + drawAmt * 35 };
      this.subPoseLabel = this.shootPhase === 'release' ? 'Snap' : 'Slingshot';
      return;
    }

    if (isSnow) {
      p.weaponMode = 'rearHand';
      p.leadArmInFront = true;
      if (this.shootPhase === 'stance' || this.shootPhase === 'aim') {
        const u = smoothstep(this.shootT / 0.3);
        p.bodyY = -42 * u;
        p.lean = -0.3 * u;
        p.snowballSize = u;
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 350, handY: 560 };
        p.rearArm = { shoulderX: 560, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 390, handY: 560 };
        this.subPoseLabel = 'Scoop';
      } else if (this.shootPhase === 'draw' || this.shootPhase === 'hold') {
        p.snowballSize = 1;
        p.lean = 0.14;
        p.rearArm = { shoulderX: 540, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: -1, handX: 575, handY: 315 };
        this.subPoseLabel = 'Wind up';
      } else {
        p.snowballSize = 0;
        p.lean = -0.18;
        p.rearArm = { shoulderX: 520, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: -1, handX: 365, handY: 370 };
        this.subPoseLabel = 'Lob';
      }
      return;
    }

    // Standard Bow / Longbow 8-phase sequence (GDD section 17)
    p.weaponMode = 'leadHand';
    p.leadArmInFront = true;
    p.rearArmInFront = true;

    const leadReach = RIG_NEW.LEAD_ARM_LEN + (this.shootPhase === 'draw' || this.shootPhase === 'hold' ? 5 * input.power01 : 0);
    const handX = RIG_NEW.LEAD_SHOULDER.x - leadReach * Math.cos(th);
    const handY = RIG_NEW.LEAD_SHOULDER.y - leadReach * Math.sin(th);

    if (this.shootPhase === 'stance') {
      const u = smoothstep(this.shootT / 0.12);
      p.bodyY -= 4 * u;
      p.legLead.hipX = 420 - 5 * u;
      p.legRear.hipX = 538 + 5 * u;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: lerp(340, handX, u), handY: lerp(490, handY, u) };
      p.rearArm = { shoulderX: lerp(582, RIG_NEW.REAR_SHOULDER_AIM.x, u), shoulderY: 426, upperLen: 86, foreLen: 86, elbowDir: -1, handX: lerp(560, 480, u), handY: lerp(550, 455, u) };
      p.weaponRot = th * u;
      p.bowDraw = 0;
      p.showArrow = false;
      this.subPoseLabel = 'Stance';
    } else if (this.shootPhase === 'nock') {
      const u = smoothstep(this.shootT / 0.25);
      p.bodyY -= 4;
      p.legLead.hipX = 415;
      p.legRear.hipX = 543;
      const lvlHandX = RIG_NEW.LEAD_SHOULDER.x - leadReach * Math.cos(th * u);
      const lvlHandY = RIG_NEW.LEAD_SHOULDER.y - leadReach * Math.sin(th * u);
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: lvlHandX, handY: lvlHandY };
      p.weaponRot = th * u;
      const g = bowWeaponGeom(lvlHandX, lvlHandY, p.weaponRot, 0, this.weapon);
      // Reach over shoulder to quiver (u < 0.5) then bring arrow to string nock (u >= 0.5)
      const reachX = u < 0.5 ? lerp(480, 610, u * 2) : lerp(610, g.nock.x, (u - 0.5) * 2);
      const reachY = u < 0.5 ? lerp(455, 340, u * 2) : lerp(340, g.nock.y, (u - 0.5) * 2);
      p.rearArm = {
        shoulderX: RIG_NEW.REAR_SHOULDER_AIM.x,
        shoulderY: 426,
        upperLen: 88,
        foreLen: 88,
        elbowDir: -1,
        handX: reachX,
        handY: reachY,
      };
      p.quiverArrows = u > 0.45 ? 1 : 2;
      p.showArrow = u > 0.55;
      p.eyeLookX = u < 0.5 ? 0.8 : -0.8;
      this.subPoseLabel = 'Nock';
    } else if (this.shootPhase === 'aim' || this.shootPhase === 'draw' || this.shootPhase === 'hold') {
      const drawAmt =
        this.shootPhase === 'draw' || this.shootPhase === 'hold'
          ? clamp(input.power01, 0, 1)
          : this.cancelT > 0
            ? (this.cancelT / 0.15) * 0.4
            : 0;
      p.bodyY -= 4;
      p.legLead.hipX = 415;
      p.legRear.hipX = 543;
      p.lean += (isLong ? 12 : 8) * DEG * clamp(this.aimAngleSmoothed / 80, 0, 1);
      p.headTilt += th * 0.3;
      p.eyeLookY = -clamp(this.aimAngleSmoothed / 90, 0, 0.8);
      p.squashX *= 1 + 0.03 * drawAmt;
      p.bowDraw = drawAmt;
      p.bowTipBend = ANIM_CFG.bowTipBend * drawAmt;
      p.weaponRot = th;
      p.showArrow = true;
      p.quiverArrows = 1;

      // Exact IK connection of lead hand to bow grip & rear hand to string nock!
      p.leadArm = {
        shoulderX: RIG_NEW.LEAD_SHOULDER.x,
        shoulderY: RIG_NEW.LEAD_SHOULDER.y,
        upperLen: 58,
        foreLen: 56,
        elbowDir: -1,
        handX,
        handY,
      };
      const g = bowWeaponGeom(handX, handY, th, drawAmt, this.weapon);
      p.rearArm = {
        shoulderX: RIG_NEW.REAR_SHOULDER_AIM.x,
        shoulderY: RIG_NEW.REAR_SHOULDER_AIM.y,
        upperLen: 88,
        foreLen: 88,
        elbowDir: -1, // elbow rises up and away from target!
        handX: g.nock.x,
        handY: g.nock.y,
      };

      if (this.shootPhase === 'hold') {
        const shake = Math.sin(this.time * 42) * clamp((this.holdDuration - 1) * 1.8, 0, 4);
        p.rearArm.handX! += shake;
        p.rearArm.handY! += shake * 0.7;
        p.eyeExpr = 'squint';
        p.mustacheCurlL = -0.12;
        p.mustacheCurlR = -0.12;
        this.subPoseLabel = 'Hold';
      } else {
        this.subPoseLabel = this.shootPhase === 'draw' ? `Draw ${Math.round(drawAmt * 100)}%` : 'Aim';
      }
    } else if (this.shootPhase === 'release' || this.shootPhase === 'follow') {
      const relU = this.shootPhase === 'release' ? smoothstep(this.shootT / 0.07) : 1;
      const bowKick = this.bowKickT > 0 ? Math.sin((this.bowKickT / 0.16) * Math.PI) * 0.14 : 0;
      p.lean += 0.04 + (isLong ? 10 : 6) * DEG * clamp(this.lastReleaseAngle / 80, 0, 1);
      p.headTilt += th * 0.25;
      p.weaponRot = th - bowKick;
      p.bowDraw = 0;
      p.stringVib = this.stringVibT > 0 ? Math.sin(this.stringVibT * 65) * 18 * (this.stringVibT / 0.28) : 0;
      p.showArrow = false;
      p.leadArm = {
        shoulderX: RIG_NEW.LEAD_SHOULDER.x,
        shoulderY: RIG_NEW.LEAD_SHOULDER.y,
        upperLen: 58,
        foreLen: 56,
        elbowDir: -1,
        handX,
        handY,
      };
      // Rear hand flies backward 24 units past cheek!
      const anchor = bowWeaponGeom(handX, handY, th, 1, this.weapon).nock;
      p.rearArm = {
        shoulderX: RIG_NEW.REAR_SHOULDER_AIM.x,
        shoulderY: RIG_NEW.REAR_SHOULDER_AIM.y,
        upperLen: 88,
        foreLen: 88,
        elbowDir: -1,
        handX: anchor.x + Math.cos(th) * ANIM_CFG.releaseKickBack * relU,
        handY: anchor.y + Math.sin(th) * ANIM_CFG.releaseKickBack * relU,
      };
      this.subPoseLabel = this.shootPhase === 'release' ? 'Release' : 'Follow-through';
    } else if (this.shootPhase === 'recover') {
      const u = smoothstep(this.shootT / 0.3);
      p.weaponRot = th * (1 - u);
      if (u > 0.65 && input.bowCarryStyle !== 'low') p.weaponMode = 'slung';
      p.leadArm = {
        shoulderX: 358,
        shoulderY: 425,
        upperLen: 56,
        foreLen: 56,
        elbowDir: -1,
        handX: lerp(handX, 360, u),
        handY: lerp(handY, 535, u),
      };
      p.rearArm = {
        shoulderX: lerp(RIG_NEW.REAR_SHOULDER_AIM.x, 582, u),
        shoulderY: 425,
        upperLen: 82,
        foreLen: 82,
        elbowDir: 1,
        handX: lerp(420, 582, u),
        handY: lerp(440, 580, u),
      };
      this.subPoseLabel = 'Recover';
    }
  }

  private applyStandFidget(p: RigPose) {
    if (this.fidgetKind === 'none') return;
    const u = clamp(this.fidgetT / Math.max(0.01, this.fidgetDur), 0, 1);
    const wave = Math.sin(u * Math.PI);
    if (this.fidgetKind === 'beard') {
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 465, handY: 500 + Math.sin(u * 14) * 14 };
      p.beardSwayX += Math.sin(u * 14) * 5;
    } else if (this.fidgetKind === 'hands') {
      p.leadArmInFront = true;
      const rub = Math.sin(u * Math.PI * 6) * 8;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: 435 + rub, handY: 445 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 455 - rub, handY: 445 };
    } else if (this.fidgetKind === 'shoulder') {
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 385 + Math.sin(u * 14) * 18, handY: 430 };
    } else if (this.fidgetKind === 'sky') {
      p.headTilt = 0.18 * wave;
      p.eyeLookY = -wave;
    } else if (this.fidgetKind === 'quiver') {
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 565, handY: 455 - wave * 12 };
      p.quiverBounce = -wave * 8;
    } else if (this.fidgetKind === 'bowstring') {
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 470, handY: 485 - wave * 12 };
    } else if (this.fidgetKind === 'hatTip') {
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 480, handY: 280 - wave * 20 };
      p.hatOffY -= wave * 20;
      p.hatRot -= wave * 0.14;
    }
  }

  private applyPickupOverlay(p: RigPose, input: AnimatorInput) {
    if (this.pickupAnim) {
      const { kind, t, isRemove } = this.pickupAnim;
      const u = clamp(t / 0.75, 0, 1);
      if (isRemove) {
        if (kind === 'quiver') {
          p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: lerp(590, 340, u), handY: lerp(390, 560, u) };
          p.quiverBounce = -Math.sin(u * Math.PI) * 35;
        } else {
          p.leadArmInFront = true;
          p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: lerp(350, 290, u), handY: lerp(460, 585, u) };
        }
      } else {
        // Legs keep walking! Only upper body reaches & equips!
        if (t < 0.25) {
          const r = smoothstep(t / 0.25);
          p.lean -= 0.07 * r;
          p.leadArmInFront = true;
          p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: lerp(340, 240, r), handY: lerp(540, 595, r) };
        } else if (kind === 'quiver') {
          const eq = smoothstep((t - 0.25) / 0.45);
          p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: lerp(380, 600, eq), handY: lerp(340, 390, eq) };
          p.quiverBounce = -Math.sin(eq * Math.PI * 2) * 14 * (1 - eq);
        } else if (kind === 'bow') {
          const eq = smoothstep((t - 0.25) / 0.45);
          if (input.bowCarryStyle === 'low') {
            p.leadArmInFront = true;
            p.weaponMode = 'leadHand';
            p.weaponRot = eq * Math.PI;
          }
        }
      }
      this.subPoseLabel = isRemove ? `Remove ${kind}` : `Equip ${kind}`;
    }

    if (this.armedMomentT > 0) {
      const u = clamp(1 - this.armedMomentT / 0.55, 0, 1);
      const lift = Math.sin(u * Math.PI);
      p.jumpY += lift * 26;
      p.smile = lift;
      p.mustacheCurlL = 0.25 * lift;
      p.mustacheCurlR = 0.25 * lift;
      if (this.weapon === 'shortbow' || this.weapon === 'longbow') {
        p.weaponMode = 'leadHand';
        p.leadArmInFront = true;
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: 315, handY: 280 - lift * 40 };
        p.weaponRot = 0.45;
      }
      this.subPoseLabel = 'Armed!';
    }

    if (this.unarmedFailAnim) {
      const { kind, t } = this.unarmedFailAnim;
      const u = clamp(t / 0.75, 0, 1);
      if (kind === 'bowOnly' && t < 0.35) {
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 460, handY: 470 - Math.sin((t / 0.35) * Math.PI) * 18 };
        this.subPoseLabel = 'Pluck empty bow';
      } else if (kind === 'quiverOnly' && t < 0.4) {
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 590, handY: 360 - Math.sin((t / 0.4) * Math.PI) * 30 };
        this.subPoseLabel = 'Check arrow';
      } else {
        const s = Math.sin(clamp((u - 0.3) / 0.7, 0, 1) * Math.PI);
        p.faceSlideX = Math.sin(t * 28) * 14 * (1 - u);
        p.leadArmInFront = true;
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 56, foreLen: 56, elbowDir: -1, handX: 300, handY: 460 - s * 20 };
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 635, handY: 460 - s * 20 };
        this.subPoseLabel = 'Shrug';
      }
    }
  }

  private applyHatOverlay(p: RigPose) {
    if (this.hatAnim === 'none' || this.hat === 'none') return;
    // Tuck two-handed weapon under arm while hands handle hat
    if (p.weaponMode === 'bothHands') p.weaponMode = 'underArm';

    const t = this.hatAnimT;
    if (this.hatAnim === 'putOn') {
      if (t < 0.15) {
        // 1. Take out from behind back
        const u = smoothstep(t / 0.15);
        p.hatInHand = true;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: lerp(615, 595, u), handY: lerp(495, 425, u) };
      } else if (t < 0.35) {
        // 2. Lift high above head, eyes look up
        const u = smoothstep((t - 0.15) / 0.2);
        p.hatInHand = true;
        p.eyeLookY = -0.9;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: lerp(595, 485, u), handY: lerp(425, 225, u) };
      } else if (t < 0.5) {
        // 3. Press down onto head (-4u sink then settle, 4% squash)
        const u = smoothstep((t - 0.35) / 0.15);
        p.hatInHand = false;
        p.hatOffY = lerp(-45, 5, u);
        p.squashY *= 1 - 0.04 * Math.sin(u * Math.PI);
        p.squashX = 1 / p.squashY;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: 485, handY: lerp(225, 265, u) };
      } else {
        // 4. Pat on top
        const u = smoothstep((t - 0.5) / 0.2);
        p.hatOffY = 4 * (1 - u);
        p.hatWobble += Math.sin(u * Math.PI * 2) * 0.45;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: lerp(485, 582, u), handY: lerp(265, 580, u) };
      }
      this.subPoseLabel = 'Put on hat';
    } else {
      // Take off (~0.6s)
      if (t < 0.2) {
        const u = smoothstep(t / 0.2);
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: lerp(582, 485, u), handY: lerp(580, 265, u) };
      } else if (t < 0.4) {
        const u = smoothstep((t - 0.2) / 0.2);
        p.hatInHand = true;
        p.hatRot = 0.26 * (1 - u);
        p.baldShine = this.baldShineT / 0.4;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: lerp(485, 490, u), handY: lerp(240, 445, u) };
      } else {
        const u = smoothstep((t - 0.4) / 0.2);
        p.hatInHand = true;
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: lerp(490, 610, u), handY: lerp(445, 515, u) };
      }
      this.subPoseLabel = 'Take off hat';
    }
  }

  private applyReactionOverlay(p: RigPose) {
    if (!this.reaction) return;
    const t = this.reactionT;
    if (this.reaction === 'hit') {
      const u = clamp(t / 0.6, 0, 1);
      p.jumpY += Math.sin(u * Math.PI) * 64;
      p.eyeExpr = 'happy';
      p.smile = 1;
      p.mustacheCurlL = 0.25;
      p.mustacheCurlR = 0.25;
      p.leadArmInFront = true;
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: 300, handY: 270 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: 610, handY: 280 };
      this.subPoseLabel = 'Hit!';
    } else if (this.reaction === 'miss') {
      const u = clamp(t / 0.6, 0, 1);
      const dip = Math.sin(u * Math.PI);
      p.bodyY -= 4 * dip;
      p.squashY *= 1 - 0.05 * dip;
      p.headTilt = -0.1 * dip;
      p.eyeExpr = 'squint';
      p.mustacheCurlL = -0.22 * dip;
      p.mustacheCurlR = -0.22 * dip;
      this.subPoseLabel = 'Miss';
    } else if (this.reaction === 'shrug') {
      const u = clamp(t / 0.5, 0, 1);
      p.faceSlideX = Math.sin(u * Math.PI * 4) * 16 * (1 - u);
      p.leadArmInFront = true;
      const raise = Math.sin(u * Math.PI);
      p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 58, foreLen: 56, elbowDir: -1, handX: 280, handY: 450 - raise * 24 };
      p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 650, handY: 450 - raise * 24 };
      this.subPoseLabel = 'Shrug';
    } else if (this.reaction === 'win') {
      if (!this.winLoop) {
        if (t < 0.7) {
          // 1. Big jump with weapon overhead
          const u = t / 0.7;
          p.jumpY = Math.sin(u * Math.PI) * 95;
          p.smile = 1;
          p.eyeExpr = 'happy';
          p.mustacheCurlL = 0.28;
          p.mustacheCurlR = 0.28;
          p.leadArmInFront = true;
          p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: 330, handY: 255 };
          if (this.weapon === 'shortbow' || this.weapon === 'longbow') {
            p.weaponMode = 'leadHand';
            p.weaponRot = 0.45;
          }
          this.subPoseLabel = 'Win: Jump';
        } else if (t < 1.5) {
          // 2. Hat thrown up, spins & caught (or beard fluff if hatless)
          const u = (t - 0.7) / 0.8;
          p.smile = 1;
          p.eyeLookY = -0.8;
          if (p.hat !== 'none') {
            p.hatThrowY = Math.sin(u * Math.PI) * 135;
            p.hatThrowRot = u * Math.PI * 2;
            p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: 500, handY: 265 };
            this.subPoseLabel = 'Win: Hat toss';
          } else {
            p.beardSwayX = Math.sin(u * Math.PI * 4) * 18;
            p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 82, foreLen: 82, elbowDir: 1, handX: 465, handY: 485 };
            this.subPoseLabel = 'Win: Beard fluff';
          }
        } else if (t < 2.2) {
          // 3. One full spin
          const u = (t - 1.5) / 0.7;
          const sp = Math.cos(u * Math.PI * 2);
          p.spinX = Math.abs(sp) < 0.15 ? 0.15 * (sp < 0 ? -1 : 1) : sp;
          p.jumpY = Math.sin(u * Math.PI) * 38;
          p.smile = 1;
          this.subPoseLabel = 'Win: Spin';
        } else {
          // 4. Final pose with wink!
          p.eyeExpr = 'wink';
          p.smile = 1;
          p.mustacheCurlL = 0.25;
          p.mustacheCurlR = 0.25;
          p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: 625, handY: 300 };
          this.subPoseLabel = 'Win: Wink!';
        }
      } else {
        // Looping happy dance
        p.jumpY = Math.abs(Math.sin(t * 5)) * 46;
        const sp = Math.cos(t * 3.5);
        p.spinX = Math.abs(sp) < 0.15 ? 0.15 * (sp < 0 ? -1 : 1) : sp;
        p.smile = 1;
        p.eyeExpr = 'happy';
        p.mustacheCurlL = 0.25;
        p.mustacheCurlR = 0.25;
        p.leadArmInFront = true;
        p.leadArm = { shoulderX: 358, shoulderY: 425, upperLen: 60, foreLen: 58, elbowDir: -1, handX: 300, handY: 270 - Math.sin(t * 8) * 20 };
        p.rearArm = { shoulderX: 582, shoulderY: 425, upperLen: 84, foreLen: 84, elbowDir: 1, handX: 620, handY: 270 + Math.sin(t * 8) * 20 };
        this.subPoseLabel = 'Win: Dance';
      }
    }
  }
}
