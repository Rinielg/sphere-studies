# Sphere Studies

A reconstructed browser-based parametric generative graphics editor.

## Use

- Select an icon in the bottom dock to choose connected clusters, concentric rings, a 3D wave loop, a scattered cloud, a square grid, a compass ring, a DNA helix, the solar system, or a cosmos flower.
- The DNA helix winds two strands around a tilted axis, with rungs joining each base pair and optional backbone lines. Spheres travel slowly along the strand and shrink to nothing at the ends before re-entering, so the wrap is never visible. Adjust base pairs, turns, flow, spin, groove angle and axis tilt.
- The solar system places the Sun and eight planets on their real orbits and spins each body at its real rotation rate. Adjust days per second, rotation speed, distance and size realism, and camera elevation. Toggle a start in alignment (as in the reference image) or at J2000 positions, orbit paths, natural colour, sunlight and the space backdrop.
- The cosmos flower is built from petal, disc, stamen, bract and stem spheres. The stem sways in the wind and the petals flutter along their own surfaces. Adjust petal count, detail, bloom, stem sway, petal flutter, breeze speed and viewing angle.
- The wave loop is a closed 3D curve: spheres flow along it while a travelling wave moves it towards and away from the camera, and the loop sways. Adjust wave depth, density, waves per loop and flow.
- While playing, formations respond immediately with exponential easing matched to the supplied Sphere Field Studio reference. They reach about 90% of the new arrangement in 0.4 seconds and 95% in 0.5 seconds, completing the subtle settling tail at 0.85 seconds. Existing balls travel to nearby positions, extra balls grow from the current arrangement, and surplus balls merge and shrink. Repeated selections restart from the displayed arrangement without jumping. Timing stays consistent across display refresh rates.
- Adjust the formation-specific sliders, then choose Wind, Ripple, Sweep, Around, or Flicker independently.
- Formation drift controls positional movement, including flow along the helix and loop. Sphere surfaces continue to animate when drift is disabled.
- Wave speed controls time, Wave spread controls spatial phase, and Lift controls displacement. Flicker hides these sliders and uses independent smooth phases.
- Randomize creates a fresh deterministic seed for geometry and material variation while retaining selected parameters. Fixed formations such as the grid retain their geometry.
- Pause freezes surfaces and formation motion. Save image exports the artwork as PNG. Controls can be hidden or sections collapsed.
- Use keys 1–9 to select formations and Space to pause/play while focus is on the stage. Sliders and buttons also support normal keyboard navigation.
- Browsers requesting reduced motion start paused. Your selected settings persist in browser-local storage.

## Rendering and reconstruction choices

The renderer draws analytic circular sphere sprites in WebGL. A rotating hemisphere mask softly feathers a blue/cyan or violet/pink gradient into a persistent pale-grey material, with a luminous pastel transition band. Soft shading and rim brightness are calculated per fragment. Spheres are ray-cast impostors under a pinhole camera. Where the browser supports `EXT_frag_depth` (almost all), each pixel writes its true surface depth, so overlapping spheres intersect along a continuous curve instead of swapping draw order when their centres cross, and connector lines pass correctly behind or in front of spheres. Without the extension the renderer falls back to sorting discs by centre depth. The wave loop fits a three-harmonic Fourier series to sixteen measured contours from the reference and samples it by arc length, so spheres stay evenly spaced as they travel. Loop settings reset once when loading this 3D layout, then persist normally. Layout generation, motion fields, rendering, formation morphs, and controls are separate modules.

The source video does not establish exact algorithms, ranges, Wind behaviour, or isolated Lift/Randomize effects. This editor makes deliberate choices: Wind is a coherent directional field; Lift scales displacement while drift is enabled; Randomize changes the seed. Slider ranges are chosen for useful exploration. This is a visual and behavioural reconstruction, not recovered original source.

## Solar system model

- **Orbits.** J2000 Keplerian elements (Standish, JPL *Keplerian Elements for Approximate Positions*). Mean anomaly advances at n = 2π / P with P = a^1.5 years (Kepler's third law). Kepler's equation M = E − e sin E is solved by Newton–Raphson. Positions are rotated by ω, i and Ω into the ecliptic. Each planet keeps its true eccentricity, inclination and relative orbital speed. Mercury completes about 4.15 orbits for each one Earth completes.
- **Aligned start.** Each planet's initial anomaly is solved so that its true longitude is zero, which puts every planet on one ray. They then separate at their real relative speeds.
- **Rotation.** Each body spins about its IAU WGCCRE pole at its signed sidereal period, so Venus and Uranus rotate retrograde and Uranus rolls on its side. The rotating surface cap shows the spin.
- **Saturn's rings.** Particles sit at the C, B and A ring radii, with the Cassini division between B and A. They lie in Saturn's equatorial plane and orbit at Keplerian periods T = 2π√(ρ³/GM). The ring opening angle changes with Saturn's position along its orbit.
- **Scale.** Real distances span about 0.4–30 AU and real radii span 2,440–695,700 km, so the display compresses both. Distance realism blends each semi-major axis in log space from even spacing (0) to true proportion (1); orbit shapes are scaled about the Sun at their focus, which keeps them exact. Size realism sets the power-law exponent on radii, normalised to Jupiter; 1 is true proportion. The Sun is capped so it never covers Mercury's perihelion.
- **Light.** Planets are lit from the Sun's position, with a wrapped terminator. The Sun uses linear limb darkening I(μ) = 1 − 0.6(1 − μ). Natural colours are approximations.

## Flower model

- **Petals.** Each ray floret is an obovate outline with a narrow base and a broad, shallow-toothed tip, filled with evenly spaced spheres. Along its length the petal follows a circular arc whose bend angle falls linearly from base to tip; Bloom sets the base angle and the tip droop. Lateral cupping, pleats, a small per-petal twist and alternating layers are offsets along the petal normal.
- **Disc and stamens.** Disc florets follow Vogel's phyllotaxis, r = R√(k/n) and θ = k × 137.508°, over a low dome. Anthers sit above the disc on the same spiral.
- **Stem.** A cubic Bézier sampled by arc length, with eight bracts below the head.
- **Motion.** Wind is three incommensurate sinusoids per axis. The stem deflects with the cantilever mode shape φ(σ) = σ²(3 − σ)/2, and the head follows the tip's displacement and slope. Each petal flutters with a wave travelling from base to tip along its own normal, amplitude ∝ u². The wave's phase steps around the flower, so all movement follows the petal shapes. The bloom breathes slowly.

## Source

- `dist/formations.js` — deterministic procedural geometry and motion fields.
- `dist/solar.js` and `dist/flower.js` — the solar system and cosmos flower formations.
- `dist/common.js` — shared seeded random, sphere identity and helper functions.
- `dist/renderer.js` — shared analytic sphere material, optional natural colour and lighting, backdrops, and fine connector lines.
- `dist/morphs.js` — sphere matching, continuous geometry/material interpolation, population changes, and connection fades.
- `dist/app.js` — state, parameter controls, playback, transitions, and export.
- `dist/index.html` and `dist/styles.css` — responsive interface.
