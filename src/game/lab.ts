// Animation Lab ("Animation Test Window") engine & stage renderer (GDD section 13).
import { ANIM_CFG, CFG } from './config';
import {
  DEG,
  PAL,
  TARGET_CENTER_UP,
  TARGET_K,
  TARGET_RED,
  TARGET_RY_ART,
  drawArrowArt,
  drawBowItem,
  drawCloud,
  drawMound,
  drawPine,
  drawQuiverItem,
  drawRock,
  drawStar,
  drawTarget,
  roundRectPath,
} from './art';
import { RigAnimator, type AnimatorInput, type BaseState, type BowCarryStyle, type ReactionKind } from './animator';
import { drawHatArt, drawOldSimpleWalk, drawRigArcher, type HatId, type RigPivots, type RigPose, type WeaponId } from './rig';

export type LabScene = 'snow' | 'grid' | 'silhouette';
export type LabMode = 'treadmill' | 'free';

export interface LabOverlays {
  pivots: boolean;
  footLocks: boolean;
  trails: boolean;
  ghosts: boolean;
  oldWalk: boolean;
}

export interface LabPickup {
  kind: 'bow' | 'quiver' | 'hat';
  x: number;
  active: boolean;
  respawnT: number;
}

interface LabProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  weapon: WeaponId;
  stuck: boolean;
  t: number;
}

interface LabParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  g: number;
}

interface TrailPoint {
  x: number;
  y: number;
}

export interface LabSnapshot {
  scene: LabScene;
  mode: LabMode;
  state: BaseState;
  weapon: WeaponId;
  hat: HatId;
  hatWearing: boolean;
  hasQuiver: boolean;
  bowCarry: BowCarryStyle;
  sitOnStump: boolean;
  inCoverRock: boolean;
  angle: number;
  power: number;
  drawing: boolean;
  autoLoop: boolean;
  paused: boolean;
  speed: number;
  cyclePct: number;
  walkSpeed: number;
  walkStride: number;
  overlays: LabOverlays;
  playAllActive: boolean;
  playAllLabel: string;
  playAllTime: number;
  shuffleActive: boolean;
  statusLine: string;
  footLockLeadOk: boolean;
  footLockRearOk: boolean;
  footLockLeadSlip: number;
  footLockRearSlip: number;
}

const G = 0; // Ground plane at y=0 in Lab stage coords!

export class AnimationLab {
  anim = new RigAnimator();
  scene: LabScene = 'snow';
  mode: LabMode = 'treadmill';
  archerX = 0;
  groundScroll = 0;

  // Controls
  selectedState: BaseState = 'stand';
  hasQuiver = true;
  sitOnStump = false;
  inCoverRock = true;
  bowCarry: BowCarryStyle = 'slung';
  aimAngle = 40;
  power = 70;
  shootPreviewMode = false; // true when Shoot state or Draw/Shoot Test active
  drawingLive = false;
  autoLoopShoot = false;
  autoLoopTimer = 0;

  // Playback
  paused = false;
  speed = 1;
  walkSpeed = CFG.archer.walkSpeed;
  walkStride = ANIM_CFG.walkStride;
  cycleScrub = false;

  // Overlays
  overlays: LabOverlays = {
    pivots: false,
    footLocks: false,
    trails: false,
    ghosts: false,
    oldWalk: false,
  };

  // Interactive keyboard state in Lab
  keys = { left: false, right: false, shift: false, up: false, down: false, jumpHold: false };
  jumpHoldTime = 0;

  // Props & practice target
  targetX = -600;
  targetWobble = 0;
  targetWobbleVel = 0;
  targetFlash = 0;
  pickups: LabPickup[] = [
    { kind: 'bow', x: -240, active: true, respawnT: 0 },
    { kind: 'quiver', x: -350, active: true, respawnT: 0 },
    { kind: 'hat', x: 240, active: true, respawnT: 0 },
  ];
  projectiles: LabProjectile[] = [];
  particles: LabParticle[] = [];
  footprints: Array<{ x: number; life: number }> = [];
  breathClouds: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  // Trails
  trails: Record<'leadHand' | 'rearHand' | 'bowTip' | 'hatTop', TrailPoint[]> = {
    leadHand: [],
    rearHand: [],
    bowTip: [],
    hatTop: [],
  };

  // Foot-lock verification state
  private prevLeadWorldX: number | null = null;
  private prevRearWorldX: number | null = null;
  private prevLeadPlanted = false;
  private prevRearPlanted = false;
  leadSlip = 0;
  rearSlip = 0;
  leadLockOk = true;
  rearLockOk = true;

  // Play All & Shuffle
  playAllActive = false;
  playAllT = 0;
  playAllStepIdx = -1;
  playAllLabel = '';
  shuffleActive = false;
  shuffleTimer = 0;

  // Stage time & old walk comparison phase
  stageTime = 0;
  oldWalkPhase = 0;

  constructor() {
    this.anim.weapon = 'shortbow';
    this.anim.hat = 'wool';
    this.anim.hatWearing = true;
  }

  reset() {
    this.anim.reset();
    this.anim.weapon = 'shortbow';
    this.anim.hat = 'wool';
    this.anim.hatWearing = true;
    this.hasQuiver = true;
    this.selectedState = 'stand';
    this.archerX = 0;
    this.groundScroll = 0;
    this.shootPreviewMode = false;
    this.drawingLive = false;
    this.autoLoopShoot = false;
    this.playAllActive = false;
    this.shuffleActive = false;
    this.paused = false;
    this.speed = 1;
    this.aimAngle = 40;
    this.power = 70;
    this.walkSpeed = CFG.archer.walkSpeed;
    this.walkStride = ANIM_CFG.walkStride;
    this.projectiles = [];
    this.particles = [];
    this.footprints = [];
    this.breathClouds = [];
    this.clearTrails();
  }

  clearTrails() {
    this.trails.leadHand = [];
    this.trails.rearHand = [];
    this.trails.bowTip = [];
    this.trails.hatTop = [];
  }

  selectState(s: BaseState | 'shoot') {
    this.playAllActive = false;
    if (s === 'shoot') {
      this.selectedState = 'stand';
      this.shootPreviewMode = true;
      if (this.anim.weapon === 'none') this.anim.setWeapon('shortbow', true);
      if (this.anim.shootPhase === 'none') {
        this.anim.beginShoot(false);
      }
      return;
    }
    this.shootPreviewMode = false;
    this.drawingLive = false;
    if (this.anim.shootPhase !== 'none') this.anim.cancelShoot();
    this.selectedState = s;
    if (s === 'sit') {
      if (this.anim.baseState !== 'sit') this.anim.toggleSit();
    } else if (s === 'hide') {
      if (this.anim.baseState !== 'hide') this.anim.toggleHide();
    } else if (s === 'jump') {
      this.anim.triggerJump(true);
    } else {
      this.anim.sitBlend = 0;
      this.anim.hideBlend = 0;
      this.anim.baseState = s;
    }
  }

  triggerReaction(r: ReactionKind) {
    this.playAllActive = false;
    this.anim.triggerReaction(r);
  }

  setWeapon(w: WeaponId, instant = false) {
    this.anim.setWeapon(w, instant);
    if (w === 'none') this.shootPreviewMode = false;
  }

  setHat(h: HatId, instant = false) {
    this.anim.setHatStyle(h, instant);
  }

  putOnHat(instant = false) {
    if (this.anim.hat === 'none') this.anim.hat = 'wool';
    this.anim.triggerHat(true, instant);
  }

  takeOffHat(instant = false) {
    this.anim.triggerHat(false, instant);
  }

  dropAll() {
    if (this.anim.weapon !== 'none') this.anim.triggerRemove('bow');
    if (this.hasQuiver) this.anim.triggerRemove('quiver');
    this.anim.setWeapon('none', true);
    this.hasQuiver = false;
    this.anim.triggerHat(false, true);
    for (const pk of this.pickups) {
      pk.active = false;
      pk.respawnT = 1.0;
    }
  }

  pickupItem(kind: 'bow' | 'quiver' | 'hat') {
    if (kind === 'bow') {
      if (this.anim.weapon === 'none') this.anim.setWeapon('shortbow', true);
      this.anim.triggerPickup('bow', -1);
    } else if (kind === 'quiver') {
      this.hasQuiver = true;
      this.anim.triggerPickup('quiver', -1);
    } else {
      if (this.anim.hat === 'none') this.anim.hat = 'wool';
      this.anim.triggerHat(true, false);
    }
  }

  startDrawTest() {
    if (this.anim.weapon === 'none') this.anim.setWeapon('shortbow', true);
    this.shootPreviewMode = true;
    this.drawingLive = true;
    if (this.anim.shootPhase === 'none' || this.anim.shootPhase === 'recover') {
      this.anim.beginShoot(this.selectedState === 'hide');
    }
  }

  releaseDrawTest() {
    this.drawingLive = false;
    if (this.anim.shootPhase !== 'none') {
      this.anim.releaseShoot(this.aimAngle, this.power / 100);
    } else {
      this.anim.beginShoot(this.selectedState === 'hide');
      this.anim.releaseShoot(this.aimAngle, this.power / 100);
    }
  }

  cancelDrawTest() {
    this.drawingLive = false;
    this.shootPreviewMode = false;
    this.anim.cancelShoot();
  }

  stepFrames(frames: number) {
    this.paused = true;
    const stepDt = 1 / 60;
    if (frames > 0) {
      for (let i = 0; i < frames; i++) this.stepSim(stepDt);
    } else {
      // rewind via cycle scrubber logic
      const cur = this.getCyclePct();
      this.setCyclePct((cur - 2 + 100) % 100);
    }
  }

  getCyclePct(): number {
    if (this.selectedState === 'walk') {
      const cycle = this.walkStride * 2;
      return ((this.anim.walkDist % cycle) / cycle) * 100;
    }
    if (this.selectedState === 'run') {
      const cycle = ANIM_CFG.runStride * 2;
      return ((this.anim.walkDist % cycle) / cycle) * 100;
    }
    if (this.selectedState === 'sit') {
      return ((this.anim.time % 3.2) / 3.2) * 100;
    }
    if (this.shootPreviewMode) {
      return this.power;
    }
    return ((this.anim.time % 2.4) / 2.4) * 100;
  }

  setCyclePct(pct: number) {
    this.paused = true;
    const p = Math.max(0, Math.min(100, pct)) / 100;
    if (this.selectedState === 'walk') {
      this.anim.walkDist = p * this.walkStride * 2;
      this.anim.baseState = 'walk';
    } else if (this.selectedState === 'run') {
      this.anim.walkDist = p * ANIM_CFG.runStride * 2;
      this.anim.baseState = 'run';
    } else if (this.selectedState === 'sit') {
      this.anim.time = p * 3.2;
      this.anim.sitT = 1;
      this.anim.sitBlend = 1;
    } else if (this.shootPreviewMode) {
      this.power = pct;
      this.drawingLive = true;
      this.anim.shootPhase = 'draw';
      this.anim.arrowNocked = true;
    } else {
      this.anim.time = p * 2.4;
    }
  }

  togglePlayAll() {
    this.playAllActive = !this.playAllActive;
    if (this.playAllActive) {
      this.shuffleActive = false;
      this.paused = false;
      this.playAllT = 0;
      this.playAllStepIdx = -1;
      this.anim.reset();
      this.anim.weapon = 'none';
      this.hasQuiver = false;
      this.anim.hat = 'wool';
      this.anim.hatWearing = false;
      this.archerX = 0;
      this.selectedState = 'stand';
    }
  }

  toggleShuffle() {
    this.shuffleActive = !this.shuffleActive;
    if (this.shuffleActive) {
      this.playAllActive = false;
      this.paused = false;
      this.shuffleTimer = 0.4;
    }
  }

  private currentInput(): AnimatorInput {
    const kbMove = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let moveDir = kbMove;
    let runHeld = this.keys.shift;
    if (moveDir === 0) {
      if (this.selectedState === 'walk') moveDir = this.anim.desiredFacing;
      else if (this.selectedState === 'run') {
        moveDir = this.anim.desiredFacing;
        runHeld = true;
      }
    }
    return {
      moveDir,
      runHeld,
      aimAngleDeg: this.aimAngle,
      power01: this.power / 100,
      drawing: this.drawingLive,
      hasQuiver: this.hasQuiver,
      sitOnStump: this.sitOnStump,
      inCoverRock: this.inCoverRock,
      peeking: this.keys.up && this.selectedState === 'hide',
      walkSpeedOverride: this.walkSpeed,
      walkStrideOverride: this.walkStride,
      bowCarryStyle: this.bowCarry,
    };
  }

  private updatePlayAll(dt: number) {
    this.playAllT += dt;
    const t = this.playAllT;
    // 15-step ~40s sequence per GDD 13.3:
    // stand -> walk -> pick up bow -> pick up quiver -> hat on -> run -> jump -> hide -> peek -> sit -> stand up -> aim -> shoot -> hit -> win
    const segments: Array<[number, string, () => void]> = [
      [0, '1/15 Stand', () => this.selectKeepPlayAll('stand')],
      [2.5, '2/15 Walk', () => this.selectKeepPlayAll('walk')],
      [5.5, '3/15 Pick up bow', () => { this.anim.setWeapon('shortbow', true); this.anim.triggerPickup('bow', -1); }],
      [7.5, '4/15 Pick up quiver', () => { this.hasQuiver = true; this.anim.triggerPickup('quiver', -1); }],
      [9.8, '5/15 Hat on', () => { this.anim.hat = 'wool'; this.anim.triggerHat(true); }],
      [11.8, '6/15 Run', () => this.selectKeepPlayAll('run')],
      [15.0, '7/15 Jump', () => this.anim.triggerJump(true)],
      [17.2, '8/15 Hide', () => this.selectKeepPlayAll('hide')],
      [19.8, '9/15 Peek', () => this.anim.triggerPeek()],
      [22.0, '10/15 Sit', () => this.selectKeepPlayAll('sit')],
      [25.0, '11/15 Stand up', () => this.selectKeepPlayAll('stand')],
      [27.0, '12/15 Aim & Draw', () => { this.shootPreviewMode = true; this.drawingLive = true; this.anim.beginShoot(false); }],
      [30.5, '13/15 Shoot!', () => { this.drawingLive = false; this.anim.releaseShoot(this.aimAngle, 0.8); }],
      [33.2, '14/15 Hit!', () => { this.shootPreviewMode = false; this.anim.triggerReaction('hit'); }],
      [35.2, '15/15 Win!', () => this.anim.triggerReaction('win')],
    ];
    let idx = 0;
    for (let i = 0; i < segments.length; i++) {
      if (t >= segments[i][0]) idx = i;
    }
    if (idx !== this.playAllStepIdx) {
      this.playAllStepIdx = idx;
      this.playAllLabel = segments[idx][1];
      segments[idx][2]();
    }
    if (t > 40.5) {
      this.playAllT = 0;
      this.playAllStepIdx = -1;
      this.anim.reset();
      this.anim.weapon = 'none';
      this.hasQuiver = false;
      this.anim.hatWearing = false;
    }
  }

  private selectKeepPlayAll(s: BaseState) {
    this.shootPreviewMode = false;
    this.drawingLive = false;
    this.selectedState = s;
    if (s === 'sit') {
      if (this.anim.baseState !== 'sit') this.anim.toggleSit();
    } else if (s === 'hide') {
      if (this.anim.baseState !== 'hide') this.anim.toggleHide();
    } else {
      this.anim.sitBlend = 0;
      this.anim.hideBlend = 0;
      this.anim.baseState = s;
    }
  }

  private updateShuffle(dt: number) {
    this.shuffleTimer -= dt;
    if (this.shuffleTimer <= 0) {
      this.shuffleTimer = 0.5 + Math.random() * 1.0;
      const roll = Math.random();
      if (roll < 0.55) {
        const states: BaseState[] = ['stand', 'walk', 'run', 'sit', 'hide', 'jump'];
        const s = states[Math.floor(Math.random() * states.length)];
        this.selectedState = s;
        if (s === 'jump') this.anim.triggerJump(Math.random() > 0.4);
        else if (s === 'sit') {
          this.anim.baseState = 'sit';
          this.anim.sitT = 0;
        } else if (s === 'hide') {
          this.anim.baseState = 'hide';
        } else {
          this.anim.sitBlend = 0;
          this.anim.hideBlend = 0;
          this.anim.baseState = s;
        }
      } else if (roll < 0.78) {
        const r: ReactionKind[] = ['hit', 'miss', 'shrug'];
        this.anim.triggerReaction(r[Math.floor(Math.random() * r.length)]);
      } else {
        const ws: WeaponId[] = ['none', 'shortbow', 'longbow', 'crossbow', 'javelin', 'slingshot', 'snowball'];
        this.anim.setWeapon(ws[Math.floor(Math.random() * ws.length)]);
        if (Math.random() < 0.5) this.anim.triggerHat(!this.anim.hatWearing);
      }
    }
  }

  update(rawDt: number) {
    if (this.paused) return;
    const dt = Math.min(rawDt, 0.05) * this.speed;
    if (dt <= 0) return;

    // Smooth aim angle keyboard input
    if (this.keys.up && this.selectedState !== 'hide') this.aimAngle = Math.min(80, this.aimAngle + 55 * rawDt);
    if (this.keys.down) this.aimAngle = Math.max(5, this.aimAngle - 55 * rawDt);
    if (this.keys.jumpHold) {
      this.jumpHoldTime += rawDt;
      if (this.jumpHoldTime > 0.1) this.anim.extendJumpHold(true);
    }

    if (this.playAllActive) this.updatePlayAll(dt);
    if (this.shuffleActive) this.updateShuffle(dt);

    // Auto-loop shoot test every 2s
    if (this.autoLoopShoot && !this.playAllActive) {
      this.autoLoopTimer += dt;
      if (this.autoLoopTimer < 1.2) {
        if (!this.drawingLive) this.startDrawTest();
        this.power = Math.min(100, (this.autoLoopTimer / 1.1) * 100);
      } else if (this.autoLoopTimer >= 1.2 && this.drawingLive) {
        this.releaseDrawTest();
      } else if (this.autoLoopTimer >= 2.0) {
        this.autoLoopTimer = 0;
      }
    }

    this.stepSim(dt);
  }

  private stepSim(dt: number) {
    this.stageTime += dt;
    const input = this.currentInput();
    const isWalkOrRun = Math.abs(input.moveDir) > 0.01 && this.anim.shootPhase !== 'draw' && this.anim.shootPhase !== 'hold' && this.anim.baseState !== 'sit' && this.anim.baseState !== 'hide';
    const spd = input.runHeld ? ANIM_CFG.runSpeed : this.walkSpeed;
    const dx = isWalkOrRun ? input.moveDir * spd * dt : 0;

    if (this.mode === 'free') {
      this.archerX += dx;
      if (this.archerX < -390) {
        this.archerX = -390;
        if (this.selectedState === 'walk' || this.selectedState === 'run') this.anim.requestTurn(1);
      } else if (this.archerX > 360) {
        this.archerX = 360;
        if (this.selectedState === 'walk' || this.selectedState === 'run') this.anim.requestTurn(-1);
      }
    } else {
      // Treadmill mode: archer stays centered, ground scrolls opposite!
      this.archerX = 0;
      this.groundScroll -= dx;
    }

    // Re-loop jump automatically if Jump state is selected in Lab
    if (this.selectedState === 'jump' && this.anim.jumpPhase === 'none' && !this.playAllActive && !this.shuffleActive) {
      this.anim.triggerJump(true);
    }

    this.anim.update(dt, input, dx);
    if (this.selectedState === 'walk') this.oldWalkPhase += dt * 9;

    // Handle emitted events
    for (const ev of this.anim.events) {
      if (ev.type === 'snowPuff') {
        for (let i = 0; i < ev.count; i++) {
          this.particles.push({
            x: this.archerX + (Math.random() - 0.5) * ev.spread,
            y: G - 4,
            vx: (Math.random() - 0.5) * 140,
            vy: -40 - Math.random() * 110,
            life: 0,
            max: 0.45 + Math.random() * 0.25,
            color: '#FFFFFF',
            size: 5 + Math.random() * 5,
            g: 320,
          });
        }
      } else if (ev.type === 'footprint') {
        this.footprints.push({ x: this.archerX, life: 0 });
      } else if (ev.type === 'breathCloud') {
        this.breathClouds.push({ x: this.archerX + ev.x * -this.anim.facing, y: G + ev.y, vx: -this.anim.facing * 35, vy: -22, life: 0 });
      } else if (ev.type === 'confetti') {
        const cols = [PAL.red, PAL.orange2, '#FFFFFF', PAL.gold, '#CADBF5'];
        for (let i = 0; i < ev.count; i++) {
          this.particles.push({
            x: this.archerX + (Math.random() - 0.5) * 300,
            y: G + ev.y,
            vx: (Math.random() - 0.5) * 260,
            vy: -140 - Math.random() * 240,
            life: 0,
            max: 1.8,
            color: cols[Math.floor(Math.random() * cols.length)],
            size: 7,
            g: 280,
          });
        }
      } else if (ev.type === 'fireProjectile') {
        const th = ev.angleDeg * DEG;
        const baseSpd = ev.weapon === 'crossbow' ? 1400 : ev.weapon === 'longbow' ? 1150 : ev.weapon === 'javelin' ? 760 : ev.weapon === 'snowball' ? 560 : 950;
        const v = baseSpd * (0.45 + 0.55 * ev.power01);
        const dir = this.anim.facing;
        this.projectiles.push({
          x: this.archerX + dir * 130,
          y: G - 245,
          vx: dir * v * Math.cos(th),
          vy: -v * Math.sin(th),
          rot: Math.atan2(-Math.sin(th), dir * Math.cos(th)),
          weapon: ev.weapon,
          stuck: false,
          t: 0,
        });
      }
    }

    // Update pickups in Free mode
    for (const pk of this.pickups) {
      if (!pk.active) {
        pk.respawnT -= dt;
        if (pk.respawnT <= 0) pk.active = true;
      } else if (this.mode === 'free' && Math.abs(this.archerX - pk.x) < 60) {
        pk.active = false;
        pk.respawnT = 1.0;
        this.pickupItem(pk.kind);
      }
    }

    // Update projectiles toward practice target
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (!pr.stuck) {
        const px = pr.x;
        pr.vy += 900 * dt;
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.rot = Math.atan2(pr.vy, pr.vx);
        if (px > this.targetX && pr.x <= this.targetX && pr.y > G - 360 && pr.y < G - 80) {
          pr.stuck = true;
          pr.x = this.targetX;
          pr.t = 0;
          this.targetWobbleVel = -2.2;
          this.targetFlash = 0.7;
          for (let k = 0; k < 10; k++) {
            this.particles.push({
              x: pr.x,
              y: pr.y,
              vx: (Math.random() - 0.5) * 260,
              vy: -Math.random() * 200,
              life: 0,
              max: 0.5,
              color: PAL.gold,
              size: 6,
              g: 500,
            });
          }
        } else if (pr.y >= G) {
          pr.y = G;
          pr.stuck = true;
          pr.t = 0;
        }
      } else {
        pr.t += dt;
        if (pr.t > 2.2) this.projectiles.splice(i, 1);
      }
    }

    // Target physics & particles
    this.targetWobbleVel += (-this.targetWobble * 70 - this.targetWobbleVel * 4.5) * dt;
    this.targetWobble += this.targetWobbleVel * dt;
    if (this.targetFlash > 0) this.targetFlash = Math.max(0, this.targetFlash - dt * 2.5);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      pt.vy += pt.g * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life >= pt.max) this.particles.splice(i, 1);
    }
    for (let i = this.footprints.length - 1; i >= 0; i--) {
      this.footprints[i].life += dt;
      if (this.mode === 'treadmill') this.footprints[i].x -= dx;
      if (this.footprints[i].life > 2.2) this.footprints.splice(i, 1);
    }
    for (let i = this.breathClouds.length - 1; i >= 0; i--) {
      const b = this.breathClouds[i];
      b.life += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life > 0.9) this.breathClouds.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ Render
  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    const scale = Math.min(w / 1000, h / 650) * 0.9;
    const camX = this.mode === 'free' ? Math.min(0, this.archerX * 0.35) - 60 : -110;
    const groundScreenY = h * 0.78;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Background by scene
    if (this.scene === 'snow') {
      const grad = ctx.createLinearGradient(0, 0, 0, groundScreenY);
      grad.addColorStop(0, '#BFD3F2');
      grad.addColorStop(0.65, PAL.sky);
      grad.addColorStop(1, '#FFFFFF');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    } else if (this.scene === 'grid') {
      ctx.fillStyle = '#F6F8FC';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#F2F4FA';
      ctx.fillRect(0, 0, w, h);
    }

    // Transform to Lab stage coordinates (ground y=0 at groundScreenY)
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (w / 2 - camX * scale), dpr * groundScreenY);

    const scroll = this.mode === 'treadmill' ? this.groundScroll : 0;

    if (this.scene === 'snow') {
      drawCloud(ctx, -380 + ((scroll * 0.08) % 1200), -340, 48, 0.75);
      drawCloud(ctx, 260 + ((scroll * 0.08) % 1200), -290, 38, 0.65);
      for (let i = -3; i <= 3; i++) {
        const px = i * 420 + (scroll % 420);
        drawPine(ctx, px - 140, 0, 120, '#C5D8F2', '#B7C3E3');
        drawMound(ctx, px + 80, 0, 260, 20, '#F3F5FB');
      }
      ctx.fillStyle = PAL.ground;
      ctx.fillRect(-2000, 0, 4000, 90);
      ctx.fillStyle = PAL.groundSide;
      ctx.fillRect(-2000, 90, 4000, 400);
      ctx.fillStyle = '#F6F7FC';
      ctx.fillRect(-2000, -2, 4000, 8);
    } else if (this.scene === 'grid') {
      ctx.lineWidth = 1;
      for (let gx = -1200; gx <= 1200; gx += 50) {
        const sx = gx + (scroll % 200);
        ctx.strokeStyle = gx % 200 === 0 ? '#CBD5E1' : '#E2E8F0';
        ctx.beginPath();
        ctx.moveTo(sx, -700);
        ctx.lineTo(sx, 300);
        ctx.stroke();
      }
      for (let gy = -600; gy <= 200; gy += 50) {
        ctx.strokeStyle = gy === 0 ? '#64748B' : gy % 200 === 0 ? '#CBD5E1' : '#E2E8F0';
        ctx.lineWidth = gy === 0 ? 2.5 : 1;
        ctx.beginPath();
        ctx.moveTo(-1200, gy);
        ctx.lineTo(1200, gy);
        ctx.stroke();
      }
    } else {
      // Silhouette ground line
      ctx.fillStyle = '#E2E6F0';
      ctx.fillRect(-2000, 0, 4000, 300);
    }

    // Footprints
    for (const fp of this.footprints) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - fp.life / 2.2) * 0.55;
      ctx.fillStyle = PAL.groundDark;
      ctx.beginPath();
      ctx.ellipse(fp.x, 4, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Practice target 600u away
    if (this.scene !== 'silhouette') {
      ctx.save();
      ctx.translate(this.targetX, -CFG.target.standLift);
      ctx.rotate(this.targetWobble);
      drawTarget(ctx, 0.9, TARGET_RED, this.targetFlash);
      ctx.restore();
      ctx.fillStyle = PAL.groundSide;
      roundRectPath(ctx, this.targetX - 150, -CFG.target.standLift + 12, 300, CFG.target.standLift, 20);
      ctx.fill();
    }

    // Stump prop (when sitting on stump)
    if (this.selectedState === 'sit' && this.sitOnStump && this.scene !== 'silhouette') {
      ctx.fillStyle = PAL.brown;
      roundRectPath(ctx, this.archerX - 64, -78, 128, 82, 16);
      ctx.fill();
      ctx.fillStyle = '#B88463';
      roundRectPath(ctx, this.archerX - 70, -86, 140, 22, 10);
      ctx.fill();
    }

    // Respawning pickups
    if (this.scene !== 'silhouette') {
      for (const pk of this.pickups) {
        if (!pk.active) continue;
        const bob = Math.sin(this.stageTime * 2.6 + pk.x) * 6;
        ctx.save();
        ctx.translate(pk.x, -4 + bob);
        if (pk.kind === 'bow') drawBowItem(ctx, 0.52);
        else if (pk.kind === 'quiver') drawQuiverItem(ctx, 0.52);
        else {
          ctx.translate(0, -35);
          ctx.scale(0.45, 0.45);
          drawHatArt(ctx, 'wool', 0, null);
        }
        ctx.restore();
      }
    }

    // Old simple walk side-by-side comparison!
    if (this.overlays.oldWalk) {
      ctx.save();
      ctx.translate(this.archerX + 260, 0);
      drawOldSimpleWalk(ctx, this.oldWalkPhase, Math.abs(Math.sin(this.oldWalkPhase)) * 7, this.anim.weapon === 'shortbow', this.hasQuiver);
      ctx.fillStyle = PAL.grey;
      ctx.font = 'bold 20px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OLD WALK', 0, 32);
      ctx.restore();
    }

    // Current input & pose
    const input = this.currentInput();
    const sil = this.scene === 'silhouette' ? '#2A221F' : null;
    const pose = this.anim.evaluatePose(input, sil);

    // Ghosts overlay (previous & next key pose silhouettes)
    if (this.overlays.ghosts) {
      this.renderGhosts(ctx, pose);
    }

    // Ground shadow
    const shadowAlpha = Math.max(0.15, 0.75 - pose.jumpY / 240);
    ctx.fillStyle = `rgba(180,188,210,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(this.archerX, 6, Math.max(45, 118 - pose.jumpY * 0.35), 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw main archer rig
    ctx.save();
    ctx.translate(this.archerX, 0);
    ctx.scale(this.anim.facing === -1 ? 1 : -1, 1);
    const localPivots = drawRigArcher(ctx, pose);
    ctx.restore();

    // Transform localPivots to stage world coordinates
    const worldPivots = this.toStagePivots(localPivots);

    // Cover rock drawn IN FRONT when Hide + inCoverRock!
    if (this.selectedState === 'hide' && this.inCoverRock && this.scene !== 'silhouette') {
      drawRock(ctx, this.archerX - 10, 4, 340, 215, PAL.groundDark);
    }

    // Angle arc indicator when aiming/shooting
    if (this.shootPreviewMode && this.anim.shootPhase !== 'none' && (this.anim.weapon === 'shortbow' || this.anim.weapon === 'longbow')) {
      const hx = worldPivots.leadHand.x;
      const hy = worldPivots.leadHand.y;
      const dir = this.anim.facing;
      const th = this.aimAngle * DEG;
      ctx.save();
      ctx.strokeStyle = 'rgba(114,98,93,0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      if (dir === -1) ctx.arc(hx, hy, 110, Math.PI, Math.PI + th, false);
      else ctx.arc(hx, hy, 110, 0, -th, true);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PAL.grey;
      ctx.font = 'bold 24px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(this.aimAngle)}°`, hx + dir * 135 * Math.cos(th / 2), hy - 135 * Math.sin(th / 2));
      ctx.restore();
    }

    // Projectiles
    for (const pr of this.projectiles) {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(pr.rot);
      if (pr.weapon === 'snowball') {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      } else {
        drawArrowArt(ctx, pr.weapon === 'javelin' ? 240 : pr.weapon === 'crossbow' ? 120 : 210);
      }
      ctx.restore();
    }

    // Particles & breath clouds
    for (const pt of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const bc of this.breathClouds) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - bc.life / 0.9) * 0.65;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(bc.x, bc.y, 12 + bc.life * 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Update trails & foot locks
    this.updateOverlaysData(pose, worldPivots);

    // Overlays
    if (this.overlays.trails) this.renderTrails(ctx);
    if (this.overlays.footLocks) this.renderFootLocks(ctx, pose, worldPivots);
    if (this.overlays.pivots) this.renderPivots(ctx, worldPivots);

    // Aim target hit check
    void TARGET_CENTER_UP;
    void TARGET_K;
    void TARGET_RY_ART;
    void drawStar;
  }

  private toStagePivots(lp: RigPivots): RigPivots {
    const f = this.anim.facing === -1 ? 1 : -1;
    const xform = (pt: { x: number; y: number }) => ({ x: this.archerX + pt.x * f, y: pt.y });
    return {
      bodyBase: xform(lp.bodyBase),
      headTop: xform(lp.headTop),
      hatTop: xform(lp.hatTop),
      leadShoulder: xform(lp.leadShoulder),
      leadElbow: xform(lp.leadElbow),
      leadHand: xform(lp.leadHand),
      rearShoulder: xform(lp.rearShoulder),
      rearElbow: xform(lp.rearElbow),
      rearHand: xform(lp.rearHand),
      leadFoot: xform(lp.leadFoot),
      rearFoot: xform(lp.rearFoot),
      bowTip: xform(lp.bowTip),
      nock: xform(lp.nock),
      arrowTip: xform(lp.arrowTip),
      backAttach: xform(lp.backAttach),
      beltAttach: xform(lp.beltAttach),
      underArmAttach: xform(lp.underArmAttach),
    };
  }

  private updateOverlaysData(pose: RigPose, wp: RigPivots) {
    // Trails
    if (!this.paused) {
      const push = (arr: TrailPoint[], pt: TrailPoint) => {
        arr.push({ x: pt.x, y: pt.y });
        if (arr.length > 44) arr.shift();
      };
      push(this.trails.leadHand, wp.leadHand);
      push(this.trails.rearHand, wp.rearHand);
      push(this.trails.bowTip, wp.bowTip);
      push(this.trails.hatTop, wp.hatTop);
    }

    // Foot locks slip computation in ground frame
    const groundOff = this.mode === 'treadmill' ? this.groundScroll : 0;
    const leadWorld = wp.leadFoot.x - groundOff;
    const rearWorld = wp.rearFoot.x - groundOff;

    if (pose.legLead.planted && this.prevLeadPlanted && this.prevLeadWorldX !== null && !this.paused) {
      this.leadSlip = Math.abs(leadWorld - this.prevLeadWorldX);
      this.leadLockOk = this.leadSlip < 2.2;
    } else if (!pose.legLead.planted) {
      this.leadSlip = 0;
      this.leadLockOk = true;
    }
    if (pose.legRear.planted && this.prevRearPlanted && this.prevRearWorldX !== null && !this.paused) {
      this.rearSlip = Math.abs(rearWorld - this.prevRearWorldX);
      this.rearLockOk = this.rearSlip < 2.2;
    } else if (!pose.legRear.planted) {
      this.rearSlip = 0;
      this.rearLockOk = true;
    }
    this.prevLeadWorldX = leadWorld;
    this.prevRearWorldX = rearWorld;
    this.prevLeadPlanted = pose.legLead.planted;
    this.prevRearPlanted = pose.legRear.planted;
  }

  private renderGhosts(ctx: CanvasRenderingContext2D, _cur: RigPose) {
    const savedDist = this.anim.walkDist;
    const stride = this.selectedState === 'run' ? ANIM_CFG.runStride : this.walkStride;
    for (const [delta, col] of [
      [-stride * 0.25, 'rgba(59,130,246,0.22)'],
      [stride * 0.25, 'rgba(234,98,39,0.22)'],
    ] as Array<[number, string]>) {
      this.anim.walkDist = Math.max(0, savedDist + delta);
      const gp = this.anim.evaluatePose(this.currentInput(), col);
      ctx.save();
      ctx.translate(this.archerX + (this.mode === 'free' ? -delta * this.anim.facing * 0.45 : 0), 0);
      ctx.scale(this.anim.facing === -1 ? 1 : -1, 1);
      drawRigArcher(ctx, gp);
      ctx.restore();
    }
    this.anim.walkDist = savedDist;
  }

  private renderTrails(ctx: CanvasRenderingContext2D) {
    const defs: Array<[keyof typeof this.trails, string]> = [
      ['leadHand', '#EA6227'],
      ['rearHand', '#D92B27'],
      ['bowTip', '#F2B134'],
      ['hatTop', '#3B82F6'],
    ];
    for (const [k, col] of defs) {
      const pts = this.trails[k];
      if (pts.length < 2) continue;
      ctx.lineCap = 'round';
      for (let i = 1; i < pts.length; i++) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = (i / pts.length) * 0.75;
        ctx.lineWidth = 2 + (i / pts.length) * 4;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  private renderFootLocks(ctx: CanvasRenderingContext2D, pose: RigPose, wp: RigPivots) {
    const boots: Array<[string, { x: number; y: number }, boolean, boolean, number]> = [
      ['L', wp.leadFoot, pose.legLead.planted, this.leadLockOk, this.leadSlip],
      ['R', wp.rearFoot, pose.legRear.planted, this.rearLockOk, this.rearSlip],
    ];
    for (const [label, pt, planted, ok, slip] of boots) {
      ctx.save();
      ctx.translate(pt.x, 4);
      if (planted) {
        ctx.fillStyle = ok ? '#22C55E' : '#EF4444';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, -14, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#4C372A';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${label}:${planted ? `${slip.toFixed(1)}` : 'AIR'}`, 0, 26);
      ctx.restore();
    }
  }

  private renderPivots(ctx: CanvasRenderingContext2D, wp: RigPivots) {
    const items: Array<[string, { x: number; y: number }, string]> = [
      ['Feet', wp.bodyBase, '#4C372A'],
      ['LeadSh', wp.leadShoulder, '#EA6227'],
      ['LeadEl', wp.leadElbow, '#EA6227'],
      ['LeadHd', wp.leadHand, '#F2B134'],
      ['RearSh', wp.rearShoulder, '#D92B27'],
      ['RearEl', wp.rearElbow, '#D92B27'],
      ['RearHd', wp.rearHand, '#EF4444'],
      ['Nock', wp.nock, '#10B981'],
      ['Back', wp.backAttach, '#8B5CF6'],
      ['Belt', wp.beltAttach, '#8B5CF6'],
      ['HatTop', wp.hatTop, '#3B82F6'],
    ];
    for (const [name, pt, col] of items) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#1E293B';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(name, pt.x + 8, pt.y + 4);
    }
  }

  snapshot(): LabSnapshot {
    const stateStr = this.selectedState.toUpperCase();
    const hatStr = this.anim.hatWearing && this.anim.hat !== 'none' ? `On (${this.anim.hat})` : 'Off';
    const faceStr = this.anim.facing === -1 ? 'Left' : 'Right';
    const armDesc =
      this.anim.shootPhase !== 'none'
        ? `Shoot (${this.anim.shootPhase})`
        : `${this.anim.weapon === 'shortbow' || this.anim.weapon === 'longbow' ? (this.bowCarry === 'slung' ? 'Bow slung' : 'Bow low') : this.anim.weapon} · ${this.anim.activeCarryPose}`;
    return {
      scene: this.scene,
      mode: this.mode,
      state: this.selectedState,
      weapon: this.anim.weapon,
      hat: this.anim.hat,
      hatWearing: this.anim.hatWearing,
      hasQuiver: this.hasQuiver,
      bowCarry: this.bowCarry,
      sitOnStump: this.sitOnStump,
      inCoverRock: this.inCoverRock,
      angle: Math.round(this.aimAngle),
      power: Math.round(this.power),
      drawing: this.drawingLive,
      autoLoop: this.autoLoopShoot,
      paused: this.paused,
      speed: this.speed,
      cyclePct: Math.round(this.getCyclePct()),
      walkSpeed: Math.round(this.walkSpeed),
      walkStride: Math.round(this.walkStride),
      overlays: { ...this.overlays },
      playAllActive: this.playAllActive,
      playAllLabel: this.playAllLabel,
      playAllTime: this.playAllT,
      shuffleActive: this.shuffleActive,
      statusLine: `${stateStr} > ${this.anim.subPoseLabel} | Arms: ${armDesc} | Hat: ${hatStr} | Facing: ${faceStr} | ${this.anim.stepsPerSec.toFixed(1)} steps/s`,
      footLockLeadOk: this.leadLockOk,
      footLockRearOk: this.rearLockOk,
      footLockLeadSlip: this.leadSlip,
      footLockRearSlip: this.rearSlip,
    };
  }
}
