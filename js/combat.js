import { C } from './config.js';
import { burst } from './effects.js';
import { state } from './state.js';
import { emitNoise } from './noise.js';
import { distance } from './utils.js';

export function attack() {
  const player = state.player;
  const weapon = C.weapons[player.weapon];
  if (player.cooldown > 0) return;
  player.cooldown = weapon.cooldown;

  let target = null;
  let bestDistance = weapon.range;
  for (const zombie of state.zombies) {
    const targetDistance = distance(player, zombie);
    const targetAngle = Math.atan2(zombie.y - player.y, zombie.x - player.x);
    const delta = Math.abs(Math.atan2(
      Math.sin(targetAngle - player.angle),
      Math.cos(targetAngle - player.angle)
    ));
    if (targetDistance < bestDistance && delta < (weapon.gun ? .22 : .75)) {
      target = zombie;
      bestDistance = targetDistance;
    }
  }

  if (weapon.gun) {
    state.shots.push({
      x1: player.x, y1: player.y,
      x2: player.x + Math.cos(player.angle) * weapon.range,
      y2: player.y + Math.sin(player.angle) * weapon.range,
      life: .07
    });
    emitNoise(player, C.zombie.gunshotDistance, 'gunshot', 1);
    burst(player.x + Math.cos(player.angle) * 22, player.y + Math.sin(player.angle) * 22, '#ffd56a', 5);
  }

  if (!target) return;
  target.hp -= weapon.damage;
  burst(target.x, target.y, '#7d302c', 7);
  if (target.hp <= 0) state.zombies.splice(state.zombies.indexOf(target), 1);
}
