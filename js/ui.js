import { C } from './config.js';
import { state } from './state.js';
import { clamp } from './utils.js';
import { landmarks } from './world.js';

const ids = ['menu', 'gameover', 'hud', 'start', 'restart', 'hpText', 'hpBar',
  'hungerText', 'hungerBar', 'staminaText', 'staminaBar', 'weapon', 'message',
  'crouch', 'dodge', 'location', 'survivalTime', 'hands', 'heldItem', 'backpackButton',
  'drop', 'backpack', 'closeBackpack', 'backpackItems'];
ids.push('interact');

export const ui = Object.fromEntries(ids.map(id => [id, document.querySelector(`#${id}`)]));
let messageTimer = 0;
let backpackSignature = '';

const itemNames = { fists: 'Кулаки', knife: 'Нож', pistol: 'Пистолет', food: 'Еда', medkit: 'Аптечка' };

export function selectHeldItemUI() {
  if (!state) return;
  const held = state.player.heldItem;
  ui.heldItem.textContent = itemNames[held];
  ui.weapon.textContent = itemNames[held].toUpperCase();
  document.querySelectorAll('[data-quick-slot]').forEach((button, slot) =>
    button.classList.toggle('selected', state.player.quickSlots[slot] === held)
  );
}

export function toggleBackpack(force) {
  if (!state?.running) return;
  const open = force ?? ui.backpack.classList.contains('hidden');
  ui.backpack.classList.toggle('hidden', !open);
  ui.backpack.setAttribute('aria-hidden', String(!open));
  if (open) renderBackpack();
}

export function closeBackpack() { toggleBackpack(false); }

export function renderBackpack() {
  if (!state) return;
  const counts = { knife: state.player.knife, pistol: state.player.pistol, food: state.player.food, medkit: state.player.medkits };
  const signature = JSON.stringify(counts);
  if (signature === backpackSignature && ui.backpackItems.children.length) return;
  backpackSignature = signature;
  ui.backpackItems.innerHTML = Object.entries(counts).map(([type, count]) => `
    <div class="backpack-item ${count ? '' : 'empty'}">
      <div><b>${itemNames[type]}</b><span>Количество: ${count}</span></div>
      <button data-equip="${type}" ${count ? '' : 'disabled'}>В руки</button>
      <div class="slot-assign" aria-label="Назначить быстрый слот">
        ${[1, 2, 3, 4].map(number => `<button data-assign="${number - 1}" data-item="${type}" ${count ? '' : 'disabled'}>${number}</button>`).join('')}
      </div>
    </div>`).join('');
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
  document.querySelectorAll('[data-quick-slot]').forEach((button, slot) => {
    button.querySelector('span').textContent = itemNames[player.quickSlots[slot]] || 'Пусто';
  });
  selectHeldItemUI();
  ui.drop.disabled = player.heldItem === 'fists';
  if (!ui.backpack.classList.contains('hidden')) renderBackpack();
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
