import { useState } from "react";
import { Link } from "react-router";
import { shapeName } from "../../shared/export.ts";
import type { FilmSummary } from "../../shared/types.ts";
import { thumbnailUrl, useClaudeActivity } from "../api.ts";
import { formatLength } from "../player/time.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";

/** Box the card picture fits in. */
const THUMB = { width: 160, height: 96 };

/**
 * The card's picture of a frame. A newer picture (the film changed) loads unseen, and the card keeps the one it
 * had, or the film icon, until it's there: never an empty box. When there is none (no browser, the film throws),
 * the icon stays.
 */
function FilmPicture({ url }: { url: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const next = url !== shown && url !== failed ? url : null;
  // Keyed by address, so the picture that loaded unseen is the one that stays (no second download).
  const pictures = [shown, next].filter((src): src is string => src !== null);
  return (
    <>
      {!shown && <PixelIcon name="film" size={32} />}
      {pictures.map((src) =>
        src === shown ? (
          <img key={src} src={src} alt="" />
        ) : (
          <img
            key={src}
            className="film-thumb-next"
            src={src}
            alt=""
            loading="lazy"
            onLoad={() => setShown(src)}
            onError={() => setFailed(src)}
          />
        ),
      )}
    </>
  );
}

export function FilmCard({ film, onDelete }: { film: FilmSummary; onDelete?: () => void }) {
  const config = film.problem ? null : film.config;
  const fit = config ? Math.min(THUMB.width / config.width, THUMB.height / config.height) : 0;
  const working = Boolean(useClaudeActivity().data?.[film.id]);

  return (
    <div className="film-card-wrap">
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
              <FilmPicture url={thumbnailUrl(film)} />
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
              {shapeName(config)} · {formatLength(config.duration)}
            </p>
          ) : (
            <p className="film-card-problem">Needs a fix</p>
          )}
          {working && (
            <span className="film-card-tags">
              <span className="px-tag film-card-working" data-tip="Claude is working on this film">
                Claude is working
              </span>
            </span>
          )}
        </div>
      </Link>
      {onDelete && (
        <PixelButton
          className="film-card-delete"
          variant="ghost"
          data-size="small"
          icon="trash"
          aria-label={`Delete ${film.config?.title ?? film.id}`}
          tip="Delete"
          onClick={onDelete}
        />
      )}
    </div>
  );
}
