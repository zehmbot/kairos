import { useEffect, useState } from "react";
import { useSheet } from "../api.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelPanel } from "./PixelPanel.tsx";

const SHEETS = [
  ["cast", "Cast"],
  ["poses", "Poses"],
  ["faces", "Faces"],
  ["props", "Props"],
  ["places", "Places"],
  ["effects", "Effects"],
  ["moves", "Moves"],
] as const;
/** The places when the film doesn't say which it has. */
const PLACES = [
  "home",
  "bedroom",
  "kitchen",
  "school",
  "classroom",
  "town",
  "park",
  "backyard",
  "forest",
];

/**
 * A Blocky film's sheets: every character, pose, face, object and place of its engine on one picture, with the
 * problems the checks found (sizes, joints). Drawn again when the film's files change. `places` are the ones the
 * film's engine says it has (a place Claude adds shows up too).
 */
export function SheetsPanel({ filmId, places }: { filmId: string; places?: string[] | null }) {
  const [name, setName] = useState<(typeof SHEETS)[number][0]>("cast");
  const [chosen, setPlace] = useState("home");
  const list = places?.length ? places : PLACES;
  const place = list.includes(chosen) ? chosen : (list[0] ?? "home");
  const sheet = useSheet(filmId, name, name === "places" ? place : undefined);
  const url = sheet.data?.url;

  // The picture's address is let go when a new one comes.
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  return (
    <PixelPanel
      title="Sheets"
      actions={
        <PixelButton
          variant="ghost"
          data-size="small"
          icon="refresh"
          tip="Draw again"
          disabled={sheet.isFetching}
          onClick={() => void sheet.refetch()}
        />
      }
    >
      <div className="stack">
        <p className="hint">
          Every character, pose, face, object and place of this film, with checks on sizes and
          joints. Claude looks at them too.
        </p>
        <div className="tool-group">
          {SHEETS.map(([id, label]) => (
            <PixelButton
              key={id}
              variant="ghost"
              data-size="small"
              aria-pressed={name === id}
              onClick={() => setName(id)}
            >
              {label}
            </PixelButton>
          ))}
        </div>
        {name === "places" && (
          <select
            className="px-input"
            aria-label="Place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
          >
            {list.map((entry) => (
              <option key={entry} value={entry}>
                {entry[0]?.toUpperCase()}
                {entry.slice(1)}
              </option>
            ))}
          </select>
        )}
        {sheet.isPending || (sheet.isFetching && !url) ? (
          <p className="hint">Drawing the sheet… (a few seconds)</p>
        ) : sheet.error ? (
          <p className="field-error">{sheet.error.message}</p>
        ) : (
          url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="sheet-link"
              data-tip="Open it big"
            >
              <img className="sheet-image px-box" src={url} alt={`The ${name} sheet`} />
            </a>
          )
        )}
        {sheet.data &&
          (sheet.data.checks.length > 0 ? (
            <div className="writer-result writer-result-problem">
              <p>
                {sheet.data.checks.length} problem{sheet.data.checks.length === 1 ? "" : "s"} found
              </p>
              <ul className="writer-warnings">
                {sheet.data.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="hint">No problems found.</p>
          ))}
      </div>
    </PixelPanel>
  );
}
