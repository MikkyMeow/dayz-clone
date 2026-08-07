import { C } from './config.js';
import { getAudibleNoise } from './noise.js';
import { state } from './state.js';
import { distance, random } from './utils.js';
import { hasLineOfSight } from './world.js';

function angleDifference(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function canSeePlayer(zombie) {
  const player = state.player;
  const playerDistance = distance(zombie, player);
  const visionDistance = player.crouching
    ? C.zombie.crouchVisionDistance
    : C.zombie.visionDistance;
  if (playerDistance > visionDistance) return false;
  if (playerDistance > C.zombie.closeVisionDistance) {
    const targetAngle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
    if (angleDifference(targetAngle, zombie.angle) > C.zombie.visionAngle / 2) return false;
  }
  return hasLineOfSight(zombie, player);
}

export function updatePerception(zombie, dt) {
  zombie.perceptionTimer -= dt;
  if (zombie.perceptionTimer > 0) return null;
  zombie.perceptionTimer = random(
    C.zombie.perceptionIntervalMin,
    C.zombie.perceptionIntervalMax
  );

  const seesPlayer = canSeePlayer(zombie);
  if (seesPlayer) {
    zombie.lastSeenPosition = { x: state.player.x, y: state.player.y };
    zombie.lastSeenAt = state.time;
  }

  const audible = getAudibleNoise(zombie, zombie.lastNoiseCheckedAt);
  zombie.lastNoiseCheckedAt = state.time;
  if (audible && audible.strength >= C.zombie.hearingThreshold) {
    const error = C.zombie.hearingMaxError * (1 - audible.strength);
    const angle = random(0, Math.PI * 2);
    const offset = random(0, error);
    zombie.lastHeardPosition = {
      x: audible.noise.position.x + Math.cos(angle) * offset,
      y: audible.noise.position.y + Math.sin(angle) * offset
    };
    zombie.lastHeardAt = audible.noise.createdAt;
  }

  return { seesPlayer, heardNoise: Boolean(audible && audible.strength >= C.zombie.hearingThreshold) };
}
