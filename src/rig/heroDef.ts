// Layer description of the hero (data only — the drawing lives in rig.ts).
// ONE stacked list, back → front. Whatever order is saved is exactly what the game draws,
// in every pose (there is no automatic re-ordering).
import { registerCharacterLayers } from './layers';

export const HERO = 'hero';
export const CTX = 'main';

registerCharacterLayers({
  id: HERO,
  name: 'Hero (the archer)',
  parts: [
    { id: 'bowBack', label: 'Bow slung on back' },
    { id: 'quiver', label: 'Quiver' },
    { id: 'legBack', label: 'Right leg (back)' },
    { id: 'bootBack', label: 'Right boot (back)' },
    { id: 'legFront', label: 'Left leg (front)' },
    { id: 'bootFront', label: 'Left boot (front)' },
    { id: 'armFront', label: 'Left arm (front)' },
    { id: 'torso', label: 'Torso (tunic)' },
    { id: 'beard', label: 'Beard' },
    { id: 'face', label: 'Face (skin, eyes, nose)' },
    { id: 'mustache', label: 'Mustache' },
    { id: 'hat', label: 'Hat (on head)' },
    { id: 'strap', label: 'Quiver belt' },
    { id: 'armBack', label: 'Right arm (back)' },
    { id: 'weaponBack', label: 'Right-hand weapon' },
    { id: 'handBack', label: 'Right hand (back)' },
    { id: 'itemFront', label: 'Left-hand bow / weapon / hat in hand' },
    { id: 'handFront', label: 'Left hand (front)' },
  ],
  contexts: [{ id: CTX, label: 'Layer order', hint: 'Top of the list draws in front. The game uses exactly this order in every pose.' }],
  defaults: {
    [CTX]: [
      'bowBack',
      'quiver',
      'legBack',
      'bootBack',
      'legFront',
      'bootFront',
      'armFront',
      'torso',
      'beard',
      'face',
      'mustache',
      'hat',
      'strap',
      'armBack',
      'weaponBack',
      'handBack',
      'itemFront',
      'handFront',
    ],
  },
  scenarios: [
    { id: 'idle', label: 'Standing', context: CTX },
    { id: 'walk', label: 'Walking', context: CTX },
    { id: 'bow', label: 'Aiming bow', context: CTX },
    { id: 'bowDraw', label: 'Bow drawn', context: CTX },
    { id: 'sit', label: 'Sitting', context: CTX },
    { id: 'sword', label: 'Sword ready', context: CTX },
    { id: 'spear', label: 'Spear ready', context: CTX },
    { id: 'axe', label: 'Axe ready', context: CTX },
    { id: 'hat', label: 'Hat in hand', context: CTX },
    { id: 'wave', label: 'Waving', context: CTX },
  ],
});
