import type { NoteShape } from "./types.ts";

/**
 * How note marks look. The player overlay (React) and the note pictures (an SVG string in the frame
 * camera) both draw from `markGeometry`, so a mark looks the same everywhere.
 * Marks are bright yellow over a dark outline, so they show up on any film.
 */
export const MARK_COLOR = "#ffcd75";
export const MARK_OUTLINE = "#1a1c2c";

/** Line width of marks, in film pixels: thicker for bigger films. */
export function markStroke(width: number, height: number): number {
  return Math.max(3, Math.round(Math.min(width, height) / 180));
}

/** An SVG element, without colours: `filled` elements are filled with the mark colour, others stroked. */
export type MarkElement =
  | { tag: "circle"; cx: number; cy: number; r: number; filled: boolean }
  | { tag: "rect"; x: number; y: number; width: number; height: number }
  | { tag: "polyline"; points: string }
  | { tag: "polygon"; points: string };

const pointList = (points: readonly (readonly [number, number])[]) =>
  points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
const round = (value: number) => Math.round(value * 10) / 10;

export function markGeometry(shapes: readonly NoteShape[], stroke: number): MarkElement[] {
  const elements: MarkElement[] = [];
  for (const shape of shapes) {
    switch (shape.type) {
      case "point":
        elements.push({ tag: "circle", cx: shape.x, cy: shape.y, r: stroke * 4, filled: false });
        elements.push({ tag: "circle", cx: shape.x, cy: shape.y, r: stroke * 1.2, filled: true });
        break;
      case "box":
        elements.push({
          tag: "rect",
          x: Math.min(shape.x, shape.x + shape.w),
          y: Math.min(shape.y, shape.y + shape.h),
          width: Math.abs(shape.w),
          height: Math.abs(shape.h),
        });
        break;
      case "arrow": {
        const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
        const length = stroke * 5;
        const spread = Math.PI / 7;
        const left: [number, number] = [
          shape.x2 - length * Math.cos(angle - spread),
          shape.y2 - length * Math.sin(angle - spread),
        ];
        const right: [number, number] = [
          shape.x2 - length * Math.cos(angle + spread),
          shape.y2 - length * Math.sin(angle + spread),
        ];
        elements.push({
          tag: "polyline",
          points: pointList([
            [shape.x1, shape.y1],
            [shape.x2, shape.y2],
          ]),
        });
        elements.push({ tag: "polygon", points: pointList([[shape.x2, shape.y2], left, right]) });
        break;
      }
      case "pen":
        elements.push({ tag: "polyline", points: pointList(shape.points) });
        break;
    }
  }
  return elements;
}

function elementSvg(element: MarkElement, color: string): string {
  switch (element.tag) {
    case "circle":
      return `<circle cx="${round(element.cx)}" cy="${round(element.cy)}" r="${round(element.r)}"${element.filled ? ` fill="${color}"` : ""}/>`;
    case "rect":
      return `<rect x="${round(element.x)}" y="${round(element.y)}" width="${round(element.width)}" height="${round(element.height)}"/>`;
    case "polyline":
      return `<polyline points="${element.points}"/>`;
    case "polygon":
      return `<polygon points="${element.points}" fill="${color}"/>`;
  }
}

/** A full-size SVG of the marks, laid over the film page by the frame camera. Only numbers go in it. */
export function marksSvg(shapes: readonly NoteShape[], width: number, height: number): string {
  const stroke = markStroke(width, height);
  const elements = markGeometry(shapes, stroke);
  const layer = (color: string, lineWidth: number) =>
    `<g fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round">${elements
      .map((element) => elementSvg(element, color))
      .join("")}</g>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `style="position:fixed;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:2147483647">` +
    layer(MARK_OUTLINE, stroke * 2.2) +
    layer(MARK_COLOR, stroke) +
    "</svg>"
  );
}
