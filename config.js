// Все числа игрового баланса собраны здесь.
window.GAME_CONFIG = Object.freeze({
  world: { width: 3200, height: 2400, grid: 80 },
  player: { speed: 175, crouchSpeedMultiplier: .25, radius: 15, maxHealth: 100, maxHunger: 100, maxStamina: 30, staminaDrainPerSecond: 1, staminaRegenPerSecond: 1, hungerPerSecond: 0.32, starvationDamagePerSecond: 3, regenPerSecond: 1.5, regenMinHunger: 65 },
  zombie: {
    radius: 15,
    speedMin: 42,
    speedMax: 67,
    wanderSpeedMin: 8,
    wanderSpeedMax: 16,
    wanderTurnMin: 1.5,
    wanderTurnMax: 4.5,
    health: 50,
    damage: 9,
    attackCooldown: 1.1,
    attackReach: 2,
    spawnMinDistance: 390,
    spawnMaxDistance: 650,
    despawnDistance: 1100,
    maxAlive: 28,
    spawnEvery: 1.35,

    visionDistance: 260,
    crouchVisionDistance: 110,
    closeVisionDistance: 55,
    visionAngle: Math.PI * .78,
    perceptionIntervalMin: .09,
    perceptionIntervalMax: .18,
    hearingThreshold: .08,
    hearingMaxError: 45,

    crouchNoiseRadius: 45,
    walkNoiseRadius: 150,
    runNoiseRadius: 340,
    gunshotDistance: 850,
    footstepDistance: 48,

    memoryDuration: 7,
    searchDuration: 6,
    searchRadius: 105,
    searchSpeedMultiplier: 1.25,
    disengageDistance: 720,

    navigationClearance: 18,
    pathRebuildInterval: .55,
    pathTargetMoveThreshold: 52,
    waypointReachDistance: 12,
    stuckTimeout: 1.1,
    stuckMovementThreshold: 2
  },
  navigation: { cellSize: 40, maxSearchesPerFrame: 3 },
  debug: { zombieAI: false },
  weapons: [
    { name: 'КУЛАКИ', damage: 12, range: 45, cooldown: .42, color: '#c4b29a' },
    { name: 'НОЖ', damage: 28, range: 58, cooldown: .32, color: '#d2d6cf' },
    { name: 'ПИСТОЛЕТ', damage: 42, range: 620, cooldown: .3, color: '#ffe29c', gun: true }
  ],
  loot: { pickupDistance: 35, foodRestore: 32, medkitHeal: 48, foodCount: 16, medkitCount: 9 },
  day: { lengthSeconds: 240, darkness: .48 }
});
