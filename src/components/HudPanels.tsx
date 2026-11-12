import { HOTKEYS, keyFor } from '../game/hotkeys';
import { DEFAULT_TUNING, type ShotTuning } from '../game/engine';

// [action, label]
const ANIM_GROUPS: Array<[string, Array<[string, string]>]> = [
  ['Stand', [['play:idle', 'Neutral'], ['play:idle-alert', 'Alert'], ['play:idle-tired', 'Tired'], ['play:idle-bored', 'Bored'], ['play:idle-armed', 'Armed']]],
  ['Move (in place)', [['play:walk-casual', 'Casual'], ['play:walk', 'Walk'], ['play:walk-power', 'Power'], ['play:walk-brisk', 'Brisk'], ['play:walk-tired', 'Tired'], ['play:run', 'Run'], ['play:sneak', 'Sneak'], ['play:creep', 'Creep']]],
  ['Sit', [['play:sit', 'Sit down'], ['play:sit-look', 'Look around'], ['play:sit-shift', 'Shift weight']]],
  ['Hide', [['play:hide', 'Crouch'], ['play:hide-idle', 'Hide idle'], ['peek:left', 'Peek forward'], ['peek:right', 'Peek back']]],
  ['Jump', [['play:jump', 'Jump'], ['play:hop', 'Small hop']]],
  ['React', [['play:nod', 'Nod'], ['play:shake', 'Shake'], ['play:wave', 'Wave'], ['play:look-item', 'Look'], ['play:surprised', 'Surprised'], ['play:disappointed', 'Sad'], ['play:victory', 'Victory'], ['play:celebrate', 'Celebrate']]],
  ['Hat', [['hat:toggle', 'Off / on'], ['hat:drop', 'Drop / pick up']]],
  ['Gear', [['attack', 'Attack'], ['ready', 'Ready / carry'], ['drop:bow', 'Put down bow'], ['drop:quiver', 'Put down quiver']]],
];

export function AnimPanel({ onAction, onClose }: { onAction: (action: string) => void; onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute right-3 top-[116px] z-20 max-h-[72vh] w-[270px] overflow-y-auto rounded-2xl bg-white/90 p-3 shadow-[0_12px_40px_rgba(76,55,42,0.2)] backdrop-blur-md sm:right-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D92B27]">Animations</span>
        <button onClick={onClose} className="text-sm font-black text-[#9A8A84]" aria-label="Close">✕</button>
      </div>
      <p className="mb-2 text-[10px] font-semibold leading-snug text-[#9A8A84]">Every animation from the lab. Hotkeys are shown on the buttons · F1 lists them all. Walk or shoot to return to gameplay.</p>
      <div className="space-y-2">
        {ANIM_GROUPS.map(([group, items]) => (
          <div key={group}>
            <div className="mb-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9A8A84]">{group}</div>
            <div className="flex flex-wrap gap-1">
              {items.map(([action, label]) => {
                const k = keyFor(action);
                return (
                  <button
                    key={action}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onAction(action);
                    }}
                    className="rounded-lg bg-[#EBEDF8] px-2 py-1 text-[11px] font-extrabold text-[#4C372A] transition-colors hover:bg-[#EA6227] hover:text-white"
                  >
                    {label}
                    {k && <span className="ml-1 rounded bg-white/70 px-1 text-[9px] font-black text-[#9A8A84]">{k}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TUNE_ROWS: Array<{ key: 'drawSpeed' | 'reloadSpeed' | 'reloadPause' | 'shotDelay'; label: string; min: number; max: number; step: number; fmt: (v: number) => string; hint: string }> = [
  { key: 'drawSpeed', label: 'Shooting speed', min: 0.3, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', hint: 'how fast the power bar fills / the bow is drawn' },
  { key: 'reloadSpeed', label: 'Reload speed', min: 0.3, max: 4, step: 0.05, fmt: (v) => v.toFixed(2) + '×', hint: 'how fast the hand fetches and nocks the next arrow' },
  { key: 'reloadPause', label: 'Pause before reload', min: 0, max: 2, step: 0.05, fmt: (v) => v.toFixed(2) + ' s', hint: 'rest after a shot before reaching for the quiver' },
  { key: 'shotDelay', label: 'Delay between shots', min: 0, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + ' s', hint: 'minimum time between two arrows leaving the bow' },
];

/** Shooting feel: sliders + switch. Used in the HUD popover and in Settings. */
export function ShotTuneControls({ tune, onTune, reloading }: { tune: ShotTuning; onTune: (p: Partial<ShotTuning>) => void; reloading?: boolean }) {
  return (
    <div className="space-y-2">
      {TUNE_ROWS.map((r) => (
        <label key={r.key} className="block" title={r.hint}>
          <div className="flex items-center justify-between text-[11px] font-extrabold text-[#4C372A]">
            <span>{r.label}</span>
            <span className="tabular-nums text-[#EA6227]">{r.fmt(tune[r.key])}</span>
          </div>
          <input
            type="range"
            className="lab-range w-full"
            min={r.min}
            max={r.max}
            step={r.step}
            value={tune[r.key]}
            onChange={(e) => onTune({ [r.key]: parseFloat(e.target.value) })}
            onPointerUp={(e) => e.currentTarget.blur()}
            aria-label={r.label}
          />
          <div className="text-[9px] font-semibold leading-tight text-[#9A8A84]">{r.hint}</div>
        </label>
      ))}
      <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-[#EBEDF8] px-2 py-1.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-[#EA6227]"
          checked={tune.fireInFlight}
          onChange={(e) => {
            onTune({ fireInFlight: e.target.checked });
            e.currentTarget.blur();
          }}
        />
        <span>
          <span className="block text-[11px] font-extrabold text-[#4C372A]">Shoot while the last arrow is still flying</span>
          <span className="block text-[9px] font-semibold leading-tight text-[#9A8A84]">off = wait until the arrow has landed</span>
        </span>
      </label>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-[#9A8A84]">{reloading === undefined ? '' : reloading ? '↻ reloading…' : '● arrow ready'}</span>
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onTune({ ...DEFAULT_TUNING });
          }}
          className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-[#4C372A] shadow hover:bg-[#EA6227] hover:text-white"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function TunePanel({ tune, onTune, reloading, onClose }: { tune: ShotTuning; onTune: (p: Partial<ShotTuning>) => void; reloading: boolean; onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute right-3 top-[116px] z-20 max-h-[78vh] w-[270px] overflow-y-auto rounded-2xl bg-white/90 p-3 shadow-[0_12px_40px_rgba(76,55,42,0.2)] backdrop-blur-md sm:right-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D92B27]">Shooting</span>
        <button onClick={onClose} className="text-sm font-black text-[#9A8A84]" aria-label="Close">✕</button>
      </div>
      <ShotTuneControls tune={tune} onTune={onTune} reloading={reloading} />
    </div>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  const groups = Array.from(new Set(HOTKEYS.map((h) => h.group)));
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[#4C372A]/25 p-3" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-[860px] overflow-y-auto rounded-3xl bg-white/95 p-5 shadow-[0_20px_60px_rgba(76,55,42,0.3)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tight text-[#4C372A]">Controls</h2>
          <button onClick={onClose} className="rounded-xl bg-[#EBEDF8] px-3 py-1 text-sm font-black text-[#4C372A]">Close (F1)</button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#D92B27]">{g}</div>
              <ul className="space-y-1">
                {HOTKEYS.filter((h) => h.group === g).map((h) => (
                  <li key={h.action + h.key} className="flex items-baseline gap-2 text-[13px] font-semibold text-[#72625D]">
                    <span className="min-w-[64px] shrink-0 rounded-lg bg-[#EBEDF8] px-2 py-0.5 text-center text-[11px] font-black text-[#4C372A]">{h.key}</span>
                    <span>{h.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] font-semibold text-[#9A8A84]">
          Sit / hide / idle / walk style keys cycle through their variants — walking ends a sit, hide or idle hold. Items you put down can be picked up again by walking over them.
        </p>
      </div>
    </div>
  );
}
