import assert from 'node:assert/strict';
import test from 'node:test';
import { SpatialGrid, intersectsBounds } from '../js/spatial-grid.js';

test('bounds intersection handles rectangles and circles', () => {
  const viewport = { left: 0, top: 0, right: 100, bottom: 100 };
  assert.equal(intersectsBounds({ x: 90, y: 90, w: 20, h: 20 }, viewport), true);
  assert.equal(intersectsBounds({ x: 110, y: 50, r: 5 }, viewport), false);
  assert.equal(intersectsBounds({ x: 103, y: 50, r: 5 }, viewport), true);
});

test('spatial grid queries intersecting cells without duplicates', () => {
  const grid = new SpatialGrid(100);
  const large = { x: 50, y: 50, w: 120, h: 120 };
  const far = { x: 500, y: 500, r: 10 };
  grid.insert(large); grid.insert(far);
  assert.deepEqual(grid.query({ left: 0, top: 0, right: 200, bottom: 200 }), [large]);
});

test('spatial grid updates and removes moving entities', () => {
  const grid = new SpatialGrid(100);
  const entity = { x: 10, y: 10, r: 5 };
  grid.insert(entity);
  entity.x = 250; grid.update(entity);
  assert.equal(grid.query({ left: 0, top: 0, right: 100, bottom: 100 }).length, 0);
  assert.deepEqual(grid.query({ left: 200, top: 0, right: 300, bottom: 100 }), [entity]);
  assert.equal(grid.remove(entity), true);
  assert.equal(grid.query({ left: 200, top: 0, right: 300, bottom: 100 }).length, 0);
});
