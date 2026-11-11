// Layer description of the hero (data only — the drawing lives in rig.ts).
import { registerCharacterLayers } from './layers';

export const HERO = 'hero';

/** Front arm hanging free / empty-handed: it reads best behind the body. */
export const CTX_REST = 'rest';
/** Front arm busy (weapon, hat, carried item, raised): it has to read in front of the body. */
export const CTX_ACTIVE = 'active';

const BEHIND_BODY = ['bowBack', 'quiver', 'legBack', 'legFront'];
const BODY = ['torso', 'beard', 'face', 'hat', 'strap'];
const BACK_ARM = ['armBack', 'weaponBack', 'handBack'];
const FRONT_ARM = ['armFront', 'itemFront', 'handFront'];

registerCharacterLayers({
  id: HERO,
  name: 'Hero (the archer)',
  parts: [
    { id: 'bowBack', label: 'Slung bow (on back)' },
    { id: 'quiver', label: 'Quiver' },
    { id: 'legBack', label: 'Back leg + boot' },
    { id: 'legFront', label: 'Front leg + boot' },
    { id: 'armFront', label: 'Front arm' },
    { id: 'itemFront', label: 'Front-hand item (bow, weapon, hat in hand)' },
    { id: 'handFront', label: 'Front hand' },
    { id: 'torso', label: 'Torso (tunic)' },
    { id: 'beard', label: 'Beard' },
    { id: 'face', label: 'Face (eyes, nose, mustache)' },
    { id: 'hat', label: 'Hat (on head)' },
    { id: 'strap', label: 'Quiver belt' },
    { id: 'armBack', label: 'Back arm' },
    { id: 'weaponBack', label: 'Back-hand weapon' },
    { id: 'handBack', label: 'Back hand' },
  ],
  contexts: [
    { id: CTX_REST, label: 'Front arm free', hint: 'Standing, walking, aiming the bow — nothing held in the front hand.' },
    { id: CTX_ACTIVE, label: 'Front arm in use', hint: 'Holding a weapon, hat or carried item, or the hand is raised.' },
  ],
  defaults: {
    [CTX_REST]: [...BEHIND_BODY, ...FRONT_ARM, ...BODY, ...BACK_ARM],
    [CTX_ACTIVE]: [...BEHIND_BODY, ...BODY, ...BACK_ARM, ...FRONT_ARM],
  },
  scenarios: [
    { id: 'idle', label: 'Standing', context: CTX_REST },
    { id: 'walk', label: 'Walking', context: CTX_REST },
    { id: 'bow', label: 'Aiming bow', context: CTX_REST },
    { id: 'bowDraw', label: 'Bow drawn', context: CTX_REST },
    { id: 'sit', label: 'Sitting', context: CTX_REST },
    { id: 'sword', label: 'Sword ready', context: CTX_ACTIVE },
    { id: 'spear', label: 'Spear ready', context: CTX_ACTIVE },
    { id: 'axe', label: 'Axe ready', context: CTX_ACTIVE },
    { id: 'hat', label: 'Hat in hand', context: CTX_ACTIVE },
    { id: 'wave', label: 'Waving', context: CTX_ACTIVE },
  ],
});
