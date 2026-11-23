/**
 * Writes public/favicon.svg from the `logo` icon, so the mark has a single source. Browser tabs can be light or dark:
 * the favicon uses deeper colors on light tabs, and the logo's own colors on dark ones.
 * Run with: npm run favicon
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gridSize, parseGrid } from "../src/web/icons/grid.ts";
import { ICONS } from "../src/web/icons/icons.ts";

const icon = ICONS.logo;
/** The same letters, in colors that read on a light tab (Sweetie-16 blue, orange, yellow). */
const ON_LIGHT: Record<keyof typeof icon.colors, string> = {
  M: "#3b5dc9",
  Y: "#ef7d57",
  W: "#ffcd75",
};

const letters = Object.keys(icon.colors) as (keyof typeof icon.colors)[];
const { width, height } = gridSize(icon);
// Each run is drawn with its letter as a class, colored by the style below.
const byLetter = Object.fromEntries(letters.map((letter) => [letter, letter]));
const rects = parseGrid({ grid: icon.grid, colors: byLetter })
  .map((r) => `  <rect class="${r.fill}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`)
  .join("\n");
const rules = (colors: Record<string, string>) =>
  letters.map((letter) => `.${letter}{fill:${colors[letter]}}`).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
  <title>Kairos</title>
  <style>${rules(ON_LIGHT)}@media (prefers-color-scheme: dark){${rules(icon.colors)}}</style>
${rects}
</svg>
`;

const out = fileURLToPath(new URL("../public/favicon.svg", import.meta.url));
mkdirSync(fileURLToPath(new URL("../public/", import.meta.url)), { recursive: true });
writeFileSync(out, svg);
console.log(`Wrote ${out}`);
