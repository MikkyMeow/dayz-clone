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
const { attack, updateCombat } = await import('../js/combat.js');
const stateModule = await import('../js/state.js');
const { buildings, doorPosition, resetDoors, toggleDoor } = await import('../js/world.js');

function zombieAt(x, y) {
  return {
    x, y, r: C.zombie.radius, hp: C.zombie.health,
    staggerTimer: 0, attackTimer: 0
  };
}

function pointsAcrossDoor(door, distance = 20) {
  const center = doorPosition(door);
  if (door.side === 'top') return [{ x: center.x, y: center.y - distance }, { x: center.x, y: center.y + distance }];
  if (door.side === 'bottom') return [{ x: center.x, y: center.y + distance }, { x: center.x, y: center.y - distance }];
  if (door.side === 'left') return [{ x: center.x - distance, y: center.y }, { x: center.x + distance, y: center.y }];
  return [{ x: center.x + distance, y: center.y }, { x: center.x - distance, y: center.y }];
}

test('melee damage lands after the readable windup, not on button press', () => {
  stateModule.resetState();
  const player = stateModule.state.player;
  player.x = 100;
  player.y = 100;
  player.angle = 0;
  const zombie = zombieAt(140, 100);
  stateModule.state.zombies.push(zombie);

  attack();
  assert.equal(zombie.hp, C.zombie.health);
  updateCombat(C.weapons[0].windup / 2);
  assert.equal(zombie.hp, C.zombie.health);
  updateCombat(C.weapons[0].windup);
  assert.equal(zombie.hp, C.zombie.health - C.weapons[0].damage);
  assert.ok(zombie.x > 140, 'a hit should create breathing room');
  assert.ok(zombie.staggerTimer > 0, 'a hit should interrupt the zombie');
});

test('melee attacks do not start without a target in the aimed sector', () => {
  stateModule.resetState();
  const player = stateModule.state.player;
  player.x = 100;
  player.y = 100;
  player.angle = 0;
  const zombie = zombieAt(100, 140);
  stateModule.state.zombies.push(zombie);
  const staminaBefore = player.stamina;

  attack();
  assert.equal(player.pendingAttack, null);
  assert.equal(player.cooldown, 0);
  assert.equal(player.stamina, staminaBefore);
  assert.equal(zombie.hp, C.zombie.health);
});

test('melee attacks do not start when all zombies are out of reach', () => {
  stateModule.resetState();
  const player = stateModule.state.player;
  player.x = 100;
  player.y = 100;
  player.angle = 0;
  stateModule.state.zombies.push(zombieAt(100 + C.weapons[0].range + 1, 100));

  attack();
  assert.equal(player.pendingAttack, null);
  assert.equal(player.cooldown, 0);
});

test('a closed door blocks melee attacks', () => {
  stateModule.resetState();
  const player = stateModule.state.player;
  const [outside, inside] = pointsAcrossDoor(buildings[0].doors[0]);
  Object.assign(player, outside, { angle: Math.atan2(inside.y - outside.y, inside.x - outside.x) });
  const zombie = zombieAt(inside.x, inside.y);
  stateModule.state.zombies.push(zombie);

  attack();
  assert.equal(player.pendingAttack, null);
  assert.equal(zombie.hp, C.zombie.health);
});

test('shooting through a closed door deals half damage', () => {
  stateModule.resetState();
  const player = stateModule.state.player;
  const door = buildings[0].doors[0];
  const [outside, inside] = pointsAcrossDoor(door);
  Object.assign(player, outside, {
    weapon: 2,
    angle: Math.atan2(inside.y - outside.y, inside.x - outside.x)
  });
  const zombie = zombieAt(inside.x, inside.y);
  stateModule.state.zombies.push(zombie);

  attack();
  assert.equal(zombie.hp, C.zombie.health - C.weapons[2].damage / 2);

  resetDoors();
  toggleDoor(door);
  player.cooldown = 0;
  zombie.hp = C.zombie.health;
  attack();
  assert.equal(zombie.hp, C.zombie.health - C.weapons[2].damage);
  resetDoors();
});
