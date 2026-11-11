import { useEffect, useRef, useState } from 'react';
import { archerGeom, DEG, drawArcher, RIG, type ArcherVis } from '../game/art';
import { legRig, type Gait } from '../game/rig';

type Pose = 'idle' | 'walk' | 'run' | 'draw';

function makePose(pose: Pose, phase: number, hat: boolean, bones: boolean, gear: boolean, angle: number, draw: number): ArcherVis {
  const gait: Gait = pose === 'walk' || pose === 'run' ? pose : 'idle';
  const bob = gait === 'idle' ? 2 : Math.abs(Math.sin(phase)) * (gait === 'run' ? 12 : 6);
  const aiming = pose === 'draw' && gear;
  return { bob, jump: 0, squash: 1, headShake: 0, headTilt: 0, eyeScale: 1,
    gait, gaitPhase: phase, hat, debug: bones, armFront: aiming ? angle * DEG : gear ? -2.15 : RIG.ARM_REST_FRONT + (gait === 'idle' ? 0 : Math.sin(phase) * .4),
    armBack: RIG.ARM_REST_BACK + (gait === 'idle' ? 0 : -Math.sin(phase) * .45),
    bowRot: aiming ? angle * DEG : gear ? -.85 : 0, draw: aiming ? draw : 0, across: aiming ? 1 : 0,
    showArrow: aiming, hasBow: gear, hasQuiver: gear, smile: 0, spinX: 1 };
}

function Preview({ pose, phase, hat, bones, gear, angle, draw, direction }: { pose: Pose; phase: number; hat: boolean; bones: boolean; gear: boolean; angle: number; draw: number; direction: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 420, 340);
    ctx.fillStyle = '#edf3fc'; ctx.fillRect(0, 0, 420, 340);
    ctx.fillStyle = '#d6e2f3'; ctx.fillRect(0, 294, 420, 46);
    ctx.strokeStyle = '#b4c9e4'; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(0, 294); ctx.lineTo(420, 294); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(210, 294); ctx.scale(direction * -.56, .56);
    drawArcher(ctx, makePose(pose, phase, hat, bones, gear, angle, draw));
    ctx.restore();
  }, [pose, phase, hat, bones, gear, angle, draw, direction]);
  return <canvas ref={ref} width={420} height={340} className="w-full rounded-xl" aria-label={`${pose} animation preview`} />;
}

export function RigInspector({ onClose, hat, onHat }: { onClose: () => void; hat: boolean; onHat: (v: boolean) => void }) {
  const [pose, setPose] = useState<Pose>('walk');
  const [compare, setCompare] = useState<Pose>('run');
  const [playing, setPlaying] = useState(true);
  const [phase, setPhase] = useState(0);
  const [bones, setBones] = useState(true);
  const [gear, setGear] = useState(true);
  const [direction, setDirection] = useState(-1);
  const [angle, setAngle] = useState(40);
  const [draw, setDraw] = useState(.7);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  useEffect(() => {
    if (!playing) return;
    let id: number, last = performance.now();
    const tick = (now: number) => { const dt = Math.min((now - last) / 1000, .05); last = now; setPhase(p => (p + dt * 9) % (Math.PI * 2)); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id);
  }, [playing]);
  const vis = makePose(pose, phase, hat, bones, gear, angle, draw);
  const legs = legRig(phase, vis.gait, vis.bob);
  const geom = archerGeom(vis);
  const select = (value: Pose, change: (v: Pose) => void) => <select className="rig-input" value={value} onChange={e => change(e.target.value as Pose)}>{(['idle', 'walk', 'run', 'draw'] as Pose[]).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select>;
  return <div data-rig-dialog className="absolute inset-0 z-50 flex items-center justify-center bg-[#352b27]/60 p-3" role="dialog" aria-modal="true" aria-labelledby="rig-title">
    <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-[#fffdf9] p-5 text-[#4C372A] shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#d37330]">Animation lab</p><h2 id="rig-title" className="text-2xl font-black">Archer rig inspector</h2><p className="text-sm text-[#72625D]">Compare poses using the same geometry as the game. Cyan = joints, coral = bow and arrow.</p></div><button ref={closeRef} onClick={onClose} className="btn-soft" aria-label="Close rig inspector">✕</button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><div className="mb-2 flex items-center justify-between text-sm font-bold">Primary {select(pose, setPose)}</div><Preview {...{pose, phase, hat, bones, gear, angle, draw, direction}} /></div>
        <div><div className="mb-2 flex items-center justify-between text-sm font-bold">Compare {select(compare, setCompare)}</div><Preview {...{pose: compare, phase, hat, bones, gear, angle, draw, direction}} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold">
        <button className="btn-soft" onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
        <button className="btn-soft" onClick={() => setDirection(-direction)}>Facing {direction < 0 ? '←' : '→'}</button>
        <label><input type="checkbox" checked={bones} onChange={e => setBones(e.target.checked)} /> Skeleton</label>
        <label><input type="checkbox" checked={gear} onChange={e => setGear(e.target.checked)} /> Gear</label>
        <label><input type="checkbox" checked={hat} onChange={e => onHat(e.target.checked)} /> Hat in game</label>
      </div>
      <div className="mt-4 grid gap-3 text-xs font-bold text-[#72625D] sm:grid-cols-3">
        <label>Cycle {Math.round(phase / (2 * Math.PI) * 100)}% <input className="w-full" type="range" min="0" max="6.283" step="0.01" value={phase} onChange={e => { setPlaying(false); setPhase(Number(e.target.value)); }} /></label>
        <label>Aim {angle}° <input className="w-full" type="range" min="5" max="80" value={angle} onChange={e => setAngle(Number(e.target.value))} /></label>
        <label>Draw {Math.round(draw * 100)}% <input className="w-full" type="range" min="0" max="1" step="0.01" value={draw} onChange={e => setDraw(Number(e.target.value))} /></label>
      </div>
      <div className="mt-3 rounded-xl bg-[#f2f5fa] p-3 font-mono text-xs leading-relaxed text-[#72625D]">Local SVG units · phase {phase.toFixed(2)} rad · {vis.gait}<br />Front hip / knee / ankle: {legs[0].hip.x.toFixed(0)},{legs[0].hip.y.toFixed(0)} / {legs[0].knee.x.toFixed(0)},{legs[0].knee.y.toFixed(0)} / {legs[0].ankle.x.toFixed(0)},{legs[0].ankle.y.toFixed(0)}<br />Bow hand / nock / tip: {geom.hand.x.toFixed(0)},{geom.hand.y.toFixed(0)} / {geom.nock.x.toFixed(0)},{geom.nock.y.toFixed(0)} / {geom.tip.x.toFixed(0)},{geom.tip.y.toFixed(0)}</div>
    </div>
  </div>;
}
