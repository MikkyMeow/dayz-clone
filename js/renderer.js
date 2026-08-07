import { C } from './config.js';
import { ctx, viewport } from './display.js';
import { sticks } from './input.js';
import { state } from './state.js';
import { clamp } from './utils.js';
import { landmarks, ponds } from './world.js';

function drawPerson(person, color, angle, crouching = false) {
  ctx.save();
  ctx.translate(person.x, person.y);
  ctx.rotate(angle);
  if (crouching) ctx.scale(.82, 1.18);
  ctx.fillStyle = '#151713';
  ctx.fillRect(-10, -11, 25, 22);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, crouching ? person.r * .82 : person.r, 0, Math.PI * 2);
  ctx.fill();
  if (crouching) {
    ctx.fillStyle = '#252920';
    ctx.fillRect(-8, -18, 8, 8);
    ctx.fillRect(-8, 10, 8, 8);
  }
  ctx.fillStyle = '#1b1d18';
  ctx.fillRect(8, -3, 15, 6);
  ctx.restore();
}

function drawWorld() {
  ctx.strokeStyle = '#3b4633';
  ctx.lineWidth = 1;
  for (let x = 0; x < C.world.width; x += C.world.grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, C.world.height); ctx.stroke();
  }
  for (let y = 0; y < C.world.height; y += C.world.grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.world.width, y); ctx.stroke();
  }

  ponds.forEach(pond => {
    ctx.fillStyle = '#294c52';
    ctx.beginPath();
    ctx.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#527064';
    ctx.lineWidth = 7;
    ctx.stroke();
  });

  landmarks.forEach(landmark => {
    ctx.fillStyle = landmark.color;
    ctx.fillRect(landmark.x, landmark.y, landmark.w, landmark.h);
    ctx.fillStyle = '#23271f';
    landmark.buildings.forEach(building => {
      ctx.fillRect(...building);
      ctx.strokeStyle = '#8a846d';
      ctx.lineWidth = 3;
      ctx.strokeRect(...building);
    });
  });
}

function drawEntities() {
  state.loot.forEach(loot => {
    ctx.fillStyle = loot.type === 'food' ? '#c7a34b' : '#e5e1d5';
    ctx.fillRect(loot.x - 7, loot.y - 7, 14, 14);
    ctx.fillStyle = loot.type === 'food' ? '#765922' : '#b84d46';
    ctx.fillRect(loot.x - 3, loot.y - 3, 6, 6);
  });
  state.zombies.forEach(zombie => {
    if (zombie.attackTimer > 0) {
      ctx.strokeStyle = `rgba(225,75,60,${.35 + .55 * (1 - zombie.attackTimer / C.zombie.attackWindup)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(zombie.x, zombie.y, zombie.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    drawPerson(zombie, zombie.staggerTimer > 0 ? '#a1a985' : '#71815b', zombie.angle);
  });
  const player = state.player;
  drawPerson(player, C.weapons[player.weapon].color, player.angle, player.crouching);
  if (player.pendingAttack) {
    ctx.strokeStyle = '#e8dec0aa';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.pendingAttack.range,
      player.pendingAttack.angle - player.pendingAttack.arc,
      player.pendingAttack.angle + player.pendingAttack.arc);
    ctx.stroke();
  }

  state.shots.forEach(shot => {
    ctx.strokeStyle = '#ffeab0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(shot.x1, shot.y1); ctx.lineTo(shot.x2, shot.y2); ctx.stroke();
  });
  state.particles.forEach(particle => {
    ctx.globalAlpha = Math.min(1, particle.life * 4);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
  });
  ctx.globalAlpha = 1;
}

function drawZombieDebug() {
  if (!C.debug?.zombieAI) return;
  ctx.save();
  ctx.font = '11px monospace';
  ctx.lineWidth = 1;
  for (const zombie of state.zombies) {
    const visionDistance = state.player.crouching
      ? C.zombie.crouchVisionDistance
      : C.zombie.visionDistance;
    ctx.fillStyle = 'rgba(238, 214, 112, .08)';
    ctx.beginPath();
    ctx.moveTo(zombie.x, zombie.y);
    ctx.arc(
      zombie.x,
      zombie.y,
      visionDistance,
      zombie.angle - C.zombie.visionAngle / 2,
      zombie.angle + C.zombie.visionAngle / 2
    );
    ctx.closePath();
    ctx.fill();

    if (zombie.path?.length) {
      ctx.strokeStyle = '#e6cf61';
      ctx.beginPath();
      ctx.moveTo(zombie.x, zombie.y);
      for (let i = zombie.pathIndex; i < zombie.path.length; i++) {
        ctx.lineTo(zombie.path[i].x, zombie.path[i].y);
      }
      ctx.stroke();
      const waypoint = zombie.path[zombie.pathIndex];
      if (waypoint) {
        ctx.fillStyle = '#fff17a';
        ctx.fillRect(waypoint.x - 3, waypoint.y - 3, 6, 6);
      }
    }

    const known = zombie.lastSeenAt >= zombie.lastHeardAt
      ? zombie.lastSeenPosition
      : zombie.lastHeardPosition;
    if (known) {
      ctx.strokeStyle = '#e47b61';
      ctx.beginPath();
      ctx.arc(known.x, known.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#f4f0d7';
    ctx.fillText(`${zombie.behaviorState}: ${zombie.stateReason}`, zombie.x + 20, zombie.y - 18);
  }
  ctx.restore();
}

function drawDayNight() {
  const phase = (Math.sin(state.time / C.day.lengthSeconds * Math.PI * 2 - Math.PI / 2) + 1) / 2;
  const alpha = (1 - phase) * C.day.darkness;
  if (alpha <= .02) return;
  ctx.fillStyle = `rgba(8,12,18,${alpha})`;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
}

function drawSticks() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const controls = [
    [viewport.width * .16, viewport.height * .76, sticks.move],
    [viewport.width * .84, viewport.height * .76, sticks.aim]
  ];
  controls.forEach(([x, y, stick]) => {
    ctx.globalAlpha = .35;
    ctx.fillStyle = '#0e110d';
    ctx.beginPath(); ctx.arc(x, y, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c6cdb8';
    ctx.stroke();
    if (stick) {
      ctx.fillStyle = '#7b886c';
      ctx.beginPath(); ctx.arc(x + stick.dx * 40, y + stick.dy * 40, 23, 0, Math.PI * 2); ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

export function drawGame() {
  const player = state.player;
  const cameraX = clamp(player.x - viewport.width / 2, 0, Math.max(0, C.world.width - viewport.width));
  const cameraY = clamp(player.y - viewport.height / 2, 0, Math.max(0, C.world.height - viewport.height));
  ctx.fillStyle = '#313b2b';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  ctx.save();
  ctx.translate(-cameraX, -cameraY);
  drawWorld();
  drawEntities();
  drawZombieDebug();
  ctx.restore();
  drawDayNight();
  drawSticks();
}
