import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router";
import type { AudioTrack, FilmVoice } from "../../shared/types.ts";
import {
  useFilmVoices,
  useLines,
  useMakeScript,
  useSetFilmVoices,
  useVoiceStatus,
} from "../api.ts";
import { useVoiceSummary } from "../voiceSummary.ts";
import { CastList, speakerName } from "./CastList.tsx";
import { LinesList } from "./LinesList.tsx";
import { NarrationWriter, ResultBox } from "./NarrationWriter.tsx";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

interface VoicePanelProps {
  filmId: string;
  /** The film's sound tracks (to find where a line is on the timeline). */
  tracks: readonly AudioTrack[];
  /** The player's time now: new lines start there. */
  now: () => number;
  onSeek: (t: number) => void;
  /** Selects a clip on the timeline. */
  onShowClip: (file: string) => void;
  /** Address of a film file on the film server (to play a line). */
  fileUrl: (file: string) => string;
  /** A voice clip clicked on the timeline: its line lights up. */
  focus: { file: string; n: number } | null;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The film's voices: what needs updating (on top), who speaks, the one list of lines, and Claude writing them.
 */
export function VoicePanel({
  filmId,
  tracks,
  now,
  onSeek,
  onShowClip,
  fileUrl,
  focus,
}: VoicePanelProps) {
  const status = useVoiceStatus();
  const voices = useFilmVoices(filmId);
  const lines = useLines(filmId);
  const make = useMakeScript(filmId);
  const setVoices = useSetFilmVoices(filmId);
  const summary = useVoiceSummary(filmId, tracks);
  const [changed, setChanged] = useState<{ speaker: string; before: FilmVoice } | null>(null);

  const cast = voices.data ?? {};
  const hasKey = Boolean(status.data?.key);
  const count = summary.toVoice + summary.off;
  const ofChanged = changed
    ? summary.lines.filter(
        ({ line, status: where }) => line.speaker === changed.speaker && where === "changed",
      ).length
    : 0;

  // Once the lines of a changed voice are made again (or there were none), the bar forgets the change.
  useEffect(() => {
    if (changed && ofChanged === 0 && !setVoices.isPending) setChanged(null);
  }, [changed, ofChanged, setVoices.isPending]);

  const update = () => make.mutate({}, { onSuccess: () => setChanged(null) });

  const updateButton = (label: string) => (
    <PixelButton
      icon="sound"
      disabled={(summary.toVoice > 0 && !hasKey) || make.isPending}
      onClick={update}
    >
      {make.isPending ? "Making the voices…" : label}
    </PixelButton>
  );

  let bar: ReactNode = null;
  if (changed && ofChanged > 0) {
    bar = (
      <div className="voice-update" role="status">
        <p>
          {speakerName(changed.speaker)}'s voice changed: {ofChanged}{" "}
          {plural(ofChanged, "line still uses", "lines still use")} the old one.
        </p>
        <div className="voice-update-actions">
          {updateButton(`Update (${count})`)}
          <PixelButton
            variant="ghost"
            icon="undo"
            disabled={setVoices.isPending}
            onClick={() =>
              setVoices.mutate(
                { ...cast, [changed.speaker]: changed.before },
                { onSuccess: () => setChanged(null) },
              )
            }
          >
            Undo
          </PixelButton>
        </div>
      </div>
    );
  } else if (count > 0) {
    bar = (
      <div className="voice-update" role="status">
        <p>
          {summary.toVoice > 0
            ? `${summary.toVoice} ${plural(summary.toVoice, "line needs", "lines need")} a new voice.`
            : `${summary.off} ${plural(summary.off, "line isn't", "lines aren't")} on the timeline.`}
        </p>
        <div className="voice-update-actions">
          {updateButton(
            summary.toVoice > 0 ? `Update the voices (${count})` : `Put them back (${count})`,
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {!hasKey && status.isSuccess && (
        <p className="hint">
          To make voices, add your fish.audio key in <Link to="/settings">Settings → Voice</Link>.
        </p>
      )}
      {summary.noVoice > 0 && (
        <p className="hint">
          {summary.noVoice} {plural(summary.noVoice, "line has", "lines have")} a speaker without a
          voice: add them in Who speaks.
        </p>
      )}

      <PixelPanel title={`Who speaks (${Object.keys(cast).length})`}>
        <CastList
          filmId={filmId}
          voices={cast}
          onChanged={(speaker, before) => setChanged({ speaker, before })}
        />
      </PixelPanel>

      <LinesList
        filmId={filmId}
        voices={cast}
        lines={lines.data ?? []}
        tracks={tracks}
        hasKey={hasKey}
        now={now}
        onSeek={onSeek}
        onShowClip={onShowClip}
        fileUrl={fileUrl}
        focus={focus}
      />
      {lines.error && <p className="field-error">{lines.error.message}</p>}

      <NarrationWriter filmId={filmId} hasKey={hasKey} />

      {/* Pinned to the bottom of the tab: what needs updating stays in view while the lists scroll. */}
      {(bar || make.data || make.error) && (
        <div className="voice-dock">
          {make.data && !make.isPending && (
            <div className="voice-dock-result">
              <ResultBox
                message={`Made ${make.data.made} ${plural(make.data.made, "voice", "voices")}${make.data.reused ? `, reused ${make.data.reused}` : ""}.`}
                warnings={make.data.warnings}
              />
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="check"
                tip="Got it"
                onClick={() => make.reset()}
              />
            </div>
          )}
          {make.error && <p className="field-error">{make.error.message}</p>}
          {bar}
        </div>
      )}
    </>
  );
}
