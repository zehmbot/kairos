# three.js recipes for Kairos films

All of these are frame-exact: they depend only on `t` (and fixed seeds).

## Sun through window blinds

A SpotLight with a striped texture throws blind-shaped shadows across a desk, a wall or a floor.

```js
function stripes(count = 12, gap = 0.45) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#fff";
  const band = 512 / count;
  for (let i = 0; i < count; i++) ctx.fillRect(0, i * band, 512, band * (1 - gap));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sun = new THREE.SpotLight("#ffb46b", 80, 20, Math.PI / 7, 0.25, 1.5);
sun.position.set(-4, 5, 3);
sun.target.position.set(0, 0, 0);
sun.map = stripes(); // the light's color is multiplied by this picture
sun.castShadow = true; // required for the map to be used
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight("#9db7ff", "#2a1d14", 0.6)); // cool fill: lower it for a darker mood
```

Animate the sun slowly from `t` (the shadows sweep across the scene) for a sense of time passing:
`sun.position.x = -4 + progress(t, 0, duration) * 1.5`.

## Toy-like characters with faces

```js
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
const paint = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.75 });

/** A blocky figure about 2 units tall. Limbs hang from pivots, so rotations swing them naturally. */
function makeFigure({ skin, shirt, pants, faces }) {
  const figure = new THREE.Group();
  const body = box(1, 1, 0.5, paint(shirt));
  body.position.y = 1.5;

  // A box has 6 materials: +x, -x, +y, -y, +z (front), -z. The face goes on the front.
  const faceMaterial = new THREE.MeshStandardMaterial({ map: faces.neutral, roughness: 0.8 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), [
    paint(skin), paint(skin), paint(skin), paint(skin), faceMaterial, paint(skin),
  ]);
  head.position.y = 2.4;

  const limb = (x, y, color) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const part = box(0.45, 1, 0.45, paint(color));
    part.position.y = -0.5; // hang below the pivot
    pivot.add(part);
    return pivot;
  };
  const arms = [limb(-0.73, 2, skin), limb(0.73, 2, skin)];
  const legs = [limb(-0.25, 1, pants), limb(0.25, 1, pants)];
  figure.add(body, head, ...arms, ...legs);
  figure.traverse((object) => {
    if (object.isMesh) object.castShadow = true;
  });

  return {
    figure,
    head,
    /** Swap the expression for a shot. */
    face(name) { faceMaterial.map = faces[name]; },
    /** Walking: arms and legs swing in opposite pairs. */
    walk(t, speed = 6, swing = 0.6) {
      const s = Math.sin(t * speed) * swing;
      legs[0].rotation.x = s;
      legs[1].rotation.x = -s;
      arms[0].rotation.x = -s;
      arms[1].rotation.x = s;
    },
  };
}
```

Faces drawn on a canvas, one texture per expression, made once:

```js
function drawFace(expression, skin = "#f2c79b") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, 256, 256);
  // Big, bold features: a face is seen small on a phone, often in a busy shot.
  ctx.fillStyle = ctx.strokeStyle = "#1a1c2c";
  ctx.lineWidth = 16;
  ctx.lineCap = "round";

  const eyes = (h = 44) => {
    for (const x of [80, 176]) {
      ctx.beginPath();
      ctx.ellipse(x, 104, 20, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const mouth = (curve) => {
    // curve > 0 smiles, < 0 frowns
    ctx.beginPath();
    ctx.moveTo(78, 178);
    ctx.quadraticCurveTo(128, 178 + curve, 178, 178);
    ctx.stroke();
  };

  switch (expression) {
    case "happy": eyes(); mouth(48); break;
    case "sad": eyes(30); mouth(-34); break;
    case "crying":
      eyes(24);
      mouth(-40);
      ctx.fillStyle = "#41a6f6";
      for (const x of [80, 176]) ctx.fillRect(x - 11, 126, 22, 110); // tears
      break;
    case "shocked":
      eyes(64);
      ctx.beginPath();
      ctx.ellipse(128, 196, 30, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "angry":
      eyes(30);
      ctx.beginPath(); // brows angled down toward the middle
      ctx.moveTo(50, 62); ctx.lineTo(108, 86);
      ctx.moveTo(206, 62); ctx.lineTo(148, 86);
      ctx.stroke();
      mouth(-24);
      break;
    default: eyes(); mouth(10);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const faces = Object.fromEntries(
  ["neutral", "happy", "sad", "crying", "shocked", "angry"].map((name) => [name, drawFace(name)]),
);
```

Blinking on a fixed schedule (frame-exact): show a "closed" face for 0.12 s every few seconds, offset per
character: `const closed = ((t + offset) % 3.7) < 0.12;`.

## A simple world from boxes

- House: a box for the walls, a rotated box or a prism (`CylinderGeometry` with 3 sides) for the roof, thin dark
  boxes for windows (emissive yellow at night).
- Street lamp: a thin cylinder plus a small sphere with an emissive material and a PointLight just under it.
- Trees: a cylinder trunk with one or two spheres on top, slightly different greens.
- Sky: `scene.background = new THREE.Color(...)`, or a large sphere with a vertical gradient canvas texture,
  rendered from the inside (`side: THREE.BackSide`).
- A moon or sun with a face: a sphere with an emissive face texture (drawFace with a pale color), plus a soft
  sprite behind it for the glow.

## Film grain and vignette

```js
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, seed: { value: 0 }, amount: { value: 0.05 } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float seed; uniform float amount; varying vec2 vUv;
    float rand(vec2 p) { return fract(sin(dot(p + seed, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb += (rand(vUv) - 0.5) * amount;                        // grain
      color.rgb *= mix(0.72, 1.0, smoothstep(0.85, 0.35, distance(vUv, vec2(0.5)))); // vignette
      gl_FragColor = color;
    }`,
});
composer.addPass(grain); // after OutputPass

// in renderOut: a new grain pattern each frame, but always the same for the same frame
grain.uniforms.seed.value = (Math.floor(t * FPS) % 977) * 0.137;
```
