import { useState } from "react";
import { useFilms, useWorkspace } from "../api.ts";
import { DeleteFilmDialog } from "../components/DeleteFilmDialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { FilmCard } from "../components/FilmCard.tsx";
import { NewFilmDialog } from "../components/NewFilmDialog.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { TrashPanel } from "../components/TrashPanel.tsx";
import { WorkspacePicker } from "../components/WorkspacePicker.tsx";

export function FilmsPage() {
  const workspace = useWorkspace();
  const hasWorkspace = Boolean(workspace.data?.path);
  const films = useFilms(hasWorkspace);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);

  const newFilmButton = (
    <PixelButton icon="plus" onClick={() => setCreating(true)}>
      New film
    </PixelButton>
  );

  function filmsBody() {
    if (films.isPending) return <p>Loading your films...</p>;
    if (films.isError) {
      return <Notice title="Kairos can't list your films">{films.error.message}</Notice>;
    }
    if (films.data.length === 0) {
      return (
        <EmptyState icon="film" title="No films yet" actions={newFilmButton}>
          Create a film, then ask Claude Code to bring it to life. You will watch it change live,
          right here.
        </EmptyState>
      );
    }
    return (
      <div className="film-grid">
        {films.data.map((film) => (
          <FilmCard
            key={film.id}
            film={film}
            onDelete={() => setDeleting({ id: film.id, title: film.config?.title ?? film.id })}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Films</h1>
        <p>Every video you make with Claude Code lives here.</p>
      </div>

      {workspace.isPending ? (
        <PixelPanel title="Your films">
          <p>Loading...</p>
        </PixelPanel>
      ) : workspace.isError ? (
        <PixelPanel title="Your films">
          <Notice title="The hub is not reachable">
            Start Kairos with <code>npm run dev</code> or <code>npm start</code>, then reload this
            page.
          </Notice>
        </PixelPanel>
      ) : !hasWorkspace ? (
        <PixelPanel title="Set up your workspace">
          <div className="stack">
            <p>
              Kairos keeps all your films in one folder on this computer. Choose that folder, or
              make a new one (for example "Kairos") in the window that opens. You can change it
              later in Settings.
            </p>
            <WorkspacePicker workspace={workspace.data} chooseLabel="Choose folder" />
          </div>
        </PixelPanel>
      ) : (
        <PixelPanel
          title="Your films"
          actions={films.data && films.data.length > 0 ? newFilmButton : undefined}
        >
          {filmsBody()}
        </PixelPanel>
      )}

      {hasWorkspace && <TrashPanel />}

      <NewFilmDialog open={creating} onClose={() => setCreating(false)} />
      <DeleteFilmDialog film={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
