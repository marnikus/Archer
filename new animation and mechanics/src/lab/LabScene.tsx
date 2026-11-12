import { useEffect, useRef, useState } from 'react';
import { Animator, isSit, type AnimStatus, type BaseState } from '../rig/animator';
import { drawRig, drawQuiverProp, drawBowProp, drawHatLoose, G as RG } from '../rig/rig';
import { PAL, drawPine, drawMound, drawCloud, drawRock, drawArrowArt } from '../game/art';
import { LabPanel, type LabUI } from './LabPanel';

const lerpRate = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

const DECOR = (() => {
  const far: Array<{ x: number; w: number; h: number }> = [];
  const pines: Array<{ x: number; h: number; c: string; t: string }> = [];
  const rocks: Array<{ x: number; w: number }> = [];
  const clouds: Array<{ x: number; y: number; r: number; a: number }> = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let x = -4000; x <= 4000; x += 520) far.push({ x: x + rnd() * 200, w: 700 + rnd() * 500, h: 90 + rnd() * 120 });
  for (let x = -4000; x <= 4000; x += 330) {
    if (rnd() < 0.7) pines.push({ x: x + rnd() * 160, h: 120 + rnd() * 160, c: rnd() < 0.5 ? '#C3D6F2' : '#B5CCF0', t: '#AFC2E6' });
    if (rnd() < 0.25) rocks.push({ x: x + rnd() * 200, w: 50 + rnd() * 60 });
  }
  for (let x = -4000; x <= 4000; x += 600) clouds.push({ x: x + rnd() * 300, y: -520 - rnd() * 260, r: 34 + rnd() * 40, a: 0.5 + rnd() * 0.4 });
  return { far, pines, rocks, clouds };
})();

export function LabScene({ onExit }: { onExit: () => void }) {
  const animRef = useRef<Animator | null>(null);
  if (!animRef.current) {
    const a = new Animator();
    a.hasQuiver = true;
    a.hasBow = true;
    a.weapon = 'bow';
    animRef.current = a;
  }
  const anim = animRef.current;
  const ghostRef = useRef<Animator | null>(null);
  const [status, setStatus] = useState<AnimStatus>(() => anim.status());
  const [ui, setUi] = useState<LabUI>({
    timeScale: 1,
    frozen: false,
    debug: { pivots: false, anchors: false, shoulders: false, hips: false, grid: false },
    ghost: 'none',
    panelOpen: true,
  });
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const stepOnce = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef({ x: 0, y: 0, zoom: 1 });

  // ghost compare instance
  useEffect(() => {
    if (ui.ghost === 'none') {
      ghostRef.current = null;
      return;
    }
    const g = new Animator();
    g.external = true;
    g.hasQuiver = anim.hasQuiver;
    g.hasBow = anim.hasBow;
    g.weapon = anim.weapon;
    g.params = anim.params;
    g.setBase(ui.ghost as BaseState);
    ghostRef.current = g;
  }, [ui.ghost, anim]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let dpr = 1;
    let statusT = 0;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000);
      last = now;
      const u = uiRef.current;
      let dt = real * u.timeScale;
      if (u.frozen) dt = stepOnce.current > 0 ? 1 / 60 : 0;
      if (stepOnce.current > 0) stepOnce.current--;
      anim.update(dt);
      const ghost = ghostRef.current;
      if (ghost) {
        ghost.facing = anim.facing;
        const gb = ghost.base;
        ghost.driveSpeed = gb === 'run' ? 520 : gb.startsWith('walk') ? 250 : gb === 'sneak' ? 110 : gb === 'creep' ? 55 : 0;
        ghost.update(dt);
      }
      render(ctx, window.innerWidth, window.innerHeight, dpr, real);
      statusT += real;
      if (statusT > 0.1) {
        statusT = 0;
        setStatus(anim.status());
      }
      raf = requestAnimationFrame(loop);
    };

    const render = (c: CanvasRenderingContext2D, w: number, h: number, dprv: number, real: number) => {
      const u = uiRef.current;
      const st = anim.status();
      const cam = camRef.current;
      // camera targets
      const moving = st.speed > 1;
      let tx = anim.x + (moving ? anim.facing * 90 : 0);
      let ty = 0;
      let tz = 1;
      if (st.shoot !== 'none') {
        tx += anim.facing * 110;
        tz = 0.86;
        ty = -20;
      }
      if (st.jumpPhase !== 'none') {
        ty = -70;
        tz = 0.92;
      }
      if (isSit(st.base) || st.hat !== 'head' || st.seq.startsWith('hat')) {
        tz = 1.02;
        ty = 10;
      }
      if (ghostRef.current) {
        tx += anim.facing * -150;
        tz = Math.min(tz, 0.8);
      }
      cam.x = lerpRate(cam.x, tx, 3, real);
      cam.y = lerpRate(cam.y, ty, 3, real);
      cam.zoom = lerpRate(cam.zoom, tz, 3, real);
      const base = Math.min(h / 820, w / 1100);
      const s = base * cam.zoom;
      const ax = w / 2;
      const ay = h * 0.66;

      c.setTransform(dprv, 0, 0, dprv, 0, 0);
      const grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#BFD3F2');
      grad.addColorStop(0.55, PAL.sky);
      grad.addColorStop(1, '#F4F6FC');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);

      const layer = (f: number, fn: () => void) => {
        c.save();
        c.translate(ax, ay);
        c.scale(s, s);
        c.translate(-cam.x * f, -cam.y * f);
        fn();
        c.restore();
      };
      layer(0.1, () => {
        for (const cl of DECOR.clouds) drawCloud(c, cl.x, cl.y, cl.r, cl.a);
      });
      layer(0.25, () => {
        for (const m of DECOR.far) drawMound(c, m.x, 0, m.w, m.h, '#D5E2F7');
      });
      layer(0.55, () => {
        for (const p of DECOR.pines) drawPine(c, p.x, 0, p.h, p.c, p.t);
        for (const r of DECOR.rocks) drawRock(c, r.x, 0, r.w, r.w * 0.45, '#CFD9EE');
      });
      // ground + reference marks
      layer(1, () => {
        c.fillStyle = PAL.ground;
        c.fillRect(cam.x - 4000, 0, 8000, 2000);
        c.fillStyle = PAL.groundSide;
        c.fillRect(cam.x - 4000, 0, 8000, 6);
        c.strokeStyle = '#C9CFE6';
        c.lineWidth = 2;
        c.fillStyle = '#9AA6C4';
        c.font = 'bold 20px Nunito, system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'top';
        const x0 = Math.floor((cam.x - 1400) / 100) * 100;
        for (let x = x0; x < cam.x + 1400; x += 100) {
          const major = x % 500 === 0;
          c.beginPath();
          c.moveTo(x, 6);
          c.lineTo(x, major ? 26 : 14);
          c.stroke();
          if (major) c.fillText(String(x), x, 30);
        }
        if (u.debug.grid) {
          c.strokeStyle = 'rgba(114,98,93,0.18)';
          c.setLineDash([6, 8]);
          for (let y = -100; y >= -500; y -= 100) {
            c.beginPath();
            c.moveTo(cam.x - 1400, y);
            c.lineTo(cam.x + 1400, y);
            c.stroke();
          }
          for (let x = x0; x < cam.x + 1400; x += 100) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, -520);
            c.stroke();
          }
          c.setLineDash([]);
          c.fillStyle = 'rgba(114,98,93,0.6)';
          c.textAlign = 'left';
          for (let y = -100; y >= -500; y -= 100) c.fillText(String(-y), cam.x - 1380 / (1 / 1), y - 24);
        }
        // props on the ground / in the air (those in front of the archer are drawn over it)
        const drawProps = (front: boolean) => {
          for (const p of anim.props) {
            const inFront = anim.worldToLocal(p.x) < -70;
            if (inFront !== front) continue;
            c.save();
            c.translate(p.x, p.y);
            c.rotate(p.rot);
            c.scale(1 + (1 - p.squash) * 0.5, p.squash);
            if (p.kind === 'quiver') drawQuiverProp(c);
            else if (p.kind === 'bow') drawBowProp(c);
            else drawHatLoose(c);
            c.restore();
          }
        };
        drawProps(false);
        // lab arrows
        for (const a of anim.arrows) {
          c.save();
          c.globalAlpha = a.t > 5 ? Math.max(0, 6 - a.t) : 1;
          c.translate(a.x, a.y);
          c.rotate(Math.atan2(a.vy, a.vx));
          drawArrowArt(c, RG.arrowLen);
          c.restore();
        }
        // ghost
        const ghost = ghostRef.current;
        if (ghost) {
          c.save();
          c.globalAlpha = 0.45;
          c.translate(anim.x - anim.facing * 300, 0);
          if (anim.facing === 1) c.scale(-1, 1);
          drawRig(c, ghost.pose, ghost.skel, {});
          c.restore();
          c.fillStyle = 'rgba(76,55,42,0.55)';
          c.font = 'bold 22px Nunito, system-ui, sans-serif';
          c.textAlign = 'center';
          c.fillText('ghost: ' + ghost.base, anim.x - anim.facing * 300, 46);
        }
        // shadow
        c.fillStyle = 'rgba(76,55,42,0.08)';
        c.beginPath();
        c.ellipse(anim.x, 4, 120, 14, 0, 0, Math.PI * 2);
        c.fill();
        // main character
        c.save();
        c.translate(anim.x, 0);
        if (anim.facing === 1) c.scale(-1, 1);
        drawRig(c, anim.pose, anim.skel, { debug: u.debug });
        c.restore();
        drawProps(true);
        if (u.debug.hips) {
          c.fillStyle = 'rgba(33,118,214,0.7)';
          c.font = 'bold 18px Nunito, system-ui, sans-serif';
          c.textAlign = 'center';
          c.fillText('hip ' + (anim.pose.hipX * -anim.facing).toFixed(1), anim.x + anim.pose.hipX * -anim.facing, 58);
        }
      });
    };
    raf = requestAnimationFrame(loop);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur?.();
        setUi((p) => ({ ...p, frozen: !p.frozen }));
      } else if (e.code === 'Period') stepOnce.current = 1;
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        anim.facing = -1;
        if (!anim.base.startsWith('walk') && anim.base !== 'run') anim.setBase('walk');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        anim.facing = 1;
        if (!anim.base.startsWith('walk') && anim.base !== 'run') anim.setBase('walk');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code) && anim.base.startsWith('walk')) anim.setBase('idle');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [anim]);

  const onCanvasPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = camRef.current;
    const s = Math.min(h / 820, w / 1100) * cam.zoom;
    const wx = (e.clientX - w / 2) / s + cam.x;
    if (anim.seq) return;
    anim.goTo(wx, () => {});
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#DAE5F7] font-display text-[#4C372A]">
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" onPointerDown={onCanvasPointer} />
      <StatusCard s={status} ui={ui} />
      <LabPanel anim={anim} status={status} ui={ui} setUi={setUi} onExit={onExit} onStep={() => (stepOnce.current = 1)} />
    </div>
  );
}

function StatusCard({ s, ui }: { s: AnimStatus; ui: LabUI }) {
  const row = (k: string, v: string, hi = false) => (
    <div key={k} className="flex items-baseline justify-between gap-3">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9A8A84]">{k}</span>
      <span className={`font-mono text-[12px] font-bold ${hi ? 'text-[#EA6227]' : 'text-[#4C372A]'}`}>{v}</span>
    </div>
  );
  return (
    <div className="pointer-events-none absolute left-3 top-3 w-[232px] rounded-2xl bg-white/80 p-3 shadow-[0_6px_20px_rgba(76,55,42,0.12)] backdrop-blur-sm">
      <div className="mb-1 text-[11px] font-black uppercase tracking-[0.3em] text-[#D92B27]">Animation Test Lab</div>
      <div className="mb-2 text-[13px] font-extrabold leading-tight">Archer&apos;s Long Shot · motion workshop</div>
      <div className="space-y-0.5">
        {row('state', s.base + (s.jumpPhase !== 'none' ? ' · ' + s.jumpPhase : ''), true)}
        {row('sequence', s.seq ? `${s.seq} ${(s.seqT * 100).toFixed(0)}%` : '—')}
        {row('reaction', s.reaction || '—')}
        {row('shoot', s.shoot + (s.shoot !== 'none' ? ` · ${s.aim.toFixed(0)}° · ${(s.draw * 100).toFixed(0)}%` : ''), s.shoot !== 'none')}
        {row('bow', s.hasBow ? s.bowMode : 'none')}
        {row('gear', `${s.hasQuiver ? 'quiver' : '–'} / ${s.hasBow ? 'bow' : '–'}`)}
        {row('weapon', s.weapon + (s.weapon !== 'unarmed' && s.weapon !== 'bow' ? (s.weaponReady ? ' · ready' : ' · carry') : ''))}
        {row('hat', s.hat)}
        {row('facing', s.facing === -1 ? '← left' : 'right →')}
        {row('time', ui.frozen ? 'FROZEN' : ui.timeScale === 1 ? '1×' : `${ui.timeScale}× slow`, ui.frozen || ui.timeScale !== 1)}
      </div>
      <div className="mt-2 text-[10px] font-semibold leading-snug text-[#9A8A84]">SPACE freeze · . step · ←/→ walk · click ground to walk there</div>
    </div>
  );
}
