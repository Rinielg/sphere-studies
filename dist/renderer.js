const sphereVertex = `
precision highp float;
attribute vec4 a_sphere;
attribute vec3 a_material;
attribute vec2 a_corner;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_scale;
uniform float u_reveal;
varying vec2 v_uv;
varying vec3 v_material;
varying float v_size;
void main() {
  float perspective = 1.0 + a_sphere.z * .12;
  float radius = a_sphere.w * u_scale * perspective * u_reveal;
  vec2 center = u_origin + vec2(a_sphere.x, -a_sphere.y) * u_scale;
  vec2 pixel = center + vec2(a_corner.x, -a_corner.y) * radius;
  gl_Position = vec4(pixel / u_resolution * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  v_uv = a_corner;
  v_material = a_material;
  v_size = radius;
}`;

const sphereFragment = `
precision highp float;
varying vec2 v_uv;
varying vec3 v_material;
varying float v_size;
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
  float aa = 1.5 / max(v_size, 1.);
  float alpha = 1. - smoothstep(1. - aa, 1., radial);
  gl_FragColor = vec4(surface, alpha);
}`;

const lineVertex = `
precision highp float;
attribute vec2 a_position;
attribute float a_opacity;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_scale;
varying float v_opacity;
void main() {
  vec2 p = u_origin + a_position * vec2(1., -1.) * u_scale;
  gl_Position = vec4(p / u_resolution * vec2(2., -2.) + vec2(-1., 1.), 0., 1.);
  v_opacity = a_opacity;
}`;
const lineFragment = `precision mediump float; varying float v_opacity; void main() { gl_FragColor = vec4(.46, .47, .49, .26 * v_opacity); }`;

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
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('This study needs WebGL. Enable graphics acceleration in your browser and reload.');
    const gl = this.gl;
    this.sphereProgram = program(gl, sphereVertex, sphereFragment);
    this.lineProgram = program(gl, lineVertex, lineFragment);
    this.sphereBuffer = gl.createBuffer();
    this.lineBuffer = gl.createBuffer();
    this.attributes = Object.fromEntries(['a_sphere', 'a_material', 'a_corner'].map(n => [n, gl.getAttribLocation(this.sphereProgram, n)]));
    this.lineAttribute = gl.getAttribLocation(this.lineProgram, 'a_position');
    this.lineOpacityAttribute = gl.getAttribLocation(this.lineProgram, 'a_opacity');
    this.uniforms = new Map();
    for (const p of [this.sphereProgram, this.lineProgram]) {
      this.uniforms.set(p, Object.fromEntries(['u_resolution', 'u_origin', 'u_scale', 'u_reveal'].map(n => [n, gl.getUniformLocation(p, n)])));
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
  }

  draw(spheres, links, reveal = 1) {
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (links.length) {
      this.bindScene(this.lineProgram);
      const points = new Map(spheres.map(s => [s.id, s]));
      const lines = [];
      for (const [a, b, opacity = 1] of links) {
        const p = points.get(a), q = points.get(b);
        if (p && q) lines.push(p.x, p.y, opacity, q.x, q.y, opacity);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lineAttribute);
      gl.vertexAttribPointer(this.lineAttribute, 2, gl.FLOAT, false, 12, 0);
      gl.enableVertexAttribArray(this.lineOpacityAttribute);
      gl.vertexAttribPointer(this.lineOpacityAttribute, 1, gl.FLOAT, false, 12, 8);
      gl.drawArrays(gl.LINES, 0, lines.length / 3);
      gl.disableVertexAttribArray(this.lineAttribute);
      gl.disableVertexAttribArray(this.lineOpacityAttribute);
    }
    this.bindScene(this.sphereProgram, reveal);
    const corners = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    const data = new Float32Array(spheres.length * 6 * 9);
    let index = 0;
    const sorted = spheres.slice().sort((a, b) => a.z - b.z);
    for (const s of sorted) {
      for (let corner = 0; corner < 6; corner++) {
        data.set([s.x, s.y, s.z, s.r, s.phase, s.tilt, s.palette, corners[corner * 2], corners[corner * 2 + 1]], index);
        index += 9;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sphereBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    for (const [name, size, offset] of [['a_sphere', 4, 0], ['a_material', 3, 16], ['a_corner', 2, 28]]) {
      const loc = this.attributes[name];
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset);
    }
    gl.drawArrays(gl.TRIANGLES, 0, spheres.length * 6);
    Object.values(this.attributes).forEach(loc => gl.disableVertexAttribArray(loc));
  }
}
