import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'));

const { C } = await import('../js/config.js');
const { attackPath, buildings, doorIsBlocked, findNearbyDoor, hasClearPath, hasLineOfSight, isWalkable, resetDoors, toggleDoor } = await import('../js/world.js');
const { beginNavigationFrame, findPath, invalidateNavigation, projectToWalkable } = await import('../js/navigation.js');

test('world geometry blocks sight and movement through a building', () => {
  const from = { x: 360, y: 480 };
  const to = { x: 570, y: 480 };
  assert.equal(hasLineOfSight(from, to), false);
  assert.equal(hasClearPath(from, to, C.zombie.navigationClearance), false);
  assert.deepEqual(attackPath(from, to), { blocked: true, damageMultiplier: 0 });
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

test('every building has one or more doors with open and closed states', () => {
  assert.ok(buildings.some(building => building.doors.length > 1));
  for (const building of buildings) {
    assert.ok(building.doors.length >= 1);
    assert.equal(isWalkable({
      x: building.x + building.w / 2,
      y: building.y + building.h / 2
    }, C.player.radius), true);

    for (const door of building.doors) {
      const point = door.side === 'top' || door.side === 'bottom'
        ? { x: building.x + door.center, y: door.side === 'top' ? building.y + 4 : building.y + building.h - 4 }
        : { x: door.side === 'left' ? building.x + 4 : building.x + building.w - 4, y: building.y + door.center };
      assert.equal(findNearbyDoor(point), door);
      assert.equal(isWalkable(point, C.player.radius), false);
      toggleDoor(door);
      assert.equal(isWalkable(point, C.player.radius), true);
      assert.equal(door.open, true);
    }
  }
  resetDoors();
  invalidateNavigation();
});

test('an open door detects occupants standing in its doorway', () => {
  const door = buildings[0].doors[0];
  const building = door.building;
  const point = door.side === 'top' || door.side === 'bottom'
    ? { x: building.x + door.center, y: door.side === 'top' ? building.y + 4 : building.y + building.h - 4 }
    : { x: door.side === 'left' ? building.x + 4 : building.x + building.w - 4, y: building.y + door.center };
  toggleDoor(door);
  assert.equal(doorIsBlocked(door, [{ ...point, r: C.player.radius }]), true);
  assert.equal(doorIsBlocked(door, [{ x: point.x + 100, y: point.y + 100, r: C.player.radius }]), false);
  resetDoors();
  invalidateNavigation();
});
