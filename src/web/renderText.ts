import type { RenderJob, RendersOverview } from "../shared/types.ts";

/** How long the film page keeps saying a render ended (done, failed or cancelled). */
export const RECENT_MS = 10 * 60_000;

/**
 * The render to mention on a film's page: the latest one while it runs, or for a few minutes after it ended.
 * A finished render is only mentioned while its video still exists (it may have been deleted since).
 */
export function filmRender(
  overview: Pick<RendersOverview, "jobs" | "videos"> | undefined,
  filmId: string,
  now: number,
): RenderJob | null {
  const latest = overview?.jobs.find((job) => job.filmId === filmId);
  if (!latest) return null;
  if (isActive(latest)) return latest;
  if (!latest.endedAt || now - Date.parse(latest.endedAt) >= RECENT_MS) return null;
  if (latest.state === "done") {
    const kept = overview?.videos.some(
      (video) => video.filmId === filmId && video.version === latest.version,
    );
    if (!kept) return null;
  }
  return latest;
}

/** `48234567` -> `"46.0 MB"` */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** `95` -> `"1 min 35 s"` */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const isActive = (job: RenderJob) =>
  job.state === "queued" || job.state === "running" || job.state === "joining";

/** 0 to 1. */
export const progressOf = (job: RenderJob) =>
  job.total > 0 ? Math.min(1, job.done / job.total) : 0;

/** Seconds left, from the speed so far, or null while it's too early to tell. */
export function secondsLeft(job: RenderJob, now: number): number | null {
  if (job.state !== "running" || !job.startedAt || job.done < 5) return null;
  const elapsed = (now - Date.parse(job.startedAt)) / 1000;
  if (elapsed <= 0) return null;
  return ((job.total - job.done) / job.done) * elapsed;
}

/** One short line saying where a render is. */
export function jobStatus(job: RenderJob, now: number): string {
  switch (job.state) {
    case "queued":
      return "Waiting for the render before it";
    case "running": {
      const left = secondsLeft(job, now);
      const percent = Math.floor(progressOf(job) * 100);
      return `Rendering ${percent}% · frame ${job.done} of ${job.total}${left === null ? "" : ` · about ${formatDuration(left)} left`}`;
    }
    case "joining":
      return "Putting the video together...";
    case "done":
      return `Done: version ${job.version}`;
    case "cancelled":
      return "Cancelled";
    case "failed":
      return job.error ?? "The render failed.";
  }
}
