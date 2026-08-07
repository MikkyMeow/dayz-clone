export const canvas = document.querySelector('#game');
export const ctx = canvas.getContext('2d', { alpha: false });

export const viewport = { width: 0, height: 0, dpr: 1 };

export function resize() {
  viewport.dpr = Math.min(devicePixelRatio || 1, 1.5);
  viewport.width = innerWidth;
  viewport.height = innerHeight;
  canvas.width = viewport.width * viewport.dpr;
  canvas.height = viewport.height * viewport.dpr;
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
}

addEventListener('resize', resize);
resize();
