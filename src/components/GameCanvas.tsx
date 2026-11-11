import { useEffect, useRef } from 'react';
import type { Game, HudState } from '../game/engine';

interface Props {
  game: Game;
  onSnapshot: (s: HudState) => void;
}

export function GameCanvas({ game, onSnapshot }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const snapRef = useRef(onSnapshot);
  snapRef.current = onSnapshot;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    };
    resize();
    window.addEventListener('resize', resize);

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      game.update(dt);
      game.render(ctx, window.innerWidth, window.innerHeight, dpr);
      snapRef.current(game.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const keyMap: Record<string, 'left' | 'right' | 'up' | 'down'> = {
      ArrowLeft: 'left',
      KeyA: 'left',
      ArrowRight: 'right',
      KeyD: 'right',
      ArrowUp: 'up',
      KeyW: 'up',
      ArrowDown: 'down',
      KeyS: 'down',
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        game.setKey('shift', true);
      }
      if (e.repeat) return;
      const k = keyMap[e.code];
      if (k) {
        game.setKey(k, true);
        return;
      }
      if (e.code === 'Space') {
        (document.activeElement as HTMLElement | null)?.blur?.();
        game.pressFire();
      } else if (e.code === 'KeyH') {
        game.toggleHatInGame();
      } else if (e.code === 'KeyJ' || e.code === 'KeyV') {
        game.triggerHop();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (game.phase === 'playing' || game.phase === 'paused') game.togglePause();
      } else if (e.code === 'KeyM') {
        game.audio.unlock();
        game.audio.toggleMuted();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        game.setKey('shift', false);
      }
      const k = keyMap[e.code];
      if (k) game.setKey(k, false);
      else if (e.code === 'Space') game.releaseFire();
    };
    const onBlur = () => {
      game.setKey('left', false);
      game.setKey('right', false);
      game.setKey('up', false);
      game.setKey('down', false);
      game.setKey('shift', false);
      game.releaseFire();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [game]);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 block touch-none"
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') game.isTouch = true;
        game.audio.unlock();
        e.currentTarget.setPointerCapture(e.pointerId);
        game.touchAimStart(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons) game.touchAimMove(e.clientX, e.clientY);
      }}
      onPointerUp={() => game.touchAimEnd()}
      onPointerCancel={() => game.touchAimEnd()}
    />
  );
}
