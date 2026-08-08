import { C } from './config.js';
import { clamp, random } from './utils.js';

export const landmarks = [
  { name: 'ФЕРМА', x: 330, y: 380, w: 460, h: 330, color: '#665d3e', buildings: [[390, 430, 150, 100], [610, 520, 120, 150]], loot: 'food' },
  { name: 'ПОСЁЛОК', x: 1240, y: 270, w: 650, h: 500, color: '#57554a', buildings: [[1300, 330, 170, 120], [1550, 350, 130, 170], [1710, 570, 120, 110], [1350, 610, 160, 100]], loot: 'mixed' },
  { name: 'БОЛЬНИЦА', x: 2380, y: 360, w: 390, h: 320, color: '#656a63', buildings: [[2460, 430, 230, 180]], loot: 'medkit' },
  { name: 'ВОЕННЫЙ ЛАГЕРЬ', x: 2180, y: 1500, w: 570, h: 440, color: '#465241', buildings: [[2260, 1590, 150, 75], [2460, 1580, 150, 75], [2360, 1770, 150, 75]], loot: 'mixed' },
  { name: 'СТАРАЯ ФЕРМА', x: 470, y: 1640, w: 430, h: 370, color: '#655d3d', buildings: [[540, 1710, 180, 120], [730, 1900, 110, 90]], loot: 'food' }
];

export const ponds = [
  { x: 1080, y: 1460, rx: 230, ry: 145 },
  { x: 2840, y: 980, rx: 180, ry: 260 }
];

const WALL_THICKNESS = 8;
const DOOR_WIDTH = 54;

// Двери выбираются псевдослучайно, но зависят только от геометрии здания:
// при перезапуске навигация и внешний вид карты не начинают расходиться.
function buildingRandom(x, y, w, h) {
  let value = (x * 73856093 ^ y * 19349663 ^ w * 83492791 ^ h * 2654435761) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeBuilding([x, y, w, h]) {
  const next = buildingRandom(x, y, w, h);
  const sides = ['top', 'right', 'bottom', 'left'];
  const doorCount = next() < .58 ? 1 : Math.min(3, w > 180 || h > 150 ? 3 : 2);
  const doors = [];

  for (let i = 0; i < doorCount; i++) {
    const sideIndex = Math.floor(next() * sides.length);
    const side = sides.splice(sideIndex, 1)[0];
    const length = side === 'top' || side === 'bottom' ? w : h;
    const margin = DOOR_WIDTH / 2 + WALL_THICKNESS + 4;
    const center = margin + next() * Math.max(0, length - margin * 2);
    doors.push({ side, center, width: DOOR_WIDTH, open: false });
  }
  return { x, y, w, h, doors };
}

export const buildings = landmarks.flatMap(landmark =>
  landmark.buildings.map(makeBuilding)
);

for (const building of buildings) {
  for (const door of building.doors) {
    door.building = building;
    door.id = `door-${buildings.indexOf(building)}-${building.doors.indexOf(door)}`;
  }
}

function wallSegments(building, side) {
  const horizontal = side === 'top' || side === 'bottom';
  const length = horizontal ? building.w : building.h;
  const door = building.doors.find(candidate => candidate.side === side);
  const ranges = door
    ? [[0, door.center - door.width / 2], [door.center + door.width / 2, length]]
    : [[0, length]];

  return ranges.filter(([start, end]) => end > start).map(([start, end]) => {
    if (horizontal) return {
      x: building.x + start,
      y: side === 'top' ? building.y : building.y + building.h - WALL_THICKNESS,
      w: end - start,
      h: WALL_THICKNESS
    };
    return {
      x: side === 'left' ? building.x : building.x + building.w - WALL_THICKNESS,
      y: building.y + start,
      w: WALL_THICKNESS,
      h: end - start
    };
  });
}

const walls = buildings.flatMap(building =>
  ['top', 'right', 'bottom', 'left'].flatMap(side => wallSegments(building, side))
);

function doorObstacle(door) {
  const building = door.building;
  if (door.side === 'top' || door.side === 'bottom') return {
    x: building.x + door.center - door.width / 2,
    y: door.side === 'top' ? building.y : building.y + building.h - WALL_THICKNESS,
    w: door.width,
    h: WALL_THICKNESS,
    door
  };
  return {
    x: door.side === 'left' ? building.x : building.x + building.w - WALL_THICKNESS,
    y: building.y + door.center - door.width / 2,
    w: WALL_THICKNESS,
    h: door.width,
    door
  };
}

export const obstacles = walls.slice();

export function resetDoors() {
  obstacles.splice(walls.length);
  for (const building of buildings) {
    for (const door of building.doors) {
      door.open = false;
      door.obstacle = doorObstacle(door);
      obstacles.push(door.obstacle);
    }
  }
}

export function doorPosition(door) {
  const building = door.building;
  if (door.side === 'top' || door.side === 'bottom') return {
    x: building.x + door.center,
    y: door.side === 'top' ? building.y : building.y + building.h
  };
  return {
    x: door.side === 'left' ? building.x : building.x + building.w,
    y: building.y + door.center
  };
}

export function findNearbyDoor(position, maxDistance = C.interaction.doorDistance) {
  let nearest = null;
  let nearestDistance = maxDistance;
  for (const building of buildings) {
    for (const door of building.doors) {
      const point = doorPosition(door);
      const distance = Math.hypot(position.x - point.x, position.y - point.y);
      if (distance <= nearestDistance) {
        nearest = door;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

function circleIntersectsRect(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  return Math.hypot(circle.x - closestX, circle.y - closestY) < circle.r;
}

export function doorIsBlocked(door, occupants) {
  return occupants.some(occupant => circleIntersectsRect(occupant, door.obstacle));
}

export function toggleDoor(door) {
  door.open = !door.open;
  if (door.open) {
    const index = obstacles.indexOf(door.obstacle);
    if (index !== -1) obstacles.splice(index, 1);
  } else if (!obstacles.includes(door.obstacle)) {
    obstacles.push(door.obstacle);
  }
  return door.open;
}

export function getDoorStates() {
  return buildings.flatMap(building => building.doors.map(door => ({ id: door.id, open: door.open })));
}

export function applyDoorStates(states) {
  const byId = new Map(states.map(item => [item.id, Boolean(item.open)]));
  for (const building of buildings) {
    for (const door of building.doors) {
      const open = byId.get(door.id);
      if (open !== undefined && open !== door.open) toggleDoor(door);
    }
  }
}

resetDoors();

export function collidesWithObstacle(object) {
  return obstacles.some(obstacle =>
    object.x + object.r > obstacle.x &&
    object.x - object.r < obstacle.x + obstacle.w &&
    object.y + object.r > obstacle.y &&
    object.y - object.r < obstacle.y + obstacle.h
  );
}

export function isWalkable(position, radius = 0) {
  if (
    position.x - radius < 0 || position.x + radius > C.world.width ||
    position.y - radius < 0 || position.y + radius > C.world.height
  ) return false;
  return !collidesWithObstacle({ x: position.x, y: position.y, r: radius });
}

function segmentIntersectsRect(from, to, rect) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let near = 0;
  let far = 1;

  for (const [start, delta, min, max] of [
    [from.x, dx, rect.x, rect.x + rect.w],
    [from.y, dy, rect.y, rect.y + rect.h]
  ]) {
    if (Math.abs(delta) < 1e-9) {
      if (start < min || start > max) return false;
      continue;
    }
    let entry = (min - start) / delta;
    let exit = (max - start) / delta;
    if (entry > exit) [entry, exit] = [exit, entry];
    near = Math.max(near, entry);
    far = Math.min(far, exit);
    if (near > far) return false;
  }
  return true;
}

// Стена полностью останавливает атаку. Закрытая дверь пропускает только пулю,
// поэтому здесь возвращается отдельный коэффициент урона для стрельбы.
export function attackPath(from, to) {
  let throughDoor = false;
  for (const obstacle of obstacles) {
    if (!segmentIntersectsRect(from, to, obstacle)) continue;
    if (!obstacle.door) return { blocked: true, damageMultiplier: 0 };
    throughDoor = true;
  }
  return { blocked: false, damageMultiplier: throughDoor ? .5 : 1 };
}

// Универсальный запрос прямой проходимости. Clearance позволяет проверять не
// луч, а коридор для круглого агента. Навигация и зрение используют один API,
// хотя для зрения clearance обычно равен нулю.
export function hasClearPath(from, to, clearance = 0) {
  if (!isWalkable(from, clearance) || !isWalkable(to, clearance)) return false;
  return !obstacles.some(obstacle => segmentIntersectsRect(from, to, {
    x: obstacle.x - clearance,
    y: obstacle.y - clearance,
    w: obstacle.w + clearance * 2,
    h: obstacle.h + clearance * 2
  }));
}

export function hasLineOfSight(from, to) {
  return hasClearPath(from, to, 0);
}

export function randomSpawnPoint(radius) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const point = {
      x: random(radius, C.world.width - radius),
      y: random(radius, C.world.height - radius),
      r: radius
    };
    if (!collidesWithObstacle(point)) return { x: point.x, y: point.y };
  }
  return { x: C.world.width / 2, y: C.world.height / 2 };
}

export function moveCircle(object, dx, dy) {
  object.x = clamp(object.x + dx, object.r, C.world.width - object.r);
  if (collidesWithObstacle(object)) object.x -= dx;

  object.y = clamp(object.y + dy, object.r, C.world.height - object.r);
  if (collidesWithObstacle(object)) object.y -= dy;
}
