// The sky and the far landscape. The dome (a shader): a gradient from the horizon up, the sun's glow, soft clouds
// that drift with t, and at night stars and a big moon with its halo. `backdrop` builds a ring of hills and a tree
// line around an outdoor place, so the horizon is never empty. Everything comes from t and seeds only.
import * as THREE from "three";
import { rng } from "./util.js";

/**
 * Each light's sky: colors, where the sun is (the same direction as the place's sun light in places.js), how cloudy,
 * and the clouds' lit and shaded colors.
 */
const SKY = {
  day: {
    top: "#4f93e0",
    horizon: "#d6ecff",
    sun: "#fff4d6",
    sunPos: [18, 30, 16],
    glow: 0.35,
    clouds: 0.46,
    cloud: "#ffffff",
    cloudShade: "#b9c7da",
  },
  evening: {
    top: "#33337a",
    horizon: "#ff9d6a",
    sun: "#ffb37a",
    sunPos: [30, 10, 14],
    glow: 0.8,
    clouds: 0.5,
    cloud: "#ffc49a",
    cloudShade: "#7a5a8c",
  },
  night: {
    top: "#04081a",
    horizon: "#1a2a5c",
    sun: "#000000",
    sunPos: [-16, 26, 12],
    glow: 0,
    clouds: 0.34,
    cloud: "#3a4a78",
    cloudShade: "#0c1230",
  },
};

/** Where the moon is: low over the far side of the usual view, so wide shots catch it. */
const MOON = new THREE.Vector3(-0.38, 0.27, -0.885).normalize();

const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 top;
  uniform vec3 horizon;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float glow;
  uniform float cloudAmount;
  uniform vec3 cloudColor;
  uniform vec3 cloudShade;
  uniform float night;
  uniform vec3 moonDir;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < OCTAVES; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 1.6 + 0.1, 0.0, 1.0);
    vec3 color = mix(horizon, top, pow(h, 0.8));
    float s = max(dot(d, sunDir), 0.0);
    color += sunColor * (pow(s, 6.0) * 0.3 + pow(s, 48.0) * 0.5) * glow;

    // Clouds on a flat layer overhead, thinning toward the horizon.
    float cover = 0.0;
    if (d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.12) * 1.3 + vec2(uTime * 0.012, uTime * 0.004);
      float c = fbm(uv);
      cover = smoothstep(1.0 - cloudAmount, 1.0 - cloudAmount + 0.22, c) * smoothstep(0.0, 0.2, d.y);
      float lit = fbm(uv + sunDir.xz * 0.06 + vec2(0.0, 0.04));
      vec3 cloud = mix(cloudShade, cloudColor, clamp(0.55 + (c - lit) * 3.0, 0.0, 1.0));
      color = mix(color, cloud, cover * 0.92);
    }

    if (night > 0.5) {
      // Stars, hidden by the clouds.
      if (d.y > 0.02) {
        vec2 sp = d.xz / (d.y + 0.35) * 140.0;
        vec2 cell = floor(sp);
        if (hash(cell) > 0.982) {
          vec2 f = fract(sp) - 0.5;
          float star = smoothstep(0.12, 0.0, length(f)) * (0.45 + 0.55 * hash(cell + 3.1));
          color += vec3(star) * (1.0 - cover);
        }
      }
      // The moon: a disc with soft gray seas, and its halo.
      float m = dot(d, moonDir);
      color += vec3(0.75, 0.8, 1.0) * (pow(max(m, 0.0), 900.0) * 0.6 + pow(max(m, 0.0), 40.0) * 0.08);
      float disc = smoothstep(0.99875, 0.9990, m);
      vec2 mp = vec2(dot(d, normalize(cross(moonDir, vec3(0.0, 1.0, 0.0)))), d.y - moonDir.y) * 60.0;
      float seas = smoothstep(0.45, 0.75, noise(mp * 1.5 + 4.0)) * 0.18;
      color = mix(color, vec3(1.0, 0.97, 0.88) * (1.0 - seas), disc);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/**
 * The sky dome. `set(light)` picks day, evening or night; `update(t)` moves the clouds. `look` ("draft",
 * "standard", "cinematic") sets how detailed the clouds are (the draft look draws without a graphics card).
 */
export function makeSky(look = "standard") {
  const material = new THREE.ShaderMaterial({
    defines: { OCTAVES: look === "draft" ? 3 : 5 },
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      glow: { value: 0 },
      cloudAmount: { value: 0 },
      cloudColor: { value: new THREE.Color() },
      cloudShade: { value: new THREE.Color() },
      night: { value: 0 },
      moonDir: { value: MOON.clone() },
      uTime: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), material);
  dome.renderOrder = -1;
  const group = new THREE.Group();
  group.add(dome);
  const u = material.uniforms;
  return {
    group,
    set(preset) {
      const sky = SKY[preset] ?? SKY.day;
      u.top.value.set(sky.top);
      u.horizon.value.set(sky.horizon);
      u.sunColor.value.set(sky.sun);
      u.sunDir.value.set(...sky.sunPos).normalize();
      u.glow.value = sky.glow;
      u.cloudAmount.value = sky.clouds;
      u.cloudColor.value.set(sky.cloud);
      u.cloudShade.value.set(sky.cloudShade);
      u.night.value = preset === "night" ? 1 : 0;
    },
    update(t) {
      u.uTime.value = t;
    },
  };
}

/** The horizon color of a light (fog fades far things into it). */
export const horizonOf = (preset) => (SKY[preset] ?? SKY.day).horizon;

/**
 * A ring of rolling hills with a line of trees at their foot around `center`, `radius` away, so outdoor places
 * have a horizon. Lit like the place (it darkens at night) and faded by its fog.
 */
export function backdrop({
  seed,
  center = [0, 0],
  radius = 120,
  hill = "#5c9c55",
  trees = "#2f6b3a",
}) {
  const random = rng(`backdrop${seed}`);
  const g = new THREE.Group();
  const segments = 160;
  // Hills: a band of quads whose top edge rolls up and down.
  for (const [r, height, color, lift] of [
    [radius + 40, 34, "#7fa7a0", -4],
    [radius, 20, hill, -2],
  ]) {
    const positions = [];
    const phase = random() * 10;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const roll =
        0.5 +
        0.3 * Math.sin(a * 3 + phase) +
        0.15 * Math.sin(a * 7 + phase * 2) +
        0.05 * Math.sin(a * 17 + phase);
      const x = center[0] + Math.cos(a) * r;
      const z = center[1] + Math.sin(a) * r;
      positions.push([x, lift, z], [x, lift + 4 + roll * height, z]);
    }
    const vertices = [];
    for (let i = 0; i < segments; i++) {
      const [b0, t0] = [positions[i * 2], positions[i * 2 + 1]];
      const [b1, t1] = [positions[i * 2 + 2], positions[i * 2 + 3]];
      vertices.push(...b0, ...b1, ...t0, ...t0, ...b1, ...t1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const band = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }),
    );
    g.add(band);
  }
  // A tree line at the hills' foot: rounded clumps, one instanced mesh.
  const count = 220;
  const clumps = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: trees, roughness: 1, flatShading: true }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random() * 0.02;
    const r = radius - 6 - random() * 8;
    const s = 3 + random() * 3.5;
    q.setFromEuler(new THREE.Euler(0, random() * 6, 0));
    m.compose(
      new THREE.Vector3(center[0] + Math.cos(a) * r, s * 0.7, center[1] + Math.sin(a) * r),
      q,
      new THREE.Vector3(s, s * (1.1 + random() * 0.5), s),
    );
    clumps.setMatrixAt(i, m);
  }
  g.add(clumps);
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  // Far away: the Places sheet's physics check and the camera's furniture rays ignore it.
  g.userData.scenery = true;
  return g;
}
