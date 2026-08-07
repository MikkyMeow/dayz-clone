import { C } from './config.js';
import { distance } from './utils.js';
import { hasClearPath, isWalkable } from './world.js';

// Реализация навигации намеренно скрыта за этим модулем. Сейчас используется
// сетка, позднее findPath/projectToWalkable можно перевести на navmesh.
const cellSize = C.navigation.cellSize;
const columns = Math.ceil(C.world.width / cellSize);
const rows = Math.ceil(C.world.height / cellSize);
const grids = new Map();
let searchesThisFrame = 0;

const directions = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
  [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]
];

class MinHeap {
  constructor() { this.items = []; }
  push(item) {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent].score <= item.score) break;
      items[index] = items[parent];
      index = parent;
    }
    items[index] = item;
  }
  pop() {
    const items = this.items;
    const root = items[0];
    const last = items.pop();
    if (items.length && last) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        let child = right < items.length && items[right].score < items[left].score ? right : left;
        if (items[child].score >= last.score) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = last;
    }
    return root;
  }
  get length() { return this.items.length; }
}

function cellIndex(x, y) { return y * columns + x; }
function cellPoint(x, y) {
  return {
    x: Math.min(C.world.width - 1, x * cellSize + cellSize / 2),
    y: Math.min(C.world.height - 1, y * cellSize + cellSize / 2)
  };
}

function gridFor(clearance) {
  const key = Math.round(clearance);
  if (grids.has(key)) return grids.get(key);
  const walkable = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      walkable[cellIndex(x, y)] = isWalkable(cellPoint(x, y), clearance) ? 1 : 0;
    }
  }
  const grid = { walkable, clearance };
  grids.set(key, grid);
  return grid;
}

function nearestWalkableCell(position, grid) {
  const startX = Math.max(0, Math.min(columns - 1, Math.floor(position.x / cellSize)));
  const startY = Math.max(0, Math.min(rows - 1, Math.floor(position.y / cellSize)));
  const maxRadius = Math.max(columns, rows);
  for (let radius = 0; radius < maxRadius; radius++) {
    for (let y = Math.max(0, startY - radius); y <= Math.min(rows - 1, startY + radius); y++) {
      for (let x = Math.max(0, startX - radius); x <= Math.min(columns - 1, startX + radius); x++) {
        if (radius && Math.abs(x - startX) !== radius && Math.abs(y - startY) !== radius) continue;
        if (grid.walkable[cellIndex(x, y)]) return { x, y };
      }
    }
  }
  return null;
}

export function beginNavigationFrame() {
  searchesThisFrame = 0;
}

export function projectToWalkable(position, agentOptions = {}) {
  const clearance = agentOptions.clearance ?? C.zombie.navigationClearance;
  if (isWalkable(position, clearance)) return { x: position.x, y: position.y };
  const cell = nearestWalkableCell(position, gridFor(clearance));
  return cell ? cellPoint(cell.x, cell.y) : null;
}

function reconstructPath(cameFrom, endIndex) {
  const result = [];
  let current = endIndex;
  while (current !== -1) {
    const x = current % columns;
    const y = Math.floor(current / columns);
    result.push(cellPoint(x, y));
    current = cameFrom[current];
  }
  result.reverse();
  return result;
}

function smoothPath(from, target, points, clearance) {
  const candidates = points.concat(target);
  const result = [];
  let anchor = { x: from.x, y: from.y };
  let index = 0;
  while (index < candidates.length) {
    let furthest = index;
    for (let test = candidates.length - 1; test >= index; test--) {
      if (hasClearPath(anchor, candidates[test], clearance)) {
        furthest = test;
        break;
      }
    }
    const point = candidates[furthest];
    result.push({ x: point.x, y: point.y });
    anchor = point;
    index = furthest + 1;
  }
  return result;
}

export function findPath(from, to, agentOptions = {}) {
  if (searchesThisFrame >= C.navigation.maxSearchesPerFrame) return null;
  searchesThisFrame++;

  const clearance = agentOptions.clearance ?? C.zombie.navigationClearance;
  const target = projectToWalkable(to, { clearance });
  if (!target) return [];
  if (hasClearPath(from, target, clearance)) return [target];

  const grid = gridFor(clearance);
  const start = nearestWalkableCell(from, grid);
  const end = nearestWalkableCell(target, grid);
  if (!start || !end) return [];

  const total = columns * rows;
  const cameFrom = new Int32Array(total);
  cameFrom.fill(-1);
  const scores = new Float64Array(total);
  scores.fill(Infinity);
  const closed = new Uint8Array(total);
  const startIndex = cellIndex(start.x, start.y);
  const endIndex = cellIndex(end.x, end.y);
  const open = new MinHeap();
  scores[startIndex] = 0;
  open.push({ index: startIndex, x: start.x, y: start.y, score: 0 });

  while (open.length) {
    const current = open.pop();
    if (closed[current.index]) continue;
    if (current.index === endIndex) {
      const raw = reconstructPath(cameFrom, endIndex);
      return smoothPath(from, target, raw.slice(1), clearance);
    }
    closed[current.index] = 1;

    for (const [dx, dy, cost] of directions) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const nextIndex = cellIndex(x, y);
      if (!grid.walkable[nextIndex] || closed[nextIndex]) continue;
      // Не срезаем диагональ через угол двух непроходимых клеток.
      if (dx && dy && (
        !grid.walkable[cellIndex(current.x + dx, current.y)] ||
        !grid.walkable[cellIndex(current.x, current.y + dy)]
      )) continue;
      const tentative = scores[current.index] + cost;
      if (tentative >= scores[nextIndex]) continue;
      scores[nextIndex] = tentative;
      cameFrom[nextIndex] = current.index;
      const heuristic = Math.hypot(end.x - x, end.y - y);
      open.push({ index: nextIndex, x, y, score: tentative + heuristic });
    }
  }
  return [];
}

export function pathNeedsRefresh(pathTarget, target) {
  return !pathTarget || distance(pathTarget, target) >= C.zombie.pathTargetMoveThreshold;
}
