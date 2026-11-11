import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudState, type Mode } from './game/engine';
import { AudioSys } from './game/audio';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { RigInspector } from './components/RigInspector';
import { GameOverScreen, PauseScreen, TitleScreen, VictoryScreen } from './components/Screens';

export default function App() {
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = new Game(new AudioSys());
  const game = gameRef.current;

  const [hud, setHud] = useState<HudState>(() => game.snapshot());
  const [mode, setMode] = useState<Mode>('normal');
  const [, setTick] = useState(0);
  const [rigOpen, setRigOpen] = useState(false);
  const [hat, setHat] = useState(true);
  const resumeAfterRig = useRef(false);
  const openRig = useCallback(() => {
    resumeAfterRig.current = game.phase === 'playing';
    game.setKey('left', false); game.setKey('right', false); game.setKey('up', false); game.setKey('down', false);
    game.setTouchMove(0); game.running = false;
    if (resumeAfterRig.current) game.togglePause();
    setRigOpen(true);
  }, [game]);
  const closeRig = useCallback(() => {
    setRigOpen(false);
    if (resumeAfterRig.current && game.phase === 'paused') game.togglePause();
    resumeAfterRig.current = false;
  }, [game]);

  const onSnapshot = useCallback((s: HudState) => setHud(s), []);

  const play = useCallback(() => {
    game.audio.unlock();
    game.audio.uiClick();
    game.start(mode);
  }, [game, mode]);

  const toggleMute = useCallback(() => {
    game.audio.unlock();
    game.audio.toggleMuted();
    setTick((t) => t + 1);
  }, [game]);

  // Enter starts / replays from the overlay screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rigOpen || e.code !== 'Enter') return;
      if (game.phase === 'title') play();
      else if (game.phase === 'victory' || game.phase === 'gameover') game.restart();
      else if (game.phase === 'paused') game.togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, play, rigOpen]);

  // keep the title's best score in sync with the selected mode
  useEffect(() => {
    if (game.phase === 'title') {
      game.mode = mode;
      game.best = (() => {
        try {
          const raw = localStorage.getItem('als-best-' + mode);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      })();
    }
  }, [game, mode]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#DAE5F7] font-display">
      <GameCanvas game={game} onSnapshot={onSnapshot} />

      {hud.phase !== 'title' && <HUD s={hud} onPause={() => game.togglePause()} onMute={toggleMute} onMove={(d) => game.setTouchMove(d)} onRun={(r) => { game.running = r; }} onRig={openRig} />}

      {hud.phase === 'title' && <TitleScreen mode={mode} setMode={setMode} onPlay={play} best={hud.best} touch={hud.touch} onRig={openRig} />}

      {hud.phase === 'paused' && (
        <PauseScreen
          onResume={() => game.togglePause()}
          onRestart={() => game.restart()}
          onTitle={() => game.toTitle()}
          muted={hud.muted}
          onMute={toggleMute}
          touch={hud.touch}
        />
      )}

      {hud.phase === 'victory' && hud.result && (
        <VictoryScreen result={hud.result} best={hud.best} mode={hud.mode} onReplay={() => game.restart()} onTitle={() => game.toTitle()} />
      )}

      {rigOpen && <RigInspector onClose={closeRig} hat={hat} onHat={(v) => { setHat(v); game.hat = v; }} />}

      {hud.phase === 'gameover' && hud.result && <GameOverScreen result={hud.result} onReplay={() => game.restart()} onTitle={() => game.toTitle()} />}
    </div>
  );
}
