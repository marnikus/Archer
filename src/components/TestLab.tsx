import { useEffect, useRef, useState } from 'react';
import { archerGeom, drawArcher, RIG, type ArcherVis } from '../game/art';
import { drawHatArt, drawCrossbowArt, drawSpearArt, drawSwordArt, drawStaffArt, drawAxeArt, type WeaponKind } from '../game/weaponsArt';
import './testLab.css';

type Settings = { motion: string; weapon: WeaponKind; quiver: boolean; ready: boolean; aim: number; draw: number; speed: number; tension: number; lag: number; beard: number; stability: number; paused: boolean; slow: boolean; compare: boolean; pivots: boolean; anchors: boolean; lines: boolean; hips: boolean; hat: string };
const motions = ['Neutral', 'Alert', 'Tired', 'Bored', 'Armed', 'Casual Walk', 'Normal Walk', 'Power Walk', 'Brisk Archer Walk', 'Tired Walk', 'Run', 'Sneak Walk', 'Creep', 'Sit Idle', 'Sit Look Around', 'Hide Crouch', 'Hide Idle', 'Peek Left', 'Peek Right', 'Jump Ready', 'Jump Air', 'Jump Fall', 'Jump Land', 'Small Hop', 'Nod Yes', 'Shake No', 'Wave', 'Look At Item', 'Surprised Small', 'Disappointed', 'Victory Bounce'];
const defaults: Settings = { motion: 'Normal Walk', weapon: 'bow', quiver: true, ready: false, aim: 0, draw: 0, speed: 1, tension: 0.5, lag: 0.5, beard: 0.5, stability: 0.7, paused: false, slow: false, compare: false, pivots: false, anchors: false, lines: false, hips: false, hat: 'on' };

function pose(s: Settings, t: number): ArcherVis {
  const walk = /Walk|Run|Creep/.test(s.motion), run = s.motion === 'Run', sneak = /Sneak|Creep|Hide|Peek/.test(s.motion);
  const stride = s.motion === 'Casual Walk' ? .25 : s.motion === 'Power Walk' || run ? .55 : sneak ? .2 : .38;
  const phase = t * (run ? 12 : 8) * s.speed;
  const wave = Math.sin(phase), bow = s.weapon === 'bow';
  const aiming = bow && (s.ready || s.draw > 0);
  let jump = /Jump Air/.test(s.motion) ? 90 : /Jump Fall/.test(s.motion) ? 45 : /Small Hop|Victory Bounce/.test(s.motion) ? Math.abs(Math.sin(t * 4)) * 65 : 0;
  if (run) jump = Math.abs(Math.sin(phase)) * 15;
  const crouch = sneak || /Sit|Jump Ready|Jump Land/.test(s.motion);
  let head = Math.sin(t * 2 - s.lag) * .015;
  if (/Tired|Disappointed/.test(s.motion)) head = -.12;
  if (/Nod/.test(s.motion)) head += Math.sin(t * 4) * .12;
  if (/Shake|Look Around/.test(s.motion)) head += Math.sin(t * 4) * .15;
  if (/Peek Left/.test(s.motion)) head -= .18;
  if (/Peek Right/.test(s.motion)) head += .18;
  const tremor = aiming ? Math.sin(t * 31) * s.tension * (1 - s.stability) * .04 : 0;
  let front = aiming ? s.aim * Math.PI / 180 + tremor : RIG.ARM_REST_FRONT + (walk ? wave * (bow ? .1 : stride) : 0);
  let back = RIG.ARM_REST_BACK - (walk ? wave * (s.quiver ? stride * .5 : stride * 1.2) : 0);
  if (s.weapon !== 'unarmed' && s.weapon !== 'bow' && s.weapon !== 'quiverOnly') front = s.ready ? -.15 : -.8;
  if (s.motion === 'Wave') front = .9 + Math.sin(t * 6) * .25;
  if (s.hat === 'held') front = -.25;
  return { bob: walk ? Math.abs(Math.sin(phase)) * 9 : Math.sin(t * 2) * 2, jump, squash: crouch ? .78 : 1, headShake: s.motion === 'Shake No' ? Math.sin(t * 5) * 7 : 0, headTilt: head, eyeScale: t % 4 < .1 ? .12 : 1, legSwing: walk ? wave * stride : crouch ? .35 : 0, armFront: front, armBack: back, bowRot: aiming ? s.aim * Math.PI / 180 : 0, draw: s.draw / 100, across: aiming ? Math.min(1, .35 + s.draw / 100) : 0, showArrow: aiming, hasBow: bow, hasQuiver: s.quiver || s.weapon === 'quiverOnly', smile: /Victory/.test(s.motion) ? 1 : 0, spinX: 1, bodyTilt: (walk ? wave * .035 : 0) + (run ? -.1 : sneak ? -.09 : 0), hipShift: walk ? wave * 5 : 0, beardLag: Math.sin(phase - .7) * .04 * s.beard };
}

function LabCanvas({ settings }: {settings: Settings}) {
  const canvas = useRef<HTMLCanvasElement>(null); const latest = useRef(settings); latest.current = settings;
  useEffect(() => {
    const el = canvas.current!; const ctx = el.getContext('2d')!; let frame = 0, last = 0, time = 0;
    const tick = (now: number) => {
      const s = latest.current; if (last && !s.paused) time += Math.min((now-last)/1000, .05) * (s.slow ? .2 : 1); last = now;
      const w = el.clientWidth, h = el.clientHeight, dpr = window.devicePixelRatio || 1;
      if (el.width !== Math.round(w*dpr) || el.height !== Math.round(h*dpr)) { el.width = Math.round(w*dpr); el.height = Math.round(h*dpr); }
      ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h); ctx.fillStyle='#f5f3ee'; ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#e8e3da'; ctx.lineWidth=1; for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()} for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
      const ground=h*.8; ctx.strokeStyle='#a29c91';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,ground);ctx.lineTo(w,ground);ctx.stroke();
      const render = (x:number, state:Settings, label:string) => {
        const v=pose(state,time); const scale=Math.min(h/900, w/(state.compare ? 1800 : 1000), .8);
        ctx.save();ctx.translate(x,ground);ctx.scale(scale,scale);drawArcher(ctx,v);
        // Props are in the same local character coordinates as the paper artwork.
        ctx.save();ctx.translate(-RIG.FEET.x,-RIG.FEET.y-v.jump-v.bob);
        if(state.hat !== 'dropped') { ctx.save(); if(state.hat==='held') { const g=archerGeom(v);ctx.translate(g.hand.x,g.hand.y);ctx.rotate(.35); } else {ctx.translate(480+v.headShake,270);ctx.rotate(v.headTilt)} drawHatArt(ctx);ctx.restore(); }
        if(state.weapon !== 'unarmed' && state.weapon !== 'bow' && state.weapon !== 'quiverOnly') { const g=archerGeom(v);ctx.save();ctx.translate(g.hand.x,g.hand.y);ctx.rotate(state.ready ? 0 : -.45);({crossbow:drawCrossbowArt,spear:drawSpearArt,sword:drawSwordArt,staff:drawStaffArt,axe:drawAxeArt}[state.weapon])?.(ctx);ctx.restore(); }
        if(state.pivots || state.anchors || state.lines || state.hips) { const g=archerGeom(v);ctx.lineWidth=4;ctx.strokeStyle='#e46242';ctx.fillStyle='#e46242'; if(state.lines){ctx.beginPath();ctx.moveTo(356,429);ctx.lineTo(604,429);ctx.stroke()} if(state.pivots) for(const [px,py] of [[480,582],[480,403],[356,429],[604,429],[420,582],[538,582]]){ctx.beginPath();ctx.arc(px,py,9,0,Math.PI*2);ctx.fill()} if(state.anchors){ctx.fillStyle='#236fc4';ctx.beginPath();ctx.arc(g.hand.x,g.hand.y,12,0,Math.PI*2);ctx.fill()} if(state.hips){ctx.strokeStyle='#329b77';ctx.beginPath();ctx.ellipse(480,582,30,12,0,0,Math.PI*2);ctx.stroke()} }
        ctx.restore(); if(state.hat==='dropped'){ctx.save();ctx.translate(160,-15);ctx.scale(.8,.65);drawHatArt(ctx);ctx.restore()}ctx.restore();
        ctx.fillStyle='#81796c';ctx.font='600 12px system-ui';ctx.textAlign='center';ctx.fillText(label,x,ground+30);
      };
      if(s.compare){render(w*.27,{...s,weapon:'unarmed',quiver:false,ready:false,draw:0},'BASELINE · UNARMED');render(w*.73,s,'CURRENT POSE')}else render(w*.5,s,'CURRENT POSE');
      frame=requestAnimationFrame(tick);
    }; frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[]);
  return <canvas ref={canvas} className="lab-canvas" aria-label="Animated archer preview"/>;
}

export function TestLab({ onClose }: {onClose:()=>void}) {
  const [s,set] = useState(defaults); const update = <K extends keyof Settings>(key:K,value:Settings[K]) => set(prev=>({...prev,[key]:value}));
  const slider=(label:string,key:'speed'|'aim'|'draw'|'tension'|'lag'|'beard'|'stability',min:number,max:number,step:number) => <label className="lab-slider">{label}<span>{s[key]}</span><input type="range" min={min} max={max} step={step} value={s[key]} onChange={e=>update(key,Number(e.target.value))}/></label>;
  return <div className="lab"><header><div><small>ARCHER'S LONG SHOT</small><h1>Animation Test Lab</h1><p>Motion workshop · pose and playback preview</p></div><button onClick={onClose}>← Back to game</button></header><main><section className="lab-stage"><div className="lab-stagebar"><strong>{s.motion}</strong><span>{s.paused?'PAUSED':s.slow?'SLOW MOTION':'LIVE PREVIEW'}</span><button onClick={()=>update('paused',!s.paused)}>{s.paused?'▶ Play':'Ⅱ Pause'}</button></div><LabCanvas settings={s}/><p className="lab-note">Compare the current pose with an unarmed baseline. The grid and ground line are visual references.</p></section><aside>
  <section><h2>Motion library</h2><label>Body state<select value={s.motion} onChange={e=>update('motion',e.target.value)}>{motions.map(m=><option key={m}>{m}</option>)}</select></label>{slider('Cycle speed','speed',.2,2,.1)}</section>
  <section><h2>Equipment & weapon</h2><label>Weapon<select value={s.weapon} onChange={e=>update('weapon',e.target.value as WeaponKind)}>{(['unarmed','bow','quiverOnly','crossbow','spear','sword','staff','axe'] as WeaponKind[]).map(w=><option key={w} value={w}>{w === 'quiverOnly' ? 'Quiver only' : w[0].toUpperCase()+w.slice(1)}</option>)}</select></label><label className="lab-check"><input type="checkbox" checked={s.quiver} onChange={e=>update('quiver',e.target.checked)}/> Quiver equipped</label><div className="lab-buttons"><button className={!s.ready?'selected':''} onClick={()=>update('ready',false)}>Carry</button><button className={s.ready?'selected':''} onClick={()=>update('ready',true)}>Ready</button></div></section>
  <section><h2>Hat</h2><div className="lab-buttons">{[['on','On head'],['held','Held'],['dropped','Dropped']].map(([v,l])=><button key={v} className={s.hat===v?'selected':''} onClick={()=>update('hat',v)}>{l}</button>)}</div></section>
  <section><h2>Shooting arms</h2><p>Choose Bow and Ready to preview aim independently of the legs.</p>{slider('Aim angle','aim',-35,60,1)}{slider('Draw amount %','draw',0,100,1)}{slider('Hold tension','tension',0,1,.1)}{slider('Hand stability','stability',0,1,.1)}<div className="lab-buttons"><button onClick={()=>update('draw',100)}>Full draw</button><button onClick={()=>update('draw',0)}>Release</button></div></section>
  <section><h2>Secondary motion</h2>{slider('Head lag','lag',0,2,.1)}{slider('Beard follow','beard',0,1,.1)}</section>
  <section><h2>Debug view</h2>{([['pivots','Pivot points'],['anchors','Hand anchor'],['lines','Shoulder line'],['hips','Hip weight shift'],['slow','Slow motion'],['compare','Side-by-side comparison']] as const).map(([key,label])=><label className="lab-check" key={key}><input type="checkbox" checked={s[key]} onChange={e=>update(key,e.target.checked)}/>{label}</label>)}</section>
  </aside></main></div>;
}
