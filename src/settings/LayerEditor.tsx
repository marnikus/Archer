import { useEffect, useRef, useState } from 'react';
import '../rig/heroDef';
import '../rig/heroPreview';
import { getCharacter, getPreview, layerStore, listCharacters } from '../rig/layers';
import { Chip, LayerList } from './LayerList';

export function LayerEditor() {
  const chars = listCharacters();
  const [charId, setCharId] = useState(chars[0]?.id ?? '');
  const def = getCharacter(charId);
  const [ctxId, setCtxId] = useState(def?.contexts[0]?.id ?? '');
  const [scenario, setScenario] = useState(def?.scenarios?.[0]?.id ?? '');
  const [, setTick] = useState(0);
  const [usedCtx, setUsedCtx] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const charRef = useRef(charId);
  charRef.current = charId;

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

  const ctxDef = def.contexts.find((c) => c.id === ctxId);

  const pickChar = (id: string) => {
    const d = getCharacter(id)!;
    setCharId(id);
    setCtxId(d.contexts[0].id);
    setScenario(d.scenarios?.[0]?.id ?? '');
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
          {def.contexts.length > 1 ? (
            <>
              This pose is drawn with: <b className="text-[#4C372A]">{def.contexts.find((c) => c.id === usedCtx)?.label ?? '…'}</b>
              {usedCtx && usedCtx !== ctxId && (
                <button className="ml-2 font-black text-[#EA6227] underline" onClick={() => setCtxId(usedCtx)}>
                  edit that order
                </button>
              )}
            </>
          ) : (
            <>This preview is drawn with the same code and the same saved order as the game — what you see here is what the game shows.</>
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
        <div className={`mb-2 flex-wrap gap-1.5 ${def.contexts.length > 1 ? 'flex' : 'hidden'}`}>
          {def.contexts.map((c) => (
            <Chip key={c.id} on={c.id === ctxId} onClick={() => setCtxId(c.id)}>
              {c.label}
              {layerStore.isCustom(charId, c.id) ? ' •' : ''}
            </Chip>
          ))}
        </div>
        {ctxDef && <p className="mb-2 text-[11px] font-semibold leading-snug text-[#9A8A84]">{ctxDef.hint}</p>}

        <LayerList charId={charId} ctxId={ctxId} />
      </div>
    </div>
  );
}
