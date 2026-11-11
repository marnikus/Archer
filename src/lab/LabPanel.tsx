import { useState } from 'react';
import { Animator, type AnimStatus, type BaseState, type Reaction } from '../rig/animator';
import { DEG, type WeaponKind } from '../rig/rig';

export interface LabUI {
  timeScale: number;
  frozen: boolean;
  debug: { pivots: boolean; anchors: boolean; shoulders: boolean; hips: boolean; grid: boolean };
  ghost: BaseState | 'none';
  panelOpen: boolean;
}

interface Props {
  anim: Animator;
  status: AnimStatus;
  ui: LabUI;
  setUi: React.Dispatch<React.SetStateAction<LabUI>>;
  onExit: () => void;
  onStep: () => void;
}

function Btn({ on, children, onClick, tone = 'neutral', small }: { on?: boolean; children: React.ReactNode; onClick: () => void; tone?: 'neutral' | 'accent' | 'danger'; small?: boolean }) {
  const base = small ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[12px]';
  const look = on
    ? 'bg-[#EA6227] text-white shadow-[0_4px_12px_rgba(234,98,39,0.35)]'
    : tone === 'accent'
      ? 'bg-[#FFF0E6] text-[#B55B1E] hover:bg-[#FFE4D1]'
      : tone === 'danger'
        ? 'bg-[#FBE9E8] text-[#B8231F] hover:bg-[#F7D7D5]'
        : 'bg-[#EBEDF8] text-[#4C372A] hover:bg-[#DCDFEF]';
  return (
    <button type="button" onClick={onClick} className={`rounded-xl font-extrabold leading-tight transition-all active:scale-95 ${base} ${look}`}>
      {children}
    </button>
  );
}

function Section({ title, hint, children, defaultOpen = true }: { title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white/85 shadow-[0_6px_20px_rgba(76,55,42,0.10)] backdrop-blur-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#D92B27]">{title}</div>
          {hint && <div className="text-[10px] font-semibold text-[#9A8A84]">{hint}</div>}
        </div>
        <span className={`text-[#9A8A84] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && <div className="space-y-2 px-3.5 pb-3.5">{children}</div>}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9A8A84]">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, fmt, onChange }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-[11px] font-extrabold text-[#4C372A]">
        <span>{label}</span>
        <span className="font-mono text-[#EA6227]">{fmt(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="lab-range w-full" />
    </label>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between rounded-xl bg-[#F4F5FB] px-2.5 py-1.5 text-[12px] font-extrabold text-[#4C372A]">
      <span>{label}</span>
      <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${on ? 'bg-[#EA6227]' : 'bg-[#D4D7E3]'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function LabPanel({ anim, status: s, ui, setUi, onExit, onStep }: Props) {
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const setParam = <K extends keyof Animator['params']>(k: K, v: Animator['params'][K]) => {
    anim.params[k] = v;
    refresh();
  };
  const base = (b: BaseState, label: string) => (
    <Btn key={b} on={s.base === b} onClick={() => anim.setBase(b)}>
      {label}
    </Btn>
  );
  const react = (r: Reaction, label: string) => (
    <Btn key={r} on={s.reaction === r} tone="accent" onClick={() => anim.react(r)}>
      {label}
    </Btn>
  );
  const weapon = (w: WeaponKind, label: string) => (
    <Btn key={w} on={s.weapon === w} onClick={() => anim.setWeapon(w)}>
      {label}
    </Btn>
  );
  const prm = anim.params;
  const meleeReady = s.weapon !== 'unarmed' && s.weapon !== 'bow';

  return (
    <>
      {!ui.panelOpen && (
        <button
          type="button"
          onClick={() => setUi((p) => ({ ...p, panelOpen: true }))}
          className="absolute right-3 top-3 rounded-2xl bg-white/85 px-4 py-2 text-[12px] font-black text-[#4C372A] shadow-[0_6px_20px_rgba(76,55,42,0.12)] backdrop-blur-sm"
        >
          ☰ Controls
        </button>
      )}
      {ui.panelOpen && (
        <div className="absolute bottom-0 right-0 top-0 flex w-full flex-col gap-2 overflow-y-auto p-3 sm:w-[380px] max-sm:top-auto max-sm:max-h-[52vh] max-sm:rounded-t-3xl max-sm:bg-[#DAE5F7]/80 max-sm:backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onExit} className="rounded-2xl bg-[#4C372A] px-4 py-2 text-[12px] font-black text-white shadow-[0_6px_20px_rgba(76,55,42,0.25)] transition-transform hover:scale-105 active:scale-95">
              ◀ Back to game
            </button>
            <button type="button" onClick={() => setUi((p) => ({ ...p, panelOpen: false }))} className="ml-auto rounded-2xl bg-white/85 px-3 py-2 text-[12px] font-black text-[#4C372A] shadow-[0_6px_20px_rgba(76,55,42,0.12)]">
              Hide ✕
            </button>
          </div>

          <Section title="Motion library" hint="locomotion & body states">
            <Group label="Standing">
              {base('idle', 'Neutral')}
              {base('idle-alert', 'Alert')}
              {base('idle-tired', 'Tired')}
              {base('idle-bored', 'Bored')}
              {base('idle-armed', 'Armed')}
            </Group>
            <Group label="Sitting">
              {base('sit', 'Sit down / idle')}
              {base('sit-look', 'Look around')}
              {base('sit-shift', 'Shift weight')}
              <Btn onClick={() => anim.setBase('idle')} on={false}>
                Stand up
              </Btn>
            </Group>
            <Group label="Locomotion">
              {base('walk-casual', 'Casual walk')}
              {base('walk', 'Walk')}
              {base('walk-power', 'Power walk')}
              {base('walk-brisk', 'Brisk archer walk')}
              {base('walk-tired', 'Tired walk')}
              {base('run', 'Run')}
              {base('sneak', 'Sneak')}
              {base('creep', 'Creep')}
              <Btn
                onClick={() => {
                  anim.facing = anim.facing === -1 ? 1 : -1;
                  refresh();
                }}
              >
                ↔ Turn around
              </Btn>
            </Group>
            <Group label="Hiding & stealth">
              {base('hide', 'Hide crouch')}
              {base('hide-idle', 'Hide idle')}
              {base('peek-left', 'Peek forward')}
              {base('peek-right', 'Peek back')}
              <Btn on={false} onClick={() => anim.setBase('hide-idle')}>
                Return to hide
              </Btn>
            </Group>
            <Group label="Jump">
              <Btn on={s.jumpPhase !== 'none' && s.base !== 'hop'} tone="accent" onClick={() => anim.setBase('jump')}>
                Jump (ready → takeoff → air → fall → land)
              </Btn>
              <Btn tone="accent" onClick={() => anim.setBase('hop')}>
                Small hop
              </Btn>
            </Group>
            <Group label="Reactions">
              {react('nod', 'Nod yes')}
              {react('shake', 'Shake no')}
              {react('wave', 'Wave')}
              {react('look-item', 'Look at item')}
              {react('surprised', 'Surprised')}
              {react('disappointed', 'Disappointed')}
              {react('victory', 'Victory bounce')}
            </Group>
          </Section>

          <Section title="Equipment" hint="pickup & attachment sequences">
            <Group label="Set instantly">
              <Btn on={!s.hasQuiver && !s.hasBow} onClick={() => anim.setEquip(false, false)}>
                None
              </Btn>
              <Btn on={s.hasQuiver && !s.hasBow} onClick={() => anim.setEquip(true, false)}>
                Quiver only
              </Btn>
              <Btn on={!s.hasQuiver && s.hasBow} onClick={() => anim.setEquip(false, true)}>
                Bow only
              </Btn>
              <Btn on={s.hasQuiver && s.hasBow} onClick={() => anim.setEquip(true, true)}>
                Bow + quiver
              </Btn>
            </Group>
            <Group label="Replay pickups (walks to the item)">
              <Btn
                tone="accent"
                on={s.seq === 'pickup-quiver'}
                onClick={() => {
                  if (anim.hasQuiver) anim.hasQuiver = false;
                  anim.pickup('quiver');
                }}
              >
                Quiver pickup
              </Btn>
              <Btn
                tone="accent"
                on={s.seq === 'pickup-bow'}
                onClick={() => {
                  if (anim.hasBow) {
                    anim.hasBow = false;
                    anim.weapon = 'unarmed';
                  }
                  anim.pickup('bow');
                }}
              >
                Bow pickup
              </Btn>
              <Btn tone="accent" on={s.seq === 'armed-ready'} onClick={() => anim.armedReady()}>
                Armed-ready transition
              </Btn>
            </Group>
            <Group label="Remove / unequip">
              <Btn tone="danger" on={s.seq === 'unequip-bow'} onClick={() => anim.unequip('bow')}>
                Remove bow
              </Btn>
              <Btn tone="danger" on={s.seq === 'unequip-quiver'} onClick={() => anim.unequip('quiver')}>
                Remove quiver
              </Btn>
            </Group>
            <Group label="Bow carry while idle / walking">
              <Btn on={prm.carryMode === 'slung'} onClick={() => setParam('carryMode', 'slung')}>
                Slung on the back
              </Btn>
              <Btn on={prm.carryMode === 'hand'} onClick={() => setParam('carryMode', 'hand')}>
                Held in front hand
              </Btn>
            </Group>
          </Section>

          <Section title="Hat" hint="separate prop with its own states">
            <Group label="States">
              <Btn
                on={s.hat === 'head'}
                onClick={() => {
                  anim.hat = 'head';
                  anim.props = anim.props.filter((p) => p.kind !== 'hat');
                }}
              >
                Hat on
              </Btn>
              <Btn tone="accent" on={s.seq === 'hat-off'} onClick={() => anim.hatTakeOff()}>
                Take hat off
              </Btn>
              <Btn
                on={s.hat === 'hand' && !s.seq}
                onClick={() => {
                  if (anim.hat === 'head') anim.hatTakeOff();
                }}
              >
                Hold hat
              </Btn>
              <Btn tone="accent" on={s.seq === 'hat-on'} onClick={() => anim.hatPutOn()}>
                Put hat back on
              </Btn>
              <Btn tone="danger" on={s.seq === 'hat-drop'} onClick={() => anim.hatDrop()}>
                Drop hat
              </Btn>
              <Btn on={s.seq === 'hat-pickup'} onClick={() => anim.hatPickUp()}>
                Pick hat up
              </Btn>
            </Group>
          </Section>

          <Section title="Weapon test set" hint="each weapon changes the whole posture">
            <Group label="Weapon">
              {weapon('unarmed', 'Unarmed')}
              {weapon('bow', 'Bow')}
              <Btn on={s.hasQuiver && !s.hasBow && s.weapon === 'unarmed'} onClick={() => anim.setEquip(true, false)}>
                Quiver only
              </Btn>
              {weapon('crossbow', 'Crossbow')}
              {weapon('spear', 'Spear')}
              {weapon('sword', 'Sword')}
              {weapon('staff', 'Staff')}
              {weapon('axe', 'Axe')}
            </Group>
            <Group label="Carry vs ready">
              <Btn
                on={meleeReady && !s.weaponReady}
                onClick={() => {
                  anim.weaponReady = false;
                  refresh();
                }}
              >
                Carry pose
              </Btn>
              <Btn
                on={meleeReady && s.weaponReady}
                onClick={() => {
                  anim.weaponReady = true;
                  refresh();
                }}
              >
                Ready pose
              </Btn>
              {s.weapon === 'bow' && <span className="self-center text-[10px] font-semibold text-[#9A8A84]">bow ready = shooting panel</span>}
            </Group>
            <Group label="Attack">
              <Btn on={false} onClick={() => anim.attack()}>
                ⚔ Attack with {s.weapon === 'unarmed' ? 'fist' : s.weapon}
              </Btn>
              {s.weapon === 'bow' && <span className="self-center text-[10px] font-semibold text-[#9A8A84]">bow attacks = shooting panel</span>}
            </Group>
          </Section>

          <Section title="Shooting arms" hint="front arm aims · back arm draws">
            <Group label="Aim">
              <Btn on={s.shoot !== 'none' && Math.abs(s.aim - 8) < 3} onClick={() => anim.shootAim(8 * DEG)}>
                Aim low
              </Btn>
              <Btn on={s.shoot !== 'none' && Math.abs(s.aim - 25) < 3} onClick={() => anim.shootAim(25 * DEG)}>
                Aim middle
              </Btn>
              <Btn on={s.shoot !== 'none' && Math.abs(s.aim - 55) < 3} onClick={() => anim.shootAim(55 * DEG)}>
                Aim high
              </Btn>
            </Group>
            <Group label="Draw">
              {[0.25, 0.5, 0.75, 1].map((d) => (
                <Btn key={d} on={(s.shoot === 'draw' || s.shoot === 'hold') && Math.abs(s.draw - d) < 0.04} onClick={() => anim.shootDraw(d)}>
                  Draw {d * 100}%
                </Btn>
              ))}
              <Btn on={s.shoot === 'hold'} tone="accent" onClick={() => anim.shootHold()}>
                Hold draw
              </Btn>
            </Group>
            <Group label="Release">
              <Btn tone="danger" on={s.shoot === 'release'} onClick={() => anim.shootRelease('carry')}>
                Release
              </Btn>
              <Btn on={s.shoot === 'recover'} onClick={() => anim.shootRecover()}>
                Recover
              </Btn>
              <Btn on={false} onClick={() => anim.shootCancel()}>
                Cancel
              </Btn>
            </Group>
          </Section>

          <Section title="Manual sliders" hint="tune timing & follow-through" defaultOpen={false}>
            <Slider label="Walk cycle speed" value={prm.walkSpeed} min={0.3} max={2} step={0.05} fmt={(v) => v.toFixed(2) + '×'} onChange={(v) => setParam('walkSpeed', v)} />
            <Slider label="Run cycle speed" value={prm.runSpeed} min={0.3} max={2} step={0.05} fmt={(v) => v.toFixed(2) + '×'} onChange={(v) => setParam('runSpeed', v)} />
            <Slider
              label="Aim angle"
              value={s.aim}
              min={0}
              max={80}
              step={1}
              fmt={(v) => v.toFixed(0) + '°'}
              onChange={(v) => {
                anim.shoot.aimGoal = v * DEG;
                if (anim.shoot.stage === 'none') anim.shootAim(v * DEG);
              }}
            />
            <Slider
              label="Draw amount"
              value={s.draw}
              min={0}
              max={1}
              step={0.01}
              fmt={(v) => (v * 100).toFixed(0) + '%'}
              onChange={(v) => {
                anim.shootDraw(v, true);
                if (v < 0.02) anim.shootAim();
              }}
            />
            <Slider label="Torso tension" value={prm.torsoTension} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('torsoTension', v)} />
            <Slider label="Head lag" value={prm.headLag} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('headLag', v)} />
            <Slider label="Beard follow" value={prm.beardFollow} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('beardFollow', v)} />
            <Slider label="Hand stability (full draw)" value={prm.handStability} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('handStability', v)} />
            <Slider label="Hold tension" value={prm.holdTension} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('holdTension', v)} />
            <Slider label="Release strength" value={prm.releaseStrength} min={0} max={1} step={0.01} fmt={(v) => v.toFixed(2)} onChange={(v) => setParam('releaseStrength', v)} />
            <Slider label="Recover speed" value={prm.recoverSpeed} min={0.5} max={2} step={0.05} fmt={(v) => v.toFixed(2) + '×'} onChange={(v) => setParam('recoverSpeed', v)} />
          </Section>

          <Section title="Debug viewing" hint="tuning helpers, not for the final game" defaultOpen={false}>
            <Toggle label="Show pivot points" on={ui.debug.pivots} onChange={(v) => setUi((p) => ({ ...p, debug: { ...p.debug, pivots: v } }))} />
            <Toggle label="Show hand anchors" on={ui.debug.anchors} onChange={(v) => setUi((p) => ({ ...p, debug: { ...p.debug, anchors: v } }))} />
            <Toggle label="Show shoulder line" on={ui.debug.shoulders} onChange={(v) => setUi((p) => ({ ...p, debug: { ...p.debug, shoulders: v } }))} />
            <Toggle label="Show hip weight shift" on={ui.debug.hips} onChange={(v) => setUi((p) => ({ ...p, debug: { ...p.debug, hips: v } }))} />
            <Toggle label="Reference grid" on={ui.debug.grid} onChange={(v) => setUi((p) => ({ ...p, debug: { ...p.debug, grid: v } }))} />
            <Group label="Playback">
              {[1, 0.5, 0.25, 0.1].map((t) => (
                <Btn key={t} small on={ui.timeScale === t && !ui.frozen} onClick={() => setUi((p) => ({ ...p, timeScale: t, frozen: false }))}>
                  {t === 1 ? 'Normal' : `${t}× slow`}
                </Btn>
              ))}
              <Btn small on={ui.frozen} tone="accent" onClick={() => setUi((p) => ({ ...p, frozen: !p.frozen }))}>
                {ui.frozen ? 'Frozen' : 'Freeze frame'}
              </Btn>
              <Btn small onClick={onStep}>
                Step 1 frame
              </Btn>
            </Group>
            <Group label="Ghost compare (side by side)">
              <select
                value={ui.ghost}
                onChange={(e) => setUi((p) => ({ ...p, ghost: e.target.value as LabUI['ghost'] }))}
                className="w-full rounded-xl bg-[#EBEDF8] px-2.5 py-1.5 text-[12px] font-extrabold text-[#4C372A]"
              >
                <option value="none">No ghost</option>
                {(['idle', 'idle-alert', 'idle-tired', 'walk-casual', 'walk', 'walk-power', 'walk-brisk', 'walk-tired', 'run', 'sneak', 'creep', 'hide-idle', 'sit'] as BaseState[]).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Group>
          </Section>
        </div>
      )}
    </>
  );
}
