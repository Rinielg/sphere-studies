/**
 * A cosmos flower built from spheres. Petals are sampled obovate blades bent
 * along circular arcs; the disc uses Vogel's phyllotaxis (golden angle); the
 * stem is a cubic Bézier. Wind sways the stem as a cantilever beam and petals
 * flutter along their own surface normals, so every displacement follows the
 * petal shape rather than a shared screen-space field.
 */
import { TAU, clamp, number, random, sphere } from './common.js';

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIGHT = (() => { const v = [-.45, .65, .62], l = Math.hypot(...v); return v.map(c => c / l); })();
const COLOURS = {
  petal: [[.97, .975, .97], [.70, .78, .80]],
  disc: [[.80, .58, .25], [.58, .38, .14]],
  anther: [[.95, .78, .44], [.78, .58, .27]],
  stem: [[.36, .39, .30], [.24, .27, .20]],
};

// Rotate by yaw (about y), pitch (about x), then roll (screen plane).
function orient(x, y, z, yaw, pitch, roll) {
  let c = Math.cos(yaw), s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(roll); s = Math.sin(roll);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/** Cosmos ray floret outline: narrow base, broad truncated tip with shallow teeth. */
const halfWidth = u => .22 + .78 * Math.sin(Math.PI / 2 * Math.min(1, u / .82) ** .8) ** .9;
const tipLimit = v => 1 - .30 * Math.abs(v) ** 2.6 - .04 * (1 - Math.cos(3 * Math.PI * (v + 1))) / 2;

/** Position along a petal whose bend angle falls linearly from base to tip. */
function arc(s, length, base, bend) {
  if (Math.abs(bend) < 1e-4) return [s * Math.cos(base), s * Math.sin(base)];
  const k = bend / length;
  return [(Math.sin(base) - Math.sin(base - k * s)) / k, (Math.cos(base - k * s) - Math.cos(base)) / k];
}

function cubic(p0, p1, p2, p3, t) {
  const m = 1 - t;
  return p0.map((_, i) => m * m * m * p0[i] + 3 * m * m * t * p1[i] + 3 * m * t * t * p2[i] + t * t * t * p3[i]);
}

export function flower(state, seed) {
  const petals = Math.round(clamp(number(state.flowerPetals, 8), 5, 13));
  const detail = Math.round(clamp(number(state.flowerDetail, 1), 0, 3));
  const openness = clamp(number(state.flowerOpen, .55), 0, 1);
  const sway = clamp(number(state.flowerSway, .45), 0, 1);
  const flutter = clamp(number(state.flowerFlutter, .4), 0, 1);
  const view = clamp(number(state.flowerView, 48), 0, 85) * DEG;
  const stem = state.flowerStem !== false, natural = state.flowerNatural !== false;
  const backdrop = state.flowerBackdrop !== false;

  const spacing = [.05, .042, .034, .027][detail];
  const inner = .085, length = .56, width = .17;
  const head = [.05, .28, 0], yaw = 10 * DEG, roll = -9 * DEG;
  const items = [];
  const add = (id, kind, data) => {
    const item = sphere('flower', seed, items.length, 0, 0, 0, 0);
    item.id = `flower-${id}`;
    item.pin = true;
    item.kind = kind;
    Object.assign(item, data);
    if (natural) {
      // Each petal catches the light slightly differently, which separates overlapping blades.
      const [main, shade] = COLOURS[kind].map(c => c.map(v => v * (data.shape ? .955 + .045 * Math.cos(data.shape.angle * 3 + data.shape.phase) : 1)));
      Object.assign(item, { tr: main[0], tg: main[1], tb: main[2], ta: 1, sr: shade[0], sg: shade[1], sb: shade[2] });
    }
    items.push(item);
  };

  // Petals: rows along the length, spheres across the outline at even spacing.
  for (let i = 0; i < petals; i++) {
    const rand = random(`${seed}/petal/${i}`);
    const shape = {
      angle: TAU * i / petals + (rand() - .5) * .16, scaleL: .92 + rand() * .16, scaleW: .9 + rand() * .2,
      open: (rand() - .5) * 10 * DEG, twist: (rand() - .5) * .24, phase: rand() * TAU, layer: i % 2 ? -.012 : .012,
    };
    // Fewer petals are broader, so the corolla stays closed around the disc.
    const L = length * shape.scaleL, W = width * shape.scaleW * Math.min(1.5, (8 / petals) ** .85);
    const rows = Math.ceil(L / spacing);
    for (let j = 0; j < rows; j++) {
      const u = (j + .5) / rows, hw = W * halfWidth(u);
      const across = Math.max(1, Math.round(2 * hw / spacing) + 1);
      for (let k = 0; k < across; k++) {
        const v = across === 1 ? 0 : (k / (across - 1)) * 2 - 1;
        if (u > tipLimit(v)) continue;
        const edge = 1 - .18 * Math.abs(v) ** 3;
        add(`p${i}-${j}-${k}`, 'petal', { petal: i, u, v, L, hw, shape, size: spacing * .76 * edge });
      }
    }
  }

  // Disc florets on Vogel's spiral, r = R√(k/n), θ = k·golden angle, over a low dome.
  const florets = [55, 89, 144, 233][detail], disc = .105;
  for (let k = 0; k < florets; k++) {
    const r = disc * Math.sqrt((k + .5) / florets);
    add(`d${k}`, 'disc', { local: [r * Math.cos(k * GOLDEN_ANGLE), r * Math.sin(k * GOLDEN_ANGLE), .05 * (1 - (r / disc) ** 2) + .018],
      size: disc * 1.05 / Math.sqrt(florets) * (.8 + .35 * r / disc) });
  }
  // Stamens: anthers raised above the disc on the same spiral, reaching past its rim.
  const anthers = [21, 34, 34, 55][detail];
  for (let k = 0; k < anthers; k++) {
    const rand = random(`${seed}/anther/${k}`);
    const r = disc * (.55 + .95 * Math.sqrt((k + .5) / anthers)), a = k * GOLDEN_ANGLE;
    add(`a${k}`, 'anther', { local: [r * Math.cos(a), r * Math.sin(a), .07 + .045 * rand() - .02 * (r / disc - 1)], size: .013 + rand() * .005 });
  }
  // Bracts: thin pointed sepals behind the petals.
  for (let i = 0; i < 8; i++) {
    const a = TAU * (i + .5) / 8;
    for (let k = 0; k < 5; k++) {
      const r = .05 + .05 * k;
      add(`b${i}-${k}`, 'stem', { local: [r * Math.cos(a), r * Math.sin(a), -.04 - .035 * k - .005 * k * k], size: .014 * (1 - k * .13) });
    }
  }

  // Stem: a cubic Bézier from the receptacle to a root below the frame.
  const neck = [0, 0, -.06];
  const [bx, by, bz] = orient(neck[0], neck[2], -neck[1], yaw, view, roll);
  const top = [head[0] + bx, head[1] + by, head[2] + bz], root = [-.06, -1.85, -.05];
  const stemPoints = [];
  if (stem) {
    const controls = [top, [top[0] - .03, top[1] - .55, top[2]], [root[0] + .14, root[1] + .75, root[2]], root];
    const samples = 200, polyline = [];
    for (let k = 0; k <= samples; k++) polyline.push(cubic(...controls, k / samples));
    let travelled = 0, next = 0;
    for (let k = 0; k <= samples; k++) {
      if (k) travelled += Math.hypot(...polyline[k].map((c, i) => c - polyline[k - 1][i]));
      if (travelled >= next) { stemPoints.push({ point: polyline[k], s: travelled }); next += .019; }
    }
    const total = travelled;
    stemPoints.forEach(({ point, s }, k) => add(`s${k}`, 'stem', { rest: point, sigma: 1 - s / total, size: .014 + .004 * s / total }));
  }

  const stemLength = Math.hypot(top[0] - root[0], top[1] - root[1]);
  const shadeCap = { phase: Math.acos(-LIGHT[2]), tilt: Math.atan2(-LIGHT[1], -LIGHT[0]) };
  const finish = (item, x, y, z) => {
    const out = { ...item, x, y, z, r: item.size };
    if (natural) Object.assign(out, shadeCap, { lx: LIGHT[0], ly: LIGHT[1], lz: LIGHT[2], lw: 1 });
    return out;
  };

  const animate = time => {
    // Wind: three incommensurate sinusoids per axis give a non-repeating breeze.
    const gx = .62 * Math.sin(.53 * time) + .28 * Math.sin(1.21 * time + 1.3) + .10 * Math.sin(2.9 * time + .4);
    const gz = .60 * Math.sin(.41 * time + 2) + .30 * Math.sin(.97 * time + .7) + .10 * Math.sin(2.3 * time);
    const ax = sway * .085 * gx, az = sway * .07 * gz;
    // Cantilever deflection shape φ(σ) = σ²(3 − σ)/2; the head follows the tip and its slope.
    const bend = sigma => sigma * sigma * (3 - sigma) / 2;
    const leanX = Math.atan(1.5 * ax / stemLength), leanZ = Math.atan(1.5 * az / stemLength);
    const breath = 2.5 * DEG * Math.sin(.23 * time);
    const gust = .6 + .4 * Math.abs(gx);
    const base = (55 - 50 * openness) * DEG, droop = (10 + 22 * openness) * DEG;
    const amp = flutter * .045;
    const toWorld = ([a, b, c]) => {
      const [x, y, z] = orient(a, c, -b, yaw, view + leanZ * .8, roll - leanX);
      return [x + head[0] + ax, y + head[1], z + head[2] + az];
    };
    const spheres = items.map(item => {
      if (item.kind === 'petal') {
        const { u, v, L, hw, shape } = item;
        const s = u * L, start = base + shape.open + breath;
        const [radial, rise] = arc(s, L, start, droop);
        const phi = start - droop * u;
        const normal = [-Math.sin(phi), Math.cos(phi)];
        const y = v * hw;
        // Offsets along the petal normal: lateral cupping, pleats, twist and flutter.
        // Flutter is a travelling wave from base to tip whose phase steps around the flower.
        const wave = Math.sin(1.9 * time - 2.4 * u + shape.angle + shape.phase) * gust;
        const roll2 = Math.sin(3.1 * time + shape.phase) * v;
        const n = .9 * y * y / width + .006 * Math.cos(4 * Math.PI * v) * u + y * Math.tan(shape.twist)
          + amp * u * u * (wave + .45 * roll2) + shape.layer;
        const rx = inner + radial + normal[0] * n, rz = rise + normal[1] * n;
        const c = Math.cos(shape.angle), sn = Math.sin(shape.angle);
        return finish(item, ...toWorld([rx * c - y * sn, rx * sn + y * c, rz]));
      }
      if (item.kind === 'stem' && item.rest) {
        const d = bend(item.sigma);
        return finish(item, item.rest[0] + ax * d, item.rest[1], item.rest[2] + az * d);
      }
      const [a, b, c] = item.local;
      const jitter = item.kind === 'anther' ? .004 * flutter * Math.sin(2.3 * time + item.offset) : 0;
      return finish(item, ...toWorld([a + jitter, b, c]));
    });
    return { spheres, links: [] };
  };

  return {
    ...animate(0),
    animate: (time, clocks = {}) => animate(number(clocks.breeze, 0)),
    clockRates: { breeze: clamp(number(state.flowerBreeze, .7), 0, 3) },
    scene: backdrop ? { background: [.29, .38, .40], dark: true } : {},
  };
}
