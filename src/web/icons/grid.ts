/**
 * Pixel icons are drawn as ASCII grids: one character per pixel, "." is transparent.
 * `parseGrid` turns a grid into SVG-ready rectangles, merging horizontal runs of the same color.
 */

export interface PixelIconDef {
  /** Rows of equal length. */
  grid: readonly string[];
  /** Character -> CSS color. Characters not listed here are an error. */
  colors: Readonly<Record<string, string>>;
}

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** Default palette for one-color icons: "#" follows the text color, "+" uses the accent. */
export const MONO = { "#": "currentColor", "+": "var(--icon-accent, currentColor)" } as const;

export function parseGrid(def: PixelIconDef): PixelRect[] {
  const width = def.grid[0]?.length ?? 0;
  const rects: PixelRect[] = [];

  def.grid.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Icon row ${y} has ${row.length} pixels, expected ${width}`);
    }
    let x = 0;
    while (x < width) {
      const char = row.charAt(x);
      let end = x + 1;
      while (end < width && row.charAt(end) === char) end++;
      if (char !== ".") {
        const fill = def.colors[char];
        if (fill === undefined) {
          throw new Error(`Icon row ${y} uses "${char}" which has no color`);
        }
        rects.push({ x, y, w: end - x, h: 1, fill });
      }
      x = end;
    }
  });

  return rects;
}

export function gridSize(def: PixelIconDef): { width: number; height: number } {
  return { width: def.grid[0]?.length ?? 0, height: def.grid.length };
}
