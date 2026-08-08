import assert from 'node:assert/strict';
import test from 'node:test';
import { GameSession } from '../server/game-session.js';
import { parseClientMessage, PROTOCOL_VERSION } from '../server/protocol.js';

test('protocol validates joins and normalizes movement', () => {
  assert.deepEqual(parseClientMessage(Buffer.from(JSON.stringify({
    type: 'join', protocolVersion: PROTOCOL_VERSION, name: '<Игрок>'
  }))), { type: 'join', name: 'Игрок' });
  const input = parseClientMessage(Buffer.from(JSON.stringify({
    type: 'input', seq: 1, moveX: 3, moveY: 4, angle: 0, run: true
  })));
  assert.equal(Math.hypot(input.moveX, input.moveY), 1);
  assert.throws(() => parseClientMessage(Buffer.from('{broken')), /invalid_json/);
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
