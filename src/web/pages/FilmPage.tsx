import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Note } from "../../shared/types.ts";
import {
  useAddNote,
  useFilm,
  useHealth,
  useNotes,
  useOpenClaude,
  useOpenFilmFolder,
  useReferences,
  useRenders,
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
import { PixelPanel } from "../components/PixelPanel.tsx";
import { Player, type PlayerHandle } from "../components/Player.tsx";
import { ReferencesPanel } from "../components/ReferencesPanel.tsx";
import { RenderDialog } from "../components/RenderDialog.tsx";
import { SaveTemplateDialog } from "../components/SaveTemplateDialog.tsx";
import { SideTabs } from "../components/SideTabs.tsx";
import { SoundPanel } from "../components/SoundPanel.tsx";
import { groupFiles, type Purpose, purposesFor } from "../filmAdd.ts";
import { useHubEvent } from "../hubEvents.ts";
import { filmFileUrl } from "../player/audioSync.ts";
import { noteCovers } from "../player/marks.ts";
import { formatLength, frameCount, timeOf } from "../player/time.ts";
import { useNoteDraft } from "../player/useNoteDraft.ts";
import { filmRender, jobStatus } from "../renderText.ts";
import { useNow } from "../useNow.ts";

const SIDE_TABS: readonly SideTab[] = ["notes", "sound", "references", "brief"];

/** The side tab shown for a film, remembered per film in this browser. */
function useFilmTab(id: string): [SideTab, (tab: SideTab) => void] {
  const key = `kairos.film-tab.${id}`;
  const read = useCallback((): SideTab => {
    try {
      const saved = localStorage.getItem(key) as SideTab | null;
      if (saved && SIDE_TABS.includes(saved)) return saved;
    } catch {}
    return "notes";
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

export function FilmPage() {
  const { id = "" } = useParams();
  const film = useFilm(id);
  const health = useHealth();
  const openFolder = useOpenFilmFolder();
  const openClaude = useOpenClaude();
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
  const navigate = useNavigate();
  const references = useReferences(id, Boolean(film.data));
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
  useHubEvent((event) => {
    if (event.type === "films-changed" && event.ids.includes(id)) setReloadKey((key) => key + 1);
  });

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
  } else if (config && previewPath && filmOrigin) {
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
          // A new frame rate starts the player over (frame numbers mean other times now).
          key={`${film.data.id}@${config.fps}`}
          ref={playerRef}
          src={`${filmOrigin}${previewPath}`}
          title={config.title}
          width={config.width}
          height={config.height}
          fps={config.fps}
          duration={config.duration}
          reloadKey={reloadKey}
          overlay={overlay}
          noteMarks={openNotes}
          audio={config.audio.map((track) => ({
            url: filmFileUrl(filmOrigin, film.data.id, track.file),
            start: track.start,
            volume: track.volume,
          }))}
        />
        <p className="hint preview-hint">
          To change this film, press Open Claude here (or run <code>claude</code> in its folder) and
          say what you want. The preview updates every time Claude saves a file.
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
    { id: "notes" as const, label: "Notes", count: openNotes.length },
    { id: "sound" as const, label: "Sound", count: config?.audio.length ?? 0 },
    { id: "references" as const, label: "References", count: references.data?.length ?? 0 },
    ...(film.data.hasBrief ? [{ id: "brief" as const, label: "Brief" }] : []),
  ];
  const shownTab = tabs.some((entry) => entry.id === tab) ? tab : "notes";

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
            {config && <span className="px-tag">{config.status}</span>}
            <p className="film-meta">
              {config ? (
                <>
                  {config.width} × {config.height} ·{" "}
                  <button
                    type="button"
                    className="film-meta-button"
                    title="Change the frame rate"
                    onClick={() => setRateOpen(true)}
                  >
                    {config.fps} fps
                    <PixelIcon name="pen" size={16} />
                  </button>{" "}
                  · {formatLength(config.duration)} · {frameCount(config.duration, config.fps)}{" "}
                  frames
                </>
              ) : (
                path
              )}
            </p>
            <div className="film-actions">
              <PixelButton
                variant="ghost"
                icon="plus"
                title="Add a sound, a reference or a file to this film"
                disabled={!canReview}
                onClick={() => setAddOpen(true)}
              >
                Add
              </PixelButton>
              <PixelButton
                variant="ghost"
                icon="render"
                title="Make an MP4 video of this film"
                disabled={!canReview}
                onClick={() => setRenderOpen(true)}
              >
                Render
              </PixelButton>
              <PixelButton
                icon="terminal"
                title="Open a terminal in this film's folder with Claude Code running"
                disabled={openClaude.isPending}
                onClick={() => openClaude.mutate(film.data.id)}
              >
                Open Claude here
              </PixelButton>
              <PixelButton
                variant="ghost"
                icon="folder"
                title={path}
                disabled={openFolder.isPending}
                onClick={() => openFolder.mutate(film.data.id)}
              >
                Open folder
              </PixelButton>
              <PixelButton
                variant="ghost"
                icon="plus"
                title="Start new films from this one"
                disabled={!canReview}
                onClick={() => setTemplateOpen(true)}
              >
                Save as template
              </PixelButton>
              <PixelButton
                variant="ghost"
                data-tone="danger"
                icon="trash"
                title="Move this film to the trash"
                onClick={() => setDeleteOpen(true)}
              >
                Delete film
              </PixelButton>
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
                    {canReview && (
                      <MarkTools
                        tool={draft.tool}
                        onTool={draftActions.setTool}
                        marks={draft.shapes.length}
                        onUndo={draftActions.undo}
                      />
                    )}
                    <span className="px-tag">Live</span>
                  </div>
                )
              }
            >
              {preview}
            </PixelPanel>
          </div>

          {canReview && (
            <div className="review-side">
              <SideTabs tabs={tabs} current={shownTab} onChange={setTab} label="Film panels">
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
                  />
                )}
                {shownTab === "references" && <ReferencesPanel filmId={film.data.id} />}
                {shownTab === "brief" && film.data.hasBrief && <BriefPanel filmId={film.data.id} />}
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
