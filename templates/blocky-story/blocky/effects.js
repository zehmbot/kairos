// The finishing look: shallow focus, soft glow, vignette, light film grain and whip motion blur.
// All driven by the frame's time, so every frame is the same each time it is drawn.
import * as THREE from "three";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uBlur: { value: 0 },
    uDir: { value: new THREE.Vector2(1, 0) },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.035 },
    uRes: { value: new THREE.Vector2(1, 1) },
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
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.9);
      float v = smoothstep(0.78, 0.22, length(d));
      color.rgb *= mix(1.0 - uVignette, 1.0, v);
      float g = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 113.0) - 0.5;
      color.rgb += g * uGrain * (0.35 + color.rgb);
      gl_FragColor = color;
    }
  `,
};

/** Builds the effect chain. `settings`: focusBlur (true), glow (0.35), vignette (0.35), grain (0.035). */
export function createEffects(renderer, scene, camera, W, H, settings = {}) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh =
    settings.focusBlur === false
      ? null
      : new BokehPass(scene, camera, { focus: 10, aperture: 0.0006, maxblur: 0.008 });
  if (bokeh) composer.addPass(bokeh);
  const glow = settings.glow ?? 0.35;
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
