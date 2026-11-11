import { useEffect, useRef, useState } from 'react';
import { getCharacter, layerStore } from '../rig/layers';

const STATUS: Record<string, string> = {
  idle: 'Changes save automatically',
  'saved-local': 'Saved in this browser ✓',
  'saved-file': 'Saved in this browser + project file (src/game/layerPreset.json) ✓',
  error: '⚠ Could not save in this browser',
};

export function Chip({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-2.5 py-1.5 text-[12px] font-extrabold leading-tight transition-all active:scale-95 ${
        on ? 'bg-[#EA6227] text-white shadow-[0_4px_12px_rgba(234,98,39,0.35)]' : 'bg-[#EBEDF8] text-[#4C372A] hover:bg-[#DCDFEF]'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * The stacked layer list for one character (front-most part on top): drag or use ▲ ▼ to reorder.
 * Used by Settings → Character layers and by the Animation Lab. Changes apply to the game instantly.
 */
export function LayerList({ charId, ctxId, compact = false }: { charId: string; ctxId: string; compact?: boolean }) {
  const def = getCharacter(charId);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [, setTick] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => layerStore.subscribe(() => setTick((t) => t + 1)), []);
  useEffect(
    () => () => {
      layerStore.highlight = null;
    },
    [],
  );
  if (!def) return null;

  const order = layerStore.order(charId, ctxId);
  const shown = [...order].reverse(); // front-most first
  const label = (id: string) => def.parts.find((p) => p.id === id)?.label ?? id;
  // display index (0 = front) <-> order index (last = front)
  const moveTo = (fromDisp: number, toDisp: number) => {
    if (fromDisp === toDisp) return;
    const o = [...order];
    const [x] = o.splice(order.length - 1 - fromDisp, 1);
    o.splice(order.length - 1 - toDisp, 0, x);
    layerStore.set(charId, ctxId, o);
  };
  const download = () => {
    const blob = new Blob([layerStore.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'layer-preset.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="mb-1 flex justify-between text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9A8A84]">
        <span>▲ In front</span>
        <span>drag to reorder</span>
      </div>
      <ul className={`space-y-1 overflow-y-auto pr-1 ${compact ? 'max-h-[320px]' : 'min-h-0 flex-1'}`} onMouseLeave={() => (layerStore.highlight = null)}>
        {shown.map((id, di) => (
          <li
            key={id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              setDrag({ from: di, over: di });
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (drag && drag.over !== di) setDrag({ ...drag, over: di });
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (drag) moveTo(drag.from, di);
              setDrag(null);
            }}
            onDragEnd={() => setDrag(null)}
            onMouseEnter={() => (layerStore.highlight = { char: charId, part: id })}
            className={`flex cursor-grab items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] font-bold text-[#4C372A] transition-colors ${
              drag?.over === di && drag.from !== di ? 'bg-[#FFE4D1] ring-2 ring-[#EA6227]' : 'bg-[#EBEDF8] hover:bg-[#E0E3F4]'
            } ${drag?.from === di ? 'opacity-40' : ''}`}
          >
            <span className="w-5 select-none text-center text-[#9A8A84]">⠿</span>
            <span className="w-5 text-center text-[10px] font-black text-[#9A8A84]">{di + 1}</span>
            <span className="min-w-0 flex-1 truncate">{label(id)}</span>
            <button type="button" title="Bring forward" disabled={di === 0} onClick={() => moveTo(di, di - 1)} className="rounded-md bg-white/80 px-1.5 text-xs font-black disabled:opacity-30">
              ▲
            </button>
            <button type="button" title="Send backward" disabled={di === shown.length - 1} onClick={() => moveTo(di, di + 1)} className="rounded-md bg-white/80 px-1.5 text-xs font-black disabled:opacity-30">
              ▼
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-right text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9A8A84]">▼ Behind</div>

      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[#E6E9F5] pt-2">
        <Chip onClick={() => layerStore.reset(charId, ctxId)}>Reset this order</Chip>
        <Chip onClick={download}>⬇ Export</Chip>
        <Chip onClick={() => fileRef.current?.click()}>⬆ Import</Chip>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (!layerStore.importJson(await f.text())) alert('That file is not a valid layer preset.');
          }}
        />
      </div>
      <div className="mt-2 text-[11px] font-bold text-[#72625D]">{STATUS[layerStore.status]}</div>
    </>
  );
}
