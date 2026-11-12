import { useEffect, useState } from 'react';
import type { HudState, ShotTuning } from '../game/engine';
import type { WeaponKind } from '../rig/rig';
import { WEAPON_SLOTS } from '../game/hotkeys';
import { AnimPanel, HelpPanel, TunePanel } from './HudPanels';
import { WeaponIcon } from './WeaponIcon';

interface Props {
  s: HudState;
  onPause: () => void;
  onMute: () => void;
  onMove: (dir: number) => void;
  onAction: (action: string) => void;
  onEquip: (kind: WeaponKind) => void;
  onSettings?: () => void;
  onZoom: (v: number) => void;
  onTune: (p: Partial<ShotTuning>) => void;
}

const QuiverIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 40 48" className={className} aria-hidden>
    <path d="M14 6l3 14M20 4l1 16M26 6l-2 14" stroke="#72625D" strokeWidth="4" strokeLinecap="round" />
    <path d="M10 4l7 4-7 4zM30 4l-7 4 7 4zM16 2l5 5 5-5" fill="#D93829" />
    <rect x="8" y="18" width="24" height="28" rx="8" fill="#813F2E" />
    <rect x="6" y="16" width="28" height="9" rx="4" fill="#9A4E38" />
  </svg>
);

const BowIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 40 48" className={className} aria-hidden>
    <path d="M14 5l-2 38" stroke="#fff" strokeWidth="2" />
    <path d="M14 5c14 6 18 28 -2 38c12-10 10-26 2-38z" fill="#D92B27" />
    <path d="M12 5l6 2M10 43l7 .5" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function HUD({ s, onPause, onMute, onMove, onAction, onEquip, onSettings, onZoom, onTune }: Props) {
  const [animOpen, setAnimOpen] = useState(false);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'F1') {
        e.preventDefault();
        setHelpOpen((o) => !o);
      } else if (e.code === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // the world is mirrored on screen: the start is on the left, the target on the right
  const pct = (x: number) => `${100 - ((x - s.worldMin) / s.worldW) * 100}%`;
  const windStr = Math.abs(s.wind);
  const windArrows = Math.min(4, Math.max(1, Math.ceil(windStr / 30)));
  const bannerColor =
    s.banner?.kind === 'great'
      ? 'text-[#D92B27]'
      : s.banner?.kind === 'good'
        ? 'text-[#EA6227]'
        : s.banner?.kind === 'final'
          ? 'text-[#D9951E]'
          : s.banner?.kind === 'bad'
            ? 'text-[#72625D]'
            : 'text-[#4C372A]';

  return (
    <div className="pointer-events-none absolute inset-0 select-none text-[#4C372A]">
      {/* cutscene: letterbox bars */}
      {s.cut && (
        <>
          <div className="absolute inset-x-0 top-0 h-[11%] bg-black/85" />
          <div className="absolute inset-x-0 bottom-0 flex h-[11%] items-center justify-center bg-black/85 text-[12px] font-bold tracking-widest text-white/70">SPACE · SKIP</div>
        </>
      )}

      {/* top-left: streak + score (snow) / Spartan fight (desert) */}
      <div className="absolute left-3 top-3 flex flex-col gap-2 sm:left-5 sm:top-5">
        {s.stage === 'desert' && (
          <div className="hud-card flex flex-col gap-1.5 px-3 py-2 sm:px-4">
            <div className="text-[11px] font-extrabold tracking-[0.2em] text-[#8A5A1E]">THE DESERT GATE</div>
            {s.foe && s.foe.alive ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🛡</span>
                  <span className="text-[11px] font-extrabold tracking-[0.16em] text-[#72625D]">SPARTAN LIVES</span>
                  <div className="flex gap-1">
                    {Array.from({ length: s.foe.max }).map((_, i) => (
                      <span key={i} className={`block text-base leading-none transition-all ${i < s.foe!.hp ? '' : 'opacity-25 grayscale'}`}>
                        ❤️
                      </span>
                    ))}
                  </div>
                  <span className="text-sm font-black tabular-nums text-[#AC2A22]">
                    {s.foe.hp}/{s.foe.max}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-extrabold">
                  <span className={s.foe.open && s.foe.state !== 'idle' && s.foe.state !== 'notice' ? 'rounded bg-[#EA6227] px-1.5 py-0.5 text-white' : 'rounded bg-[#EBEDF8] px-1.5 py-0.5 text-[#72625D]'}>{s.foe.open && s.foe.state !== 'idle' && s.foe.state !== 'notice' ? 'OPEN — SHOOT!' : s.foe.state === 'idle' ? 'UNAWARE' : s.foe.state === 'notice' ? 'NOTICED YOU' : 'GUARDING'}</span>
                  <span className="flex gap-0.5" title="Blocked arrows → he attacks">
                    {Array.from({ length: s.foe.angerMax }).map((_, i) => (
                      <span key={i} className={`block h-2.5 w-2.5 rounded-full ${i < s.foe!.anger ? 'bg-[#D92B27]' : 'bg-[#DCDFEF]'}`} />
                    ))}
                  </span>
                  <span className="text-[#9A8A84]">anger</span>
                </div>
              </>
            ) : (
              <div className="text-[12px] font-bold text-[#4C372A]">The Spartan has fallen — follow the path past the ruins →</div>
            )}
          </div>
        )}
        <div className={`hud-card items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 ${s.stage === 'desert' ? 'hidden' : 'flex'}`}>
          <span className="text-[11px] font-extrabold tracking-[0.2em] text-[#72625D]">STREAK</span>
          <div className="flex items-center gap-1 sm:gap-1.5">
            {Array.from({ length: s.goal }).map((_, i) => {
              const filled = i < s.streak;
              const last = i === s.streak - 1;
              const col = s.streak >= 7 ? 'bg-[#F2B134]' : s.streak >= 3 ? 'bg-[#D92B27]' : 'bg-[#EA6227]';
              return (
                <span
                  key={filled && last ? `p${i}-${s.pipKey}` : `p${i}`}
                  className={`block h-3 w-3 rounded-full transition-colors duration-300 sm:h-3.5 sm:w-3.5 ${
                    filled ? `${col} ${last ? 'pip-pop' : ''}` : 'bg-[#DCDFEF]'
                  }`}
                />
              );
            })}
          </div>
          <span className="text-sm font-extrabold tabular-nums">
            {s.streak}/{s.goal}
          </span>
        </div>
        <div className="hud-card flex items-center gap-4 px-3 py-1.5 text-sm font-bold sm:px-4">
          <span>
            Score <span className="tabular-nums text-[#D37330]">{s.score.toLocaleString()}</span>
          </span>
          <span>
            Arrows <span className="tabular-nums">{s.arrowsUsed}</span>
            {s.arrowsLeft >= 0 && <span className={`ml-1 ${s.arrowsLeft <= 3 ? 'text-[#D92B27]' : 'text-[#72625D]'}`}>({s.arrowsLeft} left)</span>}
          </span>
        </div>
      </div>

      {/* top-center: progress map */}
      <div className="hud-card absolute left-1/2 top-3 hidden w-[300px] -translate-x-1/2 px-5 pb-2 pt-3 md:block lg:w-[380px]">
        <div className="relative h-2 rounded-full bg-[#DCDFEF]">
          <div className="absolute inset-y-0 right-0 rounded-full bg-[#CADBF5]" style={{ width: `${((s.archerX - s.worldMin) / s.worldW) * 100}%` }} />
          <span className="map-icon" style={{ left: pct(s.targetX) }}>
            {s.stage === 'desert' ? '🛡' : '🎯'}
          </span>
          {s.bowX >= 0 && (
            <span className="map-icon" style={{ left: pct(s.bowX) }}>
              <BowIcon className="h-5 w-4" />
            </span>
          )}
          {s.quiverX >= 0 && (
            <span className="map-icon" style={{ left: pct(s.quiverX) }}>
              <QuiverIcon className="h-5 w-4" />
            </span>
          )}
          <span className="map-icon z-10 text-xl" style={{ left: pct(s.archerX) }}>
            🧔
          </span>
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-extrabold tracking-widest text-[#72625D]">
          <span>START</span>
          <span>TARGET</span>
        </div>
      </div>

      {/* top-right: buttons */}
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2 sm:right-5 sm:top-5">
        <button className="hud-btn" onClick={onMute} aria-label="Toggle sound" title="Sound (M)">
          {s.muted ? '🔇' : '🔊'}
        </button>
        <button className="hud-btn" onClick={onPause} aria-label="Pause" title="Pause (Esc)">
          ⏸
        </button>
        <button
          className="hud-btn"
          onClick={(e) => {
            e.currentTarget.blur();
            setTuneOpen((o) => !o);
            setAnimOpen(false);
          }}
          aria-label="Shooting settings"
          title="Shooting speed, reload, delay between shots"
        >
          🎯
        </button>
        <button
          className="hud-btn"
          onClick={() => {
            setAnimOpen((o) => !o);
            setTuneOpen(false);
          }}
          aria-label="Animations"
          title="Play animations"
        >
          🎬
        </button>
        <button className="hud-btn" onClick={() => setHelpOpen(true)} aria-label="Controls" title="Controls (F1)">
          ⌨
        </button>
        {onSettings && (
          <button className="hud-btn" onClick={onSettings} aria-label="Settings" title="Settings · character layer order">
            ⚙
          </button>
        )}
      </div>
      {/* camera zoom bar (global, remembered) */}
      <div className="hud-card pointer-events-auto absolute right-3 top-[60px] flex items-center gap-2 px-3 py-1.5 sm:right-5 sm:top-[72px]" title="Camera zoom (− / +)">
        <span className="text-sm">🔍</span>
        <input type="range" className="lab-range w-28" min={0.5} max={1.3} step={0.02} value={s.zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} aria-label="Camera zoom" />
        <span className="w-9 text-right text-[11px] font-extrabold tabular-nums text-[#72625D]">{Math.round(s.zoom * 100)}%</span>
      </div>
      {tuneOpen && <TunePanel tune={s.tune} onTune={onTune} reloading={s.reloading} onClose={() => setTuneOpen(false)} />}
      {animOpen && <AnimPanel onAction={onAction} onClose={() => setAnimOpen(false)} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}

      {/* stance readout (sneak / sit / walk style …) */}
      {s.stance && (
        <div className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-white/75 px-3 py-0.5 text-[11px] font-extrabold tracking-wide text-[#72625D] backdrop-blur-sm">
          {s.stance}
        </div>
      )}

      {/* bottom-left: inventory */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2 sm:bottom-5 sm:left-5">
        <div className="flex items-end gap-2">
          <div key={`b${s.bowKey}`} className={`inv-slot ${s.hasBow ? 'inv-on pip-pop' : ''}`} title="Bow">
            <BowIcon className="h-9 w-7" />
            {s.hasBow && <span className="inv-check">✓</span>}
          </div>
          <div key={`q${s.quiverKey}`} className={`inv-slot ${s.hasQuiver ? 'inv-on pip-pop' : ''}`} title="Quiver">
            <QuiverIcon className="h-9 w-7" />
            {s.hasQuiver && <span className="inv-check">✓</span>}
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5">
          {WEAPON_SLOTS.map((w) => {
            const locked = w.kind === 'bow' && !s.hasBow;
            return (
              <button
                key={w.kind}
                type="button"
                title={`${w.label} (${w.key})${locked ? ' — find the bow first' : ''}`}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onEquip(w.kind);
                }}
                className={`wslot ${s.weapon === w.kind ? 'wslot-on' : ''} ${locked ? 'wslot-locked' : ''}`}
              >
                <WeaponIcon kind={w.kind} size={34} />
                {!s.touch && <span className="wslot-key">{w.key}</span>}
                {s.weapon === w.kind && w.kind !== 'bow' && w.kind !== 'unarmed' && s.weaponReady && <span className="wslot-ready">ready</span>}
              </button>
            );
          })}
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onAction('attack');
            }}
            className="wslot ml-1 w-14 !bg-[#EA6227] text-sm font-black text-white"
            title="Attack (F)"
          >
            ⚔
            {!s.touch && <span className="wslot-key !bg-white/80">F</span>}
          </button>
        </div>
      </div>

      {/* bottom-center: power meter */}
      <div
        className={`absolute bottom-5 left-1/2 w-[260px] -translate-x-1/2 transition-all duration-200 sm:bottom-7 sm:w-[340px] ${
          s.charging ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="hud-card px-4 pb-3 pt-2">
          <div className="mb-1 flex justify-between text-[11px] font-extrabold tracking-[0.2em] text-[#72625D]">
            <span>POWER</span>
            <span className="tabular-nums">{Math.round(s.power)}%</span>
          </div>
          <div className="relative h-4 overflow-visible rounded-full bg-[#E6E9F5]">
            <div className="absolute inset-0 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${s.power}%`,
                  background: 'linear-gradient(90deg,#8FBDF4 0%,#EA6227 60%,#D92B27 100%)',
                }}
              />
            </div>
            {s.sweet >= 0 && (
              <div className="absolute -top-2 h-8 w-0.5 -translate-x-1/2" style={{ left: `${s.sweet}%` }}>
                <div className="absolute -left-[5px] -top-1 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#4C372A]" />
                <div className="h-full w-full bg-[#4C372A]/70" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* bottom-right: readouts */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2 sm:bottom-5 sm:right-5">
        {s.windMax > 0 && (
          <div className="hud-card flex items-center gap-2 px-3 py-1.5 text-sm font-bold">
            <span className="text-[11px] font-extrabold tracking-[0.2em] text-[#72625D]">WIND</span>
            {windStr < 6 ? (
              <span className="text-[#72625D]">calm</span>
            ) : (
              <>
                <span className="text-[#D92B27]">{(s.wind > 0 ? '←' : '→').repeat(windArrows)}</span>
                <span className="tabular-nums">{Math.round(windStr / 30) || 1}</span>
              </>
            )}
          </div>
        )}
        <div className="hud-card flex items-center gap-3 px-3 py-1.5 text-sm font-bold">
          {s.armed && (
            <span>
              <span className="text-[#72625D]">Angle</span> <span className="tabular-nums">{s.angle}°</span>
            </span>
          )}
          <span>
            <span className="text-[#72625D]">Dist</span> <span className="tabular-nums">{s.distance.toLocaleString()} m</span>
          </span>
        </div>
      </div>

      {/* banner */}
      {s.banner && (
        <div key={s.banner.key} className="banner absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
          <div className={`banner-text text-4xl font-black tracking-tight sm:text-6xl ${bannerColor}`}>{s.banner.text}</div>
          {s.banner.sub && <div className="mt-1 text-base font-bold text-[#72625D] sm:text-lg">{s.banner.sub}</div>}
        </div>
      )}

      {/* touch controls */}
      {s.touch && (
        <div className="pointer-events-auto absolute bottom-24 right-4 flex gap-3 sm:bottom-28">
          {[
            [-1, '◀'],
            [1, '▶'],
          ].map(([d, label]) => (
            <button
              key={d}
              className="touch-btn"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                onMove(d as number);
              }}
              onPointerUp={() => onMove(0)}
              onPointerCancel={() => onMove(0)}
              onPointerLeave={() => onMove(0)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {s.touch && s.armed && !s.charging && (
        <div className="absolute bottom-28 left-6 text-left text-xs font-bold text-[#72625D]/80 sm:bottom-32">
          drag back here
          <br />
          to aim &amp; shoot
        </div>
      )}
    </div>
  );
}
