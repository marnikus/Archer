import type { Best, Mode, Result } from '../game/engine';
import { HAT_LABELS, type HatId } from '../game/rig';

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`screen-card pointer-events-auto w-[min(92vw,520px)] rounded-[28px] bg-white/85 p-6 text-[#4C372A] shadow-[0_20px_60px_rgba(76,55,42,0.18)] backdrop-blur-md sm:p-8 ${className}`}>
      {children}
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-block min-w-[26px] rounded-md bg-[#EBEDF8] px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-[#4C372A] shadow-[inset_0_-2px_0_#D4D7E3]">{children}</kbd>;
}

export function Controls({ touch }: { touch: boolean }) {
  if (touch) {
    return (
      <ul className="space-y-1.5 text-sm font-semibold text-[#72625D]">
        <li>
          <span className="text-[#4C372A]">◀ ▶</span> buttons — walk
        </li>
        <li>
          <span className="text-[#4C372A]">Drag back</span> on the right side — aim &amp; power, release to shoot
        </li>
        <li>Walk into the bow and quiver to pick them up</li>
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm font-semibold text-[#72625D]">
      <span className="flex gap-1">
        <Key>←</Key>
        <Key>→</Key>
      </span>
      <span>Walk (hold Shift to Run)</span>
      <span className="flex gap-1">
        <Key>↑</Key>
        <Key>↓</Key>
      </span>
      <span>Aim angle (or W / S)</span>
      <span>
        <Key>SPACE</Key>
      </span>
      <span>Hold to draw · release to shoot</span>
      <span className="flex gap-1">
        <Key>H</Key>
        <Key>V</Key>
      </span>
      <span>Hat on/off · Hop</span>
      <span>
        <Key>ESC</Key>
      </span>
      <span>Pause</span>
    </ul>
  );
}

interface TitleProps {
  mode: Mode;
  setMode: (m: Mode) => void;
  hat: HatId;
  setHat: (h: HatId) => void;
  onPlay: () => void;
  onOpenLab: () => void;
  best: Best | null;
  touch: boolean;
}

const HATS: HatId[] = ['wool', 'archer', 'fur', 'none'];

export function TitleScreen({ mode, setMode, hat, setHat, onPlay, onOpenLab, best, touch }: TitleProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center md:justify-start md:pl-[6vw]">
      <Card>
        <div className="mb-1 text-xs font-extrabold uppercase tracking-[0.3em] text-[#72625D]">A calm winter skill game</div>
        <h1 className="title-text text-5xl font-black leading-[0.95] tracking-tight text-[#D92B27] sm:text-6xl">
          Archer&apos;s
          <br />
          <span className="text-[#4C372A]">Long Shot</span>
        </h1>
        <p className="mt-3 text-sm font-semibold leading-relaxed text-[#72625D] sm:text-base">
          Walk left, find your bow and arrows, then land <span className="font-black text-[#EA6227]">10 hits in a row</span>. A miss resets the streak — but nobody&apos;s keeping score of that.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(
            [
              ['normal', 'Normal', 'Unlimited arrows · aim dots'],
              ['hard', 'Hard', '15 arrows · no dots · wild wind'],
            ] as Array<[Mode, string, string]>
          ).map(([m, label, desc]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-2xl border-2 px-3 py-2 text-left transition-all ${
                mode === m ? 'border-[#EA6227] bg-[#FFF3EA] shadow-[0_6px_18px_rgba(234,98,39,0.2)]' : 'border-[#E6E9F5] bg-white/60 hover:border-[#CADBF5]'
              }`}
            >
              <div className="text-base font-black">{label}</div>
              <div className="text-[11px] font-semibold text-[#72625D]">{desc}</div>
            </button>
          ))}
        </div>

        {/* Hat selector */}
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[#EBEDF8]/80 px-3 py-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#72625D]">Hat</span>
          <div className="flex flex-wrap gap-1">
            {HATS.map((h) => (
              <button
                key={h}
                onClick={() => setHat(h)}
                className={`rounded-xl px-2.5 py-1 text-xs font-extrabold transition-all ${
                  hat === h ? 'bg-[#EA6227] text-white shadow-xs' : 'bg-white/80 text-[#4C372A] hover:bg-white'
                }`}
              >
                {HAT_LABELS[h]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onPlay}
            className="play-btn flex-1 rounded-2xl bg-[#EA6227] py-3.5 text-xl font-black text-white shadow-[0_10px_24px_rgba(234,98,39,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            ▶ Play
          </button>
          <button
            onClick={onOpenLab}
            className="rounded-2xl border-2 border-[#CADBF5] bg-white/85 px-4 py-3 text-sm font-black text-[#4C372A] shadow-xs transition-transform hover:scale-[1.02] hover:bg-white active:scale-[0.98]"
            title="Open Animation Lab (Section 13)"
          >
            Animation Lab
          </button>
        </div>

        {best && (
          <div className="mt-2 text-center text-xs font-bold text-[#72625D]">
            Best ({mode}): {best.score.toLocaleString()} pts · {best.arrows} arrows · {fmtTime(best.time)}
          </div>
        )}
        <div className="mt-4 border-t border-[#E6E9F5] pt-3">
          <Controls touch={touch} />
        </div>
      </Card>
    </div>
  );
}

interface PauseProps {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
  muted: boolean;
  onMute: () => void;
  touch: boolean;
}

export function PauseScreen({ onResume, onRestart, onTitle, muted, onMute, touch }: PauseProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#4C372A]/20">
      <Card>
        <h2 className="text-4xl font-black tracking-tight">Paused</h2>
        <div className="mt-4">
          <Controls touch={touch} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={onResume} className="col-span-2 rounded-2xl bg-[#EA6227] py-3 text-lg font-black text-white shadow-[0_10px_24px_rgba(234,98,39,0.35)]">
            Resume
          </button>
          <button onClick={onRestart} className="btn-soft">
            Restart
          </button>
          <button onClick={onMute} className="btn-soft">
            {muted ? '🔇 Sound off' : '🔊 Sound on'}
          </button>
          <button onClick={onTitle} className="btn-soft col-span-2">
            Quit to title
          </button>
        </div>
      </Card>
    </div>
  );
}

interface ResultProps {
  result: Result;
  best: Best | null;
  mode: Mode;
  onReplay: () => void;
  onTitle: () => void;
}

export function VictoryScreen({ result, best, mode, onReplay, onTitle }: ResultProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <Card className="text-center">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-[#72625D]">10 in a row</div>
        <h2 className="title-text mt-1 text-5xl font-black tracking-tight text-[#D92B27]">You did it!</h2>
        <div className="mt-3 flex justify-center gap-2 text-5xl">
          {[0, 1, 2].map((i) => (
            <span key={i} className={`star ${i < result.stars ? 'text-[#F2B134]' : 'text-[#DCDFEF]'}`} style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
              ★
            </span>
          ))}
        </div>
        <div className="mt-1 text-xs font-bold text-[#72625D]">★★★ ≤ 12 arrows · ★★ ≤ 20 arrows</div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ['Score', result.score.toLocaleString()],
            ['Arrows', String(result.arrows)],
            ['Time', fmtTime(result.time)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-[#EBEDF8] px-2 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#72625D]">{k}</div>
              <div className="text-xl font-black tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm font-bold text-[#72625D]">
          {result.perfects > 0 && <span>{result.perfects} bullseye{result.perfects > 1 ? 's' : ''} · </span>}
          {result.isBest ? <span className="text-[#EA6227]">New best score!</span> : best ? <span>Best ({mode}): {best.score.toLocaleString()}</span> : null}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onReplay} className="rounded-2xl bg-[#EA6227] py-3 text-lg font-black text-white shadow-[0_10px_24px_rgba(234,98,39,0.35)]">
            Replay
          </button>
          <button onClick={onTitle} className="btn-soft">
            Title
          </button>
        </div>
      </Card>
    </div>
  );
}

export function GameOverScreen({ result, onReplay, onTitle }: Omit<ResultProps, 'best' | 'mode'>) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#4C372A]/15">
      <Card className="text-center">
        <div className="text-xs font-extrabold uppercase tracking-[0.3em] text-[#72625D]">Hard mode</div>
        <h2 className="mt-1 text-4xl font-black tracking-tight">Out of arrows</h2>
        <p className="mt-2 text-sm font-semibold text-[#72625D]">The quiver is empty. Deep breath, and try again.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {[
            ['Score', result.score.toLocaleString()],
            ['Time', fmtTime(result.time)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-[#EBEDF8] px-2 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#72625D]">{k}</div>
              <div className="text-xl font-black tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onReplay} className="rounded-2xl bg-[#EA6227] py-3 text-lg font-black text-white shadow-[0_10px_24px_rgba(234,98,39,0.35)]">
            Retry
          </button>
          <button onClick={onTitle} className="btn-soft">
            Title
          </button>
        </div>
      </Card>
    </div>
  );
}
