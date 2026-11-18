/**
 * Writes public/favicon.svg from the hourglass icon, so the logo has a single source.
 * Run with: npm run favicon
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gridSize, parseGrid } from "../src/web/icons/grid.ts";
import { ICONS } from "../src/web/icons/icons.ts";

const icon = ICONS.hourglass;
const { width, height } = gridSize(icon);
const rects = parseGrid(icon)
  .map((r) => `  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`)
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <title>Kairos</title>
${rects}
</svg>
`;

const out = fileURLToPath(new URL("../public/favicon.svg", import.meta.url));
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), { recursive: true });
writeFileSync(out, svg);
console.log(`Wrote ${out}`);
