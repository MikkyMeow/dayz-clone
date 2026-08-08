import { updateEffects } from './effects.js';
import { bindInput } from './input.js';
import {
  assignQuickSlot, dodge, dropHeldItem, equipItem, interact, selectQuickSlot,
  toggleCrouch, updateGame, useHeldItem
} from './gameplay.js';
import { MultiplayerClient } from './multiplayer-client.js';
import { drawGame } from './renderer.js';
import { resetState, state } from './state.js';
import { closeBackpack, showGame, showMessage, toggleBackpack, ui, updateUI } from './ui.js';

let lastFrame = 0;
let animationFrame = 0;
let mode = 'single';
const multiplayerStart = document.querySelector('#multiplayerStart');
const playerName = document.querySelector('#playerName');
const connectionStatus = document.querySelector('#connectionStatus');

const multiplayer = new MultiplayerClient({
  onReady() {
    connectionStatus.textContent = '';
    updateUI(); showGame();
  },
  onDisconnect() {
    connectionStatus.textContent = 'Соединение с сервером потеряно';
    showMessage('Соединение потеряно');
  }
});

function loop(now) {
  if (!state?.running) return;
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  if (mode === 'single') updateGame(dt);
  else updateEffects(dt);
  drawGame();
  animationFrame = requestAnimationFrame(loop);
}

function beginLoop() {
  lastFrame = performance.now();
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(loop);
}

function startGame() {
  multiplayer.close(); mode = 'single'; resetState();
  updateUI(); showGame(); beginLoop();
}

async function startMultiplayer() {
  multiplayerStart.disabled = true;
  connectionStatus.textContent = 'Подключение…';
  multiplayer.close(); mode = 'multiplayer'; resetState(); beginLoop();
  try {
    await multiplayer.connect(playerName.value);
    connectionStatus.textContent = 'Ожидание состояния мира…';
  } catch (error) {
    cancelAnimationFrame(animationFrame);
    connectionStatus.textContent = error.message;
  } finally {
    multiplayerStart.disabled = false;
  }
}

function selectedType(index) { return state?.player?.quickSlots[index]; }
function routeSelect(index) {
  if (mode === 'single') selectQuickSlot(index);
  else {
    const type = selectedType(index);
    multiplayer.action('equip', { type: state.player.heldItem === type ? 'fists' : type });
  }
}
function routeCrouch() {
  if (mode === 'single') toggleCrouch();
  else { state.player.crouching = !state.player.crouching; updateUI(); }
}
function route(action, singleAction, payload = {}) {
  if (mode === 'single') singleAction(); else multiplayer.action(action, payload);
}

bindInput({
  closeBackpack,
  dodge: () => route('dodge', dodge),
  dropHeldItem: () => route('dropItem', dropHeldItem),
  interact: () => route('interact', interact),
  selectQuickSlot: routeSelect,
  toggleBackpack,
  toggleCrouch: routeCrouch
});
document.querySelectorAll('[data-quick-slot]').forEach(button => {
  button.addEventListener('click', () => routeSelect(Number(button.dataset.quickSlot)));
});
ui.crouch.addEventListener('click', routeCrouch);
ui.dodge.addEventListener('click', () => route('dodge', dodge));
ui.interact.addEventListener('click', () => route('interact', interact));
ui.hands.addEventListener('click', () => route('useItem', useHeldItem));
ui.drop.addEventListener('click', () => route('dropItem', dropHeldItem));
ui.backpackButton.addEventListener('click', () => toggleBackpack());
ui.closeBackpack.addEventListener('click', closeBackpack);
ui.backpack.addEventListener('click', event => { if (event.target === ui.backpack) closeBackpack(); });
ui.backpackItems.addEventListener('click', event => {
  const equip = event.target.closest('[data-equip]');
  const assign = event.target.closest('[data-assign]');
  if (equip) {
    if (mode === 'single') equipItem(equip.dataset.equip);
    else multiplayer.action('equip', { type: equip.dataset.equip });
  }
  if (assign) {
    const index = Number(assign.dataset.assign);
    const item = assign.dataset.item;
    if (mode === 'single') assignQuickSlot(index, item);
    else multiplayer.action('assignQuickSlot', { index, item });
  }
});
ui.start.addEventListener('click', startGame);
multiplayerStart.addEventListener('click', startMultiplayer);
ui.restart.addEventListener('click', () => mode === 'single' ? startGame() : startMultiplayer());
