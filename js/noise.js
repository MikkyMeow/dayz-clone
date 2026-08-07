import { state } from './state.js';
import { distance } from './utils.js';

export function emitNoise(position, radius, type, intensity = 1) {
  if (!state || radius <= 0) return;
  state.noises.push({
    position: { x: position.x, y: position.y },
    radius,
    type,
    intensity,
    createdAt: state.time
  });
}

export function updateNoises() {
  if (!state) return;
  for (let i = state.noises.length - 1; i >= 0; i--) {
    if (state.time - state.noises[i].createdAt > 1) state.noises.splice(i, 1);
  }
}

export function getAudibleNoise(listener, since) {
  let best = null;
  let bestStrength = 0;
  for (const noise of state.noises) {
    if (noise.createdAt <= since) continue;
    const noiseDistance = distance(listener, noise.position);
    if (noiseDistance > noise.radius) continue;
    const strength = noise.intensity * (1 - noiseDistance / noise.radius);
    if (strength <= bestStrength) continue;
    best = noise;
    bestStrength = strength;
  }
  return best ? { noise: best, strength: bestStrength } : null;
}
