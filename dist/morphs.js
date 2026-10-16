/**
 * Formation morphs operate on already evaluated scenes, so surface motion and
 * positional drift can keep running independently of a geometry transition.
 * Times are milliseconds. No input scene is mutated.
 */
// Natural colour (tr..ta, sr..sb) and light (lx..lw) blend with geometry.
const scalarFields = ['x', 'y', 'z', 'r', 'palette', 'tr', 'tg', 'tb', 'ta', 'sr', 'sg', 'sb', 'lx', 'ly', 'lz', 'lw'];
export const MORPH_DURATION_MS = 850;
// Match the reference's 9% approach per frame at 60 Hz without making the
// perceived response depend on the display's refresh rate.
const approachRate = -60 * Math.log(.91);
const angularFields = ['phase', 'tilt', 'offset'];
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const isMarker = sphere => sphere._morphMarker === true || /needle-[ab]$/.test(String(sphere.id));
const copyScene = scene => ({
  spheres: (scene?.spheres || []).map(sphere => ({ ...sphere })),
  links: (scene?.links || []).map(link => [...link]),
});
const distance = (a, b) => (finite(a.x) - finite(b.x)) ** 2
  + (finite(a.y) - finite(b.y)) ** 2 + (finite(a.z) - finite(b.z)) ** 2 * 0.25;

function nearest(sphere, candidates) {
  let best = null, bestDistance = Infinity;
  for (const candidate of candidates) {
    const next = distance(sphere, candidate);
    if (next < bestDistance) { best = candidate; bestDistance = next; }
  }
  return best;
}

function center(spheres) {
  const balls = spheres.filter(sphere => finite(sphere.r) > 0 && !isMarker(sphere));
  if (!balls.length) return { x: 0, y: 0, z: 0 };
  const sum = balls.reduce((acc, sphere) => ({
    x: acc.x + finite(sphere.x), y: acc.y + finite(sphere.y), z: acc.z + finite(sphere.z),
  }), { x: 0, y: 0, z: 0 });
  return { x: sum.x / balls.length, y: sum.y / balls.length, z: sum.z / balls.length };
}

/** Prefer stable identities, then greedily pair the nearest unused centers. */
function pairBalls(source, target) {
  const sourceUsed = new Set(), targetUsed = new Set(), pairs = [];
  const sourceById = new Map(source.map(sphere => [sphere.id, sphere]));
  for (const sphere of target) {
    const previous = sourceById.get(sphere.id);
    if (!previous || sourceUsed.has(previous)) continue;
    sourceUsed.add(previous); targetUsed.add(sphere); pairs.push([previous, sphere]);
  }
  const candidates = [];
  for (const from of source) {
    if (sourceUsed.has(from)) continue;
    for (const to of target) {
      if (!targetUsed.has(to)) candidates.push({ from, to, distance: distance(from, to) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    if (sourceUsed.has(candidate.from) || targetUsed.has(candidate.to)) continue;
    sourceUsed.add(candidate.from); targetUsed.add(candidate.to);
    pairs.push([candidate.from, candidate.to]);
  }
  return {
    pairs,
    outgoing: source.filter(sphere => !sourceUsed.has(sphere)),
    entering: target.filter(sphere => !targetUsed.has(sphere)),
  };
}

/** Capture a displayed scene and map its balls onto a new target scene. */
export function createMorph(fromScene, toScene, startTime, duration = MORPH_DURATION_MS) {
  const source = copyScene(fromScene), target = copyScene(toScene);
  const sourceBalls = source.spheres.filter(sphere => !isMarker(sphere));
  const targetBalls = target.spheres.filter(sphere => !isMarker(sphere));
  const sourceMarkers = source.spheres.filter(isMarker);
  const targetMarkers = target.spheres.filter(isMarker);
  const routes = [], sourceIds = new Map();
  const usedIds = new Set(target.spheres.map(sphere => sphere.id));
  const sourceCenter = center(source.spheres), targetCenter = center(target.spheres);
  const uniqueOutgoingId = sphere => {
    const base = `__morph-out:${String(sphere.id)}`;
    let id = base, suffix = 0;
    while (usedIds.has(id)) id = `${base}:${++suffix}`;
    usedIds.add(id);
    return id;
  };
  const add = (from, to, id, kind, marker = false) => {
    routes.push({ from, to, id, toId: to.id, kind, marker });
    if (kind !== 'entering') sourceIds.set(from.id, id);
  };
  const { pairs, outgoing, entering } = pairBalls(sourceBalls, targetBalls);
  for (const [from, to] of pairs) add(from, to, to.id, 'matched');
  for (const to of entering) {
    const origin = nearest(to, sourceBalls);
    add({ ...to, ...(origin || sourceCenter), r: 0 }, to, to.id, 'entering');
  }
  for (const from of outgoing) {
    const destination = nearest(from, targetBalls);
    add(from, { ...from, ...(destination || targetCenter), r: 0 }, uniqueOutgoingId(from), 'outgoing');
  }
  // Zero-radius needle endpoints never consume a match intended for a ball.
  const markerById = new Map(sourceMarkers.map(sphere => [sphere.id, sphere]));
  const matchedMarkers = new Set();
  for (const to of targetMarkers) {
    const from = markerById.get(to.id);
    if (from) { matchedMarkers.add(from); add(from, to, to.id, 'matched', true); }
    else add({ ...to, ...sourceCenter, r: 0 }, to, to.id, 'entering', true);
  }
  for (const from of sourceMarkers) {
    if (!matchedMarkers.has(from)) add(from, { ...from, ...targetCenter, r: 0 }, uniqueOutgoingId(from), 'outgoing', true);
  }
  return {
    startTime: finite(startTime), duration: Math.max(0, finite(duration, MORPH_DURATION_MS)),
    routes, sourceLinks: source.links.map(([a, b, opacity]) => [sourceIds.get(a), sourceIds.get(b), opacity]),
    target,
  };
}

export function isMorphComplete(morph, now) {
  return !morph || finite(now, morph.startTime) >= morph.startTime + morph.duration;
}

function blendSphere(route, target, amount) {
  const from = route.from;
  // Preserve the exact endpoint angles; equivalent wrapped angles are used only
  // inside the transition so crossing ±π does not spin a material around.
  const sphere = { ...(amount === 0 ? from : target), id: route.id };
  for (const field of scalarFields) {
    const a = finite(from[field]), b = finite(target[field]);
    sphere[field] = amount === 0 ? a : amount === 1 ? b : a + (b - a) * amount;
  }
  sphere.r = Math.max(0, sphere.r);
  for (const field of angularFields) {
    const a = finite(from[field]), b = finite(target[field]);
    const initialTarget = finite(route.to[field]);
    // Fix the shortest branch when the morph starts, then retain the target's
    // live unwrapped motion. Choosing a new branch on every frame would jump
    // when an advancing target crosses the antipodal angle mid-transition.
    const change = Math.atan2(Math.sin(initialTarget - a), Math.cos(initialTarget - a))
      + b - initialTarget;
    sphere[field] = amount === 0 ? a : amount === 1 ? b : a + change * amount;
  }
  if (route.marker) sphere._morphMarker = true;
  return sphere;
}

/** Sample toward the current evaluated target, including its live motion. */
export function sampleMorph(morph, targetScene, now) {
  const target = targetScene || morph?.target || { spheres: [], links: [] };
  if (isMorphComplete(morph, now)) return copyScene(target);
  const progress = morph.duration === 0 ? 0 : Math.max(0, Math.min(1, (finite(now, morph.startTime) - morph.startTime) / morph.duration));
  const elapsedSeconds = progress * morph.duration / 1000;
  const durationSeconds = morph.duration / 1000;
  const amount = -Math.expm1(-approachRate * elapsedSeconds) / -Math.expm1(-approachRate * durationSeconds);
  const targetById = new Map((target.spheres || []).map(sphere => [sphere.id, sphere]));
  const spheres = morph.routes.map(route => {
    let destination = targetById.get(route.toId) || route.to;
    if (route.kind === 'outgoing') destination = { ...destination, r: 0 };
    return blendSphere(route, destination, amount);
  });
  const present = new Set(spheres.map(sphere => sphere.id));
  const linksByPair = new Map();
  const addLink = ([a, b, opacity = 1], fade) => {
    const alpha = Math.max(0, Math.min(1, finite(opacity, 1))) * fade;
    if (!present.has(a) || !present.has(b) || a === b || alpha <= 0) return;
    const key = JSON.stringify([String(a), String(b)].sort());
    const existing = linksByPair.get(key);
    if (existing) existing[2] = Math.min(1, existing[2] + alpha);
    else linksByPair.set(key, [a, b, alpha]);
  };
  for (const link of morph.sourceLinks) addLink(link, 1 - amount);
  for (const link of target.links || []) addLink(link, amount);
  return { spheres, links: [...linksByPair.values()] };
}
