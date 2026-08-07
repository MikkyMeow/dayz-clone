import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

globalThis.window = {};
globalThis.innerWidth = 800;
globalThis.innerHeight = 600;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
const context = { setTransform() {} };
globalThis.document = {
  querySelector() {
    return { width: 0, height: 0, getContext: () => context };
  }
};
vm.runInThisContext(fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'));

const { C } = await import('../js/config.js');
const stateModule = await import('../js/state.js');
const { emitNoise } = await import('../js/noise.js');
const { canSeePlayer, updatePerception } = await import('../js/zombie-perception.js');
const { updateZombies, ZombieState } = await import('../js/zombies.js');

function zombieAt(x, y, angle = 0) {
  return {
    x, y, r: C.zombie.radius, hp: C.zombie.health,
    speed: 50, wanderSpeed: 10, wanderTimer: 2, cooldown: 0, angle,
    behaviorState: ZombieState.WANDER, stateReason: 'test',
    lastSeenPosition: null, lastSeenAt: -Infinity,
    lastHeardPosition: null, lastHeardAt: -Infinity,
    lastNoiseCheckedAt: -1, targetPosition: null,
    searchTarget: null, searchTimer: 0,
    path: [], pathIndex: 0, pathTarget: null, pathUpdateTimer: 0,
    perceptionTimer: 0, stuckTimer: 0, previousPosition: { x, y }
  };
}

test('vision requires an unobstructed line and respects facing', () => {
  stateModule.resetState();
  const zombie = zombieAt(350, 480, 0);
  stateModule.state.player.x = 370;
  stateModule.state.player.y = 480;
  assert.equal(canSeePlayer(zombie), true);

  stateModule.state.player.x = 570;
  assert.equal(canSeePlayer(zombie), false, 'building should hide player');

  stateModule.state.player.x = 250;
  assert.equal(canSeePlayer(zombie), false, 'player behind view direction should stay hidden');
});

test('audible noise records an approximate last-known position', () => {
  stateModule.resetState();
  const zombie = zombieAt(100, 100);
  stateModule.state.time = 2;
  emitNoise({ x: 180, y: 100 }, 300, 'running');
  const perception = updatePerception(zombie, .2);
  assert.equal(perception.heardNoise, true);
  assert.ok(zombie.lastHeardPosition);
  assert.equal(zombie.lastHeardAt, 2);
});

test('zombie changes from chase to investigate and then search after losing contact', () => {
  stateModule.resetState();
  const zombie = zombieAt(100, 100, 0);
  stateModule.state.player.x = 220;
  stateModule.state.player.y = 100;
  stateModule.state.zombies.push(zombie);

  updateZombies(.2);
  assert.equal(zombie.behaviorState, ZombieState.CHASE);
  assert.ok(zombie.lastSeenPosition);

  // Помещаем между ними здание фермы, сохраняя дистанцию преследования.
  zombie.x = 350;
  zombie.y = 480;
  zombie.previousPosition = { x: 350, y: 480 };
  zombie.angle = 0;
  zombie.perceptionTimer = 0;
  stateModule.state.player.x = 570;
  stateModule.state.player.y = 480;
  stateModule.state.time += .2;
  updateZombies(.2);
  assert.equal(zombie.behaviorState, ZombieState.INVESTIGATE);

  zombie.perceptionTimer = 0;
  stateModule.state.time += C.zombie.memoryDuration + .1;
  updateZombies(.2);
  assert.equal(zombie.behaviorState, ZombieState.SEARCH);
});

test('running noise starts investigation without visual contact', () => {
  stateModule.resetState();
  const zombie = zombieAt(350, 480, 0);
  stateModule.state.player.x = 570;
  stateModule.state.player.y = 480;
  stateModule.state.zombies.push(zombie);
  stateModule.state.time = 1;
  emitNoise(stateModule.state.player, C.zombie.runNoiseRadius, 'running');

  updateZombies(.2);
  assert.equal(zombie.behaviorState, ZombieState.INVESTIGATE);
  assert.equal(zombie.stateReason, 'noise heard');
});

test('investigating zombie follows a route around a building', () => {
  stateModule.resetState();
  const zombie = zombieAt(350, 480, 0);
  const target = { x: 570, y: 480 };
  zombie.behaviorState = ZombieState.INVESTIGATE;
  zombie.lastHeardPosition = target;
  zombie.lastHeardAt = 0;
  zombie.perceptionTimer = 999;
  stateModule.state.player.x = target.x;
  stateModule.state.player.y = target.y;
  stateModule.state.zombies.push(zombie);

  let closest = Infinity;
  for (let frame = 0; frame < 240; frame++) {
    stateModule.state.time += .05;
    updateZombies(.05);
    closest = Math.min(closest, Math.hypot(zombie.x - target.x, zombie.y - target.y));
  }
  assert.ok(closest < C.zombie.waypointReachDistance * 2, `closest distance was ${closest}`);
});
