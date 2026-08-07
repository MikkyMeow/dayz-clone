import { state } from './state.js';
import { random } from './utils.js';

export function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
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
  state.particles.forEach(particle => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  });
  state.particles = state.particles.filter(particle => particle.life > 0);
  state.shots.forEach(shot => { shot.life -= dt; });
  state.shots = state.shots.filter(shot => shot.life > 0);
}
