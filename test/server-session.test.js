import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from '../server/game-session.js';
import { parseClientMessage, PROTOCOL_VERSION } from '../server/protocol.js';

test('protocol validates joins and normalizes movement', () => {
  assert.deepEqual(parseClientMessage(Buffer.from(JSON.stringify({
    type: 'join', protocolVersion: PROTOCOL_VERSION, name: '<Игрок>',
    characterId: '12345678-1234-1234-1234-123456789abc'
  }))), { type: 'join', name: 'Игрок', characterId: '12345678-1234-1234-1234-123456789abc' });
  const input = parseClientMessage(Buffer.from(JSON.stringify({
    type: 'input', seq: 1, moveX: 3, moveY: 4, angle: 0, run: true
  })));
  assert.equal(Math.hypot(input.moveX, input.moveY), 1);
  assert.throws(() => parseClientMessage(Buffer.from('{broken')), /invalid_json/);
});

test('logout keeps an AFK player alive for 15 seconds and can be cancelled', () => {
  const session = new GameSession();
  const player = session.addPlayer('socket', 'A', 'character');
  player.x = 100; player.y = 100;
  session.setInput(player.id, { seq: 1, moveX: 1, moveY: 0, angle: 0, run: true, crouch: false });
  assert.equal(session.beginLogout(player.id), true);
  session.step(10);
  assert.equal(session.players.has(player.id), true);
  assert.equal(player.x, 100);
  assert.equal(session.cancelLogout(player.id), true);
  session.step(6);
  assert.equal(session.players.has(player.id), true);
});

test('completed logout returns persistent state and removes the world entity', () => {
  const session = new GameSession();
  const player = session.addPlayer('socket', 'A', 'character');
  Object.assign(player, { x: 321, y: 654, food: 3 });
  session.beginLogout(player.id);
  session.step(15);
  const [completed] = session.takeCompletedLogouts();
  assert.equal(session.players.has(player.id), false);
  assert.equal(completed.characterId, 'character');
  assert.equal(completed.state.x, 321);
  assert.equal(completed.state.y, 654);
  assert.equal(completed.state.food, 3);
});

test('saved player state is restored at the saved position', () => {
  const first = new GameSession();
  const original = first.addPlayer('old', 'A', 'character');
  Object.assign(original, { x: 500, y: 700, hp: 64, medkits: 2 });
  const restored = new GameSession().addPlayer('new', 'A', 'character', first.serializePlayer(original));
  assert.deepEqual({ x: restored.x, y: restored.y, hp: restored.hp, medkits: restored.medkits },
    { x: 500, y: 700, hp: 64, medkits: 2 });
});

test('reconnecting during logout takes over the same live character', () => {
  const session = new GameSession();
  const original = session.addPlayer('old-socket', 'A', 'character');
  Object.assign(original, { x: 432, y: 765, hp: 57, food: 4 });
  session.disconnectPlayer(original.id);
  session.step(5);
  const liveState = { x: original.x, y: original.y, hp: original.hp, food: original.food };
  const reconnected = session.reconnectPlayer('old-socket', 'new-socket', 'A');
  assert.equal(reconnected, original);
  assert.equal(session.players.has('old-socket'), false);
  assert.equal(session.players.get('new-socket'), original);
  assert.deepEqual({ x: reconnected.x, y: reconnected.y, hp: reconnected.hp, food: reconnected.food },
    liveState);
  assert.equal(reconnected.logoutAt, 0);
  assert.equal(reconnected.connected, true);
});

test('server session owns movement and rejects stale input', () => {
  const session = new GameSession();
  const player = session.addPlayer('a', 'A');
  player.x = 100; player.y = 100;
  session.setInput('a', { seq: 2, moveX: 1, moveY: 0, angle: 0, run: false, crouch: false });
  session.setInput('a', { seq: 1, moveX: -1, moveY: 0, angle: 0, run: false, crouch: false });
  session.step(1 / 30);
  assert.ok(player.x > 100);
  assert.equal(player.lastProcessedInput, 2);
});

test('only one player can pick up a shared loot entity', () => {
  const session = new GameSession();
  const a = session.addPlayer('a', 'A');
  const b = session.addPlayer('b', 'B');
  const item = [...session.loot.values()][0];
  Object.assign(a, { x: item.x, y: item.y });
  Object.assign(b, { x: item.x, y: item.y });
  const before = a[item.type === 'medkit' ? 'medkits' : item.type] + b[item.type === 'medkit' ? 'medkits' : item.type];
  session.step(1 / 30);
  const key = item.type === 'medkit' ? 'medkits' : item.type;
  assert.equal(a[key] + b[key], before + 1);
  assert.equal(session.loot.has(item.id), false);
});

test('server resolves PvP damage, death and respawn', () => {
  const session = new GameSession();
  const a = session.addPlayer('a', 'A');
  const b = session.addPlayer('b', 'B');
  Object.assign(a, { x: 100, y: 100, angle: 0, weapon: 2, heldItem: 'pistol', cooldown: 0 });
  Object.assign(b, { x: 150, y: 100, hp: 20, invulnerableTimer: 0 });
  session.attack(a);
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  session.time = b.respawnAt;
  session.respawn(b);
  assert.equal(b.alive, true);
  assert.equal(b.hp, 100);
});

test('snapshots include only entities inside the player area of interest', () => {
  const session = new GameSession();
  const observer = session.addPlayer('observer', 'Observer');
  const near = session.addPlayer('near', 'Near');
  const far = session.addPlayer('far', 'Far');
  Object.assign(observer, { x: 100, y: 100 });
  Object.assign(near, { x: 200, y: 100 });
  Object.assign(far, { x: 3000, y: 2200 });
  const snapshot = session.snapshot(observer.id);
  assert.deepEqual(snapshot.players.map(player => player.id).sort(), ['near', 'observer']);
  assert.ok(snapshot.loot.every(item => Math.hypot(item.x - observer.x, item.y - observer.y) <= 1250));
});
