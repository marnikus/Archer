import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type HudState, type Mode } from './game/engine';
import { AudioSys } from './game/audio';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { GameOverScreen, PauseScreen, TitleScreen, VictoryScreen } from './components/Screens';
import { LabScene } from './lab/LabScene';
import { SettingsScreen } from './settings/SettingsScreen';

export default function App() {
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = new Game(new AudioSys());
  const game = gameRef.current;

  const [hud, setHud] = useState<HudState>(() => game.snapshot());
  const [mode, setMode] = useState<Mode>('normal');
  const [view, setView] = useState<'game' | 'lab' | 'settings'>('game');
  const [, setTick] = useState(0);

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

  const openLab = useCallback(() => {
    if (game.phase === 'playing') game.togglePause();
    game.audio.musicStop();
    setView('lab');
  }, [game]);

  const openSettings = useCallback(() => {
    if (game.phase === 'playing') game.togglePause();
    setView('settings');
  }, [game]);

  // Enter starts / replays from the overlay screens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view !== 'game') return;
      if (e.code !== 'Enter') return;
      if (game.phase === 'title') play();
      else if (game.phase === 'victory' || game.phase === 'gameover') game.restart();
      else if (game.phase === 'paused') game.togglePause();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, play, view]);

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

  if (view === 'settings') return <SettingsScreen onExit={() => setView('game')} />;

  if (view === 'lab')
    return (
      <LabScene
        onExit={() => {
          if (game.phase === 'paused' || game.phase === 'playing') game.audio.musicStart();
          setView('game');
        }}
      />
    );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#DAE5F7] font-display">
      <GameCanvas game={game} onSnapshot={onSnapshot} />

      {hud.phase !== 'title' && (
        <button
          type="button"
          onClick={openLab}
          className="absolute left-1/2 top-[76px] z-10 -translate-x-1/2 rounded-2xl bg-white/80 px-3 py-1.5 text-[11px] font-black text-[#4C372A] shadow-[0_6px_20px_rgba(76,55,42,0.12)] backdrop-blur-sm transition-transform hover:scale-105"
        >
          🎬 Animation Lab
        </button>
      )}

      {hud.phase !== 'title' && <HUD s={hud} onPause={() => game.togglePause()} onMute={toggleMute} onMove={(d) => game.setTouchMove(d)} onAction={(a) => game.runAction(a)} onEquip={(k) => game.equip(k)} />}

      {hud.phase === 'title' && <TitleScreen mode={mode} setMode={setMode} onPlay={play} onLab={openLab} onSettings={openSettings} best={hud.best} touch={hud.touch} />}

      {hud.phase === 'paused' && (
        <PauseScreen
          onResume={() => game.togglePause()}
          onRestart={() => game.restart()}
          onTitle={() => game.toTitle()}
          onSettings={openSettings}
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
