import { useEffect } from 'react';
import { LayerEditor } from './LayerEditor';

export function SettingsScreen({ onExit, zoom, onZoom }: { onExit: () => void; zoom: number; onZoom: (v: number) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-gradient-to-b from-[#E9F0FC] to-[#CADBF5] p-3 font-display sm:p-5">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.25em] text-[#D92B27]">Settings</div>
          <h1 className="text-2xl font-black tracking-tight text-[#4C372A]">Character layers</h1>
          <p className="text-[12px] font-semibold text-[#72625D]">Choose exactly which part draws in front of which. Saved automatically and used by the game and the lab.</p>
        </div>
        <button onClick={onExit} className="rounded-2xl bg-white/85 px-4 py-2 text-sm font-black text-[#4C372A] shadow-[0_6px_20px_rgba(76,55,42,0.12)] transition-transform hover:scale-105">
          ← Back (Esc)
        </button>
      </header>
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/80 px-4 py-2.5 shadow-[0_6px_20px_rgba(76,55,42,0.10)]">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#D92B27]">Camera zoom</span>
        <input type="range" className="lab-range w-56" min={0.5} max={1.3} step={0.02} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} aria-label="Camera zoom" />
        <span className="w-12 text-sm font-extrabold tabular-nums text-[#4C372A]">{Math.round(zoom * 100)}%</span>
        <span className="text-[11px] font-semibold text-[#9A8A84]">smaller = camera farther away · applies to the whole game · also − / + keys</span>
      </div>
      <div className="min-h-0 flex-1">
        <LayerEditor />
      </div>
    </div>
  );
}
