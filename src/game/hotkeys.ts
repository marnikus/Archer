// Single source of truth for keyboard shortcuts: the engine dispatches from it and the HUD displays it.
// `action` grammar: "play:<anim>" | "equip:<weapon>" | "ready" | "attack" | "cycle:<what>" | "peek:<dir>" | "hat:<what>" | "drop:<item>"

export interface Hotkey {
  code: string; // KeyboardEvent.code ('' = display only)
  key: string; // label shown to the player
  label: string;
  group: string;
  action: string;
  hold?: boolean;
}

export const HOTKEYS: Hotkey[] = [
  // ---- movement
  { code: '', key: '← →  A D', label: 'Walk', group: 'Move', action: 'walk' },
  { code: 'ShiftLeft', key: 'Shift', label: 'Run (hold)', group: 'Move', action: 'hold:run', hold: true },
  { code: 'KeyC', key: 'C', label: 'Sneak → Creep → Normal', group: 'Move', action: 'cycle:move' },
  { code: 'KeyG', key: 'G', label: 'Walk style (casual · normal · power · brisk · tired)', group: 'Move', action: 'cycle:walk' },
  { code: 'KeyJ', key: 'J', label: 'Jump', group: 'Move', action: 'play:jump' },
  { code: 'KeyK', key: 'K', label: 'Small hop', group: 'Move', action: 'play:hop' },
  // ---- stance
  { code: 'KeyV', key: 'V', label: 'Sit · look around · shift · stand', group: 'Stance', action: 'cycle:sit' },
  { code: 'KeyB', key: 'B', label: 'Hide · hide idle · stand', group: 'Stance', action: 'cycle:hide' },
  { code: 'KeyQ', key: 'Q', label: 'Peek forward (hold)', group: 'Stance', action: 'peek:left', hold: true },
  { code: 'KeyE', key: 'E', label: 'Peek back (hold)', group: 'Stance', action: 'peek:right', hold: true },
  { code: 'KeyI', key: 'I', label: 'Idle style (neutral · alert · tired · bored · armed)', group: 'Stance', action: 'cycle:idle' },
  // ---- reactions
  { code: 'KeyN', key: 'N', label: 'Nod', group: 'React', action: 'play:nod' },
  { code: 'KeyU', key: 'U', label: 'Shake head', group: 'React', action: 'play:shake' },
  { code: 'KeyR', key: 'R', label: 'Wave', group: 'React', action: 'play:wave' },
  { code: 'KeyL', key: 'L', label: 'Look at item', group: 'React', action: 'play:look-item' },
  { code: 'KeyO', key: 'O', label: 'Surprised', group: 'React', action: 'play:surprised' },
  { code: 'KeyY', key: 'Y', label: 'Disappointed', group: 'React', action: 'play:disappointed' },
  { code: 'KeyZ', key: 'Z', label: 'Victory dance', group: 'React', action: 'play:victory' },
  { code: 'KeyX', key: 'X', label: 'Celebrate hop', group: 'React', action: 'play:celebrate' },
  // ---- hat
  { code: 'KeyT', key: 'T', label: 'Hat off / on', group: 'Hat', action: 'hat:toggle' },
  { code: 'KeyH', key: 'H', label: 'Drop hat / pick it up', group: 'Hat', action: 'hat:drop' },
  // ---- inventory
  { code: 'Digit0', key: '0', label: 'Unarmed', group: 'Inventory', action: 'equip:unarmed' },
  { code: 'Digit1', key: '1', label: 'Bow', group: 'Inventory', action: 'equip:bow' },
  { code: 'Digit2', key: '2', label: 'Crossbow', group: 'Inventory', action: 'equip:crossbow' },
  { code: 'Digit3', key: '3', label: 'Spear', group: 'Inventory', action: 'equip:spear' },
  { code: 'Digit4', key: '4', label: 'Sword', group: 'Inventory', action: 'equip:sword' },
  { code: 'Digit5', key: '5', label: 'Staff', group: 'Inventory', action: 'equip:staff' },
  { code: 'Digit6', key: '6', label: 'Axe', group: 'Inventory', action: 'equip:axe' },
  { code: 'Tab', key: 'Tab', label: 'Ready / carry weapon', group: 'Inventory', action: 'ready' },
  { code: 'KeyF', key: 'F', label: 'Attack', group: 'Inventory', action: 'attack' },
  { code: 'BracketLeft', key: '[', label: 'Put down the bow', group: 'Inventory', action: 'drop:bow' },
  { code: 'BracketRight', key: ']', label: 'Put down the quiver', group: 'Inventory', action: 'drop:quiver' },
  // ---- game
  { code: 'Space', key: 'Space', label: 'Draw & shoot the bow (hold / release)', group: 'Game', action: 'shoot' },
  { code: '', key: '↑ ↓  W S', label: 'Aim angle', group: 'Game', action: 'aim' },
  { code: 'KeyP', key: 'P / Esc', label: 'Pause', group: 'Game', action: 'pause' },
  { code: 'KeyM', key: 'M', label: 'Mute', group: 'Game', action: 'mute' },
  { code: 'F1', key: 'F1', label: 'This help', group: 'Game', action: 'help' },
];

/** The key label for a given action, e.g. 'play:wave' → 'R'. */
export const keyFor = (action: string) => HOTKEYS.find((h) => h.action === action)?.key ?? '';

export const WEAPON_SLOTS = [
  { kind: 'unarmed', label: 'Unarmed', key: '0' },
  { kind: 'bow', label: 'Bow', key: '1' },
  { kind: 'crossbow', label: 'Crossbow', key: '2' },
  { kind: 'spear', label: 'Spear', key: '3' },
  { kind: 'sword', label: 'Sword', key: '4' },
  { kind: 'staff', label: 'Staff', key: '5' },
  { kind: 'axe', label: 'Axe', key: '6' },
] as const;
