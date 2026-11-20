import { useEffect, useState } from "react";
import type { ClaudeActivity, ClaudeEnd } from "../../shared/types.ts";
import { useClaudeActivity, useStopClaude, useStopWriter } from "../api.ts";
import { useHubEvent } from "../hubEvents.ts";
import { useNow } from "../useNow.ts";
import { ClaudeBuddy } from "./ClaudeBuddy.tsx";
import { PixelButton } from "./PixelButton.tsx";

/** How long the character cheers when Claude is done. */
const CHEER_MS = 1800;

/** The loading screen's title. */
export function claudeTitle(activity: ClaudeActivity): string {
  switch (activity.source) {
    case "make":
      return "Claude is making your film";
    case "ask":
      return "Claude is changing your film";
    case "narration":
      return "Claude is writing the narration";
    case "terminal":
      return activity.stage === "waiting"
        ? "Claude is waiting for you"
        : "Claude is working in your terminal";
  }
}

/** `m:ss` since `since`. */
function elapsed(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** This film's activity, and a short cheer right after Claude finished well. */
export function useFilmActivity(filmId: string): {
  activity: ClaudeActivity | null;
  cheering: boolean;
} {
  const activity = useClaudeActivity().data?.[filmId] ?? null;
  const [cheerUntil, setCheerUntil] = useState(0);
  useHubEvent((event) => {
    if (
      event.type === "claude-activity" &&
      event.id === filmId &&
      event.ended?.outcome === "done"
    ) {
      setCheerUntil(Date.now() + CHEER_MS);
    }
  });
  const cheering = cheerUntil > 0 && !activity;
  useEffect(() => {
    if (!cheering) return;
    const timer = setTimeout(() => setCheerUntil(0), Math.max(0, cheerUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [cheering, cheerUntil]);
  return { activity, cheering };
}

/**
 * The loading screen over the preview while Claude works on the film: the Claude character at work, what it is
 * doing, the time so far, Peek (see the film underneath) and Stop (for runs Kairos started).
 */
export function ClaudeAtWork({ filmId }: { filmId: string }) {
  const { activity, cheering } = useFilmActivity(filmId);
  const [peek, setPeek] = useState(false);
  const stopClaude = useStopClaude(filmId);
  const stopWriter = useStopWriter(filmId);
  const now = useNow(Boolean(activity));
  const working = Boolean(activity);

  // Each new run covers the film again.
  useEffect(() => {
    if (!working) setPeek(false);
  }, [working]);

  if (!activity && !cheering) return null;

  if (activity && peek) {
    return (
      <div className="claude-peek px-box" role="status">
        <ClaudeBuddy mood={activity.stage} size={40} />
        <span className="claude-peek-text">
          <strong>{claudeTitle(activity)}</strong>
          {activity.detail && <span className="hint">{activity.detail}</span>}
        </span>
        <PixelButton variant="ghost" data-size="small" onClick={() => setPeek(false)}>
          Cover
        </PixelButton>
      </div>
    );
  }

  const stoppable = activity && activity.source !== "terminal";
  const stopping = stopClaude.isPending || stopWriter.isPending;
  return (
    <div className="claude-cover" role="status" aria-live="polite">
      <ClaudeBuddy mood={activity ? activity.stage : "done"} size={160} />
      <p className="claude-cover-title">{activity ? claudeTitle(activity) : "Done!"}</p>
      {activity && (
        <>
          <p className="claude-cover-step">
            {activity.detail ?? "Working"}
            {activity.stage !== "waiting" && <span className="writer-dots" />}
          </p>
          <p className="claude-cover-time">{elapsed(activity.startedAt, now)}</p>
          <div className="claude-cover-actions">
            <PixelButton
              variant="ghost"
              data-size="small"
              title="See the film while Claude works"
              onClick={() => setPeek(true)}
            >
              Peek
            </PixelButton>
            {stoppable && (
              <PixelButton
                variant="ghost"
                data-size="small"
                data-tone="danger"
                disabled={stopping}
                onClick={() =>
                  activity.source === "narration" ? stopWriter.mutate() : stopClaude.mutate()
                }
              >
                {stopping ? "Stopping..." : "Stop"}
              </PixelButton>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** What Claude said when it finished (or why it couldn't), above the player until you close it. */
export function ClaudeEnded({
  filmId,
  onRetry,
  onOpenClaude,
}: {
  filmId: string;
  onRetry?: (ended: ClaudeEnd) => void;
  onOpenClaude: () => void;
}) {
  const [ended, setEnded] = useState<ClaudeEnd | null>(null);
  useHubEvent((event) => {
    if (event.type !== "claude-activity" || event.id !== filmId) return;
    if (event.activity) setEnded(null);
    else if (event.ended && event.ended.outcome !== "stopped") {
      // Your terminal shows Claude's words already.
      if (event.ended.source === "terminal" && event.ended.outcome === "done") return;
      if (event.ended.summary || event.ended.message) setEnded(event.ended);
    }
  });
  if (!ended) return null;
  const failed = ended.outcome === "failed";
  return (
    <div className={`claude-ended ${failed ? "claude-ended-problem" : ""}`} role="status">
      <ClaudeBuddy mood={failed ? "waiting" : "done"} size={40} />
      <p>
        <strong>{failed ? "Claude couldn't finish. " : "Claude: "}</strong>
        {failed ? ended.message : ended.summary}
      </p>
      <div className="claude-ended-actions">
        {failed && onRetry && ended.source !== "terminal" && ended.source !== "narration" && (
          <PixelButton variant="ghost" data-size="small" onClick={() => onRetry(ended)}>
            Try again
          </PixelButton>
        )}
        {failed && (
          <PixelButton variant="ghost" data-size="small" icon="terminal" onClick={onOpenClaude}>
            Open Claude here
          </PixelButton>
        )}
        <PixelButton variant="ghost" data-size="small" onClick={() => setEnded(null)}>
          Close
        </PixelButton>
      </div>
    </div>
  );
}
