/** Shared deterministic helpers for formation generators. */
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

export function hash(value) {
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

export function random(seed) {
  let value = hash(seed);
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function density(value, counts, fallback = 1) {
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
export function sphere(formation, seed, index, x, y, z, r) {
  const rand = random(`${seed}/${formation}/${index}`);
  return {
    id: `${formation}-${index}`,
    x, y, z, r,
    palette: rand(),
    offset: rand() * TAU,
  };
}

export const smooth = v => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };
