import { useId, useState } from "react";
import type { ClaudeTurn } from "../../shared/types.ts";
import { useAskClaude, useClaude, useFilmClaude, useStopClaude } from "../api.ts";
import { claudeTitle, useFilmActivity } from "./ClaudeAtWork.tsx";
import { ClaudeBuddy } from "./ClaudeBuddy.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const OUTCOME_WORDS: Record<ClaudeTurn["outcome"], string> = {
  running: "Working",
  done: "Done",
  failed: "Didn't finish",
  stopped: "Stopped",
};

function when(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The Claude tab: ask Claude for a change and it works in the background, in the film's conversation (it remembers
 * what it made). Also: make the film from its brief, fix your notes, and the last runs with Claude's answers.
 */
export function ClaudePanel({
  filmId,
  hasBrief,
  openNotes,
}: {
  filmId: string;
  hasBrief: boolean;
  openNotes: number;
}) {
  const claude = useFilmClaude(filmId);
  const status = useClaude();
  const ask = useAskClaude(filmId);
  const stop = useStopClaude(filmId);
  const { activity } = useFilmActivity(filmId);
  const [text, setText] = useState("");
  const textId = useId();

  const installed = status.data ? Boolean(status.data.cli) : true;
  const turns = claude.data?.turns ?? [];
  const made = turns.some((turn) => turn.kind === "make" && turn.outcome === "done");
  const busy = Boolean(activity) || ask.isPending;

  const send = () => {
    const words = text.trim();
    if (!words || busy) return;
    ask.mutate({ kind: "ask", text: words }, { onSuccess: () => setText("") });
  };

  return (
    <PixelPanel title="Claude">
      <div className="stack">
        {!installed && (
          <p className="hint">
            Claude Code isn't installed on this computer. Install it (Settings → Claude Code), then
            ask here.
          </p>
        )}
        {activity ? (
          <div className="writer-progress px-box" aria-live="polite">
            <ClaudeBuddy mood={activity.stage} size={40} />
            <span className="writer-stage">
              {claudeTitle(activity)}
              {activity.stage !== "waiting" && <span className="writer-dots" />}
            </span>
            {activity.detail && <span className="hint">{activity.detail}</span>}
            {activity.source !== "terminal" && activity.source !== "narration" && (
              <PixelButton
                variant="ghost"
                data-size="small"
                data-tone="danger"
                disabled={stop.isPending}
                onClick={() => stop.mutate()}
              >
                Stop
              </PixelButton>
            )}
          </div>
        ) : (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label htmlFor={textId} className="field-label">
              What should Claude change?
            </label>
            <textarea
              id={textId}
              className="px-input px-textarea"
              rows={3}
              maxLength={4000}
              value={text}
              placeholder="Make the ending funnier, and give Ruby a red cap."
              disabled={!installed}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <p className="hint">
              Claude works in the background, on your Claude plan, and remembers what it made. The
              preview shows when it's done.
            </p>
            <div className="claude-panel-actions">
              <PixelButton type="submit" disabled={!installed || busy || !text.trim()}>
                Ask Claude
              </PixelButton>
              {openNotes > 0 && (
                <PixelButton
                  variant="ghost"
                  disabled={!installed || busy}
                  onClick={() => ask.mutate({ kind: "ask", text: "Fix my open frame notes." })}
                >
                  Fix my notes ({openNotes})
                </PixelButton>
              )}
              {hasBrief && !made && (
                <PixelButton
                  variant="ghost"
                  disabled={!installed || busy}
                  onClick={() => ask.mutate({ kind: "make" })}
                >
                  Make it from the brief
                </PixelButton>
              )}
            </div>
            {ask.error && <p className="field-error">{ask.error.message}</p>}
          </form>
        )}

        {turns.length > 0 && (
          <ol className="claude-turns">
            {turns.map((turn) => (
              <li key={turn.id} className="claude-turn px-box" data-outcome={turn.outcome}>
                <p className="claude-turn-head">
                  <strong>
                    {turn.kind === "make" ? "Make the film from the brief" : turn.text}
                  </strong>
                  <span className="px-tag" data-outcome={turn.outcome}>
                    {OUTCOME_WORDS[turn.outcome]}
                  </span>
                </p>
                {turn.answer && <p className="claude-turn-answer">{turn.answer}</p>}
                {turn.outcome === "failed" && turn.message && (
                  <p className="field-error">{turn.message}</p>
                )}
                <p className="hint">{when(turn.startedAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PixelPanel>
  );
}
