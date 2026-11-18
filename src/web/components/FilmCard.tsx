import { Link } from "react-router";
import type { FilmSummary } from "../../shared/types.ts";
import { formatLength } from "../player/time.ts";
import { PixelIcon } from "./PixelIcon.tsx";

/** Box the placeholder thumbnail fits in. Real thumbnails come with the renderer. */
const THUMB = { width: 160, height: 96 };

export function FilmCard({ film }: { film: FilmSummary }) {
  const config = film.problem ? null : film.config;
  const fit = config ? Math.min(THUMB.width / config.width, THUMB.height / config.height) : 0;

  return (
    <Link to={`/films/${encodeURIComponent(film.id)}`} className="film-card px-box">
      <div className="film-thumb">
        {config ? (
          <span
            className="film-thumb-frame"
            style={{
              width: Math.round(config.width * fit),
              height: Math.round(config.height * fit),
            }}
          >
            <PixelIcon name="film" size={32} />
          </span>
        ) : (
          <span className="film-thumb-problem">
            <PixelIcon name="warning" size={48} />
          </span>
        )}
      </div>
      <div className="film-card-body">
        <h3 className="film-card-title">{film.config?.title ?? film.id}</h3>
        {config ? (
          <p className="film-card-meta">
            {config.width}×{config.height} · {formatLength(config.duration)} · {config.fps} fps
          </p>
        ) : (
          <p className="film-card-problem">Needs a fix</p>
        )}
        {config && <span className="px-tag">{config.status}</span>}
      </div>
    </Link>
  );
}
