import { C } from './config.js';
import { viewport } from './display.js';
import { burst } from './effects.js';
import { state } from './state.js';
import { clamp, distance, random } from './utils.js';
import { moveCircle, obstacles } from './world.js';

export function spawnZombie() {
  if (state.zombies.length >= C.zombie.maxAlive) return;
  const player = state.player;
  const cameraX = clamp(player.x - viewport.width / 2, 0, Math.max(0, C.world.width - viewport.width));
  const cameraY = clamp(player.y - viewport.height / 2, 0, Math.max(0, C.world.height - viewport.height));
  const screen = {
    left: cameraX,
    right: Math.min(cameraX + viewport.width, C.world.width),
    top: cameraY,
    bottom: Math.min(cameraY + viewport.height, C.world.height)
  };
  const sides = [];
  if (screen.left > C.zombie.radius) sides.push('left');
  if (screen.right < C.world.width - C.zombie.radius) sides.push('right');
  if (screen.top > C.zombie.radius) sides.push('top');
  if (screen.bottom < C.world.height - C.zombie.radius) sides.push('bottom');
  if (!sides.length) return;

  const side = sides[Math.floor(random(0, sides.length))];
  const outsideOffset = random(C.zombie.radius + 8, C.zombie.radius + 70);
  let x;
  let y;
  if (side === 'left' || side === 'right') {
    x = side === 'left' ? screen.left - outsideOffset : screen.right + outsideOffset;
    y = random(screen.top, screen.bottom);
  } else {
    x = random(screen.left, screen.right);
    y = side === 'top' ? screen.top - outsideOffset : screen.bottom + outsideOffset;
  }

  const zombie = {
    x: clamp(x, C.zombie.radius, C.world.width - C.zombie.radius),
    y: clamp(y, C.zombie.radius, C.world.height - C.zombie.radius),
    r: C.zombie.radius,
    hp: C.zombie.health,
    speed: random(C.zombie.speedMin, C.zombie.speedMax),
    wanderSpeed: random(C.zombie.wanderSpeedMin, C.zombie.wanderSpeedMax),
    wanderTimer: random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax),
    aggro: false, cooldown: 0,
    angle: Math.atan2(player.y - y, player.x - x) + random(-Math.PI / 3, Math.PI / 3)
  };

  const insideObstacle = obstacles.some(obstacle =>
    zombie.x > obstacle.x && zombie.x < obstacle.x + obstacle.w &&
    zombie.y > obstacle.y && zombie.y < obstacle.y + obstacle.h
  );
  if (!insideObstacle) state.zombies.push(zombie);
}

export function updateZombies(dt) {
  const player = state.player;
  const despawnDistance = Math.max(
    C.zombie.despawnDistance,
    Math.hypot(viewport.width, viewport.height) + 100
  );
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const zombie = state.zombies[i];
    const playerDistance = distance(zombie, player);
    const aggroDistance = player.crouching
      ? C.zombie.crouchAggroDistance
      : C.zombie.aggroDistance;

    if (playerDistance > despawnDistance) {
      state.zombies.splice(i, 1);
      continue;
    }
    if (playerDistance < aggroDistance) zombie.aggro = true;
    zombie.cooldown -= dt;

    if (!zombie.aggro) {
      zombie.wanderTimer -= dt;
      if (zombie.wanderTimer <= 0) {
        zombie.angle = random(0, Math.PI * 2);
        zombie.wanderTimer = random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax);
      }
      const oldX = zombie.x;
      const oldY = zombie.y;
      moveCircle(
        zombie,
        Math.cos(zombie.angle) * zombie.wanderSpeed * dt,
        Math.sin(zombie.angle) * zombie.wanderSpeed * dt
      );
      if (Math.hypot(zombie.x - oldX, zombie.y - oldY) < zombie.wanderSpeed * dt * .25) {
        zombie.angle += random(Math.PI / 2, Math.PI * 1.5);
        zombie.wanderTimer = random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax);
      }
      continue;
    }
    zombie.angle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
    if (playerDistance > player.r + zombie.r + 2) {
      moveCircle(zombie, Math.cos(zombie.angle) * zombie.speed * dt, Math.sin(zombie.angle) * zombie.speed * dt);
    } else if (zombie.cooldown <= 0) {
      player.hp -= C.zombie.damage;
      zombie.cooldown = C.zombie.attackCooldown;
      burst(player.x, player.y, '#b84e43', 5);
    }
  }
}
