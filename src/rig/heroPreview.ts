// Live hero poses for the Settings → Layers editor. Registers itself as the hero's preview.
import { Animator } from './animator';
import { drawRig } from './rig';
import { registerPreview } from './layers';
import { HERO } from './heroDef';

const D = Math.PI / 180;

const SETUP: Record<string, { warm: number; fn: (a: Animator) => void }> = {
  idle: { warm: 1.2, fn: (a) => a.setBase('idle') },
  walk: { warm: 1.3, fn: (a) => a.setBase('walk') },
  bow: { warm: 2, fn: (a) => a.shootAim(14 * D) },
  bowDraw: { warm: 2, fn: (a) => a.shootDraw(1, true) },
  sit: { warm: 2, fn: (a) => a.setBase('sit') },
  sword: { warm: 1.5, fn: (a) => { a.setWeapon('sword'); a.weaponReady = true; } },
  spear: { warm: 1.5, fn: (a) => { a.setWeapon('spear'); a.weaponReady = true; } },
  axe: { warm: 1.5, fn: (a) => { a.setWeapon('axe'); a.weaponReady = true; } },
  hat: { warm: 2, fn: (a) => a.hatTakeOff() },
  wave: { warm: 0.6, fn: (a) => a.react('wave') },
};

const cache = new Map<string, Animator>();

function animatorFor(scenario: string) {
  let a = cache.get(scenario);
  if (!a) {
    a = new Animator();
    a.params.carryMode = 'slung';
    a.hasBow = true;
    a.hasQuiver = true;
    a.weapon = 'bow';
    for (let i = 0; i < 60; i++) a.update(1 / 60);
    const s = SETUP[scenario] ?? SETUP.idle;
    s.fn(a);
    for (let t = 0; t < s.warm; t += 1 / 60) a.update(1 / 60);
    cache.set(scenario, a);
  }
  return a;
}

registerPreview(HERO, (ctx, scenario, dt) => {
  const a = animatorFor(scenario);
  if (scenario === 'wave' && !a.reaction) a.react('wave');
  a.update(dt);
  drawRig(ctx, a.pose, a.skel, { arrowsInQuiver: 3 });
});
