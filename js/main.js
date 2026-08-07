import { bindInput } from './input.js';
import { dodge, selectWeapon, toggleCrouch, updateGame, useItem } from './gameplay.js';
import { drawGame } from './renderer.js';
import { resetState, state } from './state.js';
import { selectWeaponUI, showGame, ui, updateUI } from './ui.js';

let lastFrame = 0;
let animationFrame = 0;

function loop(now) {
  if (!state?.running) return;
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  updateGame(dt);
  drawGame();
  animationFrame = requestAnimationFrame(loop);
}

function startGame() {
  resetState();
  selectWeaponUI(0);
  updateUI();
  showGame();
  lastFrame = performance.now();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(loop);
}

bindInput({ dodge, selectWeapon, toggleCrouch, useItem });
document.querySelectorAll('[data-slot]').forEach(button => {
  button.addEventListener('click', () => selectWeapon(Number(button.dataset.slot)));
});
ui.crouch.addEventListener('click', toggleCrouch);
ui.dodge.addEventListener('click', dodge);
ui.useFood.addEventListener('click', () => useItem('food'));
ui.useMedkit.addEventListener('click', () => useItem('medkit'));
ui.start.addEventListener('click', startGame);
ui.restart.addEventListener('click', startGame);
