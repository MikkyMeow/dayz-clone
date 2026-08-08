import { C } from './config.js';
import { keys, pointer, sticks } from './input.js';
import { state } from './state.js';
import { showMessage, updateUI } from './ui.js';
import { applyDoorStates, findNearbyDoor } from './world.js';
import { recordSnapshot } from './performance.js';

const PROTOCOL_VERSION = 1;

function createCharacterId() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') webCrypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

export class MultiplayerClient {
  constructor({ onReady, onDisconnect, onLogoutComplete, isInputEnabled }) {
    this.socket = null;
    this.playerId = null;
    this.seq = 0;
    this.inputTimer = null;
    this.pingTimer = null;
    this.lastAttackAt = 0;
    this.receivedSnapshot = false;
    this.readyNotified = false;
    this.onReady = onReady;
    this.onDisconnect = onDisconnect;
    this.onLogoutComplete = onLogoutComplete;
    this.isInputEnabled = isInputEnabled;
    this.intentionalClose = false;
  }

  connect(name) {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.readyNotified = false;
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = this.socket = new WebSocket(`${scheme}://${location.host}/ws`);
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Сервер не отвечает')); }, 7000);
      let characterId = localStorage.getItem('deadzone.characterId');
      if (!characterId) {
        characterId = createCharacterId();
        localStorage.setItem('deadzone.characterId', characterId);
      }
      socket.addEventListener('open', () => socket.send(JSON.stringify({
        type: 'join', protocolVersion: PROTOCOL_VERSION, name, characterId
      })));
      socket.addEventListener('message', event => {
        recordSnapshot(typeof event.data === 'string' ? event.data.length : event.data?.byteLength || 0);
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'welcome') {
          clearTimeout(timeout); this.playerId = message.playerId; this.startTimers(); resolve();
        } else if (message.type === 'snapshot') this.applySnapshot(message);
        else if (message.type === 'logoutComplete') {
          this.intentionalClose = true;
          this.onLogoutComplete?.();
        }
        else if (message.type === 'error') showMessage(`Сервер: ${message.code}`);
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout); this.stopTimers();
        if (socket !== this.socket) return;
        if (!this.playerId) reject(new Error('Не удалось подключиться'));
        else if (!this.intentionalClose) this.onDisconnect?.();
      });
      socket.addEventListener('error', () => {});
    });
  }

  startTimers() {
    this.inputTimer = setInterval(() => this.sendInput(), 1000 / 30);
    this.pingTimer = setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), 5000);
  }

  stopTimers() { clearInterval(this.inputTimer); clearInterval(this.pingTimer); }

  close() {
    this.stopTimers(); this.playerId = null; this.receivedSnapshot = false;
    this.readyNotified = false; this.intentionalClose = true;
    if (this.socket?.readyState <= WebSocket.OPEN) this.socket.close(1000, 'mode_change');
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  sendInput() {
    if (!state?.running) return;
    if (this.isInputEnabled && !this.isInputEnabled()) {
      this.send({ type: 'input', seq: ++this.seq, moveX: 0, moveY: 0, angle: state.player.angle,
        run: false, crouch: state.player.crouching });
      return;
    }
    let moveX = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    let moveY = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
    if (sticks.move) { moveX = sticks.move.dx; moveY = sticks.move.dy; }
    const length = Math.hypot(moveX, moveY);
    if (length > 1) { moveX /= length; moveY /= length; }
    if (sticks.aim && Math.hypot(sticks.aim.dx, sticks.aim.dy) > .2) {
      state.player.angle = Math.atan2(sticks.aim.dy, sticks.aim.dx);
    }
    this.send({ type: 'input', seq: ++this.seq, moveX, moveY, angle: state.player.angle,
      run: sticks.move ? sticks.move.outside : keys.has('shift'), crouch: state.player.crouching });
    if ((pointer.down || (sticks.aim && Math.hypot(sticks.aim.dx, sticks.aim.dy) > .2)) && Date.now() - this.lastAttackAt > 100) {
      this.lastAttackAt = Date.now(); this.action('attack');
    }
  }

  action(action, payload = {}) { this.send({ type: 'action', seq: ++this.seq, action, payload }); }

  update(dt) {
    const blend = 1 - Math.exp(-C.network.interpolationRate * dt);
    if (state.renderPlayer) {
      state.renderPlayer.x += (state.player.x - state.renderPlayer.x) * blend;
      state.renderPlayer.y += (state.player.y - state.renderPlayer.y) * blend;
      state.renderPlayer.angle += Math.atan2(
        Math.sin(state.player.angle - state.renderPlayer.angle),
        Math.cos(state.player.angle - state.renderPlayer.angle)
      ) * blend;
    }
    for (const collection of [state.remotePlayers, state.zombies]) {
      for (const entity of collection) {
        if (entity.targetX === undefined) continue;
        entity.x += (entity.targetX - entity.x) * blend;
        entity.y += (entity.targetY - entity.y) * blend;
        entity.angle += Math.atan2(Math.sin(entity.targetAngle - entity.angle), Math.cos(entity.targetAngle - entity.angle)) * blend;
      }
    }
  }

  reconcileEntities(current, incoming) {
    const existing = new Map(current.map(entity => [entity.id, entity]));
    return incoming.map(next => {
      const entity = existing.get(next.id);
      if (!entity) return { ...next, targetX: next.x, targetY: next.y, targetAngle: next.angle };
      const { x, y, angle } = entity;
      Object.assign(entity, next, { x, y, angle, targetX: next.x, targetY: next.y, targetAngle: next.angle });
      return entity;
    });
  }

  applySnapshot(snapshot) {
    const self = snapshot.players.find(player => player.id === this.playerId);
    if (!self || !state) return;
    const visual = { particles: state.particles, shots: state.shots, noises: state.noises };
    Object.assign(state.player, self);
    if (!this.receivedSnapshot) {
      Object.assign(state.renderPlayer, { x: self.x, y: self.y, angle: self.angle, r: self.r });
      this.receivedSnapshot = true;
    }
    state.remotePlayers = this.reconcileEntities(state.remotePlayers,
      snapshot.players.filter(player => player.id !== this.playerId));
    state.zombies = this.reconcileEntities(state.zombies, snapshot.zombies);
    state.loot = snapshot.loot;
    state.time = snapshot.time;
    state.particles = visual.particles; state.shots = visual.shots; state.noises = visual.noises;
    applyDoorStates(snapshot.doors);
    state.nearbyDoor = findNearbyDoor(state.player);
    this.applyEvents(snapshot.events || []);
    updateUI();
    if (!this.readyNotified) {
      this.readyNotified = true;
      this.onReady?.();
    }
  }

  applyEvents(events) {
    for (const event of events) {
      if (event.type === 'attack' && event.weapon === 2) {
        state.shots.push({ x1: event.x, y1: event.y,
          x2: event.x + Math.cos(event.angle) * C.weapons[2].range,
          y2: event.y + Math.sin(event.angle) * C.weapons[2].range, life: .08 });
      } else if (event.type === 'death') {
        const victim = event.playerId === this.playerId ? 'Вы погибли' : 'Игрок погиб';
        showMessage(victim);
      } else if (event.type === 'pickup' && event.playerId === this.playerId) {
        showMessage('Предмет подобран');
      }
    }
  }
}
