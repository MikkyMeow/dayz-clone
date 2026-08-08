export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_BYTES = 4096;

const actions = new Set([
  'attack', 'dodge', 'interact', 'equip', 'useItem', 'dropItem',
  'assignQuickSlot', 'respawn', 'toggleCrouch'
]);

const finite = value => typeof value === 'number' && Number.isFinite(value);

export function sanitizeName(value) {
  if (typeof value !== 'string') return 'Игрок';
  const clean = value.replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 20);
  return clean || 'Игрок';
}

export function parseClientMessage(data) {
  if (data.length > MAX_MESSAGE_BYTES) throw new Error('message_too_large');
  let message;
  try { message = JSON.parse(data.toString()); }
  catch { throw new Error('invalid_json'); }
  if (!message || typeof message !== 'object') throw new Error('invalid_message');

  if (message.type === 'join') {
    if (message.protocolVersion !== PROTOCOL_VERSION) throw new Error('version_mismatch');
    return { type: 'join', name: sanitizeName(message.name) };
  }
  if (message.type === 'ping') return { type: 'ping', sentAt: message.sentAt };
  if (message.type === 'input') {
    if (!Number.isInteger(message.seq) || message.seq < 0 || !finite(message.moveX) ||
        !finite(message.moveY) || !finite(message.angle)) throw new Error('invalid_input');
    const length = Math.hypot(message.moveX, message.moveY);
    return {
      type: 'input', seq: message.seq,
      moveX: length > 1 ? message.moveX / length : message.moveX,
      moveY: length > 1 ? message.moveY / length : message.moveY,
      angle: Math.atan2(Math.sin(message.angle), Math.cos(message.angle)),
      run: Boolean(message.run), crouch: Boolean(message.crouch)
    };
  }
  if (message.type === 'action') {
    if (!Number.isInteger(message.seq) || message.seq < 0 || !actions.has(message.action)) {
      throw new Error('invalid_action');
    }
    return { type: 'action', seq: message.seq, action: message.action, payload: message.payload || {} };
  }
  throw new Error('unknown_message');
}
