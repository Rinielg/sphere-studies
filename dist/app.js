import { FORMATIONS, generateFormation, evaluateMotion } from './formations.js';
import { SphereRenderer } from './renderer.js';
import { createMorph, sampleMorph, isMorphComplete, MORPH_DURATION_MS } from './morphs.js';

const defaults = {
  formation: 'clusters', motion: 'sweep', nodes: 2, ringCount: 6,
  loopDepth: .42, loopDensity: 1, loopWaves: 2, loopFlow: .25, cloudDensity: 3, gridSize: 5,
  sphereCount: 12, pairs: 14, turns: 1.4, helixFlow: .35, spin: .12, groove: 150, helixTilt: -32,
  backbone: true, strandColour: true,
  drift: true, speed: 1.2, spread: 2.8, lift: 1, seed: 7283,
  loopLayoutVersion: 3
};
const storageKey = 'sphere-studies-v1';
const densityNames = ['Sparse', 'Medium', 'Dense', 'Very dense'];
const motionNames = ['wind', 'ripple', 'sweep', 'around', 'flicker'];
const parameterSpecs = {
  nodes: { label: 'Nodes', min: 1, max: 5, step: 1 },
  ringCount: { label: 'Ring count', min: 1, max: 8, step: 1 },
  loopDepth: { label: 'Wave depth', min: 0, max: 1, step: .01, decimals: 2 },
  loopDensity: { label: 'Density', min: 0, max: 3, step: 1, density: true },
  loopWaves: { label: 'Waves per loop', min: 1, max: 4, step: 1 },
  loopFlow: { label: 'Flow along loop', min: 0, max: 1, step: .01, decimals: 2 },
  pairs: { label: 'Base pairs', min: 6, max: 24, step: 1 },
  turns: { label: 'Turns', min: .5, max: 3, step: .05, decimals: 2 },
  helixFlow: { label: 'Flow along strand', min: 0, max: 1.5, step: .01, decimals: 2 },
  spin: { label: 'Spin', min: 0, max: .6, step: .01, decimals: 2 },
  groove: { label: 'Groove angle', min: 90, max: 180, step: 1, unit: '°' },
  helixTilt: { label: 'Axis tilt', min: -70, max: 70, step: 1, unit: '°' },
  cloudDensity: { label: 'Density', min: 0, max: 3, step: 1, density: true },
  gridSize: { label: 'Grid size', min: 3, max: 12, step: 1 },
  sphereCount: { label: 'Sphere count', min: 4, max: 24, step: 1 },
  speed: { label: 'Wave speed', min: .1, max: 3, step: .05, decimals: 2 },
  spread: { label: 'Wave spread', min: .5, max: 6, step: .1, decimals: 2 },
  lift: { label: 'Lift', min: 0, max: 2, step: .05, decimals: 2 }
};
const toggleSpecs = { backbone: 'Backbone lines', strandColour: 'Colour by strand' };
const formParameters = {
  clusters: ['nodes'], rings: ['ringCount'], loop: ['loopDepth', 'loopDensity', 'loopWaves', 'loopFlow'],
  cloud: ['cloudDensity'], grid: ['gridSize'], compass: ['sphereCount'],
  helix: ['pairs', 'turns', 'helixFlow', 'spin', 'groove', 'helixTilt', 'backbone', 'strandColour']
};

function restore() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch { return { ...defaults }; }
  const next = { ...defaults };
  if (!saved || typeof saved !== 'object') return next;
  if (FORMATIONS.some(f => f.id === saved.formation)) next.formation = saved.formation;
  if (motionNames.includes(saved.motion)) next.motion = saved.motion;
  for (const key of ['drift', ...Object.keys(toggleSpecs)]) if (typeof saved[key] === 'boolean') next[key] = saved[key];
  if (Number.isInteger(saved.seed)) next.seed = saved.seed >>> 0;
  for (const [key, spec] of Object.entries(parameterSpecs)) {
    if (Number.isFinite(saved[key])) next[key] = Math.min(spec.max, Math.max(spec.min, Math.round(saved[key] / spec.step) * spec.step));
  }
  // Reset loop settings once when loading the 3D loop layout.
  // Further user changes are retained normally.
  if (saved.loopLayoutVersion !== defaults.loopLayoutVersion) {
    for (const key of ['loopDepth', 'loopDensity', 'loopWaves', 'loopFlow']) next[key] = defaults[key];
  }
  return next;
}

const state = restore();
let formation = generateFormation(state);
let renderer;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
// geometryTime drives formations whose positions travel (loop, helix). It only
// advances while formation drift is on, so toggling drift never jumps.
let time = 0, geometryTime = 0, presentationTime = 0, lastFrame = performance.now();
let formationMorph = null, lastScene = null;
let motionSource = null, motionTargetStart = null, motionChangedAt = 0;
let frameHandle = 0;
const $ = id => document.getElementById(id);
const canvas = $('artwork');
const smooth = v => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };

function persist() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Private browsing can disable storage. */ } }
function format(key) { const spec = parameterSpecs[key]; return spec.density ? densityNames[state[key]] : (spec.decimals ? state[key].toFixed(spec.decimals) : String(state[key])) + (spec.unit || ''); }

function addParameter(key, parent, isGeometry) {
  const spec = parameterSpecs[key];
  const row = document.createElement('div');
  row.className = 'parameter';
  const heading = document.createElement('div');
  heading.className = 'parameter-heading';
  const label = document.createElement('label');
  label.htmlFor = `param-${key}`;
  label.textContent = spec.label;
  const output = document.createElement('output');
  output.htmlFor = `param-${key}`;
  output.id = `value-${key}`;
  output.textContent = format(key);
  const input = document.createElement('input');
  input.type = 'range'; input.id = `param-${key}`;
  input.min = spec.min; input.max = spec.max; input.step = spec.step; input.value = state[key];
  input.setAttribute('aria-valuetext', format(key));
  const updateTrack = () => input.style.setProperty('--fill', `${100 * (state[key] - spec.min) / (spec.max - spec.min)}%`);
  updateTrack();
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    output.textContent = format(key);
    input.setAttribute('aria-valuetext', format(key));
    updateTrack();
    if (isGeometry) rebuild(true, 420);
    persist();
    if (!playing) draw(performance.now());
  });
  heading.append(label, output); row.append(heading, input); parent.append(row);
}

function addToggle(key, parent) {
  const row = document.createElement('label');
  row.className = 'drift-row toggle-row';
  row.htmlFor = `toggle-${key}`;
  const text = document.createElement('span');
  text.textContent = toggleSpecs[key];
  const control = document.createElement('span');
  control.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.id = `toggle-${key}`; input.checked = state[key];
  const track = document.createElement('span');
  track.className = 'switch-track'; track.setAttribute('aria-hidden', 'true');
  control.append(input, track); row.append(text, control); parent.append(row);
  input.addEventListener('change', () => { state[key] = input.checked; rebuild(true, 420); persist(); });
}

function updateFormControls() {
  $('form-controls').replaceChildren();
  formParameters[state.formation].forEach(key => key in toggleSpecs ? addToggle(key, $('form-controls')) : addParameter(key, $('form-controls'), true));
}
function updateInterface() {
  document.querySelectorAll('[data-formation]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.formation === state.formation)));
  document.querySelectorAll('[data-motion]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.motion === state.motion)));
  $('drift-switch').checked = state.drift;
  $('wave-controls').hidden = state.motion === 'flicker';
  $('formation-name').textContent = FORMATIONS.find(f => f.id === state.formation).label;
  $('sphere-count').textContent = `${formation.spheres.length} spheres`;
}

function rebuild(animate = true, duration = MORPH_DURATION_MS) {
  const source = lastScene;
  formation = generateFormation(state);
  formationMorph = animate && playing && source
    ? createMorph(source, evaluateScene(), presentationTime, duration)
    : null;
  updateInterface();
  if (!playing) draw(performance.now());
}

function selectFormation(id) {
  if (state.formation === id) return;
  state.formation = id;
  updateFormControls(); rebuild(); persist();
}

function announce(message) {
  $('notification').textContent = message;
  $('notification').classList.add('visible');
  clearTimeout(announce.timeout);
  announce.timeout = setTimeout(() => $('notification').classList.remove('visible'), 2400);
}

function updatePlayback() {
  const button = $('pause-toggle');
  button.setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
  button.setAttribute('aria-pressed', String(!playing));
  button.innerHTML = playing
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4v8M10.5 4v8"/></svg><span>Pause</span>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 6 5-6 5z"/></svg><span>Play</span>';
}

function togglePlayback() { playing = !playing; lastFrame = performance.now(); updatePlayback(); }

function evaluateSphereMotion(sphere) {
  const transition = smooth((presentationTime - motionChangedAt) / 450);
  const motionState = { ...state, speed: 1 };
  const current = evaluateMotion(sphere, motionState, time);
  const source = motionSource?.get(sphere.id);
  const anchor = motionTargetStart?.get(sphere.id);
  if (!source || !anchor || transition >= 1) return current;
  const angle = field => {
    const startDelta = Math.atan2(Math.sin(anchor[field] - source[field]), Math.cos(anchor[field] - source[field]));
    return source[field] + (startDelta + current[field] - anchor[field]) * transition;
  };
  return { phase: angle('phase'), tilt: angle('tilt'),
    dx: state.drift ? source.dx + (current.dx - source.dx) * transition : 0,
    dy: state.drift ? source.dy + (current.dy - source.dy) * transition : 0,
    dz: state.drift ? source.dz + (current.dz - source.dz) * transition : 0 };
}

function evaluateScene() {
  const base = formation.animate ? formation.animate(geometryTime) : formation;
  const moved = base.spheres.map(sphere => {
    const m = evaluateSphereMotion(sphere);
    return { ...sphere, x: sphere.x + m.dx, y: sphere.y + m.dy, z: sphere.z + m.dz, phase: m.phase, tilt: m.tilt };
  });
  // Compass needle rotates independently of the material and keeps the geometry switch meaningful.
  let links = base.links;
  if (state.formation === 'compass') {
    const angle = state.drift ? time * .12 : 0;
    moved.unshift({ id: '__needle-a', x: -.74 * Math.cos(angle), y: -.74 * Math.sin(angle), z: -1, r: 0, phase: 0, tilt: 0, palette: 0 });
    moved.unshift({ id: '__needle-b', x: .74 * Math.cos(angle), y: .74 * Math.sin(angle), z: -1, r: 0, phase: 0, tilt: 0, palette: 0 });
    links = [['__needle-a', '__needle-b']];
  }
  return { spheres: moved, links };
}

function draw() {
  if (!renderer) return;
  const target = evaluateScene();
  const scene = formationMorph ? sampleMorph(formationMorph, target, presentationTime) : target;
  if (formationMorph && isMorphComplete(formationMorph, presentationTime)) formationMorph = null;
  lastScene = scene;
  renderer.draw(scene.spheres, scene.links);
}

function frame(now) {
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  if (playing && !document.hidden) {
    time += dt * (state.motion === 'flicker' ? 1.2 : state.speed);
    if (state.drift) geometryTime += dt;
    presentationTime += dt * 1000;
  }
  if (playing && !document.hidden) draw(now);
  frameHandle = requestAnimationFrame(frame);
}

document.querySelectorAll('[data-formation]').forEach(button => button.addEventListener('click', () => selectFormation(button.dataset.formation)));
document.querySelectorAll('[data-motion]').forEach(button => button.addEventListener('click', () => {
  if (state.motion === button.dataset.motion) return;
  const source = playing ? new Map(formation.spheres.map(s => [s.id, evaluateSphereMotion(s)])) : null;
  state.motion = button.dataset.motion;
  motionSource = source;
  motionTargetStart = playing ? new Map(formation.spheres.map(s => [s.id, evaluateMotion(s, { ...state, speed: 1 }, time)])) : null;
  motionChangedAt = presentationTime;
  updateInterface(); persist(); if (!playing) draw(performance.now());
}));
$('drift-switch').addEventListener('change', event => { state.drift = event.target.checked; persist(); if (!playing) draw(performance.now()); });
$('randomize').title = 'New geometry and colour variation. Keeps your settings.';
$('randomize').addEventListener('click', () => {
  state.seed = (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
  rebuild(true, 700); persist(); announce('New variation');
});
$('pause-toggle').addEventListener('click', togglePlayback);
$('close-panel').addEventListener('click', () => {
  $('controls-panel').hidden = true; $('open-panel').hidden = false; $('open-panel').focus();
});
$('open-panel').addEventListener('click', () => {
  $('controls-panel').hidden = false; $('open-panel').hidden = true; $('close-panel').focus();
});
$('export-image').addEventListener('click', () => {
  if (!renderer) return;
  draw(performance.now());
  canvas.toBlob(blob => {
    if (!blob) { announce('Image could not be saved'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `sphere-study-${state.formation}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000); announce('Image saved');
  }, 'image/png');
});
$('reset-study')?.addEventListener('click', () => {
  Object.assign(state, defaults); motionSource = null; motionTargetStart = null; time = 0;
  updateFormControls(); $('wave-controls').replaceChildren();
  ['speed', 'spread', 'lift'].forEach(key => addParameter(key, $('wave-controls'), false));
  rebuild(); persist(); announce('Parameters reset');
});
document.addEventListener('keydown', event => {
  if (/INPUT|BUTTON|TEXTAREA|SUMMARY|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
  if (/^[1-7]$/.test(event.key)) selectFormation(FORMATIONS[Number(event.key) - 1].id);
});
document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });
updateFormControls();
['speed', 'spread', 'lift'].forEach(key => addParameter(key, $('wave-controls'), false));
updateInterface(); updatePlayback();
persist();

try {
  renderer = new SphereRenderer(canvas);
  draw(performance.now());
  window.addEventListener('resize', () => { renderer.resize(); draw(performance.now()); });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(frameHandle);
    $('renderer-error').hidden = false; $('renderer-error').textContent = 'Graphics paused. Reload to restore the study.';
  });
  frameHandle = requestAnimationFrame(frame);
} catch (error) {
  $('renderer-error').hidden = false;
  $('renderer-error').textContent = error.message;
}

// A small read-only snapshot makes deterministic visual and behaviour checks reproducible.
window.sphereStudy = Object.freeze({ snapshot: () => ({ state: { ...state }, sphereCount: formation.spheres.length, time, playing, rendererReady: Boolean(renderer) }) });
