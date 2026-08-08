import { updateEffects } from './effects.js';
import { C } from './config.js';
import { bindInput, keys, pointer, sticks } from './input.js';
import {
  assignQuickSlot, dodge, dropHeldItem, equipItem, interact, selectQuickSlot,
  toggleCrouch, updateGame, useHeldItem
} from './gameplay.js';
import { MultiplayerClient } from './multiplayer-client.js';
import { drawGame } from './renderer.js';
import { beginMeasure, endMeasure, recordFrame } from './performance.js';
import { resetState, state } from './state.js';
import { closeBackpack, showGame, showMainMenu, showMessage, toggleBackpack, ui, updateUI } from './ui.js';

let lastFrame = 0;
let animationFrame = 0;
let mode = 'single';
let accumulator = 0;
let previousPlayerPose = { x: 0, y: 0, angle: 0 };
let gameMenuOpen = false;
let logoutRequested = false;
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
  },
  onLogoutComplete() { returnToMainMenu(); },
  isInputEnabled() { return !gameMenuOpen; }
});

function clearControls() {
  keys.clear(); pointer.down = false; sticks.move = null; sticks.aim = null;
}

function renderGameMenu() {
  const remaining = state?.player?.logoutAt
    ? Math.max(0, state.player.logoutAt - state.time)
    : C.network.logoutSeconds;
  ui.pauseMenuTitle.textContent = logoutRequested ? 'Выход с сервера' : 'Игра продолжается';
  ui.logoutStatus.textContent = logoutRequested
    ? `Персонаж останется в мире ещё ${Math.ceil(remaining)} сек.`
    : 'Пока меню открыто, персонаж остаётся в мире.';
  ui.resumeGame.classList.toggle('hidden', logoutRequested);
  ui.leaveServer.classList.toggle('hidden', logoutRequested);
  ui.cancelLogout.classList.toggle('hidden', !logoutRequested);
  ui.leaveServer.textContent = mode === 'multiplayer' ? 'Покинуть сервер' : 'В главное меню';
}

function openGameMenu() {
  if (!state?.running) return;
  closeBackpack(); clearControls(); gameMenuOpen = true;
  ui.pauseMenu.classList.remove('hidden'); ui.pauseMenu.setAttribute('aria-hidden', 'false');
  renderGameMenu();
}

function closeGameMenu() {
  if (logoutRequested) return;
  gameMenuOpen = false; ui.pauseMenu.classList.add('hidden');
  ui.pauseMenu.setAttribute('aria-hidden', 'true'); clearControls();
}

function toggleGameMenu() {
  if (logoutRequested) return;
  if (gameMenuOpen) closeGameMenu(); else openGameMenu();
}

function returnToMainMenu() {
  logoutRequested = false; gameMenuOpen = false;
  if (state) state.running = false;
  cancelAnimationFrame(animationFrame); multiplayer.close(); showMainMenu();
  connectionStatus.textContent = '';
}

function loop(now) {
  if (!state?.running) return;
  const frameMs = Math.min(now - lastFrame, 100);
  const dt = frameMs / 1000;
  lastFrame = now;
  beginMeasure('update');
  if (mode === 'single') {
    accumulator = Math.min(accumulator + dt, C.render.fixedStep * C.render.maxCatchUpSteps);
    let steps = 0;
    while (accumulator >= C.render.fixedStep && steps++ < C.render.maxCatchUpSteps) {
      previousPlayerPose.x = state.player.x;
      previousPlayerPose.y = state.player.y;
      previousPlayerPose.angle = state.player.angle;
      updateGame(C.render.fixedStep);
      accumulator -= C.render.fixedStep;
    }
    const alpha = accumulator / C.render.fixedStep;
    state.renderPlayer.x = previousPlayerPose.x + (state.player.x - previousPlayerPose.x) * alpha;
    state.renderPlayer.y = previousPlayerPose.y + (state.player.y - previousPlayerPose.y) * alpha;
    state.renderPlayer.angle = previousPlayerPose.angle + Math.atan2(
      Math.sin(state.player.angle - previousPlayerPose.angle),
      Math.cos(state.player.angle - previousPlayerPose.angle)
    ) * alpha;
  } else { updateEffects(dt); multiplayer.update(dt); }
  endMeasure('update');
  beginMeasure('render');
  const counts = drawGame();
  endMeasure('render');
  recordFrame(frameMs, { ...counts, particles: state.particles.length });
  if (gameMenuOpen) renderGameMenu();
  animationFrame = requestAnimationFrame(loop);
}

function beginLoop() {
  lastFrame = performance.now();
  accumulator = 0;
  if (state?.player) {
    previousPlayerPose = { x: state.player.x, y: state.player.y, angle: state.player.angle };
    Object.assign(state.renderPlayer, previousPlayerPose);
  }
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state?.running) beginLoop();
});

function startGame() {
  multiplayer.close(); mode = 'single'; logoutRequested = false; gameMenuOpen = false; resetState();
  updateUI(); showGame(); beginLoop();
}

async function startMultiplayer() {
  multiplayerStart.disabled = true;
  connectionStatus.textContent = 'Подключение…';
  multiplayer.close(); mode = 'multiplayer'; logoutRequested = false; gameMenuOpen = false; resetState(); beginLoop();
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
  toggleCrouch: routeCrouch,
  toggleGameMenu,
  isMenuOpen: () => gameMenuOpen
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
ui.resumeGame.addEventListener('click', closeGameMenu);
ui.leaveServer.addEventListener('click', () => {
  if (mode === 'single') { returnToMainMenu(); return; }
  logoutRequested = true; clearControls(); multiplayer.action('beginLogout'); renderGameMenu();
});
ui.cancelLogout.addEventListener('click', () => {
  multiplayer.action('cancelLogout'); logoutRequested = false; closeGameMenu();
});
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
