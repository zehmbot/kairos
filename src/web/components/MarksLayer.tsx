import { type PointerEvent, useRef, useState } from "react";
import {
  MARK_COLOR,
  MARK_OUTLINE,
  type MarkElement,
  markGeometry,
  markStroke,
} from "../../shared/marks.ts";
import type { NoteShape, NoteTool } from "../../shared/types.ts";
import { minDrag, type Point, shapeFromDrag, toFilmPoint } from "../player/marks.ts";

interface MarksLayerProps {
  width: number;
  height: number;
  /** Marks to show. */
  shapes: readonly NoteShape[];
  /**
   * When set, the layer takes the pointer and draws new marks with `tool`.
   * `onStart` runs as soon as the pointer goes down (the page stops the video there).
   */
  drawing?: { tool: NoteTool; onStart?: () => void; onShape: (shape: NoteShape) => void } | null;
}

function renderElement(element: MarkElement, color: string, key: number) {
  switch (element.tag) {
    case "circle":
      return (
        <circle
          key={key}
          cx={element.cx}
          cy={element.cy}
          r={element.r}
          fill={element.filled ? color : undefined}
        />
      );
    case "rect":
      return (
        <rect key={key} x={element.x} y={element.y} width={element.width} height={element.height} />
      );
    case "polyline":
      return <polyline key={key} points={element.points} />;
    case "polygon":
      return <polygon key={key} points={element.points} fill={color} />;
  }
}

/**
 * Note marks over the film, in film pixels (the SVG is stretched over the scaled preview).
 * Looks the same as the marks in note pictures: both use `markGeometry` from src/shared/marks.ts.
 */
export function MarksLayer({ width, height, shapes, drawing }: MarksLayerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // The points of the drag live in a ref (pointer events can arrive faster than React renders);
  // the state copy only redraws the mark being made.
  const dragRef = useRef<Point[] | null>(null);
  const [drag, setDrag] = useState<Point[] | null>(null);
  const film = { width, height };

  const updateDrag = (points: Point[] | null) => {
    dragRef.current = points;
    setDrag(points);
  };
  const stroke = markStroke(width, height);

  const pointFrom = (event: PointerEvent) => {
    const box = svgRef.current?.getBoundingClientRect();
    return box ? toFilmPoint(event.clientX, event.clientY, box, film) : null;
  };

  const inProgress = drag && drawing ? shapeFromDrag(drawing.tool, drag, minDrag(film)) : null;
  const elements = markGeometry(inProgress ? [...shapes, inProgress] : shapes, stroke);

  const layer = (color: string, lineWidth: number) => (
    <g
      fill="none"
      stroke={color}
      strokeWidth={lineWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {elements.map((element, i) => renderElement(element, color, i))}
    </g>
  );

  return (
    <svg
      ref={svgRef}
      className="marks-layer"
      data-drawing={drawing ? "true" : undefined}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return;
        const point = pointFrom(event);
        if (!point) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawing.onStart?.();
        updateDrag([point]);
      }}
      onPointerMove={(event) => {
        const points = dragRef.current;
        if (!drawing || !points) return;
        const point = pointFrom(event);
        if (!point) return;
        updateDrag(drawing.tool === "pen" ? [...points, point] : [points[0] ?? point, point]);
      }}
      onPointerUp={(event) => {
        const points = dragRef.current;
        if (!drawing || !points) return;
        // The release point counts too: a quick flick can end before the last move arrives.
        const end = pointFrom(event);
        const all = end ? [...points, end] : points;
        updateDrag(null);
        const shape = shapeFromDrag(drawing.tool, all, minDrag(film));
        if (shape) drawing.onShape(shape);
      }}
      onPointerCancel={() => updateDrag(null)}
    >
      {layer(MARK_OUTLINE, stroke * 2.2)}
      {layer(MARK_COLOR, stroke)}
    </svg>
  );
}
