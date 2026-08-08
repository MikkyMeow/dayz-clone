import { state } from './state.js';
import { C } from './config.js';
import { random } from './utils.js';

export function burst(x, y, color, count) {
  const available = Math.max(0, C.render.maxParticles - state.particles.length);
  for (let i = 0; i < Math.min(count, available); i++) {
    state.particles.push({
      x, y,
      vx: random(-55, 55),
      vy: random(-55, 55),
      life: random(.2, .5),
      color
    });
  }
}

export function updateEffects(dt) {
  let write = 0;
  for (let read = 0; read < state.particles.length; read++) {
    const particle = state.particles[read];
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
    if (particle.life > 0) state.particles[write++] = particle;
  }
  state.particles.length = write;
  write = 0;
  for (let read = 0; read < state.shots.length; read++) {
    const shot = state.shots[read]; shot.life -= dt;
    if (shot.life > 0) state.shots[write++] = shot;
  }
  state.shots.length = write;
}
