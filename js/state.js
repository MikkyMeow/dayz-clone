import { C } from './config.js';
import { random } from './utils.js';
import { landmarks, randomSpawnPoint, resetDoors } from './world.js';

export let state = null;

function seedLoot() {
  const add = (type, count, area) => {
    for (let i = 0; i < count; i++) {
      state.loot.push({
        type,
        x: random(area.x + 35, area.x + area.w - 35),
        y: random(area.y + 35, area.y + area.h - 35),
        r: 9
      });
    }
  };

  landmarks.forEach(landmark => {
    if (landmark.loot === 'food') add('food', 3, landmark);
    else if (landmark.loot === 'medkit') add('medkit', 4, landmark);
    else {
      add('food', 2, landmark);
      add('medkit', 1, landmark);
    }
  });

  while (state.loot.filter(item => item.type === 'food').length < C.loot.foodCount) {
    state.loot.push({ type: 'food', x: random(80, C.world.width - 80), y: random(80, C.world.height - 80), r: 9 });
  }
  while (state.loot.filter(item => item.type === 'medkit').length < C.loot.medkitCount) {
    state.loot.push({ type: 'medkit', x: random(80, C.world.width - 80), y: random(80, C.world.height - 80), r: 9 });
  }
}

export function resetState() {
  resetDoors();
  const spawn = randomSpawnPoint(C.player.radius);
  state = {
    running: true,
    time: 0,
    player: {
      x: spawn.x, y: spawn.y, r: C.player.radius,
      hp: C.player.maxHealth, hunger: C.player.maxHunger, stamina: C.player.maxStamina,
      exhausted: false, crouching: false, angle: 0, weapon: 0,
      food: 0, medkits: 0, cooldown: 0,
      attackTimer: 0, pendingAttack: null,
      dodgeTimer: 0, dodgeCooldown: 0, invulnerableTimer: 0,
      dodgeX: 0, dodgeY: 0, moveX: 0, moveY: 0,
      footstepDistance: 0
    },
    zombies: [], loot: [], particles: [], shots: [], noises: [], spawnTimer: 0,
    nearbyDoor: null
  };
  seedLoot();
  return state;
}
