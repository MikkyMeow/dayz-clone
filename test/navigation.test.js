import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'));

const { C } = await import('../js/config.js');
const { hasClearPath, hasLineOfSight, isWalkable } = await import('../js/world.js');
const { beginNavigationFrame, findPath, projectToWalkable } = await import('../js/navigation.js');

test('world geometry blocks sight and movement through a building', () => {
  const from = { x: 360, y: 480 };
  const to = { x: 570, y: 480 };
  assert.equal(hasLineOfSight(from, to), false);
  assert.equal(hasClearPath(from, to, C.zombie.navigationClearance), false);
});

test('A* returns a valid smoothed route around a building', () => {
  const from = { x: 360, y: 480 };
  const target = { x: 570, y: 480 };
  beginNavigationFrame();
  const path = findPath(from, target, { clearance: C.zombie.navigationClearance });
  assert.ok(path.length >= 2);
  let anchor = from;
  for (const point of path) {
    assert.equal(hasClearPath(anchor, point, C.zombie.navigationClearance), true);
    anchor = point;
  }
  assert.deepEqual(anchor, target);
});

test('direct routes contain a single target waypoint', () => {
  const from = { x: 100, y: 100 };
  const target = { x: 250, y: 100 };
  beginNavigationFrame();
  assert.deepEqual(findPath(from, target), [target]);
});

test('blocked targets are projected to walkable space', () => {
  const insideBuilding = { x: 430, y: 470 };
  const projected = projectToWalkable(insideBuilding);
  assert.ok(projected);
  assert.equal(isWalkable(projected, C.zombie.navigationClearance), true);
});

test('path search respects its per-frame budget', () => {
  beginNavigationFrame();
  for (let i = 0; i < C.navigation.maxSearchesPerFrame; i++) {
    assert.notEqual(findPath({ x: 100, y: 100 }, { x: 250, y: 100 }), null);
  }
  assert.equal(findPath({ x: 100, y: 100 }, { x: 250, y: 100 }), null);
});
