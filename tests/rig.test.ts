import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legRig } from '../src/game/rig';
import { archerGeom, drawArrowArt, RIG, DEG } from '../src/game/art';
import { Game } from '../src/game/engine';
import type { AudioSys } from '../src/game/audio';

const audio = new Proxy({}, { get: () => () => {} }) as AudioSys;
const advance = (game: Game, seconds: number) => { for (let i = 0; i < seconds * 60; i++) game.update(1 / 60); };

test('walk and run alternate feet; run has a longer, higher stride', () => {
  const walk = legRig(0, 'walk', 0);
  const run = legRig(0, 'run', 0);
  assert.ok(walk[0].ankle.y < walk[1].ankle.y);
  assert.ok(run[0].ankle.y < walk[0].ankle.y);
  const walkStride = legRig(Math.PI / 2, 'walk', 0);
  const runStride = legRig(Math.PI / 2, 'run', 0);
  assert.ok(Math.abs(runStride[0].ankle.x - runStride[0].hip.x) > Math.abs(walkStride[0].ankle.x - walkStride[0].hip.x));
  const halfCycle = legRig(Math.PI, 'walk', 0);
  assert.ok(halfCycle[1].ankle.y < halfCycle[0].ankle.y);
  assert.deepEqual(legRig(0, 'idle', 0), legRig(3, 'idle', 0));
});

test('movement faces travel; running is faster and aiming faces target', () => {
  const game = new Game(audio); game.start('normal');
  const x = game.archer.x;
  game.setKey('left', true); advance(game, .5);
  const walkDistance = x - game.archer.x;
  assert.equal(game.archer.facing, -1); assert.equal(game.archer.pose, 'walk');
  game.setKey('left', false); game.setKey('right', true); game.running = true;
  const before = game.archer.x; advance(game, .5);
  assert.equal(game.archer.facing, 1); assert.equal(game.archer.pose, 'run');
  assert.ok(game.archer.x - before > walkDistance * 1.5);
  game.archer.hasBow = true; game.archer.hasQuiver = true;
  game.setKey('right', false); advance(game, .5);
  assert.equal(game.archer.facing, -1); assert.equal(game.archer.pose, 'aim');
  assert.ok(game.archer.armFront < -1.5, 'bow is carried across the body at rest');
  game.pressFire(); advance(game, .5);
  assert.equal(game.archer.pose, 'draw'); assert.equal(game.archer.facing, -1);
  assert.ok(game.archer.armFront > 0, 'bow arm raises toward aim');
  game.releaseFire();
  assert.equal(game.arrows.length, 1); assert.ok(game.arrows[0].vx < 0, 'arrow travels toward target');
});

test('bow tip points toward target and fletching trails the arrowhead', () => {
  for (const angle of [5, 40, 80]) {
    const g = archerGeom({ armFront: angle * DEG, bowRot: angle * DEG, draw: .7 });
    assert.ok(g.tip.x < g.nock.x);
    assert.ok(g.tip.y < g.nock.y);
    assert.ok(Math.abs(Math.hypot(g.tip.x - g.nock.x, g.tip.y - g.nock.y) - RIG.ARROW_LEN) < 1e-8);
  }
  const paths: number[][][] = []; let current: number[][] = [];
  const ctx = { beginPath() { current = []; paths.push(current); }, moveTo(x: number, y: number) { current.push([x, y]); }, lineTo(x: number, y: number) { current.push([x, y]); }, closePath() {}, fill() {}, stroke() {} } as unknown as CanvasRenderingContext2D;
  drawArrowArt(ctx);
  const feathers = paths.slice(2, 4);
  const arrowhead = paths[4];
  assert.ok(feathers.every(p => p.every(([x]) => x < -RIG.ARROW_LEN + 50)));
  assert.ok(arrowhead.some(([x]) => x > 0));
  assert.ok(feathers[0][1][0] < feathers[0][0][0], 'feathers sweep back from the shaft');
});

test('aim preview sweet spot still lands a shot after the carry-to-draw transition', () => {
  const game = new Game(audio); game.start('normal');
  game.archer.x = 1700; game.archer.hasBow = true; game.archer.hasQuiver = true;
  advance(game, .2);
  const power = game.sweetSpot(); assert.ok(power >= 0 && power <= 100);
  game.pressFire(); advance(game, .3); game.archer.power = power; game.releaseFire();
  advance(game, 4);
  assert.equal(game.streak, 1);
});
