import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameSession } from './game-session.js';
import { PlayerStore } from './player-store.js';
import { parseClientMessage, PROTOCOL_VERSION } from './protocol.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const tickMs = 1000 / 30;
const snapshotEveryTicks = 2;
const session = new GameSession();
const clients = new Map();
const playerStore = new PlayerStore(join(root, 'data', 'players.json'));
await playerStore.load();

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, players: clients.size, tick: session.tick }));
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicFile = ['index.html', 'styles.css', 'config.js', 'manifest.webmanifest'].includes(relative) ||
    relative.startsWith('js/') || relative.startsWith('shared/');
  if (!publicFile || relative.includes('..') || relative.includes('\\')) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const path = normalize(join(root, relative));
  if (!path.startsWith(root)) { response.writeHead(403); response.end('Forbidden'); return; }
  try {
    const content = await readFile(path);
    response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(content);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', socket => {
  const client = { id: randomUUID(), joined: false, lastSeen: Date.now(), messages: 0, windowAt: Date.now() };
  clients.set(socket, client);
  socket.on('message', data => {
    client.lastSeen = Date.now();
    if (Date.now() - client.windowAt >= 1000) { client.windowAt = Date.now(); client.messages = 0; }
    if (++client.messages > 90) { socket.close(1008, 'rate_limit'); return; }
    try {
      const message = parseClientMessage(data);
      if (message.type === 'ping') { socket.send(JSON.stringify({ type: 'pong', sentAt: message.sentAt, serverTime: Date.now() })); return; }
      if (message.type === 'join') {
        if (client.joined) return;
        const existingPlayer = [...session.players.values()].find(player =>
          player.characterId === message.characterId);
        const previousConnection = [...clients.entries()].find(([, other]) =>
          other.id === existingPlayer?.id);
        if (previousConnection) {
          previousConnection[1].joined = false;
          previousConnection[0].close(4001, 'character_reconnected');
        }
        client.joined = true;
        client.characterId = message.characterId;
        if (existingPlayer) session.reconnectPlayer(existingPlayer.id, client.id, message.name);
        else session.addPlayer(client.id, message.name, message.characterId, playerStore.get(message.characterId));
        socket.send(JSON.stringify({ type: 'welcome', protocolVersion: PROTOCOL_VERSION, playerId: client.id }));
        return;
      }
      if (!client.joined) throw new Error('join_required');
      if (message.type === 'input') session.setInput(client.id, message);
      else if (message.type === 'action') session.action(client.id, message);
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', code: error.message }));
    }
  });
  socket.on('close', () => { clients.delete(socket); if (client.joined) session.disconnectPlayer(client.id); });
  socket.on('error', () => {});
});

setInterval(() => {
  session.step(tickMs / 1000);
  for (const completed of session.takeCompletedLogouts()) {
    const entry = [...clients.entries()].find(([, client]) => client.id === completed.id);
    playerStore.save(completed.characterId, completed.state).then(() => {
      if (entry?.[0].readyState !== WebSocket.OPEN) return;
      entry[0].send(JSON.stringify({ type: 'logoutComplete' }));
      entry[0].close(1000, 'logout_complete');
    });
  }
  if (session.tick % snapshotEveryTicks !== 0) return;
  for (const [socket, client] of clients) {
    if (socket.readyState === WebSocket.OPEN && client.joined) socket.send(JSON.stringify(session.snapshot(client.id)));
  }
  session.clearEvents();
}, tickMs);

setInterval(() => {
  for (const player of session.players.values()) {
    playerStore.save(player.characterId, session.serializePlayer(player));
  }
}, 5000);

setInterval(() => {
  const now = Date.now();
  for (const [socket, client] of clients) if (now - client.lastSeen > 15000) socket.terminate();
}, 5000);

function lanAddresses() {
  return Object.values(networkInterfaces()).flat().filter(address => address?.family === 'IPv4' && !address.internal).map(address => address.address);
}

server.listen(port, '0.0.0.0', () => {
  console.log(`DeadZone server: http://localhost:${port}`);
  for (const address of lanAddresses()) console.log(`LAN: http://${address}:${port}`);
});

async function shutdown() {
  for (const player of session.players.values()) {
    await playerStore.save(player.characterId, session.serializePlayer(player));
  }
  for (const socket of clients.keys()) socket.close(1012, 'server_shutdown');
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
