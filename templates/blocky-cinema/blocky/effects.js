// The finishing look: smooth edges, shading where things meet (ambient occlusion), shallow focus, soft glow, a colour
// grade, vignette, light film grain and whip motion blur. How much of it depends on the look (draft, standard,
// cinematic: the same film, lighter or richer). All driven by the frame's time, so every frame is the same each time
// it is drawn.
import * as THREE from "three";
import { SimplexNoise } from "three/addons/math/SimplexNoise.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { rng } from "./util.js";

/**
 * The occlusion's denoising noise, from a seed: three.js makes it with Math.random, so every render worker would
 * get its own and frames would differ slightly at edges.
 */
function seededNoise(size = 64) {
  const simplex = new SimplexNoise({ random: rng("gtao-noise") });
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      const o = (i * size + j) * 4;
      data[o] = (simplex.noise(i, j) * 0.5 + 0.5) * 255;
      data[o + 1] = (simplex.noise(i + size, j) * 0.5 + 0.5) * 255;
      data[o + 2] = (simplex.noise(i, j + size) * 0.5 + 0.5) * 255;
      data[o + 3] = (simplex.noise(i + size, j + size) * 0.5 + 0.5) * 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBlur: { value: 0 },
    uDir: { value: new THREE.Vector2(1, 0) },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uRes: { value: new THREE.Vector2(1, 1) },
    // The grade: shadows lifted toward a cool tone, highlights warmed, a little more colour.
    uLift: { value: new THREE.Vector3(0.004, 0.006, 0.012) },
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
    uSaturation: { value: 1.08 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBlur;
    uniform vec2 uDir;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform vec2 uRes;
    uniform vec3 uLift;
    uniform vec3 uGain;
    uniform float uSaturation;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color;
      if (uBlur > 0.002) {
        color = vec4(0.0);
        for (int i = 0; i < 18; i++) {
          float k = float(i) / 17.0 - 0.5;
          color += texture2D(tDiffuse, vUv + uDir * k * uBlur * 0.16);
        }
        color /= 18.0;
      } else {
        color = texture2D(tDiffuse, vUv);
      }
      color.rgb = color.rgb * uGain + uLift;
      float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
      color.rgb = max(mix(vec3(luma), color.rgb, uSaturation), 0.0);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.9);
      float v = smoothstep(0.78, 0.22, length(d));
      color.rgb *= mix(1.0 - uVignette, 1.0, v);
      float g = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 113.0) - 0.5;
      color.rgb += g * uGrain * (0.35 + color.rgb);
      gl_FragColor = color;
    }
  `,
};

/**
 * Builds the effect chain. `settings`: focusBlur (true), glow (0.35), vignette (0.35), grain (0.035). `look`: draft
 * (no smoothing, occlusion, focus blur or glow), standard (smooth edges, focus blur, glow), cinematic (all of it, with
 * ambient occlusion).
 */
export function createEffects(renderer, scene, camera, W, H, settings = {}, look = "standard") {
  // Drawn into a multisampled buffer: smooth edges (the canvas's own antialiasing doesn't reach the effects).
  const target = new THREE.WebGLRenderTarget(W, H, {
    type: THREE.HalfFloatType,
    samples: look === "draft" ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  if (look === "cinematic") {
    // Contact shadows and soft shading where things meet (the film's units: a figure is 5.3 tall).
    const ao = new GTAOPass(scene, camera, W, H);
    ao.updateGtaoMaterial({
      radius: 1.1,
      distanceExponent: 1.4,
      thickness: 1.4,
      scale: 1.0,
      samples: 16,
    });
    ao.updatePdMaterial({
      lumaPhi: 10,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      rings: 2,
      samples: 16,
    });
    ao.blendIntensity = 0.85;
    ao.pdNoiseTexture.dispose();
    ao.pdNoiseTexture = seededNoise();
    ao.pdMaterial.uniforms.tNoise.value = ao.pdNoiseTexture;
    composer.addPass(ao);
  }
  const bokeh =
    settings.focusBlur === false || look === "draft"
      ? null
      : new BokehPass(scene, camera, { focus: 10, aperture: 0.0006, maxblur: 0.008 });
  if (bokeh) composer.addPass(bokeh);
  const glow = look === "draft" ? 0 : (settings.glow ?? 0.35);
  if (glow > 0)
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), glow, 0.5, 1.0));
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.uVignette.value = settings.vignette ?? 0.35;
  finish.uniforms.uGrain.value = settings.grain ?? 0.035;
  finish.uniforms.uRes.value.set(W, H);
  composer.addPass(finish);
  composer.addPass(new OutputPass());

  return {
    /** Sets this frame's focus (distance to the subject), how shallow it is, and whip blur. */
    render({ t, focus, aperture, blur, blurDir }) {
      if (bokeh) {
        bokeh.uniforms.focus.value = focus;
        bokeh.uniforms.aperture.value = aperture;
      }
      finish.uniforms.uTime.value = t;
      finish.uniforms.uBlur.value = blur;
      finish.uniforms.uDir.value.set(blurDir, 0);
      composer.render();
    },
  };
}
