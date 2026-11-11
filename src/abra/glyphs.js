// The whole page is drawn with one thing: letters. This file bakes the handwriting
// font into a texture atlas and draws tens of thousands of glyph instances in a single
// WebGL2 call per pass, on top of a notebook-paper background shader.
import hebUrl from './fonts/playpen-hebrew-700.woff2';
import latUrl from './fonts/playpen-latin-700.woff2';
import printUrl from './fonts/fredoka-hebrew-600.woff2';

export const HEB = 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PUNCT = '.,!?:-';
// Hand-drawn marks, painted by code rather than taken from the font.
const DRAWN = '●○♥★♪❘✦';
export const CHARS = HEB + LATIN + PUNCT + DRAWN;

const CELL = 128;          // atlas cell, px
const EM = 92;             // font size inside a cell
const BASE = 0.66;         // baseline, as a fraction of the cell
const COLS = 12;
export const QUAD = CELL / EM;                 // quad side per unit of glyph size
export const BASELINE_DROP = (BASE - 0.5) * QUAD; // baseline sits this far (× size) under a glyph's centre

const index = new Map();
[...CHARS].forEach((ch, i) => index.set(ch, i));
export const glyphOf = (ch) => index.get(ch) ?? index.get('●');
export const hasGlyph = (ch) => index.has(ch);
export const advance = new Float32Array(CHARS.length); // advance width per unit of size

export async function loadFonts(timeout = 5000) {
  if (typeof FontFace === 'undefined') return false;
  const faces = [
    new FontFace('AbraHand', `url(${hebUrl}) format('woff2')`, { weight: '700' }),
    new FontFace('AbraHand', `url(${latUrl}) format('woff2')`, { weight: '700', unicodeRange: 'U+0000-00FF' }),
    new FontFace('AbraPrint', `url(${printUrl}) format('woff2')`, { weight: '600' }),
  ];
  const all = Promise.all(faces.map((f) => f.load().then((l) => document.fonts.add(l))));
  const late = new Promise((done) => setTimeout(() => done('late'), timeout));
  try { return (await Promise.race([all, late])) !== 'late'; } catch { return false; }
}

function drawMark(ctx, ch, cx, cy) {
  const r = EM * 0.3;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ch === '●') { ctx.arc(0, 0, r * 0.82, 0, 7); ctx.fill(); }
  else if (ch === '○') { ctx.lineWidth = r * 0.42; ctx.arc(0, 0, r * 0.78, 0, 7); ctx.stroke(); }
  else if (ch === '♥') {
    const s = r * 1.15;
    ctx.moveTo(0, s * 0.95);
    ctx.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.75, -s * 1.15, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.75, -s * 1.15, s * 1.5, -s * 0.1, 0, s * 0.95);
    ctx.fill();
  } else if (ch === '★') {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.5 : r * 1.15;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  } else if (ch === '♪') {
    ctx.ellipse(-r * 0.35, r * 0.75, r * 0.5, r * 0.36, -0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.lineWidth = r * 0.26;
    ctx.moveTo(r * 0.1, r * 0.7); ctx.lineTo(r * 0.1, -r * 1.0); ctx.quadraticCurveTo(r * 0.7, -r * 0.8, r * 0.75, -r * 0.2); ctx.stroke();
  } else if (ch === '❘') { ctx.lineWidth = r * 0.5; ctx.moveTo(-r * 0.06, -r * 0.95); ctx.quadraticCurveTo(r * 0.12, 0, -r * 0.04, r * 0.95); ctx.stroke(); }
  else if (ch === '✦') {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.3 : r * 1.2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function buildAtlas() {
  const rows = Math.ceil(CHARS.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * CELL; canvas.height = rows * CELL;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${EM}px AbraHand, "Arial Hebrew", "Noto Sans Hebrew", Arial, sans-serif`;
  [...CHARS].forEach((ch, i) => {
    const cx = (i % COLS) * CELL + CELL / 2, top = Math.floor(i / COLS) * CELL;
    if (DRAWN.includes(ch)) { drawMark(ctx, ch, cx, top + CELL / 2); advance[i] = 0.75; return; }
    // Fit unusually wide glyphs into the cell instead of letting them bleed into a neighbour.
    const w = ctx.measureText(ch).width;
    advance[i] = w / EM;
    const squeeze = Math.min(1, (CELL - 10) / Math.max(1, w));
    ctx.save(); ctx.translate(cx, top + CELL * BASE); ctx.scale(squeeze, 1); ctx.fillText(ch, 0, 0); ctx.restore();
  });
  return { canvas, cols: COLS, rows };
}

// ---------- WebGL ----------
const BG_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.,-1.), vec2(3.,-1.), vec2(-1.,3.));
out vec2 v_p;
void main(){ v_p = P[gl_VertexID]; gl_Position = vec4(v_p, 0., 1.); }`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 v_p; out vec4 o;
uniform vec2 u_res;        // css px
uniform float u_dpr, u_time, u_night, u_dusk;
uniform float u_rule;      // spacing of ruled lines, css px
uniform float u_ruleFrom;  // lines exist below this y (css px); above is blank drawing paper
uniform float u_ruleAll;   // 0..1: rule the whole page (intro, story)
uniform float u_margin;    // x of the margin line
uniform vec3 u_sun;        // x, y, strength
uniform vec3 u_moon;
uniform float u_flash, u_warm, u_sky;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 px = vec2(v_p.x * .5 + .5, .5 - v_p.y * .5) * u_res;
  float y01 = px.y / u_res.y;
  vec3 day = mix(vec3(.972,.965,.925), vec3(.992,.984,.953), y01);
  vec3 dusk = mix(vec3(.99,.80,.66), vec3(.99,.92,.80), smoothstep(0., .8, y01));
  vec3 night = mix(vec3(.055,.07,.17), vec3(.10,.13,.27), y01);
  vec3 c = mix(day, dusk, u_dusk);
  c = mix(c, night, u_night);
  c = mix(c, vec3(.80,.90,.985), u_sky * (1. - u_night) * (1. - u_dusk) * smoothstep(.95, .1, y01));
  c += vec3(.05,.025,-.02) * u_warm;
  // paper tooth: fine grain plus slow blotches
  float g = h21(floor(px * u_dpr)) - .5;
  float b = vn(px * .012) - .5;
  c += g * .022 + b * .018;
  // sun and moon halos
  float ds = distance(px, u_sun.xy) / max(u_res.x, u_res.y);
  c += vec3(1., .78, .32) * u_sun.z * (.20 * exp(-ds * 7.) + .10 * exp(-ds * 2.2)) * (1. - u_night * .7);
  float dm = distance(px, u_moon.xy) / max(u_res.x, u_res.y);
  c += vec3(.55, .62, .9) * u_moon.z * (.22 * exp(-dm * 9.) + .08 * exp(-dm * 2.5));
  // ruled lines and the margin
  float below = max(u_ruleAll, smoothstep(u_ruleFrom - 1., u_ruleFrom + 1., px.y));
  float ly = abs(fract((px.y - u_ruleFrom) / u_rule + .5) - .5) * u_rule;
  float line = (1. - smoothstep(.45, 1.15, ly)) * below;
  vec3 lineCol = mix(vec3(.58,.71,.90), vec3(.42,.50,.85), u_night);
  c = mix(c, lineCol, line * mix(.62, .30, u_night));
  float mx = abs(px.x - u_margin);
  float marg = (1. - smoothstep(.5, 1.3, mx)) * below;
  c = mix(c, mix(vec3(.93,.50,.55), vec3(.75,.38,.55), u_night), marg * mix(.6, .32, u_night));
  // soft vignette
  vec2 q = v_p; c *= 1. - .06 * dot(q, q) * (.6 + .4 * u_night);
  c = mix(c, vec3(1.), u_flash);
  o = vec4(c, 1.);
}`;

const GL_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_psr;     // x, y, size, rotation
layout(location=2) in float a_glyph;
layout(location=3) in vec4 a_color;
uniform vec2 u_res; uniform vec4 u_cam; // shake x, y, zoom, unused
uniform float u_time, u_boil, u_quad; uniform vec2 u_atlas;
out vec2 v_uv; out vec4 v_color; out vec2 v_at; out float v_halo;
float hash(float n){ return fract(sin(n) * 43758.5453123); }
void main(){
  float id = float(gl_InstanceID);
  float tick = floor(u_time * 7.);
  float j1 = hash(id * 1.2989 + tick * 7.233) - .5;
  float j2 = hash(id * 3.9346 + tick * 1.135) - .5;
  float j3 = hash(id * 7.3156 + tick * 5.719) - .5;
  float rot = a_psr.w + j1 * .13 * u_boil;
  float s = a_psr.z * ${QUAD.toFixed(5)} * u_quad;
  vec2 c = a_corner * s;
  float cs = cos(rot), sn = sin(rot);
  vec2 p = a_psr.xy + vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + vec2(j2, j3) * a_psr.z * .05 * u_boil;
  p = (p - u_res * .5) * u_cam.z + u_res * .5 + u_cam.xy;
  gl_Position = vec4(p.x / u_res.x * 2. - 1., 1. - p.y / u_res.y * 2., 0., 1.);
  float gx = mod(a_glyph, u_atlas.x), gy = floor(a_glyph / u_atlas.x);
  v_uv = (vec2(gx, gy) + a_corner + .5) / u_atlas;
  v_color = a_color; v_at = a_psr.xy / u_res;
  v_halo = clamp(13. / a_psr.z, .12, 1.);   // small letters glow like stars; big handwriting only faintly
}`;

const GL_FS = `#version 300 es
precision highp float;
uniform sampler2D u_tex; uniform float u_bias, u_night, u_glow, u_dpr, u_spell, u_time;
in vec2 v_uv; in vec4 v_color; in vec2 v_at; in float v_halo; out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  float a = texture(u_tex, v_uv, u_bias).a;
  vec3 ink = v_color.rgb;
  if (u_spell > 0.) {            // the spell: every ink runs through the rainbow
    float h = v_at.x * 1.5 + v_at.y * .7 - u_time * .35;
    vec3 rb = .5 + .5 * cos(6.2832 * (h + vec3(0., .33, .67)));
    ink = mix(ink, rb * .85, u_spell * .85);
  }
  // at night every ink turns to chalk and light
  vec3 lit = (ink + (1. - ink) * .58) * vec3(.94, .97, 1.);
  vec3 col = mix(ink, lit, u_night);
  if (u_glow > 0.) { o = vec4(col * a * v_color.a * u_glow * v_halo, 0.); return; }
  // marker ink soaks unevenly into paper
  float tooth = h21(floor(gl_FragCoord.xy / (1.5 * u_dpr)));
  a *= .84 + .16 * tooth;
  a *= v_color.a;
  o = vec4(col * a, a);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

const STRIDE = 24; // 5 floats + 4 colour bytes

// A growable list of glyph instances for one frame.
export class Batch {
  constructor(max) {
    this.max = max; this.n = 0;
    this.buf = new ArrayBuffer(max * STRIDE);
    this.f = new Float32Array(this.buf); this.b = new Uint8Array(this.buf);
  }
  clear() { this.n = 0; }
  push(x, y, size, rot, glyph, r, g, b, a) {
    if (this.n >= this.max || a <= 0.004 || size <= 0.2) return;
    const i = this.n++, fi = i * 6, bi = i * STRIDE + 20;
    const f = this.f, u = this.b;
    f[fi] = x; f[fi + 1] = y; f[fi + 2] = size; f[fi + 3] = rot; f[fi + 4] = glyph;
    u[bi] = r; u[bi + 1] = g; u[bi + 2] = b; u[bi + 3] = a >= 1 ? 255 : a * 255;
  }
}

export function createRenderer(canvas, atlas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const bg = program(gl, BG_VS, BG_FS);
  const gp = program(gl, GL_VS, GL_FS);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  let capacity = 0;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 16); gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, STRIDE, 20); gl.vertexAttribDivisor(3, 1);
  gl.bindVertexArray(null);
  const empty = gl.createVertexArray();

  let W = 1, H = 1, dpr = 1;
  return {
    gl,
    get size() { return { W, H, dpr }; },
    resize(w, h, ratio) {
      W = w; H = h; dpr = ratio;
      const pw = Math.max(1, Math.round(w * ratio)), ph = Math.max(1, Math.round(h * ratio));
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      gl.viewport(0, 0, pw, ph);
    },
    // env: everything the paper needs to know about the weather and the hour
    draw(batch, env) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(bg.p);
      gl.bindVertexArray(empty);
      gl.uniform2f(bg.u.u_res, W, H);
      gl.uniform1f(bg.u.u_dpr, dpr);
      gl.uniform1f(bg.u.u_time, env.time);
      gl.uniform1f(bg.u.u_night, env.night);
      gl.uniform1f(bg.u.u_dusk, env.dusk);
      gl.uniform1f(bg.u.u_rule, env.rule);
      gl.uniform1f(bg.u.u_ruleFrom, env.ruleFrom);
      gl.uniform1f(bg.u.u_ruleAll, env.ruleAll);
      gl.uniform1f(bg.u.u_margin, env.margin);
      gl.uniform3f(bg.u.u_sun, env.sunX, env.sunY, env.sunGlow);
      gl.uniform3f(bg.u.u_moon, env.moonX, env.moonY, env.moonGlow);
      gl.uniform1f(bg.u.u_flash, env.flash);
      gl.uniform1f(bg.u.u_warm, env.warm);
      gl.uniform1f(bg.u.u_sky, env.sky);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!batch.n) return;

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(gp.p);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, inst);
      const bytes = new Uint8Array(batch.buf, 0, batch.n * STRIDE);
      if (batch.max * STRIDE > capacity) { capacity = batch.max * STRIDE; gl.bufferData(gl.ARRAY_BUFFER, capacity, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, bytes);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gp.u.u_tex, 0);
      gl.uniform2f(gp.u.u_res, W, H);
      gl.uniform4f(gp.u.u_cam, env.shakeX, env.shakeY, env.zoom, 0);
      gl.uniform1f(gp.u.u_time, env.time);
      gl.uniform1f(gp.u.u_boil, env.boil);
      gl.uniform2f(gp.u.u_atlas, atlas.cols, atlas.rows);
      gl.uniform1f(gp.u.u_night, env.night);
      gl.uniform1f(gp.u.u_dpr, dpr);
      gl.uniform1f(gp.u.u_spell, Math.min(1, env.spell * 3));
      if (env.night > 0.02) {       // a soft halo first: the blurred mip levels of each letter, added as light
        gl.uniform1f(gp.u.u_quad, 2.3); gl.uniform1f(gp.u.u_bias, 3.2); gl.uniform1f(gp.u.u_glow, 0.2 * env.night);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.n);
      }
      gl.uniform1f(gp.u.u_quad, 1); gl.uniform1f(gp.u.u_bias, 0); gl.uniform1f(gp.u.u_glow, 0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.n);
      gl.bindVertexArray(null);
    },
  };
}
