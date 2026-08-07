import { C } from './config.js';
import { viewport } from './display.js';
import { burst } from './effects.js';
import { beginNavigationFrame, findPath, pathNeedsRefresh, projectToWalkable } from './navigation.js';
import { state } from './state.js';
import { clamp, distance, random } from './utils.js';
import { hasClearPath, isWalkable, moveCircle, obstacles } from './world.js';
import { updatePerception } from './zombie-perception.js';

export const ZombieState = Object.freeze({
  WANDER: 'wander',
  CHASE: 'chase',
  INVESTIGATE: 'investigate',
  SEARCH: 'search',
  ATTACK: 'attack'
});

function setState(zombie, next, reason) {
  if (zombie.behaviorState === next) return;
  zombie.behaviorState = next;
  zombie.stateReason = reason;
  zombie.path = [];
  zombie.pathIndex = 0;
  zombie.pathTarget = null;
  zombie.pathUpdateTimer = 0;
  zombie.stuckTimer = 0;

  if (next === ZombieState.SEARCH) {
    zombie.searchTimer = C.zombie.searchDuration;
    zombie.searchTarget = null;
  } else if (next === ZombieState.WANDER) {
    zombie.lastSeenPosition = null;
    zombie.lastHeardPosition = null;
    zombie.wanderTimer = 0;
  }
}

function createZombie(x, y, player) {
  return {
    x: clamp(x, C.zombie.radius, C.world.width - C.zombie.radius),
    y: clamp(y, C.zombie.radius, C.world.height - C.zombie.radius),
    r: C.zombie.radius,
    hp: C.zombie.health,
    speed: random(C.zombie.speedMin, C.zombie.speedMax),
    wanderSpeed: random(C.zombie.wanderSpeedMin, C.zombie.wanderSpeedMax),
    wanderTimer: random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax),
    cooldown: 0,
    angle: Math.atan2(player.y - y, player.x - x) + random(-Math.PI / 3, Math.PI / 3),

    behaviorState: ZombieState.WANDER,
    stateReason: 'spawned',
    lastSeenPosition: null,
    lastSeenAt: -Infinity,
    lastHeardPosition: null,
    lastHeardAt: -Infinity,
    lastNoiseCheckedAt: state.time - 1,
    targetPosition: null,
    searchTarget: null,
    searchTimer: 0,
    path: [],
    pathIndex: 0,
    pathTarget: null,
    pathUpdateTimer: random(0, C.zombie.pathRebuildInterval),
    perceptionTimer: random(0, C.zombie.perceptionIntervalMax),
    stuckTimer: 0,
    previousPosition: { x, y }
  };
}

export function spawnZombie() {
  if (state.zombies.length >= C.zombie.maxAlive) return;
  const player = state.player;
  const cameraX = clamp(player.x - viewport.width / 2, 0, Math.max(0, C.world.width - viewport.width));
  const cameraY = clamp(player.y - viewport.height / 2, 0, Math.max(0, C.world.height - viewport.height));
  const screen = {
    left: cameraX,
    right: Math.min(cameraX + viewport.width, C.world.width),
    top: cameraY,
    bottom: Math.min(cameraY + viewport.height, C.world.height)
  };
  const sides = [];
  if (screen.left > C.zombie.radius) sides.push('left');
  if (screen.right < C.world.width - C.zombie.radius) sides.push('right');
  if (screen.top > C.zombie.radius) sides.push('top');
  if (screen.bottom < C.world.height - C.zombie.radius) sides.push('bottom');
  if (!sides.length) return;

  const side = sides[Math.floor(random(0, sides.length))];
  const outsideOffset = random(C.zombie.radius + 8, C.zombie.radius + 70);
  let x;
  let y;
  if (side === 'left' || side === 'right') {
    x = side === 'left' ? screen.left - outsideOffset : screen.right + outsideOffset;
    y = random(screen.top, screen.bottom);
  } else {
    x = random(screen.left, screen.right);
    y = side === 'top' ? screen.top - outsideOffset : screen.bottom + outsideOffset;
  }

  const zombie = createZombie(x, y, player);
  const insideObstacle = obstacles.some(obstacle =>
    zombie.x > obstacle.x && zombie.x < obstacle.x + obstacle.w &&
    zombie.y > obstacle.y && zombie.y < obstacle.y + obstacle.h
  );
  if (!insideObstacle && isWalkable(zombie, zombie.r)) state.zombies.push(zombie);
}

function latestKnownPosition(zombie) {
  if (zombie.lastSeenAt >= zombie.lastHeardAt) return zombie.lastSeenPosition;
  return zombie.lastHeardPosition;
}

function lastContactAt(zombie) {
  return Math.max(zombie.lastSeenAt, zombie.lastHeardAt);
}

function hasFreshMemory(zombie) {
  return state.time - lastContactAt(zombie) <= C.zombie.memoryDuration;
}

function updateBehavior(zombie, perception, playerDistance) {
  if (perception?.seesPlayer) {
    setState(zombie, playerDistance <= state.player.r + zombie.r + C.zombie.attackReach
      ? ZombieState.ATTACK
      : ZombieState.CHASE, 'player visible');
    return;
  }

  if (perception?.heardNoise) {
    setState(zombie, ZombieState.INVESTIGATE, 'noise heard');
    return;
  }

  if (playerDistance > C.zombie.disengageDistance && zombie.behaviorState !== ZombieState.WANDER) {
    setState(zombie, ZombieState.WANDER, 'player too far');
    return;
  }

  // Решение о потере контакта принимается только в кадр фактической проверки
  // восприятия, иначе CHASE сбрасывался бы между двумя проверками зрения.
  if (!perception) return;

  if (zombie.behaviorState === ZombieState.CHASE || zombie.behaviorState === ZombieState.ATTACK) {
    if (hasFreshMemory(zombie)) setState(zombie, ZombieState.INVESTIGATE, 'visual contact lost');
    else setState(zombie, ZombieState.SEARCH, 'memory expired');
  } else if (zombie.behaviorState === ZombieState.INVESTIGATE && !hasFreshMemory(zombie)) {
    setState(zombie, ZombieState.SEARCH, 'trail lost');
  }
}

function moveDirectly(zombie, target, speed, dt) {
  const dx = target.x - zombie.x;
  const dy = target.y - zombie.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return true;
  zombie.angle = Math.atan2(dy, dx);
  moveCircle(zombie, dx / length * speed * dt, dy / length * speed * dt);
  return length <= Math.max(C.zombie.waypointReachDistance, speed * dt);
}

function rebuildPath(zombie, target) {
  const path = findPath(zombie, target, { clearance: C.zombie.navigationClearance });
  if (path === null) return false; // Кадровый бюджет исчерпан — повторим позже.
  zombie.path = path;
  zombie.pathIndex = 0;
  zombie.pathTarget = { x: target.x, y: target.y };
  zombie.pathUpdateTimer = C.zombie.pathRebuildInterval + random(0, .15);
  return true;
}

function followTarget(zombie, target, speed, dt, allowDirect = false) {
  zombie.pathUpdateTimer -= dt;
  if (allowDirect && hasClearPath(zombie, target, C.zombie.navigationClearance)) {
    zombie.path = [];
    zombie.pathIndex = 0;
    zombie.pathTarget = { x: target.x, y: target.y };
    return moveDirectly(zombie, target, speed, dt);
  }

  if (
    !zombie.path.length || zombie.pathIndex >= zombie.path.length ||
    (zombie.pathUpdateTimer <= 0 && pathNeedsRefresh(zombie.pathTarget, target))
  ) rebuildPath(zombie, target);

  const waypoint = zombie.path[zombie.pathIndex];
  if (!waypoint) return false;
  const reached = moveDirectly(zombie, waypoint, speed, dt);
  if (reached || distance(zombie, waypoint) <= C.zombie.waypointReachDistance) zombie.pathIndex++;
  return zombie.pathIndex >= zombie.path.length && distance(zombie, target) <= C.zombie.waypointReachDistance * 1.5;
}

function updateStuckState(zombie, dt) {
  const moved = distance(zombie, zombie.previousPosition);
  const expectsMovement = ![ZombieState.ATTACK, ZombieState.WANDER].includes(zombie.behaviorState) || zombie.wanderTimer > 0;
  if (expectsMovement && moved < C.zombie.stuckMovementThreshold * dt) zombie.stuckTimer += dt;
  else zombie.stuckTimer = 0;
  zombie.previousPosition.x = zombie.x;
  zombie.previousPosition.y = zombie.y;
  if (zombie.stuckTimer < C.zombie.stuckTimeout) return;
  zombie.path = [];
  zombie.pathIndex = 0;
  zombie.pathUpdateTimer = 0;
  zombie.stuckTimer = 0;
}

function updateWander(zombie, dt) {
  zombie.wanderTimer -= dt;
  if (zombie.wanderTimer <= 0) {
    zombie.angle = random(0, Math.PI * 2);
    zombie.wanderTimer = random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax);
  }
  const oldX = zombie.x;
  const oldY = zombie.y;
  moveCircle(
    zombie,
    Math.cos(zombie.angle) * zombie.wanderSpeed * dt,
    Math.sin(zombie.angle) * zombie.wanderSpeed * dt
  );
  if (Math.hypot(zombie.x - oldX, zombie.y - oldY) < zombie.wanderSpeed * dt * .25) {
    zombie.angle += random(Math.PI / 2, Math.PI * 1.5);
    zombie.wanderTimer = random(C.zombie.wanderTurnMin, C.zombie.wanderTurnMax);
  }
}

function chooseSearchTarget(zombie) {
  const center = latestKnownPosition(zombie) || zombie;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random(0, Math.PI * 2);
    const radius = random(C.zombie.searchRadius * .25, C.zombie.searchRadius);
    const candidate = projectToWalkable({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    }, { clearance: C.zombie.navigationClearance });
    if (candidate) return candidate;
  }
  return { x: center.x, y: center.y };
}

function updateSearch(zombie, dt) {
  zombie.searchTimer -= dt;
  if (zombie.searchTimer <= 0) {
    setState(zombie, ZombieState.WANDER, 'search completed');
    return;
  }
  if (!zombie.searchTarget || distance(zombie, zombie.searchTarget) <= C.zombie.waypointReachDistance * 1.5) {
    zombie.searchTarget = chooseSearchTarget(zombie);
    zombie.path = [];
  }
  followTarget(zombie, zombie.searchTarget, zombie.wanderSpeed * C.zombie.searchSpeedMultiplier, dt, true);
}

function updateAttack(zombie, dt) {
  const player = state.player;
  const playerDistance = distance(zombie, player);
  zombie.angle = Math.atan2(player.y - zombie.y, player.x - zombie.x);
  if (playerDistance > player.r + zombie.r + C.zombie.attackReach) {
    setState(zombie, ZombieState.CHASE, 'player left attack range');
    return;
  }
  if (zombie.cooldown > 0) return;
  player.hp -= C.zombie.damage;
  zombie.cooldown = C.zombie.attackCooldown;
  burst(player.x, player.y, '#b84e43', 5);
}

function updateActiveMovement(zombie, dt) {
  if (zombie.behaviorState === ZombieState.WANDER) {
    updateWander(zombie, dt);
    return;
  }
  if (zombie.behaviorState === ZombieState.ATTACK) {
    updateAttack(zombie, dt);
    return;
  }
  if (zombie.behaviorState === ZombieState.SEARCH) {
    updateSearch(zombie, dt);
    return;
  }

  const target = zombie.behaviorState === ZombieState.CHASE
    ? state.player
    : latestKnownPosition(zombie);
  if (!target) {
    setState(zombie, ZombieState.SEARCH, 'no known target');
    return;
  }
  const arrived = followTarget(
    zombie,
    target,
    zombie.speed,
    dt,
    zombie.behaviorState === ZombieState.CHASE
  );
  if (arrived && zombie.behaviorState === ZombieState.INVESTIGATE) {
    setState(zombie, ZombieState.SEARCH, 'last known position reached');
  }
}

export function alertZombieToPosition(zombie, position, source = 'external noise') {
  zombie.lastHeardPosition = { x: position.x, y: position.y };
  zombie.lastHeardAt = state.time;
  setState(zombie, ZombieState.INVESTIGATE, source);
}

export function updateZombies(dt) {
  const player = state.player;
  const despawnDistance = Math.max(
    C.zombie.despawnDistance,
    Math.hypot(viewport.width, viewport.height) + 100
  );
  beginNavigationFrame();

  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const zombie = state.zombies[i];
    const playerDistance = distance(zombie, player);
    if (playerDistance > despawnDistance && zombie.behaviorState === ZombieState.WANDER) {
      state.zombies.splice(i, 1);
      continue;
    }

    zombie.cooldown = Math.max(0, zombie.cooldown - dt);
    const perception = updatePerception(zombie, dt);
    updateBehavior(zombie, perception, playerDistance);
    updateActiveMovement(zombie, dt);
    updateStuckState(zombie, dt);
  }
}
