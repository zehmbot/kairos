import { useState } from "react";
import { Link, useParams } from "react-router";
import { useFilm, useHealth, useOpenFilmFolder } from "../api.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelIcon } from "../components/PixelIcon.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { Player } from "../components/Player.tsx";
import { useHubEvent } from "../hubEvents.ts";
import { formatLength, frameCount } from "../player/time.ts";

function BackLink() {
  return (
    <Link to="/films" className="back-link">
      <PixelIcon name="arrowLeft" size={16} />
      All films
    </Link>
  );
}

export function FilmPage() {
  const { id = "" } = useParams();
  const film = useFilm(id);
  const health = useHealth();
  const openFolder = useOpenFilmFolder();
  const [reloadKey, setReloadKey] = useState(0);

  // Live reload: any saved file in this film reloads the preview.
  useHubEvent((event) => {
    if (event.type === "films-changed" && event.ids.includes(id)) setReloadKey((key) => key + 1);
  });

  if (film.isPending) {
    return (
      <div className="page">
        <BackLink />
        <p>Loading the film...</p>
      </div>
    );
  }

  if (film.isError) {
    return (
      <div className="page">
        <BackLink />
        <PixelPanel title="Film">
          <EmptyState icon="film" title="Film not found">
            {film.error.message}
          </EmptyState>
        </PixelPanel>
      </div>
    );
  }

  const { config, problem, previewPath, path } = film.data;
  const filmOrigin = health.data
    ? `${window.location.protocol}//${window.location.hostname}:${health.data.filmPort}`
    : null;

  let preview = <p>Connecting to the hub...</p>;
  if (problem) {
    preview = (
      <Notice title="This film needs a fix">
        <p className="notice-code">{problem}</p>
        <p>Fix it and the preview comes back by itself.</p>
      </Notice>
    );
  } else if (config && previewPath && filmOrigin) {
    preview = (
      <Player
        key={film.data.id}
        src={`${filmOrigin}${previewPath}`}
        title={config.title}
        width={config.width}
        height={config.height}
        fps={config.fps}
        duration={config.duration}
        reloadKey={reloadKey}
      />
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <BackLink />
        <h1>{config?.title ?? film.data.id}</h1>
      </div>

      <PixelPanel title="Preview" actions={!problem && <span className="px-tag">Live</span>}>
        {preview}
      </PixelPanel>

      <PixelPanel
        title="Film"
        actions={
          <PixelButton
            variant="ghost"
            icon="folder"
            disabled={openFolder.isPending}
            onClick={() => openFolder.mutate(film.data.id)}
          >
            Open folder
          </PixelButton>
        }
      >
        <div className="stack">
          <dl className="kv">
            {config && (
              <>
                <dt>Size</dt>
                <dd>
                  {config.width} × {config.height}
                </dd>
                <dt>Frame rate</dt>
                <dd>{config.fps} fps</dd>
                <dt>Length</dt>
                <dd>
                  {formatLength(config.duration)} ({frameCount(config.duration, config.fps)} frames)
                </dd>
                <dt>Status</dt>
                <dd>{config.status}</dd>
              </>
            )}
            <dt>Folder</dt>
            <dd>{path}</dd>
          </dl>
          <p className="hint">
            To change this film, open a terminal in its folder and run <code>claude</code>. The
            preview updates every time Claude saves a file.
          </p>
          {openFolder.isError && <p className="field-error">{openFolder.error.message}</p>}
        </div>
      </PixelPanel>
    </div>
  );
}
