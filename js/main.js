import { bindInput } from './input.js';
import { assignQuickSlot, dodge, dropHeldItem, equipItem, interact, selectQuickSlot, toggleCrouch, updateGame, useHeldItem } from './gameplay.js';
import { drawGame } from './renderer.js';
import { resetState, state } from './state.js';
import { closeBackpack, showGame, toggleBackpack, ui, updateUI } from './ui.js';

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
  updateUI();
  showGame();
  lastFrame = performance.now();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(loop);
}

bindInput({ closeBackpack, dodge, dropHeldItem, interact, selectQuickSlot, toggleBackpack, toggleCrouch });
document.querySelectorAll('[data-quick-slot]').forEach(button => {
  button.addEventListener('click', () => selectQuickSlot(Number(button.dataset.quickSlot)));
});
ui.crouch.addEventListener('click', toggleCrouch);
ui.dodge.addEventListener('click', dodge);
ui.interact.addEventListener('click', interact);
ui.hands.addEventListener('click', useHeldItem);
ui.drop.addEventListener('click', dropHeldItem);
ui.backpackButton.addEventListener('click', () => toggleBackpack());
ui.closeBackpack.addEventListener('click', closeBackpack);
ui.backpack.addEventListener('click', event => { if (event.target === ui.backpack) closeBackpack(); });
ui.backpackItems.addEventListener('click', event => {
  const equip = event.target.closest('[data-equip]');
  const assign = event.target.closest('[data-assign]');
  if (equip) equipItem(equip.dataset.equip);
  if (assign) assignQuickSlot(Number(assign.dataset.assign), assign.dataset.item);
});
ui.start.addEventListener('click', startGame);
ui.restart.addEventListener('click', startGame);
