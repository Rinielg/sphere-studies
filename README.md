# Sphere Studies

A reconstructed browser-based parametric generative graphics editor.

## Use

- Select an icon in the bottom dock to choose connected clusters, concentric rings, a 3D wave loop, a scattered cloud, a square grid, a compass ring, or a DNA helix.
- The DNA helix winds two strands around a tilted axis, with rungs joining each base pair and optional backbone lines. Spheres travel slowly along the strand and shrink to nothing at the ends before re-entering, so the wrap is never visible. Adjust base pairs, turns, flow, spin, groove angle and axis tilt.
- The wave loop is a closed 3D curve: spheres flow along it while a travelling wave moves it towards and away from the camera, and the loop sways. Adjust wave depth, density, waves per loop and flow.
- While playing, formations respond immediately with exponential easing matched to the supplied Sphere Field Studio reference. They reach about 90% of the new arrangement in 0.4 seconds and 95% in 0.5 seconds, completing the subtle settling tail at 0.85 seconds. Existing balls travel to nearby positions, extra balls grow from the current arrangement, and surplus balls merge and shrink. Repeated selections restart from the displayed arrangement without jumping. Timing stays consistent across display refresh rates.
- Adjust the formation-specific sliders, then choose Wind, Ripple, Sweep, Around, or Flicker independently.
- Formation drift controls positional movement, including flow along the helix and loop. Sphere surfaces continue to animate when drift is disabled.
- Wave speed controls time, Wave spread controls spatial phase, and Lift controls displacement. Flicker hides these sliders and uses independent smooth phases.
- Randomize creates a fresh deterministic seed for geometry and material variation while retaining selected parameters. Fixed formations such as the grid retain their geometry.
- Pause freezes surfaces and formation motion. Save image exports the artwork as PNG. Controls can be hidden or sections collapsed.
- Use keys 1–7 to select formations and Space to pause/play while focus is on the stage. Sliders and buttons also support normal keyboard navigation.
- Browsers requesting reduced motion start paused. Your selected settings persist in browser-local storage.

## Rendering and reconstruction choices

The renderer draws analytic circular sphere sprites in WebGL. A rotating hemisphere mask softly feathers a blue/cyan or violet/pink gradient into a persistent pale-grey material, with a luminous pastel transition band. Soft shading and rim brightness are calculated per fragment. Spheres are ray-cast impostors under a pinhole camera. Where the browser supports `EXT_frag_depth` (almost all), each pixel writes its true surface depth, so overlapping spheres intersect along a continuous curve instead of swapping draw order when their centres cross, and connector lines pass correctly behind or in front of spheres. Without the extension the renderer falls back to sorting discs by centre depth. The wave loop fits a three-harmonic Fourier series to sixteen measured contours from the reference and samples it by arc length, so spheres stay evenly spaced as they travel. Loop settings reset once when loading this 3D layout, then persist normally. Layout generation, motion fields, rendering, formation morphs, and controls are separate modules.

The source video does not establish exact algorithms, ranges, Wind behaviour, or isolated Lift/Randomize effects. This editor makes deliberate choices: Wind is a coherent directional field; Lift scales displacement while drift is enabled; Randomize changes the seed. Slider ranges are chosen for useful exploration. This is a visual and behavioural reconstruction, not recovered original source.

## Source

- `dist/formations.js` — deterministic procedural geometry and motion fields.
- `dist/renderer.js` — shared analytic sphere material and fine connector lines.
- `dist/morphs.js` — sphere matching, continuous geometry/material interpolation, population changes, and connection fades.
- `dist/app.js` — state, parameter controls, playback, transitions, and export.
- `dist/index.html` and `dist/styles.css` — responsive interface.
