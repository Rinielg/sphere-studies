/**
 * The solar system as spheres. Planet positions come from Keplerian elements
 * solved through Kepler's equation; spin uses each body's sidereal rotation
 * period about its IAU pole; Saturn's rings are particles on Keplerian orbits.
 * Only the display scale is compressed: orbit shapes, relative orbital and
 * rotation rates, eccentricities, inclinations and axial tilts are real.
 */
import { TAU, clamp, number, random, sphere } from './common.js';

const DEG = Math.PI / 180;
const OBLIQUITY = 23.43928 * DEG;
const JUPITER_RADIUS = 69911;

// J2000 elements (Standish, JPL "Keplerian Elements for Approximate Positions"):
// a [AU], e, i, L (mean longitude), varpi (longitude of perihelion), Omega (node) [deg].
// Mean radius [km], signed sidereal rotation period [h] (negative is retrograde),
// IAU WGCCRE north pole right ascension and declination [deg], approximate colours.
const BODIES = [
  { id: 'sun', radius: 695700, rotation: 609.12, pole: [286.13, 63.87],
    colour: [1, .80, .40], feature: [1, .63, .24] },
  { id: 'mercury', a: .38709927, e: .20563593, i: 7.00497902, L: 252.2503235, varpi: 77.45779628, node: 48.33076593,
    radius: 2439.7, rotation: 1407.6, pole: [281.01, 61.41], colour: [.64, .62, .60], feature: [.47, .45, .44] },
  { id: 'venus', a: .72333566, e: .00677672, i: 3.39467605, L: 181.9790995, varpi: 131.60246718, node: 76.67984255,
    radius: 6051.8, rotation: -5832.5, pole: [272.76, 67.16], colour: [.90, .76, .49], feature: [.80, .63, .37] },
  { id: 'earth', a: 1.00000261, e: .01671123, i: -.00001531, L: 100.46457166, varpi: 102.93768193, node: 0,
    radius: 6371, rotation: 23.9345, pole: [0, 90], colour: [.20, .42, .78], feature: [.39, .57, .37] },
  { id: 'mars', a: 1.52371034, e: .0933941, i: 1.84969142, L: -4.55343205, varpi: -23.94362959, node: 49.55953891,
    radius: 3389.5, rotation: 24.6229, pole: [317.68, 52.89], colour: [.77, .35, .20], feature: [.56, .25, .15] },
  { id: 'jupiter', a: 5.202887, e: .04838624, i: 1.30439695, L: 34.39644051, varpi: 14.72847983, node: 100.47390909,
    radius: 69911, rotation: 9.925, pole: [268.06, 64.50], colour: [.87, .80, .69], feature: [.72, .56, .43] },
  { id: 'saturn', a: 9.53667594, e: .05386179, i: 2.48599187, L: 49.95424423, varpi: 92.59887831, node: 113.66242448,
    radius: 58232, rotation: 10.656, pole: [40.59, 83.54], colour: [.91, .83, .64], feature: [.80, .70, .51] },
  { id: 'uranus', a: 19.18916464, e: .04725744, i: .77263783, L: 313.23810451, varpi: 170.9542763, node: 74.01692503,
    radius: 25362, rotation: -17.24, pole: [257.31, -15.18], colour: [.63, .85, .89], feature: [.53, .77, .83] },
  { id: 'neptune', a: 30.06992276, e: .00859048, i: 1.77004347, L: -55.12002969, varpi: 44.96476227, node: 131.78422574,
    radius: 24622, rotation: 16.11, pole: [299.36, 43.46], colour: [.26, .42, .86], feature: [.20, .32, .72] },
];
const PLANETS = BODIES.slice(1);
const NEPTUNE_A = PLANETS.at(-1).a;

// Saturn's rings in Saturn radii: C ring, inner and outer B ring, A ring
// (the gap between the last two is the Cassini division). GM in km^3/s^2.
const RINGLETS = [1.36, 1.62, 1.86, 2.16];
const SATURN_GM = 3.7931e7;
const RING_COLOUR = [.84, .77, .62];

/** Newton–Raphson solution of Kepler's equation M = E − e sin E. */
export function solveKepler(M, e) {
  M = Math.atan2(Math.sin(M), Math.cos(M));
  let E = e < .8 ? M : Math.PI;
  for (let k = 0; k < 8; k++) {
    const step = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return E;
}

/** Heliocentric ecliptic position [AU] at eccentric anomaly E. */
function orbitPoint(body, E) {
  const { a, e } = body;
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (body.varpi - body.node) * DEG, O = body.node * DEG, i = body.i * DEG;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
    (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
    sw * si * xp + cw * si * yp,
  ];
}

/** IAU pole (equatorial RA/Dec) rotated into the ecliptic frame, with an equatorial basis. */
function spinFrame([ra, dec]) {
  const x = Math.cos(dec * DEG) * Math.cos(ra * DEG), ye = Math.cos(dec * DEG) * Math.sin(ra * DEG), ze = Math.sin(dec * DEG);
  const pole = [x, ye * Math.cos(OBLIQUITY) + ze * Math.sin(OBLIQUITY), -ye * Math.sin(OBLIQUITY) + ze * Math.cos(OBLIQUITY)];
  // First equatorial axis: the ascending node of the body's equator on the ecliptic.
  let e1 = [-pole[1], pole[0], 0];
  const length = Math.hypot(...e1) || 1;
  e1 = length < 1e-6 ? [1, 0, 0] : e1.map(v => v / length);
  const e2 = [pole[1] * e1[2] - pole[2] * e1[1], pole[2] * e1[0] - pole[0] * e1[2], pole[0] * e1[1] - pole[1] * e1[0]];
  return { pole, e1, e2 };
}

export function solar(state, seed) {
  const distanceRealism = clamp(number(state.solarDistance, .12), 0, 1);
  const sizeRealism = clamp(number(state.solarSize, .15), 0, 1);
  const elevation = clamp(number(state.solarElevation, 14), 3, 90) * DEG;
  const aligned = state.solarAligned !== false, paths = state.solarPaths !== false;
  const natural = state.solarNatural !== false, sunlight = state.solarLight !== false;
  const backdrop = state.solarBackdrop !== false;

  // Camera: azimuth puts the alignment ray right of the Sun and slightly towards
  // the viewer, as in the reference; low elevations push the Sun to the left.
  const azimuth = 20 * DEG, cA = Math.cos(azimuth), sA = Math.sin(azimuth);
  const cB = Math.cos(elevation), sB = Math.sin(elevation);
  const reach = 1.85 - .95 * sB * sB;
  const sunX = -.95 * cB * cB, sunY = .06 * cB;
  const view = ([X, Y, Z], tx = sunX, ty = sunY) => {
    const X1 = X * cA + Y * sA, Y1 = -X * sA + Y * cA;
    return [X1 + tx, Z * cB + Y1 * sB + ty, -Y1 * cB + Z * sB];
  };
  const viewDirection = v => view(v, 0, 0);

  // Semi-major axes blend, in log space, from even spacing (0) to true proportion (1).
  // Each orbit keeps its true eccentric shape, scaled about the Sun at its focus.
  const scaled = PLANETS.map((body, k) => {
    const even = .34 + .66 * k / (PLANETS.length - 1), truth = body.a / NEPTUNE_A;
    return reach * Math.exp((1 - distanceRealism) * Math.log(even) + distanceRealism * Math.log(truth)) / body.a;
  });
  // Radii follow a power law normalised to Jupiter; exponent 1 is true proportion.
  const exponent = .2 + .8 * sizeRealism;
  const size = radius => .074 * (radius / JUPITER_RADIUS) ** exponent;
  const mercury = PLANETS[0];
  const sunRadius = Math.min(size(BODIES[0].radius), .8 * mercury.a * (1 - mercury.e) * scaled[0]);

  // Mean anomaly at clock zero: J2000, or the anomaly giving true longitude 0
  // for every planet, so all bodies start on one ray as in the reference.
  const epoch = PLANETS.map(body => {
    if (!aligned) return (body.L - body.varpi) * DEG;
    const nu = -body.varpi * DEG;
    const E = 2 * Math.atan(Math.sqrt((1 - body.e) / (1 + body.e)) * Math.tan(nu / 2));
    return E - body.e * Math.sin(E);
  });

  const material = (item, body) => {
    if (natural) Object.assign(item, { tr: body.colour[0], tg: body.colour[1], tb: body.colour[2], ta: 1, sr: body.feature[0], sg: body.feature[1], sb: body.feature[2] });
    return item;
  };
  const bodies = BODIES.map((body, k) => {
    const item = sphere('solar', seed, k, 0, 0, 0, 0);
    item.id = `solar-${body.id}`;
    item.pin = true;
    item.frame = spinFrame(body.pole);
    return material(item, body);
  });
  const saturn = PLANETS.findIndex(body => body.id === 'saturn');
  const saturnRadius = size(PLANETS[saturn].radius);
  const particle = Math.max(.0042, saturnRadius * .12);
  const ring = [];
  RINGLETS.forEach((rho, k) => {
    const count = Math.round(clamp(TAU * rho * saturnRadius / (particle * 1.55), 24, 120));
    const rand = random(`${seed}/saturn-ring/${k}`);
    // Keplerian ring period in hours: T = 2π √(ρ³ / GM).
    const hours = TAU * Math.sqrt((rho * PLANETS[saturn].radius) ** 3 / SATURN_GM) / 3600;
    for (let j = 0; j < count; j++) {
      const item = sphere('solar', seed, 100 + ring.length, 0, 0, 0, 0);
      item.id = `solar-ring-${k}-${j}`;
      item.pin = true;
      Object.assign(item, { rho, angle: TAU * j / count + rand() * .02, hours, size: particle * (.85 + rand() * .3) });
      if (natural) Object.assign(item, { tr: RING_COLOUR[0], tg: RING_COLOUR[1], tb: RING_COLOUR[2], ta: 1, sr: .70, sg: .63, sb: .50 });
      ring.push(item);
    }
  });

  const pathSpheres = [], pathLinks = [];
  if (paths) {
    PLANETS.forEach((body, p) => {
      const samples = 180, first = pathSpheres.length;
      for (let j = 0; j < samples; j++) {
        const [x, y, z] = view(orbitPoint(body, TAU * j / samples).map(v => v * scaled[p]));
        pathSpheres.push({ id: `solar-path-${body.id}-${j}`, x, y, z, r: 0, palette: 0, offset: 0, phase: 0, tilt: 0, pin: true, _morphMarker: true });
        if (j) pathLinks.push([pathSpheres[first + j - 1].id, pathSpheres[first + j].id, 1]);
      }
      pathLinks.push([pathSpheres[first + samples - 1].id, pathSpheres[first].id, 1]);
    });
  }

  /** Point a sphere's surface cap along its rotating prime meridian. */
  const spin = (item, angle) => {
    const { e1, e2 } = item.frame, c = Math.cos(angle), s = Math.sin(angle);
    const [dx, dy, dz] = viewDirection([c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]]);
    item.phase = Math.acos(clamp(dz, -1, 1));
    item.tilt = Math.atan2(dy, dx);
  };
  const light = (item, sun) => {
    if (!sunlight) return;
    const lx = sun.x - item.x, ly = sun.y - item.y, lz = sun.z - item.z, length = Math.hypot(lx, ly, lz) || 1;
    Object.assign(item, { lx: lx / length, ly: ly / length, lz: lz / length, lw: 1 });
  };

  // clocks.orbit is in days; clocks.spin counts Earth sidereal days of rotation.
  const animate = (time, clocks = {}) => {
    const days = number(clocks.orbit, 0), turns = number(clocks.spin, 0);
    const [sx, sy, sz] = view([0, 0, 0]);
    const sun = { ...bodies[0], x: sx, y: sy, z: sz, r: sunRadius };
    spin(sun, TAU * turns * 23.9345 / BODIES[0].rotation);
    if (natural) sun.lw = 2.5;
    const spheres = [sun];
    PLANETS.forEach((body, p) => {
      const M = epoch[p] + TAU * days / (365.25 * body.a ** 1.5);
      const [x, y, z] = view(orbitPoint(body, solveKepler(M, body.e)).map(v => v * scaled[p]));
      const item = { ...bodies[p + 1], x, y, z, r: size(body.radius) };
      spin(item, TAU * turns * 23.9345 / body.rotation);
      light(item, sun);
      spheres.push(item);
    });
    const host = spheres[saturn + 1], { e1, e2 } = host.frame;
    for (const particleItem of ring) {
      const angle = particleItem.angle + TAU * turns * 23.9345 / particleItem.hours;
      const c = Math.cos(angle) * particleItem.rho * saturnRadius, s = Math.sin(angle) * particleItem.rho * saturnRadius;
      const [dx, dy, dz] = viewDirection([c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]]);
      const item = { ...particleItem, x: host.x + dx, y: host.y + dy, z: host.z + dz, r: particleItem.size, frame: host.frame };
      spin(item, angle);
      light(item, sun);
      spheres.push(item);
    }
    return { spheres: spheres.concat(pathSpheres), links: pathLinks };
  };

  return {
    ...animate(0),
    animate,
    clockRates: { orbit: clamp(number(state.solarDays, 12), 0, 400), spin: clamp(number(state.solarSpin, .5), 0, 4) },
    scene: backdrop
      ? { background: [.012, .012, .016], lineColor: [.80, .74, .64, .30], dark: true }
      : { lineColor: [.40, .41, .44, .30] },
  };
}
