const sphereVertex = `
precision highp float;
attribute vec4 a_sphere;
attribute vec3 a_material;
attribute vec2 a_corner;
attribute vec4 a_tint;
attribute vec3 a_tint2;
attribute vec4 a_light;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_reveal;
uniform float u_lens;
uniform float u_mode;
varying vec2 v_uv;
varying vec3 v_material;
varying float v_size;
varying float v_z;
varying float v_r;
varying vec4 v_tint;
varying vec3 v_tint2;
varying vec4 v_light;
void main() {
  // Depth mode projects centres through a pinhole camera; the legacy mode only scales radii.
  float projection = u_mode > .5 ? u_lens / (u_lens - a_sphere.z) : 1.;
  float perspective = u_mode > .5 ? projection : 1.0 + a_sphere.z * .12;
  float radius = a_sphere.w * u_scale * perspective * u_reveal;
  vec2 center = u_origin + vec2(a_sphere.x, -a_sphere.y) * u_scale * projection;
  // One extra pixel keeps the antialiased rim inside the quad.
  float extent = radius + 1.;
  vec2 pixel = center + vec2(a_corner.x, -a_corner.y) * extent;
  gl_Position = vec4(pixel / u_resolution * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  v_uv = a_corner * extent / max(radius, 1e-4);
  v_material = a_material;
  v_size = radius;
  v_z = a_sphere.z;
  v_r = a_sphere.w * u_reveal;
  v_tint = a_tint;
  v_tint2 = a_tint2;
  v_light = a_light;
}`;

// Each quad ray-casts a sphere. With EXT_frag_depth it writes the surface's true
// depth, so overlapping spheres intersect along a continuous curve instead of
// swapping draw order when their centres cross.
const sphereFragment = `
precision highp float;
varying vec2 v_uv;
varying vec3 v_material;
varying float v_size;
varying float v_z;
varying float v_r;
varying vec4 v_tint;
varying vec3 v_tint2;
varying vec4 v_light;
uniform float u_depthScale;
void main() {
  float rr = dot(v_uv, v_uv);
  if (rr > 1.) discard;
  float radial = sqrt(rr);
  vec3 n = vec3(v_uv, sqrt(max(0., 1. - rr)));
  float phase = v_material.x;
  float tilt = v_material.y;
  vec3 direction = vec3(sin(phase) * cos(tilt), sin(phase) * sin(tilt), cos(phase));
  float boundary = dot(n, direction) - .10;
  // A broad surface blend keeps the grey face solid and softly rolls colour
  // into it, rather than clipping the cap at a hard hemisphere boundary.
  float mask = smoothstep(-.16, .24, boundary);
  float palette = smoothstep(.25, .75, v_material.z);
  vec3 blue = vec3(.23, .39, .98);
  vec3 violet = vec3(.66, .43, .88);
  vec3 cyan = vec3(.49, .86, 1.0);
  vec3 pink = vec3(.99, .55, .98);
  float gradient = clamp((mix(.29, .54, palette) - n.y * .61 - n.x * .14), 0., 1.);
  vec3 upper = mix(blue, violet, palette);
  vec3 lower = mix(cyan, pink, palette);
  vec3 color = mix(upper, lower, pow(gradient, 1.30));
  vec2 hotspot = v_uv - vec2(-.04, .24);
  float glow = exp(-dot(hotspot, hotspot) * 5.2);
  color = mix(color, mix(vec3(.37, .28, .90), vec3(.59, .42, .91), palette), glow * .30);
  float bloom = pow(radial, 5.0) * (.22 + .35 * (1. - smoothstep(-.7, .55, n.y)));
  color = mix(color, mix(vec3(.91, .97, 1.), vec3(1., .84, .98), palette), bloom);
  float light = .97 + .045 * dot(n, normalize(vec3(-.35, .5, 1.)));
  color *= light;
  float feather = exp(-boundary * boundary / .022);
  vec3 featherColor = mix(vec3(.87, .75, 1.), vec3(1., .79, .97), palette);
  color = mix(color, featherColor, feather * .58);
  vec3 grey = vec3(.918) + .006 * n.y - .004 * radial;
  vec3 surface = mix(grey, color, mask);
  // Natural colour: the same rotating cap selects a secondary surface colour,
  // so spin and surface features stay visible without the studio gradient.
  vec3 natural = mix(v_tint.rgb, v_tint2, smoothstep(-.08, .16, boundary));
  natural *= .95 + .07 * n.z;
  surface = mix(surface, natural, v_tint.a);
  if (v_light.w > 1.5) {
    // Emissive photosphere with linear limb darkening, I(mu) = 1 - u(1 - mu), u = 0.6.
    surface *= mix(1., .4 + .6 * n.z, v_light.w - 1.5);
  } else if (v_light.w > .05 && dot(v_light.xyz, v_light.xyz) > 1e-6) {
    // Directional light with a wrapped terminator and a faint specular sheen.
    vec3 l = normalize(v_light.xyz);
    float d = dot(n, l);
    float diffuse = clamp((d + .18) / 1.18, 0., 1.);
    float sheen = pow(max(dot(reflect(-l, n), vec3(0., 0., 1.)), 0.), 22.) * .12;
    surface = mix(surface, surface * (.16 + .84 * diffuse) + sheen, min(v_light.w, 1.));
  }
  float aa = 1.5 / max(v_size, 1.);
  float alpha = 1. - smoothstep(1. - aa, 1., radial);
#ifdef DEPTH
  gl_FragDepthEXT = clamp(.5 - (v_z + v_r * n.z) * u_depthScale, 0., 1.);
#endif
  gl_FragColor = vec4(surface, alpha);
}`;

const lineVertex = `
precision highp float;
attribute vec3 a_position;
attribute float a_opacity;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_lens;
uniform float u_mode;
uniform float u_depthScale;
varying float v_opacity;
void main() {
  float projection = u_mode > .5 ? u_lens / (u_lens - a_position.z) : 1.;
  vec2 p = u_origin + a_position.xy * vec2(1., -1.) * u_scale * projection;
  // Same depth mapping as the sphere surfaces, so lines pass behind or in front correctly.
  float depth = u_mode > .5 ? -2. * a_position.z * u_depthScale : 0.;
  gl_Position = vec4(p / u_resolution * vec2(2., -2.) + vec2(-1., 1.), depth, 1.);
  v_opacity = a_opacity;
}`;
const lineFragment = `precision mediump float; varying float v_opacity; uniform vec4 u_lineColor; void main() { gl_FragColor = vec4(u_lineColor.rgb, u_lineColor.a * v_opacity); }`;
const DEFAULT_LINE = [.46, .47, .49, .26];
const DEFAULT_BACKGROUND = [241 / 255, 241 / 255, 241 / 255];

// Camera distance in scene units, and the factor mapping scene z (±2.5) into the depth buffer.
const CAMERA_DISTANCE = 5;
const DEPTH_SCALE = .18;

function program(gl, vertex, fragment) {
  const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, i ? fragment : vertex);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  });
  const result = gl.createProgram();
  shaders.forEach(s => gl.attachShader(result, s));
  gl.linkProgram(result);
  if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
  shaders.forEach(s => gl.deleteShader(s));
  return result;
}

export class SphereRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: true, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('This study needs WebGL. Enable graphics acceleration in your browser and reload.');
    const gl = this.gl;
    // Without per-pixel depth the renderer falls back to sorting flat discs by centre.
    this.depthCorrect = Boolean(gl.getExtension('EXT_frag_depth'));
    const fragment = this.depthCorrect ? `#extension GL_EXT_frag_depth : enable\n#define DEPTH\n${sphereFragment}` : sphereFragment;
    this.sphereProgram = program(gl, sphereVertex, fragment);
    this.lineProgram = program(gl, lineVertex, lineFragment);
    this.sphereBuffer = gl.createBuffer();
    this.lineBuffer = gl.createBuffer();
    this.attributes = Object.fromEntries(['a_sphere', 'a_material', 'a_corner', 'a_tint', 'a_tint2', 'a_light'].map(n => [n, gl.getAttribLocation(this.sphereProgram, n)]));
    this.lineAttribute = gl.getAttribLocation(this.lineProgram, 'a_position');
    this.lineOpacityAttribute = gl.getAttribLocation(this.lineProgram, 'a_opacity');
    this.uniforms = new Map();
    for (const p of [this.sphereProgram, this.lineProgram]) {
      this.uniforms.set(p, Object.fromEntries(['u_resolution', 'u_origin', 'u_scale', 'u_reveal', 'u_lens', 'u_mode', 'u_depthScale', 'u_lineColor'].map(n => [n, gl.getUniformLocation(p, n)])));
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(241 / 255, 241 / 255, 241 / 255, 1);
    this.resize();
  }

  resize() {
    this.width = this.canvas.clientWidth || innerWidth;
    this.height = this.canvas.clientHeight || innerHeight;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const mobile = this.width < 650;
    this.origin = [(mobile ? .5 : .44) * this.canvas.width, (mobile ? .59 : .52) * this.canvas.height];
    this.scale = Math.min(this.width * (mobile ? .39 : .285), this.height * (mobile ? .235 : .34)) * this.dpr;
  }

  bindScene(p, reveal = 1) {
    const gl = this.gl, u = this.uniforms.get(p);
    gl.useProgram(p);
    gl.uniform2f(u.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.u_origin, ...this.origin);
    gl.uniform1f(u.u_scale, this.scale);
    if (u.u_reveal) gl.uniform1f(u.u_reveal, reveal);
    gl.uniform1f(u.u_lens, CAMERA_DISTANCE);
    gl.uniform1f(u.u_mode, this.depthCorrect ? 1 : 0);
    if (u.u_depthScale) gl.uniform1f(u.u_depthScale, DEPTH_SCALE);
  }

  drawLines(spheres, links, color = DEFAULT_LINE) {
    if (!links.length) return;
    const gl = this.gl;
    this.bindScene(this.lineProgram);
    gl.uniform4f(this.uniforms.get(this.lineProgram).u_lineColor, ...color);
    const points = new Map(spheres.map(s => [s.id, s]));
    const lines = [];
    for (const [a, b, opacity = 1] of links) {
      const p = points.get(a), q = points.get(b);
      if (p && q && opacity > .005) lines.push(p.x, p.y, p.z || 0, opacity, q.x, q.y, q.z || 0, opacity);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.lineAttribute);
    gl.vertexAttribPointer(this.lineAttribute, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.lineOpacityAttribute);
    gl.vertexAttribPointer(this.lineOpacityAttribute, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.LINES, 0, lines.length / 4);
    gl.disableVertexAttribArray(this.lineAttribute);
    gl.disableVertexAttribArray(this.lineOpacityAttribute);
  }

  drawSpheres(spheres, reveal) {
    const gl = this.gl;
    this.bindScene(this.sphereProgram, reveal);
    const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    // Back-to-front order still matters for the translucent antialiased rims.
    const sorted = spheres.filter(s => s.r > .0005).sort((a, b) => a.z - b.z);
    const stride = 20, data = new Float32Array(sorted.length * 6 * stride);
    const f = v => Number.isFinite(v) ? v : 0;
    let index = 0;
    for (const s of sorted) {
      // Optional natural colour (tr..ta, sr..sb) and lighting (lx..lw) fields default to off.
      const extra = [f(s.tr), f(s.tg), f(s.tb), f(s.ta), f(s.sr), f(s.sg), f(s.sb), f(s.lx), f(s.ly), f(s.lz), f(s.lw)];
      for (let corner = 0; corner < 6; corner++) {
        data.set([s.x, s.y, s.z, s.r, s.phase, s.tilt, s.palette, corners[corner * 2], corners[corner * 2 + 1], ...extra], index);
        index += stride;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    for (const [name, size, offset] of [['a_sphere', 4, 0], ['a_material', 3, 16], ['a_corner', 2, 28], ['a_tint', 4, 36], ['a_tint2', 3, 52], ['a_light', 4, 64]]) {
      const loc = this.attributes[name];
      if (loc < 0) continue;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset);
    }
    gl.drawArrays(gl.TRIANGLES, 0, sorted.length * 6);
    Object.values(this.attributes).forEach(loc => loc >= 0 && gl.disableVertexAttribArray(loc));
  }

  /** options.background is linear RGB 0–1; options.lineColor is RGBA. */
  draw(spheres, links, reveal = 1, options = {}) {
    const gl = this.gl;
    gl.clearColor(...(options.background || DEFAULT_BACKGROUND), 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.depthCorrect) {
      // Spheres write depth first; lines are then depth-tested without writing.
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      this.drawSpheres(spheres, reveal);
      gl.depthMask(false);
      this.drawLines(spheres, links, options.lineColor);
      gl.depthMask(true);
    } else {
      gl.disable(gl.DEPTH_TEST);
      this.drawLines(spheres, links, options.lineColor);
      this.drawSpheres(spheres, reveal);
    }
  }
}
