/**
 * Writes the README's pixel pictures from the app's own icon grids, so they have a single source:
 * docs/readme/logo-dark.svg and logo-light.svg (the mark, for GitHub's dark and light themes) and
 * docs/readme/icons/<name>.svg (the feature list's icons, in a color that reads on both).
 * Run with: npm run readme-images
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gridSize, type PixelIconDef, parseGrid } from "../src/web/icons/grid.ts";
import { ICONS, type IconName } from "../src/web/icons/icons.ts";

/** The mark's colors on a light page (the favicon uses the same). */
const LOGO_ON_LIGHT = { M: "#3b5dc9", Y: "#ef7d57", W: "#ffcd75" };
/** Sweetie-16 orange: reads on GitHub's white and on its dark gray. */
const ICON_COLOR = "#ef7d57";
const FEATURE_ICONS: IconName[] = [
  "template",
  "play",
  "note",
  "pen",
  "film",
  "sound",
  "render",
  "skill",
];

function svgOf(def: PixelIconDef, title: string): string {
  const { width, height } = gridSize(def);
  const rects = parseGrid(def)
    .map((r) => `  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <title>${title}</title>
${rects}
</svg>
`;
}

const dir = fileURLToPath(new URL("../docs/readme/", import.meta.url));
mkdirSync(`${dir}icons`, { recursive: true });

writeFileSync(`${dir}logo-dark.svg`, svgOf(ICONS.logo, "Kairos"));
writeFileSync(
  `${dir}logo-light.svg`,
  svgOf({ grid: ICONS.logo.grid, colors: LOGO_ON_LIGHT }, "Kairos"),
);
for (const name of FEATURE_ICONS) {
  const icon = ICONS[name];
  writeFileSync(
    `${dir}icons/${name}.svg`,
    svgOf({ grid: icon.grid, colors: { "#": ICON_COLOR, "+": ICON_COLOR } }, name),
  );
}
console.log(`Wrote the README pictures to ${dir}`);
