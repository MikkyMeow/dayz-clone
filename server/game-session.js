import { randomUUID } from 'node:crypto';
import { C } from '../js/config.js';
import { clamp, distance, random } from '../js/utils.js';
import {
  attackPath, buildings, doorIsBlocked, findNearbyDoor, getDoorStates,
  hasClearPath, isWalkable, moveCircle, randomSpawnPoint, resetDoors, toggleDoor
} from '../js/world.js';

const weaponByItem = { fists: 0, knife: 1, pistol: 2 };
const countKey = { knife: 'knife', pistol: 'pistol', food: 'food', medkit: 'medkits' };
const RESPAWN_SECONDS = 3;
const SPAWN_PROTECTION_SECONDS = 2;

function newPlayer(id, name, characterId, saved = null) {
  const spawn = randomSpawnPoint(C.player.radius);
  const player = {
    id, name, characterId, x: spawn.x, y: spawn.y, r: C.player.radius, angle: 0,
    hp: C.player.maxHealth, hunger: C.player.maxHunger, stamina: C.player.maxStamina,
    exhausted: false, crouching: false, weapon: 1, heldItem: 'knife',
    quickSlots: ['knife', 'pistol', null, null], knife: 1, pistol: 1, food: 0, medkits: 0,
    cooldown: 0, dodgeTimer: 0, dodgeCooldown: 0, invulnerableTimer: SPAWN_PROTECTION_SECONDS,
    dodgeX: 0, dodgeY: 0, alive: true, respawnAt: 0, kills: 0, deaths: 0,
    lastProcessedInput: 0, input: { moveX: 0, moveY: 0, angle: 0, run: false, crouch: false },
    logoutAt: 0, connected: true
  };
  if (saved) {
    const fields = ['x', 'y', 'angle', 'hp', 'hunger', 'stamina', 'exhausted', 'crouching',
      'weapon', 'heldItem', 'quickSlots', 'knife', 'pistol', 'food', 'medkits', 'alive',
      'respawnAt', 'kills', 'deaths'];
    for (const field of fields) if (saved[field] !== undefined) player[field] = saved[field];
    if (!player.alive) player.respawnAt = RESPAWN_SECONDS;
    player.x = clamp(Number(player.x) || spawn.x, player.r, C.world.width - player.r);
    player.y = clamp(Number(player.y) || spawn.y, player.r, C.world.height - player.r);
    if (!isWalkable(player, player.r)) Object.assign(player, spawn);
  }
  return player;
}

export class GameSession {
  constructor() {
    resetDoors();
    this.id = randomUUID();
    this.tick = 0;
    this.time = 0;
    this.players = new Map();
    this.zombies = new Map();
    this.loot = new Map();
    this.events = [];
    this.spawnTimer = 0;
    this.nextEntityId = 1;
    this.completedLogouts = [];
    this.seedLoot();
  }

  entityId(prefix) { return `${prefix}-${this.nextEntityId++}`; }

  seedLoot() {
    for (const [type, count] of [['food', C.loot.foodCount], ['medkit', C.loot.medkitCount]]) {
      for (let i = 0; i < count; i++) {
        const point = randomSpawnPoint(9);
        const id = this.entityId('loot');
        this.loot.set(id, { id, type, x: point.x, y: point.y, r: 9, pickupDelay: 0 });
      }
    }
  }

  addPlayer(id, name, characterId = id, saved = null) {
    const player = newPlayer(id, name, characterId, saved);
    this.players.set(id, player);
    this.events.push({ type: 'playerJoined', playerId: id, name, tick: this.tick });
    return player;
  }

  reconnectPlayer(oldId, newId, name) {
    const player = this.players.get(oldId);
    if (!player) return null;
    this.players.delete(oldId);
    player.id = newId;
    player.name = name;
    player.connected = true;
    player.logoutAt = 0;
    player.lastProcessedInput = 0;
    player.input = { moveX: 0, moveY: 0, angle: player.angle, run: false,
      crouch: player.crouching };
    this.players.set(newId, player);
    this.events.push({ type: 'playerReconnected', playerId: newId, name, tick: this.tick });
    return player;
  }

  removePlayer(id) {
    if (!this.players.delete(id)) return;
    this.events.push({ type: 'playerLeft', playerId: id, tick: this.tick });
  }

  beginLogout(id, connected = true) {
    const player = this.players.get(id);
    if (!player || player.logoutAt) return false;
    player.connected = connected;
    player.logoutAt = this.time + C.network.logoutSeconds;
    player.input = { seq: player.lastProcessedInput, moveX: 0, moveY: 0,
      angle: player.angle, run: false, crouch: player.crouching };
    return true;
  }

  cancelLogout(id) {
    const player = this.players.get(id);
    if (!player || !player.connected || !player.logoutAt) return false;
    player.logoutAt = 0;
    return true;
  }

  disconnectPlayer(id) {
    const player = this.players.get(id);
    if (!player) return;
    player.connected = false;
    if (!player.logoutAt) this.beginLogout(id, false);
  }

  takeCompletedLogouts() {
    const completed = this.completedLogouts;
    this.completedLogouts = [];
    return completed;
  }

  serializePlayer(player) {
    const fields = ['name', 'x', 'y', 'angle', 'hp', 'hunger', 'stamina', 'exhausted',
      'crouching', 'weapon', 'heldItem', 'quickSlots', 'knife', 'pistol', 'food', 'medkits',
      'alive', 'respawnAt', 'kills', 'deaths'];
    const saved = Object.fromEntries(fields.map(field => [field, player[field]]));
    if (!saved.alive) saved.respawnAt = RESPAWN_SECONDS;
    return saved;
  }

  setInput(id, input) {
    const player = this.players.get(id);
    if (!player || player.logoutAt || input.seq <= player.lastProcessedInput) return;
    player.input = input;
    player.lastProcessedInput = input.seq;
  }

  action(id, message) {
    const player = this.players.get(id);
    if (!player) return;
    if (message.action === 'beginLogout') return this.beginLogout(id);
    if (message.action === 'cancelLogout') return this.cancelLogout(id);
    if (player.logoutAt) return;
    if (message.action === 'respawn') return this.respawn(player);
    if (!player.alive) return;
    const payload = message.payload || {};
    if (message.action === 'attack') this.attack(player);
    else if (message.action === 'dodge') this.dodge(player);
    else if (message.action === 'interact') this.interact(player);
    else if (message.action === 'toggleCrouch') player.crouching = !player.crouching;
    else if (message.action === 'equip') this.equip(player, payload.type);
    else if (message.action === 'useItem') this.useItem(player);
    else if (message.action === 'dropItem') this.dropItem(player);
    else if (message.action === 'assignQuickSlot') {
      if (Number.isInteger(payload.index) && payload.index >= 0 && payload.index < 4 &&
          [null, 'knife', 'pistol', 'food', 'medkit'].includes(payload.item)) {
        player.quickSlots[payload.index] = payload.item;
      }
    }
  }

  equip(player, type) {
    if (type === 'fists') { player.heldItem = 'fists'; player.weapon = 0; return; }
    const key = countKey[type];
    if (!key || !player[key]) return;
    player.heldItem = type;
    if (weaponByItem[type] !== undefined) player.weapon = weaponByItem[type];
  }

  useItem(player) {
    if (player.heldItem === 'food' && player.food > 0) {
      player.food--; player.hunger = Math.min(C.player.maxHunger, player.hunger + C.loot.foodRestore);
    } else if (player.heldItem === 'medkit' && player.medkits > 0) {
      player.medkits--; player.hp = Math.min(C.player.maxHealth, player.hp + C.loot.medkitHeal);
    }
  }

  dropItem(player) {
    const key = countKey[player.heldItem];
    if (!key || player[key] <= 0) return;
    player[key]--;
    const id = this.entityId('loot');
    this.loot.set(id, { id, type: player.heldItem, x: player.x, y: player.y, r: 9, pickupDelay: .65 });
    player.heldItem = 'fists'; player.weapon = 0;
  }

  dodge(player) {
    if (player.crouching || player.dodgeCooldown > 0 || player.stamina < C.player.dodgeStaminaCost) return;
    const input = player.input;
    const length = Math.hypot(input.moveX, input.moveY);
    player.dodgeX = length > .1 ? input.moveX / length : Math.cos(player.angle);
    player.dodgeY = length > .1 ? input.moveY / length : Math.sin(player.angle);
    player.dodgeTimer = C.player.dodgeDuration;
    player.invulnerableTimer = C.player.dodgeInvulnerability;
    player.dodgeCooldown = C.player.dodgeCooldown;
    player.stamina -= C.player.dodgeStaminaCost;
  }

  interact(player) {
    const door = findNearbyDoor(player);
    if (!door) return;
    const occupants = [...this.players.values(), ...this.zombies.values()].filter(entity => entity.alive !== false);
    if (door.open && doorIsBlocked(door, occupants)) return;
    toggleDoor(door);
    this.events.push({ type: 'door', doorId: door.id, open: door.open, tick: this.tick });
  }

  attack(attacker) {
    const weapon = C.weapons[attacker.weapon];
    if (!weapon || attacker.cooldown > 0 || !['fists', 'knife', 'pistol'].includes(attacker.heldItem)) return;
    if (!weapon.gun && (attacker.dodgeTimer > 0 || attacker.stamina < weapon.staminaCost)) return;
    attacker.cooldown = weapon.cooldown;
    if (!weapon.gun) attacker.stamina -= weapon.staminaCost;

    const candidates = [
      ...[...this.players.values()].filter(p => p.id !== attacker.id && p.alive),
      ...this.zombies.values()
    ];
    let target = null;
    let best = weapon.range;
    const arc = weapon.gun ? .22 : weapon.arc;
    for (const candidate of candidates) {
      const d = distance(attacker, candidate);
      const angle = Math.atan2(candidate.y - attacker.y, candidate.x - attacker.x);
      const delta = Math.abs(Math.atan2(Math.sin(angle - attacker.angle), Math.cos(angle - attacker.angle)));
      if (d < best && delta < arc && (weapon.gun || hasClearPath(attacker, candidate))) {
        target = candidate; best = d;
      }
    }
    this.events.push({ type: 'attack', attackerId: attacker.id, weapon: attacker.weapon,
      x: attacker.x, y: attacker.y, angle: attacker.angle, tick: this.tick });
    if (!target) return;
    const path = attackPath(attacker, target);
    if (path.blocked || target.invulnerableTimer > 0) return;
    target.hp -= weapon.damage * path.damageMultiplier;
    this.events.push({ type: 'hit', attackerId: attacker.id, targetId: target.id, hp: Math.max(0, target.hp), tick: this.tick });
    if (target.hp <= 0) this.kill(target, attacker);
  }

  kill(target, attacker) {
    if (this.players.has(target.id)) {
      target.hp = 0; target.alive = false; target.respawnAt = this.time + RESPAWN_SECONDS; target.deaths++;
      if (this.players.has(attacker.id)) attacker.kills++;
      this.events.push({ type: 'death', playerId: target.id, killerId: attacker.id, tick: this.tick });
    } else {
      this.zombies.delete(target.id);
      this.events.push({ type: 'zombieKilled', zombieId: target.id, killerId: attacker.id, tick: this.tick });
    }
  }

  respawn(player) {
    if (player.alive || this.time < player.respawnAt) return;
    const spawn = randomSpawnPoint(player.r);
    Object.assign(player, spawn, { hp: C.player.maxHealth, hunger: C.player.maxHunger,
      stamina: C.player.maxStamina, alive: true, invulnerableTimer: SPAWN_PROTECTION_SECONDS,
      heldItem: 'knife', weapon: 1, knife: 1, pistol: 1, food: 0, medkits: 0 });
    this.events.push({ type: 'respawn', playerId: player.id, tick: this.tick });
  }

  updatePlayer(player, dt) {
    player.cooldown = Math.max(0, player.cooldown - dt);
    player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
    player.invulnerableTimer = Math.max(0, player.invulnerableTimer - dt);
    if (!player.alive) { if (this.time >= player.respawnAt) this.respawn(player); return; }
    player.angle = player.input.angle;
    player.crouching = player.input.crouch && player.stamina > 0;
    if (player.dodgeTimer > 0) {
      player.dodgeTimer = Math.max(0, player.dodgeTimer - dt);
      moveCircle(player, player.dodgeX * C.player.dodgeSpeed * dt, player.dodgeY * C.player.dodgeSpeed * dt);
    } else {
      const moving = Math.hypot(player.input.moveX, player.input.moveY) > .01;
      const running = moving && player.input.run && !player.crouching && !player.exhausted && player.stamina > 0;
      if (running || (moving && player.crouching)) player.stamina = Math.max(0, player.stamina - C.player.staminaDrainPerSecond * dt);
      else player.stamina = Math.min(C.player.maxStamina, player.stamina + C.player.staminaRegenPerSecond * dt);
      if (player.stamina === 0) player.exhausted = true;
      if (!player.input.run || player.stamina === C.player.maxStamina) player.exhausted = false;
      const speed = C.player.speed * (player.crouching ? C.player.crouchSpeedMultiplier : running ? 1 : .5);
      moveCircle(player, player.input.moveX * speed * dt, player.input.moveY * speed * dt);
    }
    player.hunger = clamp(player.hunger - C.player.hungerPerSecond * dt, 0, C.player.maxHunger);
    if (player.hunger <= 0) player.hp -= C.player.starvationDamagePerSecond * dt;
    else if (player.hunger >= C.player.regenMinHunger) player.hp = Math.min(C.player.maxHealth, player.hp + C.player.regenPerSecond * dt);
    if (player.hp <= 0) this.kill(player, { id: 'world' });
    this.pickup(player);
  }

  pickup(player) {
    for (const [id, item] of this.loot) {
      if (item.pickupDelay > 0 || distance(player, item) >= C.loot.pickupDistance) continue;
      const key = countKey[item.type];
      if (!key) continue;
      this.loot.delete(id); player[key]++;
      this.events.push({ type: 'pickup', playerId: player.id, lootId: id, item: item.type, tick: this.tick });
      break;
    }
  }

  spawnZombie() {
    if (!this.players.size || this.zombies.size >= C.zombie.maxAlive) return;
    const players = [...this.players.values()].filter(p => p.alive);
    if (!players.length) return;
    const target = players[Math.floor(Math.random() * players.length)];
    const angle = random(0, Math.PI * 2);
    const radius = random(C.zombie.spawnMinDistance, C.zombie.spawnMaxDistance);
    const point = { x: clamp(target.x + Math.cos(angle) * radius, C.zombie.radius, C.world.width - C.zombie.radius),
      y: clamp(target.y + Math.sin(angle) * radius, C.zombie.radius, C.world.height - C.zombie.radius) };
    if (!isWalkable(point, C.zombie.radius)) return;
    const id = this.entityId('zombie');
    this.zombies.set(id, { id, ...point, r: C.zombie.radius, hp: C.zombie.health,
      angle: 0, speed: random(C.zombie.speedMin, C.zombie.speedMax), cooldown: 0, attackTimer: 0, staggerTimer: 0 });
  }

  updateZombies(dt) {
    const players = [...this.players.values()].filter(p => p.alive);
    for (const zombie of this.zombies.values()) {
      if (!players.length) break;
      let target = players[0];
      for (const player of players) if (distance(zombie, player) < distance(zombie, target)) target = player;
      const d = distance(zombie, target);
      zombie.angle = Math.atan2(target.y - zombie.y, target.x - zombie.x);
      zombie.cooldown = Math.max(0, zombie.cooldown - dt);
      if (d <= target.r + zombie.r + C.zombie.attackReach) {
        if (zombie.cooldown <= 0 && target.invulnerableTimer <= 0 && hasClearPath(zombie, target)) {
          target.hp -= C.zombie.damage; zombie.cooldown = C.zombie.attackCooldown;
          this.events.push({ type: 'hit', attackerId: zombie.id, targetId: target.id, hp: Math.max(0, target.hp), tick: this.tick });
          if (target.hp <= 0) this.kill(target, zombie);
        }
      } else if (d < C.zombie.disengageDistance && hasClearPath(zombie, target, C.zombie.navigationClearance)) {
        moveCircle(zombie, Math.cos(zombie.angle) * zombie.speed * dt, Math.sin(zombie.angle) * zombie.speed * dt);
      }
    }
  }

  step(dt) {
    this.tick++; this.time += dt;
    for (const item of this.loot.values()) item.pickupDelay = Math.max(0, item.pickupDelay - dt);
    for (const player of this.players.values()) this.updatePlayer(player, dt);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = C.zombie.spawnEvery; this.spawnZombie(); }
    this.updateZombies(dt);
    for (const player of [...this.players.values()]) {
      if (!player.logoutAt || this.time < player.logoutAt) continue;
      this.completedLogouts.push({ id: player.id, characterId: player.characterId,
        state: this.serializePlayer(player), connected: player.connected });
      this.removePlayer(player.id);
    }
  }

  snapshot(forPlayerId) {
    const observer = this.players.get(forPlayerId);
    const radiusSquared = C.network.aoiRadius * C.network.aoiRadius;
    const relevant = entity => !observer || entity.id === forPlayerId ||
      (entity.x - observer.x) ** 2 + (entity.y - observer.y) ** 2 <= radiusSquared;
    return {
      type: 'snapshot', sessionId: this.id, tick: this.tick, time: this.time,
      selfId: forPlayerId,
      players: [...this.players.values()].filter(relevant).map(player => ({ ...player, input: undefined,
        characterId: undefined, connected: undefined })),
      zombies: [...this.zombies.values()].filter(relevant), loot: [...this.loot.values()].filter(relevant),
      doors: getDoorStates(), events: this.events
    };
  }

  clearEvents() { this.events = []; }
}
