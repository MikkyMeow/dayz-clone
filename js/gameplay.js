import { C } from './config.js';
import { attack } from './combat.js';
import { updateEffects } from './effects.js';
import { keys, pointer, refreshMouseAim, sticks } from './input.js';
import { emitNoise, updateNoises } from './noise.js';
import { state } from './state.js';
import { showGameOver, showMessage, selectWeaponUI, updateUI } from './ui.js';
import { clamp, distance } from './utils.js';
import { moveCircle } from './world.js';
import { spawnZombie, updateZombies } from './zombies.js';

export function selectWeapon(index) {
  if (!state || !C.weapons[index]) return;
  state.player.weapon = index;
  selectWeaponUI(index);
}

export function toggleCrouch() {
  if (!state?.running || state.player.stamina <= 0) return;
  state.player.crouching = !state.player.crouching;
  updateUI();
}

export function useItem(type) {
  if (!state) return;
  const player = state.player;
  if (type === 'food' && player.food) {
    player.food--;
    player.hunger = Math.min(C.player.maxHunger, player.hunger + C.loot.foodRestore);
    showMessage('Вы поели');
  }
  if (type === 'medkit' && player.medkits) {
    player.medkits--;
    player.hp = Math.min(C.player.maxHealth, player.hp + C.loot.medkitHeal);
    showMessage('Раны обработаны');
  }
  updateUI();
}

function updatePlayer(dt) {
  const player = state.player;
  player.cooldown = Math.max(0, player.cooldown - dt);

  let moveX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
    (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let moveY = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) -
    (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (sticks.move) {
    moveX = sticks.move.dx;
    moveY = sticks.move.dy;
  }

  const moving = Math.hypot(moveX, moveY) > 0;
  const runRequested = !player.crouching && (sticks.move ? sticks.move.outside : keys.has('shift'));
  if (!runRequested) player.exhausted = false;
  const running = moving && runRequested && !player.exhausted && player.stamina > 0;
  const crouchMoving = moving && player.crouching && player.stamina > 0;

  if (running || crouchMoving) {
    player.stamina = Math.max(0, player.stamina - C.player.staminaDrainPerSecond * dt);
    if (player.stamina === 0) {
      player.exhausted = true;
      player.crouching = false;
    }
  } else {
    player.stamina = Math.min(C.player.maxStamina, player.stamina + C.player.staminaRegenPerSecond * dt);
    if (player.stamina === C.player.maxStamina) player.exhausted = false;
  }

  const speed = C.player.speed * (player.crouching ? C.player.crouchSpeedMultiplier : running ? 1 : .5);
  const moveLength = Math.hypot(moveX, moveY) || 1;
  const oldX = player.x;
  const oldY = player.y;
  moveCircle(player, moveX / moveLength * speed * dt, moveY / moveLength * speed * dt);
  const travelled = Math.hypot(player.x - oldX, player.y - oldY);
  if (moving && travelled > 0) {
    player.footstepDistance += travelled;
    if (player.footstepDistance >= C.zombie.footstepDistance) {
      player.footstepDistance %= C.zombie.footstepDistance;
      emitNoise(
        player,
        player.crouching
          ? C.zombie.crouchNoiseRadius
          : running ? C.zombie.runNoiseRadius : C.zombie.walkNoiseRadius,
        player.crouching ? 'crouching' : running ? 'running' : 'walking'
      );
    }
  } else if (!moving) {
    player.footstepDistance = 0;
  }

  refreshMouseAim();
  if (sticks.aim && Math.hypot(sticks.aim.dx, sticks.aim.dy) > .2) {
    player.angle = Math.atan2(sticks.aim.dy, sticks.aim.dx);
    attack();
  } else if (pointer.down) {
    attack();
  }
}

function updateSurvival(dt) {
  const player = state.player;
  player.hunger = clamp(player.hunger - C.player.hungerPerSecond * dt, 0, C.player.maxHunger);
  if (player.hunger <= 0) {
    player.hp -= C.player.starvationDamagePerSecond * dt;
  } else if (player.hunger >= C.player.regenMinHunger) {
    player.hp = Math.min(C.player.maxHealth, player.hp + C.player.regenPerSecond * dt);
  }
}

function pickupLoot() {
  const player = state.player;
  for (let i = state.loot.length - 1; i >= 0; i--) {
    if (distance(player, state.loot[i]) >= C.loot.pickupDistance) continue;
    const loot = state.loot.splice(i, 1)[0];
    if (loot.type === 'food') {
      player.food++;
      showMessage('Найдена еда');
    } else {
      player.medkits++;
      showMessage('Найдена аптечка');
    }
  }
}

export function updateGame(dt) {
  state.time += dt;
  updatePlayer(dt);
  updateSurvival(dt);

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer = C.zombie.spawnEvery;
    spawnZombie();
  }

  updateZombies(dt);
  updateNoises();
  updateEffects(dt);
  pickupLoot();
  updateUI();

  if (state.player.hp <= 0) {
    state.running = false;
    showGameOver();
  }
}
