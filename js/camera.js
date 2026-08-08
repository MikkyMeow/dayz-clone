import { C } from './config.js';
import { viewport } from './display.js';
import { clamp } from './utils.js';

export const camera = { x: 0, y: 0, width: 0, height: 0, scale: 1, left: 0, top: 0, right: 0, bottom: 0 };

export function updateCamera(target, scale) {
  const width = viewport.width / scale;
  const height = viewport.height / scale;
  const x = clamp(target.x - width / 2, 0, Math.max(0, C.world.width - width));
  const y = clamp(target.y - height / 2, 0, Math.max(0, C.world.height - height));
  Object.assign(camera, { x, y, width, height, scale, left: x, top: y, right: x + width, bottom: y + height });
  return camera;
}

export function expandedCameraBounds(margin = C.render.cullMargin) {
  return { left: camera.left - margin, top: camera.top - margin,
    right: camera.right + margin, bottom: camera.bottom + margin };
}
