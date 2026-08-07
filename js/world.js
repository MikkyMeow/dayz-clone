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

export const obstacles = landmarks.flatMap(landmark =>
  landmark.buildings.map(([x, y, w, h]) => ({ x, y, w, h }))
);

function collidesWithObstacle(object) {
  return obstacles.some(obstacle =>
    object.x + object.r > obstacle.x &&
    object.x - object.r < obstacle.x + obstacle.w &&
    object.y + object.r > obstacle.y &&
    object.y - object.r < obstacle.y + obstacle.h
  );
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
