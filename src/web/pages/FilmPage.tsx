import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { talkSpans, voiceSpans } from "../../shared/duck.ts";
import {
  exportSize,
  isReshaped,
  shapeName,
  shapeOf,
  showingQuery,
  withQuery,
} from "../../shared/export.ts";
import { type FilmAbilities, type FilmSound, NO_ABILITIES } from "../../shared/film-protocol.ts";
import { mediaKindOf } from "../../shared/media.ts";
import type { AudioTrack, FilmShape, Note } from "../../shared/types.ts";
import {
  syncFilmSounds,
  useAddEffectSound,
  useAddNote,
  useAskClaude,
  useChangeFilm,
  useFilm,
  useFilmClaude,
  useFilmWords,
  useHealth,
  useLines,
  useNotes,
  useOpenClaude,
  useOpenFilmFolder,
  useReferences,
  useRenders,
  useSavePicture,
  useSaveTracks,
  useTranscribe,
} from "../api.ts";
import {
  AddDialog,
  type Pending,
  PurposeDialog,
  type SideTab,
  useFilmAdds,
} from "../components/AddToFilm.tsx";
import { BackLink } from "../components/BackLink.tsx";
import { BriefPanel } from "../components/BriefPanel.tsx";
import { ClaudeAtWork, ClaudeEnded, useFilmActivity } from "../components/ClaudeAtWork.tsx";
import { ClaudePanel } from "../components/ClaudePanel.tsx";
import { DeleteFilmDialog } from "../components/DeleteFilmDialog.tsx";
import { DropZone } from "../components/DropZone.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { FrameRateDialog } from "../components/FrameRateDialog.tsx";
import { MarksLayer } from "../components/MarksLayer.tsx";
import { MarkTools } from "../components/MarkTools.tsx";
import { NoteForm } from "../components/NoteForm.tsx";
import { NotesPanel } from "../components/NotesPanel.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelIcon } from "../components/PixelIcon.tsx";
import { PixelMenu } from "../components/PixelMenu.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { Player, type PlayerHandle } from "../components/Player.tsx";
import { ReferencesPanel } from "../components/ReferencesPanel.tsx";
import { RenderDialog } from "../components/RenderDialog.tsx";
import { SaveTemplateDialog } from "../components/SaveTemplateDialog.tsx";
import { ShapeSwitch } from "../components/ShapeSwitch.tsx";
import { SideTabs } from "../components/SideTabs.tsx";
import { isOwnSound, SoundPanel } from "../components/SoundPanel.tsx";
import { Timeline } from "../components/Timeline.tsx";
import { VoicePanel } from "../components/VoicePanel.tsx";
import { groupFiles, type Purpose, purposesFor } from "../filmAdd.ts";
import { useHubEvent, useHubReconnect } from "../hubEvents.ts";
import { filmFileUrl } from "../player/audioSync.ts";
import { noteCovers } from "../player/marks.ts";
import { formatLength, timeOf } from "../player/time.ts";
import { useNoteDraft } from "../player/useNoteDraft.ts";
import { filmRender, jobStatus } from "../renderText.ts";
import { useNow } from "../useNow.ts";
import { useVoiceSummary } from "../voiceSummary.ts";

const SIDE_TABS: readonly SideTab[] = ["claude", "notes", "sound", "voice", "references", "brief"];
const NO_TRACKS: readonly AudioTrack[] = [];

/**
 * The side tab shown for a film, remembered per film in this browser. A film you haven't opened before starts on
 * the Claude tab: where Claude makes it (or is making it) and where you ask for changes.
 */
function useFilmTab(id: string): [SideTab, (tab: SideTab) => void] {
  const key = `kairos.film-tab.${id}`;
  const read = useCallback((): SideTab => {
    try {
      const saved = localStorage.getItem(key) as SideTab | null;
      if (saved && SIDE_TABS.includes(saved)) return saved;
    } catch {}
    return "claude";
  }, [key]);
  const [state, setState] = useState(() => ({ id, tab: read() }));
  const tab = state.id === id ? state.tab : read();
  const set = useCallback(
    (next: SideTab) => {
      setState({ id, tab: next });
      try {
        localStorage.setItem(key, next);
      } catch {}
    },
    [id, key],
  );
  return [tab, set];
}

/** How long a story length must hold before the film is fitted to it (a page that reloads says it again). */
const FIT_AFTER_MS = 1500;

/** The story length you went back from with Undo, per film: Kairos doesn't fit the film to it again. */
const keptKey = (filmId: string) => `kairos.length-kept.${filmId}`;

function readKept(filmId: string): number | null {
  try {
    const value = Number(localStorage.getItem(keptKey(filmId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * A film that times itself (Blocky follows its voices) says how long its story lasts. When the film's length
 * differs, Kairos fits it by itself and says so, with Undo; after Undo, one click fits it again. Nothing shows
 * while Claude works on the film: the story is still changing.
 */
function StoryLength({
  filmId,
  story,
  duration,
}: {
  filmId: string;
  story: number | null;
  duration: number;
}) {
  const change = useChangeFilm(filmId);
  const { mutate } = change;
  const working = Boolean(useFilmActivity(filmId).activity);
  const [kept, setKept] = useState(() => readKept(filmId));
  const [fitted, setFitted] = useState<{ from: number; to: number } | null>(null);
  const fit = story === null ? null : Math.round(story * 10) / 10;
  const differs = fit !== null && Math.abs(fit - duration) >= 0.05;
  const fitByItself = differs && !working && kept !== fit && !change.isPending && !change.error;

  useEffect(() => {
    if (!fitByItself || fit === null) return;
    const timer = setTimeout(
      () => mutate({ duration: fit }, { onSuccess: () => setFitted({ from: duration, to: fit }) }),
      FIT_AFTER_MS,
    );
    return () => clearTimeout(timer);
  }, [fitByItself, fit, duration, mutate]);

  if (working) return null;

  if (fitted && !differs) {
    const undo = () => {
      // Kept first, so the film isn't fitted again the moment it's back.
      setKept(fitted.to);
      try {
        localStorage.setItem(keptKey(filmId), String(fitted.to));
      } catch {}
      mutate({ duration: fitted.from }, { onSuccess: () => setFitted(null) });
    };
    return (
      <div className="story-length" role="status">
        <p>
          The film now lasts {formatLength(fitted.to)}, as long as its story (it was{" "}
          {formatLength(fitted.from)}).
        </p>
        <PixelButton
          variant="ghost"
          data-size="small"
          icon="undo"
          disabled={change.isPending}
          onClick={undo}
        >
          Undo
        </PixelButton>
        <PixelButton variant="ghost" data-size="small" onClick={() => setFitted(null)}>
          OK
        </PixelButton>
      </div>
    );
  }

  // After Undo (or when fitting failed): one click fits it.
  if (!differs || fit === null || (kept !== fit && !change.error)) return null;
  return (
    <div className="story-length" role="status">
      <p>
        The story lasts {formatLength(fit)}, the film {formatLength(duration)}
        {fit > duration ? ": its end is cut off." : "."}
      </p>
      <PixelButton
        variant="ghost"
        data-size="small"
        disabled={change.isPending}
        onClick={() => mutate({ duration: fit })}
      >
        Make it {formatLength(fit)}
      </PixelButton>
      {change.error && <span className="field-error">{change.error.message}</span>}
    </div>
  );
}

export function FilmPage() {
  const { id = "" } = useParams();
  const film = useFilm(id);
  const health = useHealth();
  const openFolder = useOpenFilmFolder();
  const openClaude = useOpenClaude();
  const askClaude = useAskClaude(id);
  const filmClaude = useFilmClaude(id);
  const notes = useNotes(id, Boolean(film.data?.config));
  const addNote = useAddNote(id);
  const { draft, ...draftActions } = useNoteDraft();
  const playerRef = useRef<PlayerHandle>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showMarks, setShowMarks] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [rateOpen, setRateOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // How long the film says its story lasts (a Blocky film follows its voices).
  const [storyLength, setStoryLength] = useState<number | null>(null);
  // What the film can do for an export (reframe itself, give its captions), and the shape you're looking at it in
  // (null: its own). Both belong to this film only.
  const [abilitiesOf, setAbilitiesOf] = useState<{ id: string; abilities: FilmAbilities }>({
    id,
    abilities: NO_ABILITIES,
  });
  const abilities = abilitiesOf.id === id ? abilitiesOf.abilities : NO_ABILITIES;
  const onAbilities = useCallback(
    (next: FilmAbilities) => setAbilitiesOf({ id, abilities: next }),
    [id],
  );
  const [shownOf, setShownOf] = useState<{ id: string; shape: FilmShape | null }>({
    id,
    shape: null,
  });
  // Only a film that reframes itself shows in another shape.
  const shown = shownOf.id === id && abilities.reshape ? shownOf.shape : null;
  // The effect sounds the film places (Blocky): sent to Kairos when they change, for the Effects lane.
  const sentSounds = useRef<string | null>(null);
  const onSounds = useCallback(
    (sounds: FilmSound[] | null) => {
      if (!sounds) return;
      const key = `${id}|${JSON.stringify(sounds)}`;
      if (sentSounds.current === key) return;
      sentSounds.current = key;
      syncFilmSounds(id, sounds).catch(() => {
        sentSounds.current = null;
      });
    },
    [id],
  );
  const navigate = useNavigate();
  const references = useReferences(id, Boolean(film.data));
  const voiceSummary = useVoiceSummary(id, film.data?.config?.audio ?? NO_TRACKS);
  // A clip clicked on the timeline lights up its line (Voice) or sound (Sound); Go to in a tab selects a clip.
  const [focus, setFocus] = useState<{ file: string; n: number } | null>(null);
  const [selectClip, setSelectClip] = useState<{ file: string; n: number } | null>(null);
  const filmWords = useFilmWords(id);
  // A frame saved as a picture (a cover, a thumbnail), in the shape you're looking at.
  const savePicture = useSavePicture(id);
  const lines = useLines(id);
  const addEffect = useAddEffectSound(id);
  const transcribe = useTranscribe(id);
  const saveTracks = useSaveTracks(id);
  const [tab, setTab] = useFilmTab(id);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const adds = useFilmAdds(id, () => playerRef.current?.time() ?? 0, setTab);
  // Drawing on the video starts a note: its form is in the Notes tab.
  const drawing = draft.t !== null;
  useEffect(() => {
    if (drawing) setTab("notes");
  }, [drawing, setTab]);
  const renders = useRenders();
  // This film's latest render: shown while it runs, and for a few minutes after it ends. The clock ticks
  // while there's something to show, so "time left" moves and an old message goes away by itself.
  const clock = useNow(Boolean(filmRender(renders.data, id, Date.now())));
  const renderJob = filmRender(renders.data, id, clock);

  // Live reload: any saved file in this film reloads the preview.
  const seen = useRef<{ id: string; changedAt: number | null; fromEvent: boolean }>({
    id,
    changedAt: null,
    fromEvent: false,
  });
  useHubEvent((event) => {
    if (event.type === "films-changed" && event.ids.includes(id)) {
      setReloadKey((key) => key + 1);
      seen.current.fromEvent = true;
    }
  });
  // The hub was away (restarted, the computer slept): a reload made meanwhile found no film server.
  useHubReconnect(() => {
    setReloadKey((key) => key + 1);
    seen.current.fromEvent = true;
  });
  // A tab in the background can miss those messages (Chrome drops or freezes its connection while Claude works
  // for minutes). The film is read again when you come back (and after a reconnect): if its last change moved on,
  // the preview catches up. Not twice for a change a message already reloaded.
  const changedAt = film.data?.updatedAt ?? null;
  const fetchedAt = film.dataUpdatedAt;
  useEffect(() => {
    if (changedAt === null || fetchedAt === 0) return;
    const last = seen.current;
    if (
      last.id === id &&
      last.changedAt !== null &&
      changedAt > last.changedAt &&
      !last.fromEvent
    ) {
      setReloadKey((key) => key + 1);
    }
    seen.current = { id, changedAt, fromEvent: false };
  }, [id, changedAt, fetchedAt]);

  if (film.isPending) {
    return (
      <div className="page">
        <BackLink to="/films" label="All films" />
        <p>Loading the film...</p>
      </div>
    );
  }

  if (film.isError) {
    return (
      <div className="page">
        <BackLink to="/films" label="All films" />
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
  // The size the preview shows the film at: its own, or another shape's (the film frames itself for it).
  const shownSize = config ? exportSize(config, shown) : null;
  const reshaped = Boolean(config && shownSize && isReshaped(config, shownSize));
  // Words a subtitles file can show: the film's own captions, or sounds on its timeline with word timings.
  const hasWords =
    abilities.captions ||
    Boolean(
      config?.audio.some(
        (track) =>
          !track.muted && !track.sfx && (filmWords.data?.[track.file]?.words.length ?? 0) > 0,
      ),
    );
  const allNotes = notes.data ?? [];
  const openNotes = allNotes.filter((note) => note.status === "open");

  const now = () => playerRef.current?.time() ?? 0;
  const pause = () => playerRef.current?.pause();
  const showTime = (t: number) => playerRef.current?.seekTime(t);

  const openNote = (note: Note) => {
    setTab("notes");
    setFocusedId(note.id);
    showTime(note.t);
    // On narrow screens the video is above the list; bring it back into view.
    document.querySelector(".player")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const saveNote = () => {
    if (draft.t === null) return;
    addNote.mutate(
      {
        text: draft.text,
        t: draft.t,
        until: draft.range ? draft.until : null,
        shapes: draft.shapes,
      },
      {
        onSuccess: (note) => {
          draftActions.clear();
          setFocusedId(note.id);
        },
      },
    );
  };

  let preview = <p>Connecting to the hub...</p>;
  if (problem) {
    preview = (
      <Notice title="This film needs a fix">
        <p className="notice-code">{problem}</p>
        <p>Fix it and the preview comes back by itself.</p>
      </Notice>
    );
  } else if (config && shownSize && previewPath && filmOrigin) {
    // While a note is being written, only its own marks show. Otherwise: open notes (and the one opened).
    const overlay = (frame: number) => {
      const t = timeOf(frame, config.fps);
      const shapes =
        draft.t !== null
          ? draft.shapes
          : showMarks
            ? allNotes
                .filter((note) => note.status === "open" || note.id === focusedId)
                .filter((note) => noteCovers(note, t, config.fps))
                .flatMap((note) => note.shapes)
            : [];
      return (
        <MarksLayer
          width={config.width}
          height={config.height}
          shapes={shapes}
          drawing={{
            tool: draft.tool,
            onStart: pause,
            onShape: (shape) => draftActions.addShape(shape, now()),
          }}
        />
      );
    };

    preview = (
      <div className="stack">
        <Player
          // A new frame rate starts the player over (frame numbers mean other times now), and so does another shape.
          key={`${film.data.id}@${config.fps}@${shownSize.width}x${shownSize.height}`}
          ref={playerRef}
          // `kairos=preview`: the film may draw a lighter look while you watch (renders get its full look). In
          // another shape, the page is asked for that size.
          src={withQuery(
            `${filmOrigin}${previewPath}?kairos=preview`,
            reshaped ? showingQuery({ size: shownSize }) : "",
          )}
          title={config.title}
          width={shownSize.width}
          height={shownSize.height}
          fps={config.fps}
          duration={config.duration}
          reloadKey={reloadKey}
          // Notes and their marks belong to the film's own shape.
          overlay={reshaped ? undefined : overlay}
          cover={<ClaudeAtWork filmId={film.data.id} />}
          noteMarks={openNotes}
          onStoryLength={setStoryLength}
          onSounds={onSounds}
          onAbilities={onAbilities}
          video={config.video.map((clip) => ({
            ...clip,
            url: filmFileUrl(filmOrigin, film.data.id, clip.file),
          }))}
          timeline={({ t, scenes, seekTime }) => (
            <Timeline
              duration={config.duration}
              filmSize={{ width: config.width, height: config.height }}
              video={config.video}
              fileUrl={(file) => filmFileUrl(filmOrigin, film.data.id, file)}
              onAddClips={(files, start, lane) => void adds.addClipsAt(files, start, lane)}
              time={t}
              scenes={scenes}
              notes={openNotes}
              tracks={config.audio}
              soundUrl={(file) =>
                `/api/films/${encodeURIComponent(film.data.id)}/sounds/file?path=${encodeURIComponent(file)}`
              }
              onSeek={seekTime}
              onChange={(next) => saveTracks.mutate(next)}
              onAddSounds={(files, start, lane) => void adds.addSoundsAt(files, start, lane)}
              words={filmWords.data}
              onGetWords={(file) => transcribe.mutate(file)}
              wordsBusy={transcribe.isPending ? transcribe.variables : null}
              wordsError={transcribe.error?.message ?? null}
              onClipClick={(file, kind) => {
                // Video clips and effect sounds have no tab: their settings are under the timeline.
                if (kind === "video") return;
                const track = config.audio.find((entry) => entry.file === file);
                if (!track || !isOwnSound(track)) {
                  if (!file.startsWith("voice/")) return;
                  setTab("voice");
                } else {
                  setTab("sound");
                }
                setFocus({ file, n: Date.now() });
              }}
              selectFile={selectClip}
              stale={voiceSummary.staleFiles}
              onAddEffect={(sound, start) => addEffect.mutate({ sound, start })}
            />
          )}
          audio={[
            ...config.audio.map((track) => ({
              url: filmFileUrl(filmOrigin, film.data.id, track.file),
              start: track.start,
              volume: track.volume,
              from: track.from,
              length: track.length,
              muted: track.muted,
              loop: track.loop,
              duck: track.duck ? talkSpans(voiceSpans(config.audio, lines.data ?? [])) : undefined,
            })),
            // A video clip's own sound plays with the film's sound.
            ...config.video
              .filter((clip) => mediaKindOf(clip.file) === "video")
              .map((clip) => ({
                url: filmFileUrl(filmOrigin, film.data.id, clip.file),
                start: clip.start,
                volume: clip.volume,
                from: clip.from,
                length: clip.length,
                muted: clip.muted,
              })),
          ]}
        />
        <p className="hint preview-hint">
          To change this film, ask Claude in the{" "}
          <button type="button" className="link-button" onClick={() => setTab("claude")}>
            Claude tab
          </button>
          . The preview updates every time Claude saves a file.
        </p>
      </div>
    );
  }

  const canReview = Boolean(config && !problem);

  /** Files for one purpose (from the Add window, or dropped on the Sound or References tab). */
  const addFor = (purpose: Purpose, files: File[]) => {
    const { groups } = groupFiles(files);
    const fits = groups.every((group) =>
      purposesFor(group.kind, group.files[0]?.name ?? "").includes(purpose),
    );
    if (groups.length === 0 || !fits) {
      setPending({ files });
      return;
    }
    void adds.addFiles(groups, Object.fromEntries(groups.map((group) => [group.kind, purpose])));
  };

  /** Files dropped on the page: straight in when dropped on a tab that says what they are, else ask. */
  const onDrop = (files: File[], zone: string | null) => {
    if (zone === "sound" || zone === "reference") addFor(zone, files);
    else setPending({ files });
  };

  const tabs = [
    { id: "claude" as const, label: "Claude" },
    { id: "notes" as const, label: "Notes", count: openNotes.length },
    // Lines that need a new voice show in amber; otherwise, how many lines there are.
    voiceSummary.toVoice > 0
      ? { id: "voice" as const, label: "Voice", count: voiceSummary.toVoice, alert: true }
      : { id: "voice" as const, label: "Voice", count: voiceSummary.lines.length },
    // Music and the sounds you added (voice lines are in Voice, effects on their lane).
    {
      id: "sound" as const,
      label: "Sound",
      count: config?.audio.filter(isOwnSound).length ?? 0,
    },
  ];
  // Opened less often: under More.
  const moreTabs = [
    { id: "references" as const, label: "References", count: references.data?.length ?? 0 },
    ...(film.data.hasBrief ? [{ id: "brief" as const, label: "Brief" }] : []),
  ];
  const shownTab = [...tabs, ...moreTabs].some((entry) => entry.id === tab) ? tab : "claude";

  return (
    <DropZone
      className="film-drop"
      onFiles={onDrop}
      label="Drop to add to this film"
      labels={{ sound: "Drop to add to the sound", reference: "Drop to add as a reference" }}
    >
      <div className="page film-page">
        <div className="film-head">
          <BackLink to="/films" label="All films" />
          <div className="film-title-row">
            <h1>{config?.title ?? film.data.id}</h1>
            <p className="film-meta">
              {config ? (
                <>
                  <span data-tip={`${config.width} × ${config.height}`}>{shapeName(config)}</span> ·{" "}
                  {formatLength(config.duration)} ·{" "}
                  <button
                    type="button"
                    className="film-meta-button"
                    data-tip="Change the frame rate"
                    onClick={() => setRateOpen(true)}
                  >
                    {config.fps} fps
                    <PixelIcon name="pen" size={16} />
                  </button>
                </>
              ) : (
                path
              )}
            </p>
            <div className="film-actions">
              <PixelButton
                variant="ghost"
                icon="plus"
                tip="Add a sound, a reference or a file to this film"
                disabled={!canReview}
                onClick={() => setAddOpen(true)}
              >
                Add
              </PixelButton>
              <PixelButton
                icon="render"
                tip="Make a video of this film"
                disabled={!canReview}
                onClick={() => setRenderOpen(true)}
              >
                Render
              </PixelButton>
              <PixelMenu
                label="More for this film"
                items={[
                  {
                    id: "claude",
                    label: "Open Claude here",
                    icon: "terminal",
                    tip: "A terminal in this film's folder, with Claude Code",
                    disabled: openClaude.isPending,
                    onSelect: () => openClaude.mutate(film.data.id),
                  },
                  {
                    id: "folder",
                    label: "Open folder",
                    icon: "folder",
                    tip: path,
                    disabled: openFolder.isPending,
                    onSelect: () => openFolder.mutate(film.data.id),
                  },
                  {
                    id: "template",
                    label: "Save as template",
                    icon: "template",
                    tip: "Start new films from this one",
                    disabled: !canReview,
                    onSelect: () => setTemplateOpen(true),
                  },
                  {
                    id: "delete",
                    label: "Delete film",
                    icon: "trash",
                    danger: true,
                    onSelect: () => setDeleteOpen(true),
                  },
                ]}
              >
                {(trigger) => (
                  <PixelButton
                    variant="ghost"
                    icon="more"
                    aria-label="More"
                    tip="More"
                    {...trigger}
                  />
                )}
              </PixelMenu>
            </div>
          </div>
          {adds.status && <p className="upload-status">{adds.status}</p>}
          {adds.error && <p className="field-error">{adds.error}</p>}
          {adds.message && (
            <div className="add-message">
              <span>{adds.message}</span>
              <PixelButton variant="ghost" data-size="small" onClick={adds.clearMessage}>
                OK
              </PixelButton>
            </div>
          )}
          {openFolder.isError && <p className="field-error">{openFolder.error.message}</p>}
          {openClaude.isError && <p className="field-error">{openClaude.error.message}</p>}
          <ClaudeEnded
            filmId={film.data.id}
            onOpenClaude={() => openClaude.mutate(film.data.id)}
            onRetry={(ended) => {
              const last = filmClaude.data?.turns[0];
              if (ended.source === "make") askClaude.mutate({ kind: "make" });
              else if (last?.kind === "ask" && last.text) {
                askClaude.mutate({ kind: "ask", text: last.text });
              }
            }}
          />
          {askClaude.isError && <p className="field-error">{askClaude.error.message}</p>}
          {config && (
            <StoryLength
              key={film.data.id}
              filmId={film.data.id}
              story={storyLength}
              duration={config.duration}
            />
          )}
          {(savePicture.isPending || savePicture.data || savePicture.error) && (
            <p
              className="render-line"
              data-state={savePicture.isPending ? "running" : savePicture.error ? "failed" : "done"}
            >
              {savePicture.isPending
                ? "Saving the picture..."
                : savePicture.error
                  ? `The picture wasn't saved: ${savePicture.error.message}`
                  : `Picture saved: ${savePicture.data?.file}`}
              {savePicture.data && !savePicture.isPending && (
                <>
                  {" · "}
                  <Link to="/renders">See it in Renders</Link>
                </>
              )}
            </p>
          )}
          {renderJob && (
            <p className="render-line" data-state={renderJob.state}>
              {jobStatus(renderJob, clock)}
              {" · "}
              <Link to="/renders">
                {renderJob.state === "done" ? "Play it in Renders" : "See renders"}
              </Link>
            </p>
          )}
        </div>

        <div className={canReview ? "review" : "stack"}>
          <div className="review-main">
            <PixelPanel
              title="Preview"
              actions={
                !problem && (
                  <div className="panel-actions">
                    {config && abilities.reshape && (
                      <ShapeSwitch
                        shown={shown}
                        own={shapeOf(config)}
                        size={config}
                        onShow={(shape) => setShownOf({ id, shape })}
                      />
                    )}
                    {canReview && (
                      <PixelButton
                        variant="ghost"
                        icon="picture"
                        aria-label="Save this frame as a picture"
                        tip="Save this frame as a picture (a cover)"
                        disabled={savePicture.isPending}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          pause();
                          savePicture.mutate({ t: now(), shape: shown ?? undefined });
                        }}
                      />
                    )}
                    {/* The drawing tools belong to notes: they show with the Notes tab, or once you draw. */}
                    {canReview && !reshaped && (shownTab === "notes" || drawing) && (
                      <MarkTools
                        tool={draft.tool}
                        onTool={draftActions.setTool}
                        marks={draft.shapes.length}
                        onUndo={draftActions.undo}
                      />
                    )}
                  </div>
                )
              }
            >
              {preview}
            </PixelPanel>
          </div>

          {canReview && (
            <div className="review-side">
              <SideTabs
                tabs={tabs}
                more={moreTabs}
                current={shownTab}
                onChange={setTab}
                label="Film panels"
              >
                {shownTab === "claude" && (
                  <ClaudePanel
                    filmId={film.data.id}
                    hasBrief={film.data.hasBrief}
                    openNotes={openNotes.length}
                  />
                )}
                {shownTab === "notes" && (
                  <>
                    <PixelPanel title="New note">
                      <NoteForm
                        draft={draft}
                        actions={draftActions}
                        now={now}
                        onPause={pause}
                        onShowTime={showTime}
                        onSave={saveNote}
                        saving={addNote.isPending}
                        error={addNote.error?.message ?? null}
                      />
                    </PixelPanel>
                    <NotesPanel
                      filmId={film.data.id}
                      notes={notes.data}
                      loading={notes.isPending}
                      error={notes.error}
                      focusedId={focusedId}
                      onOpen={openNote}
                      showMarks={showMarks}
                      onShowMarks={setShowMarks}
                    />
                  </>
                )}
                {shownTab === "sound" && config && filmOrigin && (
                  <SoundPanel
                    filmId={film.data.id}
                    tracks={config.audio}
                    duration={config.duration}
                    fileUrl={(file) => filmFileUrl(filmOrigin, film.data.id, file)}
                    now={now}
                    focus={focus}
                    onShowVoice={() => setTab("voice")}
                  />
                )}
                {shownTab === "voice" && config && filmOrigin && (
                  <VoicePanel
                    filmId={film.data.id}
                    tracks={config.audio}
                    now={now}
                    onSeek={showTime}
                    onShowClip={(file) => setSelectClip({ file, n: Date.now() })}
                    fileUrl={(file) => filmFileUrl(filmOrigin, film.data.id, file)}
                    focus={focus}
                  />
                )}
                {shownTab === "references" && <ReferencesPanel filmId={film.data.id} />}
                {shownTab === "brief" && film.data.hasBrief && (
                  <BriefPanel filmId={film.data.id} onClaude={() => setTab("claude")} />
                )}
              </SideTabs>
            </div>
          )}
        </div>

        {config && (
          <>
            <FrameRateDialog
              open={rateOpen}
              onClose={() => setRateOpen(false)}
              filmId={film.data.id}
              fps={config.fps}
            />
            <RenderDialog
              open={renderOpen}
              onClose={() => setRenderOpen(false)}
              filmId={film.data.id}
              title={config.title}
              size={config}
              duration={config.duration}
              reshape={abilities.reshape}
              shown={shown}
              words={hasWords}
              captions={abilities.captions}
            />
            <SaveTemplateDialog
              open={templateOpen}
              onClose={() => setTemplateOpen(false)}
              filmId={film.data.id}
              title={config.title}
            />
          </>
        )}
        <DeleteFilmDialog
          film={deleteOpen ? { id: film.data.id, title: config?.title ?? film.data.id } : null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate("/")}
        />
        <AddDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onFiles={(purpose, files) => {
            setAddOpen(false);
            addFor(purpose, files);
          }}
          onAsset={(asset) => {
            setAddOpen(false);
            const options = purposesFor(asset.kind, asset.name, true);
            if (options.length === 1 && options[0]) void adds.addAsset(asset, options[0]);
            else setPending({ asset });
          }}
        />
        <PurposeDialog
          pending={pending}
          onCancel={() => setPending(null)}
          onFiles={(groups, choice) => {
            setPending(null);
            void adds.addFiles(groups, choice);
          }}
          onAsset={(asset, purpose) => {
            setPending(null);
            void adds.addAsset(asset, purpose);
          }}
        />
      </div>
    </DropZone>
  );
}
