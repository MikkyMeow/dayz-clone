import { C } from './config.js';
import { keys, pointer, sticks } from './input.js';
import { state } from './state.js';
import { showMessage, updateUI } from './ui.js';
import { applyDoorStates, findNearbyDoor } from './world.js';

const PROTOCOL_VERSION = 1;

export class MultiplayerClient {
  constructor({ onReady, onDisconnect }) {
    this.socket = null;
    this.playerId = null;
    this.seq = 0;
    this.inputTimer = null;
    this.pingTimer = null;
    this.lastAttackAt = 0;
    this.onReady = onReady;
    this.onDisconnect = onDisconnect;
  }

  connect(name) {
    return new Promise((resolve, reject) => {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = this.socket = new WebSocket(`${scheme}://${location.host}/ws`);
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Сервер не отвечает')); }, 7000);
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', protocolVersion: PROTOCOL_VERSION, name })));
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'welcome') {
          clearTimeout(timeout); this.playerId = message.playerId; this.startTimers(); resolve();
        } else if (message.type === 'snapshot') this.applySnapshot(message);
        else if (message.type === 'error') showMessage(`Сервер: ${message.code}`);
      });
      socket.addEventListener('close', () => {
        clearTimeout(timeout); this.stopTimers();
        if (socket !== this.socket) return;
        if (!this.playerId) reject(new Error('Не удалось подключиться'));
        else this.onDisconnect?.();
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
    this.stopTimers(); this.playerId = null;
    if (this.socket?.readyState <= WebSocket.OPEN) this.socket.close(1000, 'mode_change');
  }

  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  sendInput() {
    if (!state?.running) return;
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

  applySnapshot(snapshot) {
    const self = snapshot.players.find(player => player.id === this.playerId);
    if (!self || !state) return;
    const visual = { particles: state.particles, shots: state.shots, noises: state.noises };
    Object.assign(state.player, self);
    state.remotePlayers = snapshot.players.filter(player => player.id !== this.playerId);
    state.zombies = snapshot.zombies;
    state.loot = snapshot.loot;
    state.time = snapshot.time;
    state.particles = visual.particles; state.shots = visual.shots; state.noises = visual.noises;
    applyDoorStates(snapshot.doors);
    state.nearbyDoor = findNearbyDoor(state.player);
    this.applyEvents(snapshot.events || []);
    updateUI();
    this.onReady?.(); this.onReady = null;
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
