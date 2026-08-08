import { C } from './config.js';
import { camera, expandedCameraBounds, updateCamera } from './camera.js';
import { ctx, viewport } from './display.js';
import { sticks } from './input.js';
import { state } from './state.js';
import { intersectsBounds } from './spatial-grid.js';
import { buildings, landmarks, ponds } from './world.js';

const MOBILE_CONTENT_SCALE = .5;
const TAU = Math.PI * 2;
const chunkCache = new Map();
const preloadQueue = [];
const queuedChunks = new Set();
let preloadScheduled = false;
const lootColors = {
  food: ['#c7a34b', '#765922'], medkit: ['#e5e1d5', '#b84d46'],
  knife: ['#b9c0bd', '#58615d'], pistol: ['#727a73', '#242925']
};
let coarsePointer = matchMedia('(pointer: coarse)').matches;
matchMedia('(pointer: coarse)').addEventListener?.('change', event => { coarsePointer = event.matches; });

function contentScale() { return innerWidth <= 650 ? MOBILE_CONTENT_SCALE : 1; }

function drawPerson(person, color, angle, crouching = false) {
  ctx.save(); ctx.translate(person.x, person.y); ctx.rotate(angle);
  if (crouching) ctx.scale(.82, 1.18);
  ctx.fillStyle = '#151713'; ctx.fillRect(-10, -11, 25, 22);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, crouching ? person.r * .82 : person.r, 0, TAU); ctx.fill();
  if (crouching) {
    ctx.fillStyle = '#252920'; ctx.fillRect(-8, -18, 8, 8); ctx.fillRect(-8, 10, 8, 8);
  }
  ctx.fillStyle = '#1b1d18'; ctx.fillRect(8, -3, 15, 6); ctx.restore();
}

function drawStaticWorld(target, bounds) {
  target.fillStyle = '#313b2b'; target.fillRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  target.strokeStyle = '#3b4633'; target.lineWidth = 1; target.beginPath();
  const firstX = Math.ceil(bounds.left / C.world.grid) * C.world.grid;
  const firstY = Math.ceil(bounds.top / C.world.grid) * C.world.grid;
  for (let x = firstX; x <= bounds.right; x += C.world.grid) { target.moveTo(x, bounds.top); target.lineTo(x, bounds.bottom); }
  for (let y = firstY; y <= bounds.bottom; y += C.world.grid) { target.moveTo(bounds.left, y); target.lineTo(bounds.right, y); }
  target.stroke();
  for (const pond of ponds) {
    if (!intersectsBounds({ x: pond.x - pond.rx - 8, y: pond.y - pond.ry - 8, w: pond.rx * 2 + 16, h: pond.ry * 2 + 16 }, bounds)) continue;
    target.fillStyle = '#294c52'; target.beginPath(); target.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, TAU); target.fill();
    target.strokeStyle = '#527064'; target.lineWidth = 7; target.stroke();
  }
  for (const landmark of landmarks) {
    if (!intersectsBounds(landmark, bounds)) continue;
    target.fillStyle = landmark.color; target.fillRect(landmark.x, landmark.y, landmark.w, landmark.h);
  }
  for (const building of buildings) {
    if (!intersectsBounds(building, bounds)) continue;
    target.fillStyle = '#34382e'; target.fillRect(building.x, building.y, building.w, building.h);
    target.strokeStyle = '#8a846d'; target.lineWidth = 8;
    target.strokeRect(building.x + 4, building.y + 4, building.w - 8, building.h - 8);
  }
}

function createChunk(cx, cy) {
  const size = C.render.chunkSize;
  const width = Math.min(size, C.world.width - cx * size);
  const height = Math.min(size, C.world.height - cy * size);
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const target = canvas.getContext('2d', { alpha: false });
  const left = cx * size; const top = cy * size;
  target.translate(-left, -top);
  drawStaticWorld(target, { left, top, right: left + width, bottom: top + height });
  return { canvas, cx, cy, usedAt: performance.now() };
}

function getChunk(cx, cy) {
  const key = `${cx},${cy}`;
  let chunk = chunkCache.get(key);
  if (!chunk) {
    chunk = createChunk(cx, cy);
    if (!chunk) return null;
    chunkCache.set(key, chunk);
    if (chunkCache.size > C.render.maxCachedChunks) {
      let oldestKey; let oldestAt = Infinity;
      for (const [candidateKey, candidate] of chunkCache) {
        if (candidate.usedAt < oldestAt) { oldestAt = candidate.usedAt; oldestKey = candidateKey; }
      }
      if (oldestKey !== undefined && oldestKey !== key) chunkCache.delete(oldestKey);
    }
  }
  chunk.usedAt = performance.now();
  return chunk;
}

function queueChunk(cx, cy) {
  const maxX = Math.ceil(C.world.width / C.render.chunkSize);
  const maxY = Math.ceil(C.world.height / C.render.chunkSize);
  if (cx < 0 || cy < 0 || cx >= maxX || cy >= maxY) return;
  const key = `${cx},${cy}`;
  if (chunkCache.has(key) || queuedChunks.has(key)) return;
  queuedChunks.add(key); preloadQueue.push([cx, cy, key]);
}

function runChunkPreload(deadline) {
  preloadScheduled = false;
  let completed = 0;
  while (preloadQueue.length && completed < 2 && (!deadline || deadline.didTimeout || deadline.timeRemaining() > 2)) {
    const [cx, cy, key] = preloadQueue.shift(); queuedChunks.delete(key); getChunk(cx, cy); completed++;
  }
  if (preloadQueue.length) scheduleChunkPreload();
}

function scheduleChunkPreload() {
  if (preloadScheduled) return;
  preloadScheduled = true;
  if (globalThis.requestIdleCallback) requestIdleCallback(runChunkPreload, { timeout: 120 });
  else setTimeout(() => runChunkPreload(null), 0);
}

function preloadNeighbourChunks(minX, maxX, minY, maxY) {
  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      if (x < minX || x > maxX || y < minY || y > maxY) queueChunk(x, y);
    }
  }
  if (preloadQueue.length) scheduleChunkPreload();
}

function drawVisibleChunks() {
  const size = C.render.chunkSize;
  const minX = Math.max(0, Math.floor(camera.left / size));
  const maxX = Math.min(Math.ceil(C.world.width / size) - 1, Math.floor(camera.right / size));
  const minY = Math.max(0, Math.floor(camera.top / size));
  const maxY = Math.min(Math.ceil(C.world.height / size) - 1, Math.floor(camera.bottom / size));
  let count = 0;
  for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
    const chunk = getChunk(cx, cy); if (!chunk) continue;
    ctx.drawImage(chunk.canvas, cx * size, cy * size); count++;
  }
  preloadNeighbourChunks(minX, maxX, minY, maxY);
  return count;
}

function drawDoors(bounds) {
  for (const building of buildings) {
    if (!intersectsBounds(building, bounds)) continue;
    for (const door of building.doors) {
      ctx.fillStyle = '#34382e';
      if (door.side === 'top' || door.side === 'bottom') {
        const x = building.x + door.center - door.width / 2;
        const y = door.side === 'top' ? building.y : building.y + building.h - 8;
        ctx.fillRect(x, y - 1, door.width, 10); ctx.fillStyle = '#8b7047';
        if (door.open) ctx.fillRect(x, door.side === 'top' ? y : y - door.width + 8, 7, door.width);
        else ctx.fillRect(x, y, door.width, 8);
      } else {
        const x = door.side === 'left' ? building.x : building.x + building.w - 8;
        const y = building.y + door.center - door.width / 2;
        ctx.fillRect(x - 1, y, 10, door.width); ctx.fillStyle = '#8b7047';
        if (door.open) ctx.fillRect(door.side === 'left' ? x : x - door.width + 8, y, door.width, 7);
        else ctx.fillRect(x, y, 8, door.width);
      }
    }
  }
}

function drawEntities(bounds, counts, renderPlayer) {
  for (const loot of state.loot) {
    counts.candidates++; if (!intersectsBounds(loot, bounds, 8)) { counts.culled++; continue; }
    const colors = lootColors[loot.type]; if (!colors) continue;
    ctx.fillStyle = colors[0]; ctx.fillRect(loot.x - 7, loot.y - 7, 14, 14);
    ctx.fillStyle = colors[1]; ctx.fillRect(loot.x - 3, loot.y - 3, 6, 6); counts.rendered++;
  }
  for (const zombie of state.zombies) {
    counts.candidates++; if (!intersectsBounds(zombie, bounds, 32)) { counts.culled++; continue; }
    if (zombie.attackTimer > 0) {
      ctx.strokeStyle = `rgba(225,75,60,${.35 + .55 * (1 - zombie.attackTimer / C.zombie.attackWindup)})`;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(zombie.x, zombie.y, zombie.r + 8, 0, TAU); ctx.stroke();
    }
    drawPerson(zombie, zombie.staggerTimer > 0 ? '#a1a985' : '#71815b', zombie.angle); counts.rendered++;
  }
  for (const remote of state.remotePlayers || []) {
    counts.candidates++; if (!remote.alive || !intersectsBounds(remote, bounds, 50)) { counts.culled++; continue; }
    drawPerson(remote, '#d96b5f', remote.angle, remote.crouching);
    ctx.save(); ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f4f0d7';
    ctx.fillText(remote.name, remote.x, remote.y - remote.r - 12);
    ctx.fillStyle = '#351b19'; ctx.fillRect(remote.x - 20, remote.y - remote.r - 8, 40, 4);
    ctx.fillStyle = '#b84e43'; ctx.fillRect(remote.x - 20, remote.y - remote.r - 8, 40 * Math.max(0, remote.hp) / C.player.maxHealth, 4);
    ctx.restore(); counts.rendered++;
  }
  const player = state.player;
  if (player.alive !== false) { drawPerson(renderPlayer, C.weapons[player.weapon]?.color || C.weapons[0].color, renderPlayer.angle, player.crouching); counts.rendered++; }
  if (player.pendingAttack) {
    ctx.strokeStyle = '#e8dec0aa'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.arc(renderPlayer.x, renderPlayer.y, player.pendingAttack.range, player.pendingAttack.angle - player.pendingAttack.arc,
      player.pendingAttack.angle + player.pendingAttack.arc); ctx.stroke();
  }
  for (const shot of state.shots) {
    const shotBounds = { x: Math.min(shot.x1, shot.x2), y: Math.min(shot.y1, shot.y2),
      w: Math.abs(shot.x2 - shot.x1), h: Math.abs(shot.y2 - shot.y1) };
    counts.candidates++; if (!intersectsBounds(shotBounds, bounds, 3)) { counts.culled++; continue; }
    ctx.strokeStyle = '#ffeab0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(shot.x1, shot.y1); ctx.lineTo(shot.x2, shot.y2); ctx.stroke(); counts.rendered++;
  }
  for (const particle of state.particles) {
    counts.candidates++; if (!intersectsBounds(particle, bounds, 4)) { counts.culled++; continue; }
    ctx.globalAlpha = Math.min(1, particle.life * 4); ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4); counts.rendered++;
  }
  ctx.globalAlpha = 1;
}

function drawZombieDebug(bounds) {
  if (!C.debug?.zombieAI) return;
  ctx.save(); ctx.font = '11px monospace'; ctx.lineWidth = 1;
  for (const zombie of state.zombies) {
    if (!intersectsBounds(zombie, bounds, C.zombie.visionDistance)) continue;
    const visionDistance = state.player.crouching ? C.zombie.crouchVisionDistance : C.zombie.visionDistance;
    ctx.fillStyle = 'rgba(238, 214, 112, .08)'; ctx.beginPath(); ctx.moveTo(zombie.x, zombie.y);
    ctx.arc(zombie.x, zombie.y, visionDistance, zombie.angle - C.zombie.visionAngle / 2,
      zombie.angle + C.zombie.visionAngle / 2); ctx.closePath(); ctx.fill();
    if (zombie.path?.length) {
      ctx.strokeStyle = '#e6cf61'; ctx.beginPath(); ctx.moveTo(zombie.x, zombie.y);
      for (let i = zombie.pathIndex; i < zombie.path.length; i++) ctx.lineTo(zombie.path[i].x, zombie.path[i].y);
      ctx.stroke();
    }
    ctx.fillStyle = '#f4f0d7'; ctx.fillText(`${zombie.behaviorState}: ${zombie.stateReason}`, zombie.x + 20, zombie.y - 18);
  }
  ctx.restore();
}

function drawDayNight() {
  const phase = (Math.sin(state.time / C.day.lengthSeconds * TAU - Math.PI / 2) + 1) / 2;
  const alpha = (1 - phase) * C.day.darkness; if (alpha <= .02) return;
  ctx.fillStyle = `rgba(8,12,18,${alpha})`; ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawSticks() {
  if (!coarsePointer) return;
  for (const [x, y, stick] of [[viewport.width * .16, viewport.height * .76, sticks.move], [viewport.width * .84, viewport.height * .76, sticks.aim]]) {
    ctx.globalAlpha = .35; ctx.fillStyle = '#0e110d'; ctx.beginPath(); ctx.arc(x, y, 58, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c6cdb8'; ctx.stroke();
    if (stick) { ctx.fillStyle = '#7b886c'; ctx.beginPath(); ctx.arc(x + stick.dx * 40, y + stick.dy * 40, 23, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}

export function drawGame() {
  const renderPlayer = state.renderPlayer || state.player;
  renderPlayer.r = state.player.r;
  const scale = contentScale(); updateCamera(renderPlayer, scale);
  const bounds = expandedCameraBounds(); const counts = { candidates: 0, rendered: 0, culled: 0, chunks: 0 };
  ctx.fillStyle = '#313b2b'; ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save(); ctx.scale(scale, scale); ctx.translate(-camera.x, -camera.y);
  counts.chunks = drawVisibleChunks(); drawDoors(bounds); drawEntities(bounds, counts, renderPlayer); drawZombieDebug(bounds);
  ctx.restore(); drawDayNight(); drawSticks();
  return counts;
}
