import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { RendersOverview } from "../../shared/types.ts";
import {
  useCancelRender,
  useDeleteRender,
  useExportInfo,
  useOpenRenderFolder,
  useRenders,
  videoUrl,
} from "../api.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { formatLength } from "../player/time.ts";
import { formatBytes, formatDuration, isActive, jobStatus, progressOf } from "../renderText.ts";
import { useNow } from "../useNow.ts";

type Video = RendersOverview["videos"][number];

export function RendersPage() {
  const renders = useRenders();
  const info = useExportInfo();
  const cancel = useCancelRender();
  const [playing, setPlaying] = useState<Video | null>(null);
  const jobs = renders.data?.jobs ?? [];
  const active = jobs.filter(isActive);
  const failed = jobs.filter((job) => job.state === "failed");
  const videos = renders.data?.videos ?? [];
  const now = useNow(active.length > 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Renders</h1>
        <p>Turn your films into video files. Press Render on a film to start one.</p>
      </div>

      {info.data && !info.data.ffmpeg && (
        <Notice title="ffmpeg is missing">
          Kairos uses ffmpeg to make videos. Install it (on Windows: winget install Gyan.FFmpeg),
          then restart Kairos.
        </Notice>
      )}

      <PixelPanel title="Rendering">
        {active.length === 0 ? (
          <EmptyState icon="render" title="Nothing rendering">
            Open a film and press Render. Its progress shows up here.
          </EmptyState>
        ) : (
          <ul className="render-list">
            {active.map((job) => (
              <li key={job.id} className="render-row px-box" data-state={job.state}>
                <div className="render-head">
                  <Link to={`/films/${encodeURIComponent(job.filmId)}`} className="render-title">
                    {job.title}
                  </Link>
                  <PixelButton
                    variant="ghost"
                    data-size="small"
                    disabled={cancel.isPending || job.state === "joining"}
                    onClick={() => cancel.mutate(job.id)}
                  >
                    Cancel
                  </PixelButton>
                </div>
                <div
                  className="px-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={job.total}
                  aria-valuenow={job.done}
                  aria-label={`Rendering ${job.title}`}
                >
                  <div
                    className="px-progress-fill"
                    style={{ width: `${progressOf(job) * 100}%` }}
                  />
                </div>
                <p className="render-status">{jobStatus(job, now)}</p>
              </li>
            ))}
          </ul>
        )}
      </PixelPanel>

      {failed.length > 0 && (
        <PixelPanel title="Problems">
          <ul className="render-list">
            {failed.map((job) => (
              <li key={job.id} className="render-row px-box">
                <Link to={`/films/${encodeURIComponent(job.filmId)}`} className="render-title">
                  {job.title}
                </Link>
                <p className="notice-code">{job.error}</p>
                <p className="hint">Fix the film, then press Render again.</p>
              </li>
            ))}
          </ul>
        </PixelPanel>
      )}

      <PixelPanel title="Videos">
        {renders.isPending ? (
          <p>Loading videos...</p>
        ) : videos.length === 0 ? (
          <EmptyState icon="film" title="No videos yet">
            Finished renders show up here, newest first.
          </EmptyState>
        ) : (
          <ul className="render-list">
            {videos.map((video) => (
              <VideoRow
                key={`${video.filmId}@${video.version}`}
                video={video}
                onPlay={setPlaying}
              />
            ))}
          </ul>
        )}
      </PixelPanel>

      <VideoDialog video={playing} onClose={() => setPlaying(null)} />
    </div>
  );
}

function VideoRow({ video, onPlay }: { video: Video; onPlay: (video: Video) => void }) {
  const remove = useDeleteRender();
  const openFolder = useOpenRenderFolder();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const target = { filmId: video.filmId, version: video.version };
  const error = remove.error ?? openFolder.error;

  return (
    <li className="render-row px-box">
      <div className="render-head">
        <span className="render-title">
          {video.title} <span className="px-tag">v{video.version}</span>
        </span>
        <span className="render-date">{new Date(video.createdAt).toLocaleString()}</span>
      </div>
      <p className="render-meta">
        {video.width} × {video.height} · {video.fps} fps · {formatLength(video.duration)} ·{" "}
        {formatBytes(video.bytes)} · {video.quality === "high" ? "High" : "Smaller file"} · made in{" "}
        {formatDuration(video.seconds)}
      </p>
      <div className="note-actions">
        <PixelButton data-size="small" icon="play" onClick={() => onPlay(video)}>
          Play
        </PixelButton>
        <PixelButton
          variant="ghost"
          data-size="small"
          icon="folder"
          onClick={() => openFolder.mutate(target)}
        >
          Open folder
        </PixelButton>
        {confirmDelete ? (
          <>
            <span className="note-confirm">Delete this video?</span>
            <PixelButton
              data-size="small"
              icon="trash"
              disabled={remove.isPending}
              onClick={() => remove.mutate(target)}
            >
              Delete
            </PixelButton>
            <PixelButton variant="ghost" data-size="small" onClick={() => setConfirmDelete(false)}>
              Keep
            </PixelButton>
          </>
        ) : (
          <PixelButton
            variant="ghost"
            data-size="small"
            icon="trash"
            aria-label="Delete"
            title="Delete this video"
            onClick={() => setConfirmDelete(true)}
          />
        )}
      </div>
      {error && <p className="field-error">{error.message}</p>}
    </li>
  );
}

/** Plays a finished video in the app. */
function VideoDialog({ video, onClose }: { video: Video | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (video && !dialog.open) dialog.showModal();
    else if (!video && dialog.open) dialog.close();
  }, [video]);

  return (
    <dialog
      ref={dialogRef}
      className="px-dialog px-dialog-video px-box"
      aria-label={video ? `${video.title}, version ${video.version}` : "Video"}
      onClose={onClose}
    >
      {video && (
        <div className="stack">
          <h2 className="dialog-title">
            {video.title} · v{video.version}
          </h2>
          {/* biome-ignore lint/a11y/useMediaCaption: the films have no caption tracks yet. */}
          <video
            className="video-player"
            src={videoUrl(video.filmId, video.version)}
            controls
            autoPlay
          />
          <div className="form-actions">
            <PixelButton variant="ghost" onClick={onClose}>
              Close
            </PixelButton>
          </div>
        </div>
      )}
    </dialog>
  );
}
