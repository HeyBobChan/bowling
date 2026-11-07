// Animate only the original drawing's leg and wheel regions. The source texture
// remains unchanged: a small fragment-shader puppet moves its existing ink.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const WHEELS = {
  delivery: [
    { center: [52, 277], radius: [31, 32], rollingRadius: 43 },
    { center: [274, 289], radius: [25, 25], rollingRadius: 37 },
  ],
  scooter: [
    { center: [21, 241], radius: [15, 15], rollingRadius: 14 },
    { center: [150, 226], radius: [16, 15], rollingRadius: 14 },
  ],
};

const helpers = `
uniform float jaHop;
uniform vec2 jaWheels;
vec2 jaDx, jaDy;
vec2 jaTurn(vec2 p, vec2 pivot, float angle) {
  float c = cos(angle), s = sin(angle);
  p -= pivot;
  return pivot + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
vec4 jaRead(vec2 p, vec2 size) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > size.x || p.y > size.y) return vec4(0.0);
  // Explicit gradients keep mip selection stable across limb/wheel branches.
  // Implicit derivatives there produced crop-edge lines and detached ink.
  return textureGrad(map, vec2(p.x / size.x, 1.0 - p.y / size.y), jaDx, jaDy);
}
float jaRect(vec2 p, vec4 bounds) {
  return step(bounds.x, p.x) * step(bounds.y, p.y) * step(p.x, bounds.z) * step(p.y, bounds.w);
}
vec4 jaOver(vec4 top, vec4 bottom) {
  float alpha = top.a + bottom.a * (1.0 - top.a);
  return vec4((top.rgb * top.a + bottom.rgb * bottom.a * (1.0 - top.a)) / max(alpha, .00001), alpha);
}
vec4 jaLeg(vec2 p, vec2 pivot, vec4 bounds, float angle, vec2 size) {
  // A short fixed shoulder/hip blend keeps the cutout joined at the root.
  float bend = smoothstep(bounds.y, bounds.y + 22.0, p.y);
  vec2 source = jaTurn(p, pivot, -angle * bend);
  vec4 ink = jaRead(source, size);
  ink.a *= jaRect(source, bounds);
  return ink;
}
`;

function dogShader() {
  return `
vec4 jaSample(vec2 uv) {
  jaDx = dFdx(uv); jaDy = dFdy(uv);
  vec2 size = vec2(371.0, 222.0), p = vec2(uv.x, 1.0 - uv.y) * size;
  vec4 original = jaRead(p, size);
  if (jaHop <= .00001 || jaHop >= .99999) return original;
  float lift = sin(jaHop * 3.14159265);
  vec4 front = vec4(85.0, 108.0, 126.0, 222.0);
  // Both overlapping hind legs stay together, avoiding a cut through their ink.
  vec4 hind = vec4(227.0, 132.0, 292.0, 222.0);
  vec4 body = original;
  body.a *= 1.0 - max(jaRect(p, front), jaRect(p, hind));
  vec4 legs = jaLeg(p, vec2(258.0, 134.0), hind, .28 * lift, size);
  legs = jaOver(jaLeg(p, vec2(106.0, 110.0), front, -.28 * lift, size), legs);
  return jaOver(body, legs);
}
`;
}
function wheelShader(kind, size) {
  const wheels = WHEELS[kind];
  const parts = wheels.map((wheel, i) => {
    const center = `vec2(${wheel.center.map(v => v.toFixed(1)).join(',')})`;
    const radius = `vec2(${wheel.radius.map(v => v.toFixed(1)).join(',')})`;
    return `{
      vec2 center = ${center}, radius = ${radius};
      if (length((p - center) / radius) < 1.0) {
        // Original art faces left. Mirroring the sprite reverses the apparent spin.
        vec2 source = center + jaTurn((p - center) / radius, vec2(0.0), jaWheels.${i === 0 ? 'x' : 'y'}) * radius;
        ink = jaRead(source, size);
      }
    }`;
  }).join('\n');
  return `
vec4 jaSample(vec2 uv) {
  jaDx = dFdx(uv); jaDy = dFdy(uv);
  vec2 size = vec2(${size[0].toFixed(1)}, ${size[1].toFixed(1)});
  vec2 p = vec2(uv.x, 1.0 - uv.y) * size;
  vec4 ink = jaRead(p, size);
  ${parts}
  ${kind === 'delivery' ? `
  // Fork and rear swingarm stay attached while the wheel ink turns behind them.
  vec2 a = vec2(76.0, 246.0), b = vec2(55.0, 275.0);
  float along = clamp(dot(p - a, b - a) / dot(b - a, b - a), 0.0, 1.0);
  if (length(p - mix(a, b, along)) < 2.4 || (p.x > 246.0 && p.x < 274.0 && abs(p.y - 286.0) < 2.0)) ink = jaRead(p, size);
  ` : ''}
  return ink;
}
`;
}

export function rigDrawing(material, kind, region) {
  const motion = { hop: 0, distance: 0, angles: new THREE.Vector2(), material, uniforms: { hop: { value: 0 }, wheels: { value: new THREE.Vector2() } } };
  material.onBeforeCompile = shader => {
    shader.uniforms.jaHop = motion.uniforms.hop; shader.uniforms.jaWheels = motion.uniforms.wheels;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_pars_fragment>', '#include <map_pars_fragment>\n' + helpers + (kind === 'dog' ? dogShader() : wheelShader(kind, region.crop.slice(2))));
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'jaSample( vMapUv )'));
  };
  material.customProgramCacheKey = () => `jaffa-original-ink-motion-v2:${kind}`;
  motion.radii = WHEELS[kind]?.map(w => w.rollingRadius * region.width / region.crop[2]);
  return motion;
}
export function poseDog(dog, hopProgress = 0) {
  const motion = dog.userData.motion;
  if (!motion) return;
  motion.hop = THREE.MathUtils.clamp(hopProgress, 0, 1);
  motion.uniforms.hop.value = motion.hop;
}
export function rollWheels(actor, distance) {
  const motion = actor.userData.motion;
  if (!motion?.radii || !Number.isFinite(distance)) return;
  const travel = Math.abs(distance);
  motion.distance += travel;
  motion.angles.x = (motion.angles.x + travel / motion.radii[0]) % TAU;
  motion.angles.y = (motion.angles.y + travel / motion.radii[1]) % TAU;
  motion.uniforms.wheels.value.copy(motion.angles);
}
export function disposeDrawingActor(actor) {
  // Animated actors own a material, while their source textures remain shared.
  actor.userData.motion?.material.dispose();
  actor.removeFromParent();
}
