import { C } from './config.js';
import { attack, updateCombat } from './combat.js';
import { updateEffects } from './effects.js';
import { keys, pointer, refreshMouseAim, sticks } from './input.js';
import { emitNoise, updateNoises } from './noise.js';
import { invalidateNavigation } from './navigation.js';
import { state } from './state.js';
import { showGameOver, showMessage, selectWeaponUI, updateUI } from './ui.js';
import { clamp, distance } from './utils.js';
import { doorIsBlocked, findNearbyDoor, moveCircle, toggleDoor } from './world.js';
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

export function dodge() {
  const player = state?.player;
  if (!state?.running || player.crouching || player.dodgeCooldown > 0 ||
      player.stamina < C.player.dodgeStaminaCost) return;
  let dx = player.moveX;
  let dy = player.moveY;
  if (Math.hypot(dx, dy) < .1) {
    dx = Math.cos(player.angle);
    dy = Math.sin(player.angle);
  }
  const length = Math.hypot(dx, dy) || 1;
  player.dodgeX = dx / length;
  player.dodgeY = dy / length;
  player.dodgeTimer = C.player.dodgeDuration;
  player.invulnerableTimer = C.player.dodgeInvulnerability;
  player.dodgeCooldown = C.player.dodgeCooldown;
  player.stamina -= C.player.dodgeStaminaCost;
  player.pendingAttack = null;
  player.attackTimer = 0;
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

export function interact() {
  if (!state?.running) return;
  const door = findNearbyDoor(state.player);
  if (!door) return;
  if (door.open && doorIsBlocked(door, [state.player, ...state.zombies])) {
    showMessage('Проход заблокирован');
    return;
  }
  const opened = toggleDoor(door);
  invalidateNavigation();
  state.nearbyDoor = door;
  showMessage(opened ? 'Дверь открыта' : 'Дверь закрыта');
  updateUI();
}

function updatePlayer(dt) {
  const player = state.player;
  player.cooldown = Math.max(0, player.cooldown - dt);
  player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
  player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);

  let moveX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) -
    (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  let moveY = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) -
    (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  if (sticks.move) {
    moveX = sticks.move.dx;
    moveY = sticks.move.dy;
  }
  const inputLength = Math.hypot(moveX, moveY) || 1;
  player.moveX = moveX / inputLength;
  player.moveY = moveY / inputLength;

  if (player.dodgeTimer > 0) {
    player.dodgeTimer = Math.max(0, player.dodgeTimer - dt);
    moveCircle(player, player.dodgeX * C.player.dodgeSpeed * dt, player.dodgeY * C.player.dodgeSpeed * dt);
    refreshMouseAim();
    return;
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
  updateCombat(dt);
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
  state.nearbyDoor = findNearbyDoor(state.player);
  updateUI();

  if (state.player.hp <= 0) {
    state.running = false;
    showGameOver();
  }
}
