import { C } from './config.js';
import { state } from './state.js';
import { clamp } from './utils.js';
import { landmarks } from './world.js';

const ids = ['menu', 'gameover', 'hud', 'start', 'restart', 'hpText', 'hpBar',
  'hungerText', 'hungerBar', 'staminaText', 'staminaBar', 'weapon', 'message',
  'crouch', 'dodge', 'foodCount', 'medkitCount', 'useFood', 'useMedkit', 'location', 'survivalTime'];
ids.push('interact');

export const ui = Object.fromEntries(ids.map(id => [id, document.querySelector(`#${id}`)]));
let messageTimer = 0;

export function selectWeaponUI(index) {
  document.querySelectorAll('[data-slot]').forEach((button, slot) =>
    button.classList.toggle('selected', slot === index)
  );
  ui.weapon.textContent = C.weapons[index].name;
}

export function showMessage(message) {
  ui.message.textContent = message;
  ui.message.style.opacity = 1;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { ui.message.style.opacity = 0; }, 1300);
}

export function updateUI() {
  const player = state.player;
  ui.hpText.textContent = Math.ceil(player.hp);
  ui.hungerText.textContent = Math.ceil(player.hunger);
  ui.staminaText.textContent = Math.ceil(player.stamina);
  ui.hpBar.style.width = `${clamp(player.hp, 0, 100)}%`;
  ui.hungerBar.style.width = `${player.hunger}%`;
  ui.staminaBar.style.width = `${player.stamina / C.player.maxStamina * 100}%`;
  ui.crouch.classList.toggle('active', player.crouching);
  const crouchAction = player.crouching ? 'Встать' : 'Присесть';
  ui.crouch.setAttribute('aria-label', crouchAction);
  ui.crouch.title = `${crouchAction} (C)`;
  ui.foodCount.textContent = player.food;
  ui.medkitCount.textContent = player.medkits;
  ui.interact.classList.toggle('hidden', !state.nearbyDoor);
  if (state.nearbyDoor) {
    ui.interact.textContent = `E: ${state.nearbyDoor.open ? 'закрыть дверь' : 'открыть дверь'}`;
  }

  const location = landmarks.find(landmark =>
    player.x > landmark.x && player.x < landmark.x + landmark.w &&
    player.y > landmark.y && player.y < landmark.y + landmark.h
  );
  ui.location.textContent = location?.name || 'ДИКАЯ МЕСТНОСТЬ';
}

export function showGame() {
  ui.menu.classList.add('hidden');
  ui.gameover.classList.add('hidden');
  ui.hud.classList.remove('hidden');
}

export function showGameOver() {
  ui.hud.classList.add('hidden');
  ui.gameover.classList.remove('hidden');
  const minutes = Math.floor(state.time / 60);
  const seconds = String(Math.floor(state.time % 60)).padStart(2, '0');
  ui.survivalTime.textContent = `Продержались ${minutes}:${seconds}`;
}
