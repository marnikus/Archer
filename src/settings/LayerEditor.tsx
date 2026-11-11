import { useEffect, useRef, useState } from 'react';
import '../rig/heroDef';
import '../rig/heroPreview';
import { getCharacter, getPreview, layerStore, listCharacters } from '../rig/layers';

const STATUS: Record<string, string> = {
  idle: 'Changes save automatically',
  'saved-local': 'Saved in this browser ✓',
  'saved-file': 'Saved in this browser + project file (src/game/layerPreset.json) ✓',
  error: '⚠ Could not save in this browser',
};

function Chip({ on, children, onClick }: { on?: boolean; children: React.ReactNode; onClick: () => void }) {
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

export function LayerEditor() {
  const chars = listCharacters();
  const [charId, setCharId] = useState(chars[0]?.id ?? '');
  const def = getCharacter(charId);
  const [ctxId, setCtxId] = useState(def?.contexts[0]?.id ?? '');
  const [scenario, setScenario] = useState(def?.scenarios?.[0]?.id ?? '');
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [, setTick] = useState(0);
  const [usedCtx, setUsedCtx] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const charRef = useRef(charId);
  charRef.current = charId;
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => layerStore.subscribe(() => setTick((t) => t + 1)), []);
  useEffect(() => () => {
    layerStore.highlight = null;
  }, []);

  // live preview loop
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let lastUsed = '';
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#E9F0FC');
      g.addColorStop(1, '#D3E0F5');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const groundY = h * 0.88;
      ctx.fillStyle = 'rgba(76,55,42,0.08)';
      ctx.fillRect(0, groundY, w, h - groundY);
      ctx.fillStyle = 'rgba(76,55,42,0.10)';
      ctx.beginPath();
      ctx.ellipse(w / 2, groundY, 120, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      const pv = getPreview(charRef.current);
      if (pv) {
        const sc = Math.min((h * 0.8) / 520, (w * 0.82) / 480);
        ctx.save();
        ctx.translate(w / 2, groundY);
        ctx.scale(sc, sc);
        pv(ctx, scenarioRef.current, dt);
        ctx.restore();
      }
      const used = layerStore.lastContext.get(charRef.current) ?? '';
      if (used !== lastUsed) {
        lastUsed = used;
        setUsedCtx(used);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!def) return <div className="p-6 text-sm font-bold text-[#72625D]">No characters registered.</div>;

  const order = layerStore.order(charId, ctxId);
  const shown = [...order].reverse(); // front-most first
  const label = (id: string) => def.parts.find((p) => p.id === id)?.label ?? id;
  const ctxDef = def.contexts.find((c) => c.id === ctxId);

  const apply = (next: string[]) => layerStore.set(charId, ctxId, next);
  // display index (0 = front) <-> order index (last = front)
  const moveTo = (fromDisp: number, toDisp: number) => {
    if (fromDisp === toDisp) return;
    const o = [...order];
    const [x] = o.splice(order.length - 1 - fromDisp, 1);
    o.splice(order.length - 1 - toDisp, 0, x);
    apply(o);
  };

  const pickChar = (id: string) => {
    const d = getCharacter(id)!;
    setCharId(id);
    setCtxId(d.contexts[0].id);
    setScenario(d.scenarios?.[0]?.id ?? '');
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
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* preview */}
      <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-3xl bg-white/70 shadow-[0_10px_30px_rgba(76,55,42,0.12)]">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E6E9F5] p-2.5">
          {def.scenarios?.map((s) => (
            <Chip
              key={s.id}
              on={scenario === s.id}
              onClick={() => {
                setScenario(s.id);
                setCtxId(s.context);
              }}
            >
              {s.label}
            </Chip>
          ))}
        </div>
        <canvas ref={canvasRef} className="min-h-0 w-full flex-1" aria-label="Live preview" />
        <div className="border-t border-[#E6E9F5] px-3 py-2 text-[11px] font-semibold text-[#72625D]">
          This pose is drawn with: <b className="text-[#4C372A]">{def.contexts.find((c) => c.id === usedCtx)?.label ?? '…'}</b>
          {usedCtx && usedCtx !== ctxId && (
            <button className="ml-2 font-black text-[#EA6227] underline" onClick={() => setCtxId(usedCtx)}>
              edit that order
            </button>
          )}
        </div>
      </div>

      {/* layer list */}
      <div className="flex w-full min-h-0 flex-col rounded-3xl bg-white/80 p-3 shadow-[0_10px_30px_rgba(76,55,42,0.12)] lg:w-[400px]">
        {chars.length > 1 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {chars.map((c) => (
              <Chip key={c.id} on={c.id === charId} onClick={() => pickChar(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}
        <div className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#D92B27]">{def.name} · layer order</div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {def.contexts.map((c) => (
            <Chip key={c.id} on={c.id === ctxId} onClick={() => setCtxId(c.id)}>
              {c.label}
              {layerStore.isCustom(charId, c.id) ? ' •' : ''}
            </Chip>
          ))}
        </div>
        {ctxDef && <p className="mb-2 text-[11px] font-semibold leading-snug text-[#9A8A84]">{ctxDef.hint}</p>}

        <div className="mb-1 flex justify-between text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#9A8A84]">
          <span>▲ In front</span>
          <span>drag to reorder</span>
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" onMouseLeave={() => (layerStore.highlight = null)}>
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
          <Chip onClick={() => layerStore.reset(charId)}>Reset all orders</Chip>
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
      </div>
    </div>
  );
}
