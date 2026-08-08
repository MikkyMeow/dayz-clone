export function intersectsBounds(item, bounds, padding = 0) {
  const left = item.x - (item.r ?? 0);
  const top = item.y - (item.r ?? 0);
  const right = item.x + (item.w ?? item.r ?? 0);
  const bottom = item.y + (item.h ?? item.r ?? 0);
  return right >= bounds.left - padding && left <= bounds.right + padding &&
    bottom >= bounds.top - padding && top <= bounds.bottom + padding;
}

export class SpatialGrid {
  constructor(cellSize = 320) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.memberships = new Map();
  }

  key(x, y) { return `${x},${y}`; }

  range(bounds) {
    return {
      minX: Math.floor(bounds.left / this.cellSize),
      maxX: Math.floor(bounds.right / this.cellSize),
      minY: Math.floor(bounds.top / this.cellSize),
      maxY: Math.floor(bounds.bottom / this.cellSize)
    };
  }

  boundsFor(item) {
    const radius = item.r ?? 0;
    return {
      left: item.x - radius,
      right: item.x + (item.w ?? radius),
      top: item.y - radius,
      bottom: item.y + (item.h ?? radius)
    };
  }

  insert(item, bounds = this.boundsFor(item)) {
    this.remove(item);
    const keys = [];
    const range = this.range(bounds);
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        const key = this.key(x, y);
        let cell = this.cells.get(key);
        if (!cell) this.cells.set(key, cell = new Set());
        cell.add(item);
        keys.push(key);
      }
    }
    this.memberships.set(item, keys);
    return item;
  }

  update(item, bounds = this.boundsFor(item)) {
    const next = this.range(bounds);
    const keys = this.memberships.get(item);
    if (keys?.length && keys[0] === this.key(next.minX, next.minY) &&
        keys[keys.length - 1] === this.key(next.maxX, next.maxY) &&
        keys.length === (next.maxX - next.minX + 1) * (next.maxY - next.minY + 1)) return false;
    this.insert(item, bounds);
    return true;
  }

  remove(item) {
    const keys = this.memberships.get(item);
    if (!keys) return false;
    for (const key of keys) {
      const cell = this.cells.get(key);
      cell?.delete(item);
      if (cell?.size === 0) this.cells.delete(key);
    }
    this.memberships.delete(item);
    return true;
  }

  query(bounds, output = []) {
    output.length = 0;
    const seen = new Set();
    const range = this.range(bounds);
    for (let y = range.minY; y <= range.maxY; y++) {
      for (let x = range.minX; x <= range.maxX; x++) {
        const cell = this.cells.get(this.key(x, y));
        if (!cell) continue;
        for (const item of cell) {
          if (seen.has(item)) continue;
          seen.add(item);
          if (intersectsBounds(item, bounds)) output.push(item);
        }
      }
    }
    return output;
  }

  clear() {
    this.cells.clear();
    this.memberships.clear();
  }
}
