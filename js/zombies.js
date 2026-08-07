import { C } from './config.js';
import { burst } from './effects.js';
import { state } from './state.js';
import { clamp, distance, random } from './utils.js';
import { moveCircle, obstacles } from './world.js';

export function spawnZombie() {
  if (state.zombies.length >= C.zombie.maxAlive) return;
  const player = state.player;
  const angle = random(0, Math.PI * 2);
  const spawnDistance = random(C.zombie.spawnMinDistance, C.zombie.spawnMaxDistance);
  const zombie = {
    x: clamp(player.x + Math.cos(angle) * spawnDistance, 20, C.world.width - 20),
    y: clamp(player.y + Math.sin(angle) * spawnDistance, 20, C.world.height - 20),
    r: C.zombie.radius,
    hp: C.zombie.health,
    speed: random(C.zombie.speedMin, C.zombie.speedMax),
    aggro: false, cooldown: 0, angle: 0
  };

  const insideObstacle = obstacles.some(obstacle =>
    zombie.x > obstacle.x && zombie.x < obstacle.x + obstacle.w &&
    zombie.y > obstacle.y && zombie.y < obstacle.y + obstacle.h
  );
  if (!insideObstacle) state.zombies.push(zombie);
}

export function updateZombies(dt) {
  const player = state.player;
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const zombie = state.zombies[i];
    const playerDistance = distance(zombie, player);
    const aggroDistance = player.crouching
      ? C.zombie.crouchAggroDistance
      : C.zombie.aggroDistance;

    if (playerDistance > C.zombie.despawnDistance) {
      state.zombies.splice(i, 1);
      continue;
    }
    if (playerDistance < aggroDistance) zombie.aggro = true;
    zombie.cooldown -= dt;

    if (!zombie.aggro) continue;
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
