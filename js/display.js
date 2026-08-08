export const canvas = document.querySelector('#game');
export const ctx = canvas.getContext('2d', { alpha: false });

export const viewport = { width: 0, height: 0, dpr: 1, quality: 'auto' };

function preferredPixelRatio() {
  const search = globalThis.location?.search || '';
  const saved = globalThis.localStorage?.getItem?.('renderQuality');
  const requested = new URLSearchParams(search).get('quality') || saved || 'auto';
  viewport.quality = requested;
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
  const ratios = { low: .75, medium: 1, high: 1.5 };
  return ratios[requested] || (coarse ? .75 : Math.min(globalThis.devicePixelRatio || 1, 1.5));
}

export function resize() {
  viewport.dpr = preferredPixelRatio();
  viewport.width = innerWidth;
  viewport.height = innerHeight;
  canvas.width = viewport.width * viewport.dpr;
  canvas.height = viewport.height * viewport.dpr;
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
  window.__renderScale = viewport.dpr;
}

addEventListener('resize', resize);
resize();
