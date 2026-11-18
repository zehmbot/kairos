import { gridSize, type PixelRect, parseGrid } from "../icons/grid.ts";
import { ICONS, type IconName } from "../icons/icons.ts";

const cache = new Map<IconName, PixelRect[]>();

function rectsFor(name: IconName): PixelRect[] {
  let rects = cache.get(name);
  if (!rects) {
    rects = parseGrid(ICONS[name]);
    cache.set(name, rects);
  }
  return rects;
}

interface PixelIconProps {
  name: IconName;
  /** Rendered width in CSS pixels. Use multiples of 16 to keep pixels crisp. */
  size?: number;
  /** Accessible name. Leave out for decorative icons next to text. */
  label?: string;
}

export function PixelIcon({ name, size = 32, label }: PixelIconProps) {
  const { width, height } = gridSize(ICONS[name]);
  const pixels = rectsFor(name).map((r) => (
    <rect key={`${r.x},${r.y}`} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
  ));
  const svgProps = {
    className: "px-icon",
    width: size,
    height: (size * height) / width,
    viewBox: `0 0 ${width} ${height}`,
    shapeRendering: "crispEdges",
  };

  if (!label) {
    return (
      <svg {...svgProps} aria-hidden="true">
        {pixels}
      </svg>
    );
  }
  return (
    <svg {...svgProps} role="img" aria-label={label}>
      <title>{label}</title>
      {pixels}
    </svg>
  );
}
