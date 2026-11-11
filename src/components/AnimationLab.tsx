import { useEffect, useRef, useState } from 'react';
import { AnimationLab, type LabMode, type LabOverlays, type LabScene, type LabSnapshot } from '../game/lab';
import type { BaseState, BowCarryStyle } from '../game/animator';
import { HAT_LABELS, WEAPON_LABELS, type HatId, type WeaponId } from '../game/rig';

interface Props {
  onBack: () => void;
  initialHat?: HatId;
}

const WEAPONS: WeaponId[] = ['none', 'shortbow', 'longbow', 'crossbow', 'javelin', 'slingshot', 'snowball'];
const HATS: HatId[] = ['none', 'wool', 'archer', 'fur'];
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

export function AnimationLabScreen({ onBack, initialHat }: Props) {
  const labRef = useRef<AnimationLab | null>(null);
  if (!labRef.current) {
    const l = new AnimationLab();
    if (initialHat && initialHat !== 'none') {
      l.anim.hat = initialHat;
      l.anim.hatWearing = true;
    }
    labRef.current = l;
  }
  const lab = labRef.current;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<LabSnapshot>(() => lab.snapshot());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let dpr = 1;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect?.width ?? window.innerWidth));
      const h = Math.max(260, Math.floor(rect?.height ?? window.innerHeight));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const rect = canvas.getBoundingClientRect();
      lab.update(dt);
      lab.render(ctx, rect.width || 800, rect.height || 500, dpr);
      setSnap(lab.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      ro.disconnect();
    };
  }, [lab]);

  // GDD 13.4 Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') lab.keys.shift = true;

      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        lab.keys.left = true;
        lab.selectedState = lab.keys.shift ? 'run' : 'walk';
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        lab.keys.right = true;
        lab.selectedState = lab.keys.shift ? 'run' : 'walk';
      } else if (e.code === 'ArrowUp') {
        if (lab.selectedState === 'hide') lab.anim.triggerPeek();
        else lab.keys.up = true;
      } else if (e.code === 'ArrowDown') {
        lab.keys.down = true;
      } else if (e.code === 'Space') {
        lab.keys.jumpHold = true;
        lab.jumpHoldTime = 0;
        lab.anim.triggerJump(false);
      } else if (e.code === 'KeyX') {
        lab.selectState(lab.selectedState === 'sit' ? 'stand' : 'sit');
      } else if (e.code === 'KeyC') {
        lab.selectState(lab.selectedState === 'hide' ? 'stand' : 'hide');
      } else if (e.code === 'KeyF') {
        lab.startDrawTest();
      } else if (e.code === 'KeyH') {
        if (lab.anim.hatWearing) lab.takeOffHat(e.altKey);
        else lab.putOnHat(e.altKey);
      } else if (e.code === 'KeyQ') {
        lab.hasQuiver = !lab.hasQuiver;
      } else if (e.code === 'KeyE') {
        if (lab.anim.weapon === 'none') lab.pickupItem('bow');
        else if (!lab.hasQuiver) lab.pickupItem('quiver');
        else lab.dropAll();
      } else if (e.code >= 'Digit0' && e.code <= 'Digit6') {
        const idx = Number(e.code.replace('Digit', ''));
        lab.setWeapon(WEAPONS[idx], e.altKey);
      } else if (e.code === 'Digit7') {
        lab.triggerReaction('hit');
      } else if (e.code === 'Digit8') {
        lab.triggerReaction('miss');
      } else if (e.code === 'Digit9') {
        lab.triggerReaction('win');
      } else if (e.code === 'KeyP') {
        lab.paused = !lab.paused;
      } else if (e.code === 'Comma') {
        lab.stepFrames(-1);
      } else if (e.code === 'Period') {
        lab.stepFrames(1);
      } else if (e.code === 'KeyT') {
        lab.speed = lab.speed < 0.9 ? 1 : 0.25;
      } else if (e.code === 'Escape') {
        onBack();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') lab.keys.shift = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        lab.keys.left = false;
        if (!lab.keys.right && (lab.selectedState === 'walk' || lab.selectedState === 'run')) lab.selectedState = 'stand';
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        lab.keys.right = false;
        if (!lab.keys.left && (lab.selectedState === 'walk' || lab.selectedState === 'run')) lab.selectedState = 'stand';
      } else if (e.code === 'ArrowUp') {
        lab.keys.up = false;
      } else if (e.code === 'ArrowDown') {
        lab.keys.down = false;
      } else if (e.code === 'Space') {
        lab.keys.jumpHold = false;
      } else if (e.code === 'KeyF') {
        lab.releaseDrawTest();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [lab, onBack]);

  const cycleWeapon = (dir: number, instant: boolean) => {
    const i = WEAPONS.indexOf(snap.weapon);
    const next = WEAPONS[(i + dir + WEAPONS.length) % WEAPONS.length];
    lab.setWeapon(next, instant);
  };
  const cycleHat = (dir: number, instant: boolean) => {
    const cur = snap.hatWearing ? snap.hat : 'none';
    const i = HATS.indexOf(cur);
    const next = HATS[(i + dir + HATS.length) % HATS.length];
    lab.setHat(next, instant);
  };
  const toggleOverlay = (k: keyof LabOverlays) => {
    lab.overlays[k] = !lab.overlays[k];
    if (k === 'trails' && !lab.overlays.trails) lab.clearTrails();
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-[#EBF0FA] font-display text-[#4C372A] select-none">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4D7E3] bg-white/85 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-xl bg-[#EBEDF8] px-3 py-1.5 text-xs font-extrabold text-[#4C372A] hover:bg-[#DCDFEF]"
          >
            ← Title
          </button>
          <span className="text-base font-black tracking-wide text-[#D92B27]">ANIMATION LAB</span>
          {snap.playAllActive && (
            <span className="rounded-full bg-[#FFF3EA] px-3 py-0.5 text-xs font-extrabold text-[#EA6227]">
              Play all ({snap.playAllTime.toFixed(1)}s / 40s): {snap.playAllLabel}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <label className="flex items-center gap-1.5 rounded-xl bg-[#EBEDF8] px-2.5 py-1">
            <span className="text-[#72625D]">Scene</span>
            <select
              value={snap.scene}
              onChange={(e) => {
                lab.scene = e.target.value as LabScene;
              }}
              className="bg-transparent font-extrabold outline-none"
            >
              <option value="snow">Snow</option>
              <option value="grid">Grid</option>
              <option value="silhouette">Silhouette</option>
            </select>
          </label>

          <div className="flex rounded-xl bg-[#EBEDF8] p-0.5">
            {(['treadmill', 'free'] as LabMode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  lab.mode = m;
                  if (m === 'treadmill') lab.archerX = 0;
                }}
                className={`rounded-lg px-2.5 py-1 capitalize transition-colors ${
                  snap.mode === m ? 'bg-white font-black text-[#EA6227] shadow-sm' : 'text-[#72625D]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <button
            onClick={() => lab.togglePlayAll()}
            className={`rounded-xl px-3 py-1.5 font-extrabold transition-colors ${
              snap.playAllActive ? 'bg-[#EA6227] text-white' : 'bg-[#EBEDF8] hover:bg-[#DCDFEF]'
            }`}
          >
            {snap.playAllActive ? '⏹ Stop Demo' : '▶ Play all'}
          </button>
          <button
            onClick={() => lab.toggleShuffle()}
            className={`rounded-xl px-3 py-1.5 font-extrabold transition-colors ${
              snap.shuffleActive ? 'bg-[#D92B27] text-white' : 'bg-[#EBEDF8] hover:bg-[#DCDFEF]'
            }`}
          >
            {snap.shuffleActive ? '⏹ Stop Shuffle' : '🎲 Shuffle'}
          </button>
          <button onClick={() => lab.reset()} className="rounded-xl bg-[#EBEDF8] px-3 py-1.5 font-extrabold hover:bg-[#DCDFEF]">
            Reset
          </button>
        </div>
      </header>

      {/* Main 3-column Body */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Sidebar: States & Reactions */}
        <aside className="flex w-48 shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#D4D7E3] bg-white/75 p-3 sm:w-56">
          <div>
            <div className="mb-1.5 text-[10px] font-black tracking-[0.2em] text-[#72625D]">STATES</div>
            <div className="grid grid-cols-1 gap-1">
              {(
                [
                  ['stand', 'Stand'],
                  ['walk', 'Walk'],
                  ['run', 'Run'],
                  ['sit', 'Sit'],
                  ['hide', 'Hide'],
                  ['jump', 'Jump'],
                  ['shoot', 'Shoot'],
                ] as Array<[BaseState | 'shoot', string]>
              ).map(([id, label]) => {
                const active = id === 'shoot' ? lab.shootPreviewMode : !lab.shootPreviewMode && snap.state === id;
                return (
                  <button
                    key={id}
                    onClick={() => lab.selectState(id)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs font-extrabold transition-colors ${
                      active ? 'bg-[#FFF3EA] text-[#EA6227] ring-1 ring-[#EA6227]' : 'bg-[#F4F6FC] hover:bg-[#E6E9F5]'
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-[#EA6227]' : 'bg-[#CBD5E1]'}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {snap.state === 'sit' && (
            <label className="flex items-center justify-between rounded-xl bg-[#F4F6FC] px-2.5 py-1.5 text-xs font-bold">
              <span>Sit on stump</span>
              <input
                type="checkbox"
                checked={snap.sitOnStump}
                onChange={(e) => {
                  lab.sitOnStump = e.target.checked;
                }}
              />
            </label>
          )}

          {snap.state === 'hide' && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-[#F4F6FC] p-2 text-xs font-bold">
              <label className="flex items-center justify-between">
                <span>Cover rock</span>
                <input
                  type="checkbox"
                  checked={snap.inCoverRock}
                  onChange={(e) => {
                    lab.inCoverRock = e.target.checked;
                  }}
                />
              </label>
              <button
                onClick={() => lab.anim.triggerPeek()}
                className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
              >
                Peek (↑)
              </button>
              <button
                onClick={() => {
                  lab.anim.beginShoot(true);
                  lab.shootPreviewMode = true;
                }}
                className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
              >
                Pop-up Shot
              </button>
            </div>
          )}

          {(snap.state === 'walk' || snap.state === 'run') && (
            <div className="space-y-2 rounded-xl bg-[#F4F6FC] p-2.5 text-[11px] font-bold">
              <div>
                <div className="flex justify-between">
                  <span>Speed</span>
                  <span className="tabular-nums">{snap.walkSpeed} u/s</span>
                </div>
                <input
                  type="range"
                  min={120}
                  max={450}
                  value={snap.walkSpeed}
                  onChange={(e) => {
                    lab.walkSpeed = Number(e.target.value);
                  }}
                  className="w-full accent-[#EA6227]"
                />
              </div>
              <div>
                <div className="flex justify-between">
                  <span>Stride</span>
                  <span className="tabular-nums">{snap.walkStride} u</span>
                </div>
                <input
                  type="range"
                  min={42}
                  max={105}
                  value={snap.walkStride}
                  onChange={(e) => {
                    lab.walkStride = Number(e.target.value);
                  }}
                  className="w-full accent-[#EA6227]"
                />
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 text-[10px] font-black tracking-[0.2em] text-[#72625D]">REACTIONS</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => lab.triggerReaction('hit')} className="rounded-xl bg-[#F4F6FC] py-1.5 text-xs font-extrabold hover:bg-[#FFF3EA]">
                Hit (7)
              </button>
              <button onClick={() => lab.triggerReaction('miss')} className="rounded-xl bg-[#F4F6FC] py-1.5 text-xs font-extrabold hover:bg-[#FFF3EA]">
                Miss (8)
              </button>
              <button onClick={() => lab.triggerReaction('win')} className="rounded-xl bg-[#F4F6FC] py-1.5 text-xs font-extrabold hover:bg-[#FFF3EA]">
                Win (9)
              </button>
              <button onClick={() => lab.triggerReaction('shrug')} className="rounded-xl bg-[#F4F6FC] py-1.5 text-xs font-extrabold hover:bg-[#FFF3EA]">
                Shrug
              </button>
            </div>
          </div>

          <div className="mt-auto rounded-xl bg-[#F4F6FC] p-2 text-[10px] font-semibold leading-relaxed text-[#72625D]">
            <div>
              <b>←→</b> Walk · <b>Shift</b> Run · <b>Space</b> Jump
            </div>
            <div>
              <b>X</b> Sit · <b>C</b> Hide · <b>F</b> Shoot · <b>H</b> Hat
            </div>
            <div>
              <b>0–6</b> Weapons · <b>P</b> Pause · <b>,/.</b> Step
            </div>
          </div>
        </aside>

        {/* Center Stage */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <canvas ref={canvasRef} className="block h-full w-full" />
          <div className="pointer-events-none absolute left-3 top-2 flex flex-wrap gap-2 text-[11px] font-extrabold">
            <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[#72625D] shadow-xs">
              {snap.mode === 'treadmill' ? 'Treadmill (centered)' : 'Free stage (walk to edge/pickups)'}
            </span>
            {snap.overlays.footLocks && (
              <span
                className={`rounded-full px-2.5 py-0.5 shadow-xs ${
                  snap.footLockLeadOk && snap.footLockRearOk ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}
              >
                Foot Locks: L {snap.footLockLeadSlip.toFixed(1)} · R {snap.footLockRearSlip.toFixed(1)}
              </span>
            )}
          </div>
        </main>

        {/* Right Sidebar: Equipment & Shoot Test */}
        <aside className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#D4D7E3] bg-white/75 p-3 sm:w-60">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-black tracking-[0.2em] text-[#72625D]">
              <span>EQUIPMENT</span>
              <span className="font-semibold normal-case tracking-normal">Alt+click instant</span>
            </div>

            <div className="space-y-2 rounded-xl bg-[#F4F6FC] p-2.5 text-xs font-bold">
              <div className="flex items-center justify-between">
                <span className="text-[#72625D]">Weapon</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => cycleWeapon(-1, e.altKey)}
                    className="h-6 w-6 rounded-lg bg-white font-black shadow-xs hover:bg-[#FFF3EA]"
                  >
                    ‹
                  </button>
                  <span className="min-w-[78px] text-center font-extrabold">{WEAPON_LABELS[snap.weapon]}</span>
                  <button
                    onClick={(e) => cycleWeapon(1, e.altKey)}
                    className="h-6 w-6 rounded-lg bg-white font-black shadow-xs hover:bg-[#FFF3EA]"
                  >
                    ›
                  </button>
                </div>
              </div>

              {(snap.weapon === 'shortbow' || snap.weapon === 'longbow') && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#72625D]">Bow idle/walk</span>
                  <div className="flex rounded-lg bg-white p-0.5 shadow-xs">
                    {(['slung', 'low'] as BowCarryStyle[]).map((style) => (
                      <button
                        key={style}
                        onClick={() => {
                          lab.bowCarry = style;
                        }}
                        className={`rounded-md px-2 py-0.5 capitalize ${
                          snap.bowCarry === style ? 'bg-[#FFF3EA] font-black text-[#EA6227]' : 'text-[#72625D]'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[#72625D]">Hat</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => cycleHat(-1, e.altKey)}
                    className="h-6 w-6 rounded-lg bg-white font-black shadow-xs hover:bg-[#FFF3EA]"
                  >
                    ‹
                  </button>
                  <span className="min-w-[78px] text-center font-extrabold">
                    {snap.hatWearing ? HAT_LABELS[snap.hat] : 'None'}
                  </span>
                  <button
                    onClick={(e) => cycleHat(1, e.altKey)}
                    className="h-6 w-6 rounded-lg bg-white font-black shadow-xs hover:bg-[#FFF3EA]"
                  >
                    ›
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between">
                <span>Quiver (Q)</span>
                <input
                  type="checkbox"
                  checked={snap.hasQuiver}
                  onChange={(e) => {
                    lab.hasQuiver = e.target.checked;
                  }}
                />
              </label>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={(e) => lab.putOnHat(e.altKey)}
                  className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
                >
                  Put on hat
                </button>
                <button
                  onClick={(e) => lab.takeOffHat(e.altKey)}
                  className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
                >
                  Take off hat
                </button>
                <button
                  onClick={() => lab.pickupItem('bow')}
                  className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
                >
                  Pick bow
                </button>
                <button
                  onClick={() => lab.pickupItem('quiver')}
                  className="rounded-lg bg-white py-1 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
                >
                  Pick quiver
                </button>
                <button
                  onClick={() => lab.dropAll()}
                  className="col-span-2 rounded-lg bg-white py-1 font-extrabold text-[#D92B27] shadow-xs hover:bg-red-50"
                >
                  Drop all
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[10px] font-black tracking-[0.2em] text-[#72625D]">SHOOT TEST</div>
            <div className="space-y-2 rounded-xl bg-[#F4F6FC] p-2.5 text-xs font-bold">
              <div>
                <div className="flex justify-between">
                  <span>Angle</span>
                  <span className="tabular-nums">{snap.angle}°</span>
                </div>
                <input
                  type="range"
                  min={snap.weapon === 'crossbow' ? 0 : 5}
                  max={snap.weapon === 'crossbow' ? 45 : 80}
                  value={snap.angle}
                  onChange={(e) => {
                    lab.aimAngle = Number(e.target.value);
                    lab.shootPreviewMode = true;
                    if (lab.anim.shootPhase === 'none') lab.anim.beginShoot(false);
                  }}
                  className="w-full accent-[#EA6227]"
                />
              </div>

              <div>
                <div className="flex justify-between">
                  <span>Power</span>
                  <span className="tabular-nums">{snap.power}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={snap.power}
                  onChange={(e) => {
                    lab.power = Number(e.target.value);
                    lab.startDrawTest();
                  }}
                  className="w-full accent-[#D92B27]"
                />
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  onClick={() => lab.startDrawTest()}
                  className="rounded-lg bg-white py-1.5 font-extrabold shadow-xs hover:bg-[#FFF3EA]"
                >
                  Draw
                </button>
                <button
                  onClick={() => lab.releaseDrawTest()}
                  className="rounded-lg bg-[#EA6227] py-1.5 font-extrabold text-white shadow-xs hover:bg-[#D92B27]"
                >
                  Release
                </button>
                <button
                  onClick={() => lab.cancelDrawTest()}
                  className="rounded-lg bg-white py-1.5 font-extrabold shadow-xs hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>

              <label className="flex items-center justify-between pt-1">
                <span>Auto-loop (2s)</span>
                <input
                  type="checkbox"
                  checked={snap.autoLoop}
                  onChange={(e) => {
                    lab.autoLoopShoot = e.target.checked;
                    lab.autoLoopTimer = 0;
                  }}
                />
              </label>
            </div>
          </div>
        </aside>
      </div>

      {/* Bottom Playback & Overlays Bar */}
      <footer className="border-t border-[#D4D7E3] bg-white/85 px-4 py-2 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
          {/* Playback controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                lab.paused = !lab.paused;
              }}
              className="flex h-8 w-10 items-center justify-center rounded-lg bg-[#EA6227] font-black text-white shadow-xs"
              title="Play / Pause (P)"
            >
              {snap.paused ? '▶' : '⏸'}
            </button>
            <button
              onClick={() => lab.stepFrames(-1)}
              className="h-8 rounded-lg bg-[#EBEDF8] px-2 font-black hover:bg-[#DCDFEF]"
              title="Step Back (,)"
            >
              ◁|
            </button>
            <button
              onClick={() => lab.stepFrames(1)}
              className="h-8 rounded-lg bg-[#EBEDF8] px-2 font-black hover:bg-[#DCDFEF]"
              title="Step Forward (.)"
            >
              |▷
            </button>

            <div className="ml-2 flex items-center gap-1 rounded-lg bg-[#EBEDF8] p-0.5">
              <span className="px-1.5 text-[10px] uppercase text-[#72625D]">Speed</span>
              {SPEEDS.map((sp) => (
                <button
                  key={sp}
                  onClick={() => {
                    lab.speed = sp;
                  }}
                  className={`rounded-md px-1.5 py-0.5 ${
                    snap.speed === sp ? 'bg-white font-black text-[#EA6227] shadow-xs' : 'text-[#72625D]'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>
          </div>

          {/* Cycle Scrubber */}
          <div className="flex min-w-[180px] flex-1 items-center gap-2 max-w-xs">
            <span className="text-[11px] uppercase tracking-wider text-[#72625D]">Cycle</span>
            <input
              type="range"
              min={0}
              max={100}
              value={snap.cyclePct}
              onChange={(e) => lab.setCyclePct(Number(e.target.value))}
              className="w-full accent-[#EA6227]"
            />
            <span className="w-9 text-right tabular-nums">{snap.cyclePct}%</span>
          </div>

          {/* Show Overlays */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[#72625D]">Show:</span>
            {(
              [
                ['pivots', 'Pivots'],
                ['footLocks', 'Foot locks'],
                ['trails', 'Trails'],
                ['ghosts', 'Ghosts'],
                ['oldWalk', 'Old walk'],
              ] as Array<[keyof LabOverlays, string]>
            ).map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-1 rounded-lg bg-[#EBEDF8] px-2 py-1 hover:bg-[#DCDFEF]">
                <input type="checkbox" checked={snap.overlays[k]} onChange={() => toggleOverlay(k)} className="accent-[#EA6227]" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Status line */}
        <div className="mt-1.5 flex items-center justify-between border-t border-[#EBEDF8] pt-1 font-mono text-[11px] font-bold text-[#4C372A]">
          <span>{snap.statusLine}</span>
        </div>
      </footer>
    </div>
  );
}
