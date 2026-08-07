// Все числа игрового баланса собраны здесь.
window.GAME_CONFIG = Object.freeze({
  world: { width: 3200, height: 2400, grid: 80 },
  player: { speed: 175, crouchSpeedMultiplier: .25, radius: 15, maxHealth: 100, maxHunger: 100, maxStamina: 30, staminaDrainPerSecond: 1, staminaRegenPerSecond: 1, hungerPerSecond: 0.32, starvationDamagePerSecond: 3, regenPerSecond: 1.5, regenMinHunger: 65 },
  zombie: { radius: 15, speedMin: 42, speedMax: 67, wanderSpeedMin: 8, wanderSpeedMax: 16, wanderTurnMin: 1.5, wanderTurnMax: 4.5, health: 50, damage: 9, attackCooldown: 1.1, spawnMinDistance: 390, spawnMaxDistance: 650, despawnDistance: 900, maxAlive: 28, spawnEvery: 1.35, aggroDistance: 240, crouchAggroDistance: 100, gunshotDistance: 850 },
  weapons: [
    { name: 'КУЛАКИ', damage: 12, range: 45, cooldown: .42, color: '#c4b29a' },
    { name: 'НОЖ', damage: 28, range: 58, cooldown: .32, color: '#d2d6cf' },
    { name: 'ПИСТОЛЕТ', damage: 42, range: 620, cooldown: .3, color: '#ffe29c', gun: true }
  ],
  loot: { pickupDistance: 35, foodRestore: 32, medkitHeal: 48, foodCount: 16, medkitCount: 9 },
  day: { lengthSeconds: 240, darkness: .48 }
});
