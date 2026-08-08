export const C = Object.freeze({
  world: { width: 3200, height: 2400, grid: 80 },
  player: {
    speed: 175, crouchSpeedMultiplier: .25, radius: 15,
    maxHealth: 100, maxHunger: 100, maxStamina: 30,
    staminaDrainPerSecond: 1, staminaRegenPerSecond: 1,
    hungerPerSecond: 0.32, starvationDamagePerSecond: 3,
    regenPerSecond: 1.5, regenMinHunger: 65,
    dodgeSpeed: 430, dodgeDuration: .2, dodgeInvulnerability: .16,
    dodgeStaminaCost: 7, dodgeCooldown: .42
  },
  zombie: {
    radius: 15, speedMin: 42, speedMax: 67, wanderSpeedMin: 8, wanderSpeedMax: 16,
    wanderTurnMin: 1.5, wanderTurnMax: 4.5, health: 50, damage: 9,
    attackCooldown: .82, attackWindup: .48, attackRecovery: .28, attackReach: 2,
    spawnMinDistance: 390, spawnMaxDistance: 650, despawnDistance: 1100,
    maxAlive: 28, spawnEvery: 1.35, visionDistance: 260, crouchVisionDistance: 110,
    closeVisionDistance: 55, visionAngle: Math.PI * .78, perceptionIntervalMin: .09,
    perceptionIntervalMax: .18, hearingThreshold: .08, hearingMaxError: 45,
    crouchNoiseRadius: 45, walkNoiseRadius: 150, runNoiseRadius: 340,
    gunshotDistance: 850, footstepDistance: 48, memoryDuration: 7, searchDuration: 6,
    searchRadius: 105, searchSpeedMultiplier: 1.25, disengageDistance: 720,
    navigationClearance: 18, pathRebuildInterval: .55, pathTargetMoveThreshold: 52,
    waypointReachDistance: 12, stuckTimeout: 1.1, stuckMovementThreshold: 2
  },
  navigation: { cellSize: 40, maxSearchesPerFrame: 3 },
  render: {
    quality: 'auto', lowPixelRatio: .75, mediumPixelRatio: 1, highPixelRatio: 1.5,
    chunkSize: 640, maxCachedChunks: 48, cullMargin: 96,
    maxParticles: 240, fixedStep: 1 / 60, maxCatchUpSteps: 3
  },
  network: { aoiRadius: 1250, interpolationRate: 14, logoutSeconds: 15 },
  interaction: { doorDistance: 62 },
  debug: { zombieAI: false },
  weapons: [
    { name: 'КУЛАКИ', damage: 13, range: 48, cooldown: .46, windup: .16, arc: .82, knockback: 12, stagger: .18, staminaCost: 2, color: '#c4b29a' },
    { name: 'НОЖ', damage: 27, range: 61, cooldown: .39, windup: .12, arc: .62, knockback: 8, stagger: .13, staminaCost: 3, color: '#d2d6cf' },
    { name: 'ПИСТОЛЕТ', damage: 42, range: 620, cooldown: .3, color: '#ffe29c', gun: true }
  ],
  loot: { pickupDistance: 35, foodRestore: 32, medkitHeal: 48, foodCount: 16, medkitCount: 9 },
  day: { lengthSeconds: 240, darkness: .48 }
});
