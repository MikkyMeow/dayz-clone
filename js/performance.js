const WINDOW_SIZE = 180;
const samples = [];
const timings = Object.create(null);
const started = Object.create(null);

export const perf = {
  enabled: new URLSearchParams(location.search).has('perf'),
  fps: 0, p50: 0, p95: 0, p99: 0,
  rendered: 0, candidates: 0, culled: 0,
  chunks: 0, particles: 0, snapshotBytes: 0
};

let panel;
let lastPanelUpdate = 0;

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
}

export function beginMeasure(name) { if (perf.enabled) started[name] = performance.now(); }
export function endMeasure(name) { if (perf.enabled && started[name] !== undefined) timings[name] = performance.now() - started[name]; }

export function recordFrame(frameMs, counts = {}) {
  if (!perf.enabled) return;
  samples.push(frameMs);
  if (samples.length > WINDOW_SIZE) samples.shift();
  Object.assign(perf, counts);
  if (performance.now() - lastPanelUpdate < 250) return;
  lastPanelUpdate = performance.now();
  const sorted = [...samples].sort((a, b) => a - b);
  perf.p50 = percentile(sorted, .5); perf.p95 = percentile(sorted, .95); perf.p99 = percentile(sorted, .99);
  perf.fps = perf.p50 ? 1000 / perf.p50 : 0;
  renderPanel();
}

export function recordSnapshot(bytes) { if (perf.enabled) perf.snapshotBytes = bytes; }

function renderPanel() {
  if (!panel) {
    panel = document.createElement('pre'); panel.id = 'perfHud';
    document.body.append(panel);
  }
  panel.textContent = [
    `FPS ${perf.fps.toFixed(0)} | frame ${perf.p50.toFixed(1)}/${perf.p95.toFixed(1)}/${perf.p99.toFixed(1)} ms`,
    `update ${(timings.update || 0).toFixed(2)} | render ${(timings.render || 0).toFixed(2)} ms`,
    `objects ${perf.rendered}/${perf.candidates} | culled ${perf.culled} | chunks ${perf.chunks}`,
    `particles ${perf.particles} | snapshot ${perf.snapshotBytes} B`,
    `canvas ${innerWidth}x${innerHeight} @ ${window.__renderScale?.toFixed(2) || '?'}`
  ].join('\n');
}
