---
name: kairos-3d
description: Making 3D Kairos films with three.js - setup, frame-exact animation, light, materials, atmosphere, post effects and simple toy-like characters. Use whenever a film uses three.js or WebGL, or the user asks for a 3D scene, 3D objects, 3D characters, or a "rendered", "no Blender" look.
---

# 3D films with three.js

Kairos serves one pinned three.js version to every film, so the preview, the note pictures and the final render
all match, offline. Longer code (window-blind shadows, characters with faces, film grain) is in
[recipes.md](recipes.md).

## Setup

`index.html`, at the film's exact size:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="importmap">
      { "imports": { "three": "/__kairos/lib/three/build/three.module.js",
                     "three/addons/": "/__kairos/lib/three/examples/jsm/" } }
    </script>
    <style>html, body { margin: 0; background: #000; } canvas { display: block; }</style>
  </head>
  <body>
    <script type="module" src="film.js"></script>
  </body>
</html>
```

`film.js`:

```js
import * as THREE from "three";

const W = 1920; // same as kairos.json
const H = 1080;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); // Kairos handles scaling; keep 1 so frames match the film size
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 500);
camera.filmGauge = 36;
camera.setFocalLength(35);

// ... build the scene once, here ...

window.renderOut = (t) => {
  // set every moving thing from t, then draw once
  renderer.render(scene, camera);
};
```

`preserveDrawingBuffer: true` lets Kairos take pictures of the canvas. Always render inside `renderOut`, never in an
animation loop.

## Frame-exact animation

Kairos asks for frames in any order. Everything visible must be computed from `t`:
- No `THREE.Clock`, `getDelta()` or `requestAnimationFrame`.
- Animation clips: `mixer.setTime(t)` (never `mixer.update(delta)`).
- Physics or simulations: write closed-form motion (positions as functions of `t`), or precompute every frame in
  `window.READY` and look them up.
- Particles: seeded random start values, then position = f(seed values, `t`).
- Shaders: pass `t` as a uniform (`material.uniforms.uTime.value = t`).
- Random choices: seeded random (see the kairos skill), never `Math.random()`.

## Loading things

Set `window.READY` at the top of `film.js`, before anything awaits:

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
let model;
window.READY = (async () => {
  model = (await new GLTFLoader().loadAsync("assets/model.glb")).scene;
  scene.add(model);
  const texture = await new THREE.TextureLoader().loadAsync("assets/wood.jpg");
  texture.colorSpace = THREE.SRGBColorSpace; // color textures are sRGB
  renderer.compile(scene, camera); // avoid a slow first frame
})();
```

Put files in `assets/`. Fonts for 3D text or canvas textures load in `READY` too.

## Light makes the scene

A plain model under even light looks like a test render. A strong, deliberate light makes it look filmed:

1. **Key light:** one warm, strong light from one side (DirectionalLight or SpotLight) that casts shadows. It
   decides where the eye goes.
2. **Patterned shadows:** light through window blinds, leaves or a grille throws shapes across the scene and
   instantly says "a real place, a time of day". Recipe: SpotLight with a striped texture in recipes.md.
3. **Fill:** a weak, cool light (`HemisphereLight` at 0.2-0.6) so shadows aren't pure black.
4. **Rim / back light:** behind the subject, to outline it against the background.
5. **Practicals:** lamps and screens in the scene: an emissive material plus a small PointLight nearby.
6. **Reflections:** a soft environment for shiny materials:

```js
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3; // keep it low so the key light still leads
```

Light intensities are physical: a DirectionalLight around 2-4, a PointLight a metre away around 5-20.
Shadows: `light.castShadow = true`, `mesh.castShadow` / `receiveShadow`, and size the shadow camera to the scene
(`light.shadow.camera` bounds, `light.shadow.mapSize.set(2048, 2048)`, `light.shadow.bias = -0.0005`).

## Materials and color

- `MeshStandardMaterial` for almost everything; vary `roughness` (0.2 polished, 0.9 matte) so surfaces read as
  different things.
- No pure black or pure white surfaces; real things sit in between.
- A limited palette: 3-5 colors, with one accent kept for what matters.
- A small set of well-lit props beats many flat ones.

## Atmosphere and depth

- `scene.fog = new THREE.Fog(skyColor, near, far)` fades distant layers and gives depth.
- Dust in a light beam: a few hundred seeded points (`THREE.Points`) drifting as a function of `t`.
- Build in layers: something close to the camera, the subject, a midground, a background (see kairos-directing).

## Post effects (all frame-exact)

```js
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const composer = new EffectComposer(renderer);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.4, 0.85)); // subtle glow
composer.addPass(new OutputPass());
// in renderOut: composer.render() instead of renderer.render(...)
```

Film grain and vignette with a per-frame seed: recipes.md. Depth of field: the kairos-camera skill.

## Characters

Simple toy-like figures (boxes for head, body, arms and legs, joined at pivots) with faces drawn on a canvas
texture can carry a whole story: the face changes per shot (happy, sad, crying, shocked, angry). Recipe in
recipes.md. Design your own characters, outfits and world; never copy a game's or brand's characters, logos or
names.

## Speed

The render draws every frame, so each frame should take well under a second:
- Keep scenes under a few hundred thousand triangles; merge static meshes.
- One or two shadow-casting lights, 1024-2048 shadow maps.
- Textures at 2048 px or less.

Check the result with `kairos_frame` at a few moments: light direction, shadows, color and framing.
