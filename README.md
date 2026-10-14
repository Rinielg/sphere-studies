# Sphere Studies

A browser-based parametric generative graphics editor reconstructed from the supplied storyboard and replication brief. No build step or third-party runtime dependencies.

## Run locally

From this directory:

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. WebGL must be available in your browser.

## Use

- Select an icon in the bottom dock to choose connected clusters, concentric rings, a wave loop, a scattered cloud, a square grid, or a compass ring.
- While playing, formations respond immediately with exponential easing matched to the supplied Sphere Field Studio reference. They reach about 90% of the new arrangement in 0.4 seconds and 95% in 0.5 seconds, completing the subtle settling tail at 0.85 seconds. Existing balls travel to nearby positions, extra balls grow from the current arrangement, and surplus balls merge and shrink. Repeated selections restart from the displayed arrangement without jumping. Timing stays consistent across display refresh rates.
- Adjust the formation-specific sliders, then choose Wind, Ripple, Sweep, Around, or Flicker independently.
- Formation drift controls positional movement. Sphere surfaces continue to animate when drift is disabled.
- Wave speed controls time, Wave spread controls spatial phase, and Lift controls displacement. Flicker hides these sliders and uses independent smooth phases.
- Randomize creates a fresh deterministic seed for geometry and material variation while retaining selected parameters. Fixed formations such as the grid retain their geometry.
- Pause freezes surfaces and formation motion. Save image exports the artwork as PNG. Controls can be hidden or sections collapsed.
- Use keys 1–6 to select formations and Space to pause/play while focus is on the stage. Sliders and buttons also support normal keyboard navigation.
- Browsers requesting reduced motion start paused. Your selected settings persist in browser-local storage.

## Rendering and reconstruction choices

The renderer draws analytic circular sphere sprites in WebGL. A rotating hemisphere mask softly feathers a blue/cyan or violet/pink gradient into a persistent pale-grey material, with a luminous pastel transition band. Soft shading and rim brightness are calculated per fragment. The default wave loop uses sixteen measured circular contours from the reference: ten along an asymmetric arc, and six overlapping in a fold on the right. Sphere radii and overlap order follow the image. Other densities resample this path; wave height changes its depth and deformation. Legacy loop density/height settings reset once when loading this revised layout, then new settings persist normally. Layout generation, motion fields, rendering, formation morphs, and controls are separate modules.

The source video does not establish exact algorithms, ranges, Wind behaviour, or isolated Lift/Randomize effects. This editor makes deliberate choices: Wind is a coherent directional field; Lift scales displacement while drift is enabled; Randomize changes the seed. Slider ranges are chosen for useful exploration. This is a visual and behavioural reconstruction, not recovered original source.

## Source

- `dist/formations.js` — deterministic procedural geometry and motion fields.
- `dist/renderer.js` — shared analytic sphere material and fine connector lines.
- `dist/morphs.js` — sphere matching, continuous geometry/material interpolation, population changes, and connection fades.
- `dist/app.js` — state, parameter controls, playback, transitions, and export.
- `dist/index.html` and `dist/styles.css` — responsive interface.
