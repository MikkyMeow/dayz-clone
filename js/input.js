import { C } from './config.js';
import { canvas, viewport } from './display.js';
import { state } from './state.js';
import { clamp } from './utils.js';

export const keys = new Set();
export const pointer = { x: 0, y: 0, down: false, active: false };
export const sticks = { move: null, aim: null };

function updateMouseAim() {
  if (!state) return;
  const player = state.player;
  const cameraX = clamp(player.x - viewport.width / 2, 0, Math.max(0, C.world.width - viewport.width));
  const cameraY = clamp(player.y - viewport.height / 2, 0, Math.max(0, C.world.height - viewport.height));
  player.angle = Math.atan2(
    pointer.y - (player.y - cameraY),
    pointer.x - (player.x - cameraX)
  );
}

function updateStick(event) {
  for (const [name, centerX] of [['move', viewport.width * .16], ['aim', viewport.width * .84]]) {
    const stick = sticks[name];
    if (stick?.id !== event.pointerId) continue;

    let dx = (event.clientX - centerX) / 58;
    let dy = (event.clientY - viewport.height * .76) / 58;
    const length = Math.hypot(dx, dy);
    stick.outside = length > 1;
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    stick.dx = dx;
    stick.dy = dy;
  }
}

export function bindInput(actions) {
  addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    keys.add(key);
    if ('123'.includes(event.key)) actions.selectWeapon(Number(event.key) - 1);
    if (key === 'f') actions.useItem('food');
    if (key === 'h') actions.useItem('medkit');
    if (key === 'c' && !event.repeat) actions.toggleCrouch();
    if (key === 'e' && !event.repeat) actions.interact();
    if (key === ' ' && !event.repeat) {
      event.preventDefault();
      actions.dodge();
    }
  });
  addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));

  canvas.addEventListener('pointermove', event => {
    if (event.pointerType !== 'touch') {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
      if (state && !sticks.move && !sticks.aim) updateMouseAim();
    }
    updateStick(event);
  });

  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      const side = event.clientX < viewport.width / 2 ? 'move' : 'aim';
      sticks[side] = { id: event.pointerId, dx: 0, dy: 0, outside: false };
      updateStick(event);
    } else {
      pointer.down = true;
    }
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  canvas.addEventListener('pointerup', event => {
    pointer.down = false;
    for (const name of ['move', 'aim']) {
      if (sticks[name]?.id === event.pointerId) sticks[name] = null;
    }
  });
}

export function refreshMouseAim() {
  if (pointer.active && !sticks.move && !sticks.aim) updateMouseAim();
}
