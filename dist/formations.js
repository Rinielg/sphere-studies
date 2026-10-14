/**
 * Pure, deterministic geometry and animation fields for the sphere editor.
 * Coordinates and radii are in scene units; phase and tilt are radians.
 * The surface field is independent of the optional positional drift.
 */
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export const FORMATIONS = Object.freeze([
  { id: 'clusters', label: 'Connected clusters' },
  { id: 'rings', label: 'Concentric rings' },
  { id: 'loop', label: 'Wave loop' },
  { id: 'cloud', label: 'Scattered cloud' },
  { id: 'grid', label: 'Square grid' },
  { id: 'compass', label: 'Compass ring' },
].map(Object.freeze));

function hash(value) {
  const str = String(value);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}

function random(seed) {
  let value = hash(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function density(value, counts, fallback = 1) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value >= counts[0]) return Math.round(clamp(value, counts[0], counts.at(-1)));
    return counts[Math.round(clamp(value, 0, counts.length - 1))];
  }
  const key = String(value ?? '').toLowerCase().replace(/[\s_-]/g, '');
  const presets = { sparse: 0, low: 0, medium: 1, normal: 1, dense: 2, high: 2, verydense: 3 };
  if (key in presets) return counts[presets[key]];
  if (key !== '' && Number.isFinite(Number(key))) return density(Number(key), counts, fallback);
  return counts[fallback];
}

/** Sphere identities retain their palette/offset when a parameter changes. */
function sphere(formation, seed, index, x, y, z, r) {
  const rand = random(`${seed}/${formation}/${index}`);
  return {
    id: `${formation}-${index}`,
    x, y, z, r,
    palette: rand(),
    offset: rand() * TAU,
  };
}

function fit(points, extent = 0.92) {
  let bounds = 0;
  for (const p of points) bounds = Math.max(bounds, Math.abs(p.x), Math.abs(p.y));
  const scale = bounds > extent ? extent / bounds : 1;
  for (const p of points) { p.x *= scale; p.y *= scale; }
  return points;
}

function clusters(state, seed) {
  const count = Math.round(clamp(number(state.nodes, 2), 1, 8));
  const spheres = [];
  const links = [];
  const rand = random(`${seed}/cluster-layout`);
  const radius = clamp(0.118 * Math.sqrt(2 / count), 0.068, 0.14);
  // Two branching hubs reproduce the reference's tall, asymmetric silhouette.
  const reference = [
    [[-0.07, -0.39], [-0.39, -0.63], [0.04, -0.96], [-0.38, 0.12], [0.36, 0.20], [-0.14, 0.67]],
    [[-0.16, 0.65], [-0.68, 0.34], [-0.30, 0.35], [0.10, 0.43], [0.42, 0.71], [0.08, 0.98]],
  ];
  for (let h = 0; h < count; h++) {
    const hubIndex = spheres.length;
    const angle = -Math.PI / 2 + TAU * h / count;
    const hub = count === 2 ? reference[h][0] : count === 1 ? [0, -0.05] : [0.46 * Math.cos(angle), 0.46 * Math.sin(angle)];
    for (let j = 0; j < 6; j++) {
      let x, y;
      if (count === 2) [x, y] = reference[h][j];
      else if (j === 0) [x, y] = hub;
      else {
        const a = angle + TAU * (j - 1) / 5 + 0.26;
        const reach = count === 1 ? 0.67 + rand() * 0.13 : 0.25 + rand() * 0.17;
        x = hub[0] + Math.cos(a) * reach;
        y = hub[1] + Math.sin(a) * reach;
      }
      const jitter = j === 0 ? 0.013 : 0.031;
      x += (rand() - 0.5) * jitter;
      y += (rand() - 0.5) * jitter;
      const item = sphere('clusters', seed, spheres.length, x, y, (rand() - 0.5) * 0.12, radius);
      spheres.push(item);
      if (j > 0) links.push([`clusters-${hubIndex}`, item.id]);
    }
    if (h > 0) links.push([`clusters-${(h - 1) * 6}`, `clusters-${hubIndex}`]);
  }
  // A couple of quiet cross-links give the lower branches the reference's mesh.
  if (count === 2) links.push(['clusters-3', 'clusters-8'], ['clusters-4', 'clusters-9']);
  // The template was traced in screen coordinates; scene y points upward.
  for (const item of spheres) item.y = -item.y;
  return { spheres: fit(spheres, 0.91), links };
}

function rings(state, seed) {
  const count = Math.round(clamp(number(state.ringCount, 6), 1, 10));
  const population = i => i < 4 ? 12 * (i + 1) : 48 + 8 * (i - 3);
  const outerCount = population(count - 1);
  const r = Math.min(0.14, 0.72 / (count + 0.25), 0.91 * Math.sin(Math.PI / outerCount) * 0.89);
  const spheres = [];
  for (let layer = 0; layer < count; layer++) {
    const n = population(layer);
    const reach = 0.91 * (layer + 1) / count;
    const stagger = layer % 2 ? Math.PI / n : 0;
    for (let i = 0; i < n; i++) {
      const a = TAU * i / n + stagger - Math.PI / 2;
      const item = sphere('rings', seed, spheres.length, reach * Math.cos(a), reach * Math.sin(a), 0, r);
      // Ring identities encode layer/slot, keeping existing rings stable on edits.
      item.id = `rings-${layer}-${i}`;
      const rand = random(`${seed}/${item.id}`);
      item.palette = rand();
      item.offset = rand() * TAU;
      spheres.push(item);
    }
  }
  return { spheres, links: [] };
}

// Measured centres and circular contours from the supplied 1494×1240 reference.
// The asymmetric arc and six-layer fold cannot be reproduced by compressing a
// sector of an evenly sampled circle. Pixel radii preserve the visible size ramp.
const loopReference = [
  [359, 249, 77, -.20], [505, 215, 74, -.15],
  [677, 295, 73, -.10], [853, 425, 71, -.05],
  [1012, 535, 73, .10], [1251, 519, 82, -.15],
  [1249, 560, 83, -.40], [1190, 525, 85, .40],
  [1167, 589, 72, -.65], [1062, 627, 97, .75],
  [849, 794, 95, .30], [629, 936, 92, .25],
  [441, 969, 89, .15], [309, 860, 85, .05],
  [252, 645, 83, -.05], [270, 410, 79, -.15]
];

function loop(state, seed) {
  const count = density(state.loopDensity, [10, 16, 22, 28]);
  const height = clamp(number(state.waveHeight, 0.6), 0, 3);
  const delta = height - .6;
  const radiusScale = Math.sqrt(16 / count);
  const spheres = [];
  for (let i = 0; i < count; i++) {
    // Medium samples the sixteen measured contours exactly; other densities
    // resample the same closed path instead of reverting to a regular circle.
    const position = i * loopReference.length / count;
    const index = Math.floor(position), blend = position - index;
    const a = loopReference[index], b = loopReference[(index + 1) % loopReference.length];
    const point = a.map((value, j) => value + (b[j] - value) * blend);
    const phase = position / loopReference.length * TAU;
    const knot = index >= 4 && index <= 9 ? 1 : .15;
    const x = (point[0] - 750) / 600 + delta * .012 * knot * Math.sin(phase * 3);
    const y = (600 - point[1]) / 600 + delta * .012 * knot * Math.cos(phase * 3);
    const z = point[3] * (1 + delta * .65);
    // Compensate the renderer's depth scale at the reference wave height.
    const r = point[2] / 600 / (1 + point[3] * .12) * radiusScale;
    spheres.push(sphere('loop', seed, i, x, y, z, r));
  }
  return { spheres, links: [] };
}

function cloud(state, seed) {
  const count = density(state.cloudDensity, [12, 24, 40, 56], 3);
  const rand = random(`${seed}/cloud-layout`);
  const points = [];
  // Best-candidate sampling fills a disc evenly while preserving an organic edge.
  // Unlike rejection sampling, it always returns the exact requested population.
  for (let i = 0; i < count; i++) {
    let best = null;
    let bestDistance = -Infinity;
    for (let candidate = 0; candidate < 72; candidate++) {
      const a = rand() * TAU;
      const distance = Math.sqrt(rand()) * 0.91;
      const x = Math.cos(a) * distance * 0.94;
      const y = Math.sin(a) * distance;
      let separation = i === 0 ? rand() : Infinity;
      for (const point of points) separation = Math.min(separation, Math.hypot(point.x - x, point.y - y));
      if (separation > bestDistance) { best = { x, y }; bestDistance = separation; }
    }
    points.push(best);
  }
  // Relax unusually close pairs so a single small gap cannot shrink every
  // sphere. The soft constraint retains the random cloud's uneven spacing.
  const clearance = clamp(1.35 / Math.sqrt(count), 0.175, 0.34);
  for (let pass = 0; pass < 100; pass++) {
    const pushes = points.map(() => ({ x: 0, y: 0 }));
    let correction = 0;
    for (let i = 1; i < points.length; i++) {
      for (let j = 0; j < i; j++) {
        const vx = points[i].x - points[j].x;
        const vy = points[i].y - points[j].y;
        const distance = Math.hypot(vx, vy);
        if (distance >= clearance) continue;
        const push = (clearance - distance) * 0.43;
        const px = vx / Math.max(distance, 0.0001) * push;
        const py = vy / Math.max(distance, 0.0001) * push;
        pushes[i].x += px; pushes[i].y += py;
        pushes[j].x -= px; pushes[j].y -= py;
        correction += push;
      }
    }
    for (let i = 0; i < points.length; i++) {
      points[i].x += pushes[i].x;
      points[i].y += pushes[i].y;
      const reach = Math.hypot(points[i].x / 0.94, points[i].y);
      if (reach > 0.91) {
        points[i].x *= 0.91 / reach;
        points[i].y *= 0.91 / reach;
      }
    }
    if (correction < 0.00002) break;
  }
  let minimum = Infinity;
  for (let i = 1; i < points.length; i++) {
    for (let j = 0; j < i; j++) minimum = Math.min(minimum, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
  }
  const r = Math.min(clamp(0.75 / Math.sqrt(count), 0.078, 0.165), minimum * 0.46);
  const spheres = points.map((p, i) => sphere('cloud', seed, i, p.x, p.y, (rand() - 0.5) * 0.15, r));
  return { spheres, links: [] };
}

function grid(state, seed) {
  const count = Math.round(clamp(number(state.gridSize, 5), 2, 12));
  const step = 1.66 / (count - 1);
  const r = Math.min(0.25, step * 0.394);
  const spheres = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const item = sphere('grid', seed, row * count + col, (col - (count - 1) / 2) * step, (row - (count - 1) / 2) * step, 0, r);
      item.id = `grid-${row}-${col}`;
      const rand = random(`${seed}/${item.id}`);
      item.palette = rand();
      item.offset = rand() * TAU;
      spheres.push(item);
    }
  }
  return { spheres, links: [] };
}

function compass(state, seed) {
  const count = Math.round(clamp(number(state.sphereCount, 12), 3, 32));
  const r = Math.min(0.163, 0.89 * Math.sin(Math.PI / count) * 0.69);
  const spheres = [sphere('compass', seed, 0, 0, 0, 0.06, Math.max(r, 0.125))];
  for (let i = 0; i < count; i++) {
    const a = TAU * i / count - Math.PI / 2 - 0.16;
    spheres.push(sphere('compass', seed, i + 1, 0.89 * Math.cos(a), 0.89 * Math.sin(a), 0, r));
  }
  // The renderer may rotate this fine diameter independently of the formation.
  const opposite = Math.round(count / 2) + 1;
  return { spheres, links: [[spheres[1].id, spheres[0].id], [spheres[0].id, spheres[opposite].id]] };
}

const generators = { clusters, rings, loop, cloud, grid, compass };

/** Return deterministic base geometry without applying any animation. */
export function generateFormation(state = {}) {
  const generator = generators[state.formation] || clusters;
  return generator(state, state.seed ?? 17);
}

/**
 * Evaluate a surface phase and gentle optional drift at an elapsed time in seconds.
 * Wind is deliberately reconstructed as a slow coherent directional field.
 */
export function evaluateMotion(sphere, state = {}, time = 0) {
  const x = number(sphere.x, 0);
  const y = number(sphere.y, 0);
  const offset = number(sphere.offset, 0);
  const t = number(time, 0);
  const speed = clamp(number(state.speed, 1.2), 0, 5);
  const spread = clamp(number(state.spread, 2.8), 0.1, 8);
  const lift = clamp(number(state.lift, 1), 0, 3);
  const clock = t * speed * 0.83;
  const reach = Math.hypot(x, y);
  const angle = Math.atan2(y, x);
  const randomRate = 0.65 + (hash(sphere.id ?? offset) / 4294967296) * 0.70;
  let phase, tilt, dx = 0, dy = 0, dz = 0;
  const mode = state.motion || 'sweep';
  if (mode === 'ripple') {
    phase = clock - reach * spread * 2.15 + offset * 0.11;
    // Tilt is the in-plane mask direction, so a ripple points radially outward.
    tilt = angle + Math.sin(clock * 0.17) * 0.18;
    if (reach > 0.001) {
      const breath = Math.sin(clock - reach * spread * 2.15) * 0.026 * lift;
      dx = x / reach * breath;
      dy = y / reach * breath;
    }
    dz = Math.cos(phase) * 0.060 * lift;
  } else if (mode === 'around') {
    // A unit winding closes exactly across atan2's ±π seam. Spread changes a
    // periodic modulation, rather than introducing a fractional winding.
    phase = clock - angle + Math.sin(angle * 2 + 0.4) * (spread - 1) * 0.065 + offset * 0.10;
    tilt = angle + clock * 0.12;
    const orbit = Math.sin(clock * 0.32) * 0.025 * lift;
    dx = -y * orbit;
    dy = x * orbit;
    dz = Math.sin(phase) * 0.044 * lift;
  } else if (mode === 'flicker') {
    // Independent smooth phases create grey discs and colour crescents without
    // opacity flashes. The displayed wave parameters have no effect in this mode.
    phase = t * 0.93 * randomRate + offset + Math.sin(t * 0.54 + offset) * 0.22;
    tilt = offset * 0.53 + Math.sin(t * 0.21 + offset) * 0.32;
    dx = Math.sin(t * 0.28 + offset) * 0.013;
    dy = Math.cos(t * 0.24 + offset) * 0.013;
    dz = Math.sin(t * 0.36 + offset) * 0.022;
  } else if (mode === 'wind') {
    phase = clock - (x * 0.92 + y * 0.35) * spread + Math.sin(clock * 0.31 + y * 2) * 0.38 + offset * 0.14;
    tilt = -0.47 + Math.sin(clock * 0.25 + y * 1.8) * 0.33;
    dx = Math.sin(clock * 0.38 + y * spread) * 0.045 * lift;
    dy = Math.cos(clock * 0.31 + x * 1.7) * 0.018 * lift;
    dz = Math.sin(phase) * 0.045 * lift;
  } else {
    phase = clock - (x * 0.96 + y * 0.23) * spread * 1.72 + offset * 0.11;
    tilt = -0.27 + Math.sin(clock * 0.21) * 0.20;
    dx = Math.sin(phase) * 0.026 * lift;
    dy = Math.sin(phase + 1.2) * 0.009 * lift;
    dz = Math.cos(phase) * 0.052 * lift;
  }
  if (!state.drift) return { phase, tilt, dx: 0, dy: 0, dz: 0 };
  // The same low-frequency breeze is shared across fields, with a small stable
  // variation per sphere. It never modifies base positions or formation state.
  dx += Math.sin(t * 0.14 + offset * 0.13) * 0.011;
  dy += Math.cos(t * 0.12 + offset * 0.17) * 0.010;
  return { phase, tilt, dx, dy, dz };
}
