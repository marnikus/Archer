import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudState, type Mode } from './game/engine';
import { AudioSys } from './game/audio';
import type { HatId } from './game/rig';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { AnimationLabScreen } from './components/AnimationLab';
import { GameOverScreen, PauseScreen, TitleScreen, VictoryScreen } from './components/Screens';

export default function App() {
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = new Game(new AudioSys());
  const game = gameRef.current;

  const [hud, setHud] = useState<HudState>(() => game.snapshot());
  const [mode, setMode] = useState<Mode>('normal');
  const [hat, setHat] = useState<HatId>(() => game.selectedHat);
  const [showLab, setShowLab] = useState(false);
  const [, setTick] = useState(0);

  const onSnapshot = useCallback((s: HudState) => setHud(s), []);

  const play = useCallback(() => {
    game.audio.unlock();
    game.audio.uiClick();
    game.start(mode);
  }, [game, mode]);

  const handleHatChange = useCallback(
    (h: HatId) => {
      setHat(h);
      game.setHatChoice(h);
      setHud(game.snapshot());
    },
    [game],
  );

  const toggleMute = useCallback(() => {
    game.audio.unlock();
    game.audio.toggleMuted();
    setTick((t) => t + 1);
  }, [game]);

  // Enter starts / replays from the overlay screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showLab || e.code !== 'Enter') return;
      if (game.phase === 'title') play();
      else if (game.phase === 'victory' || game.phase === 'gameover') game.restart();
      else if (game.phase === 'paused') game.togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, play, showLab]);

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

  if (showLab) {
    return (
      <AnimationLabScreen
        initialHat={hat}
        onBack={() => {
          game.audio.uiClick();
          setShowLab(false);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#DAE5F7] font-display">
      <GameCanvas game={game} onSnapshot={onSnapshot} />

      {hud.phase !== 'title' && <HUD s={hud} onPause={() => game.togglePause()} onMute={toggleMute} onMove={(d) => game.setTouchMove(d)} />}

      {hud.phase === 'title' && (
        <TitleScreen
          mode={mode}
          setMode={setMode}
          hat={hat}
          setHat={handleHatChange}
          onPlay={play}
          onOpenLab={() => {
            game.audio.unlock();
            game.audio.uiClick();
            setShowLab(true);
          }}
          best={hud.best}
          touch={hud.touch}
        />
      )}

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

      {hud.phase === 'gameover' && hud.result && <GameOverScreen result={hud.result} onReplay={() => game.restart()} onTitle={() => game.toTitle()} />}
    </div>
  );
}
