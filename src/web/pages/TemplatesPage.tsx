import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { BLANK_TEMPLATE_ID, type TemplateSummary } from "../../shared/types.ts";
import {
  templatePreviewUrl,
  useDeleteTemplate,
  useDuplicateTemplate,
  useOpenTemplateFolder,
  useTemplates,
  useWorkspace,
} from "../api.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { NewFilmDialog } from "../components/NewFilmDialog.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelIcon } from "../components/PixelIcon.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

/** All templates: Kairos' own (use, duplicate) and the user's (use, edit, open folder, delete). */
export function TemplatesPage() {
  const workspace = useWorkspace();
  const hasWorkspace = Boolean(workspace.data?.path);
  const templates = useTemplates();
  const navigate = useNavigate();
  const [using, setUsing] = useState<string | null>(null);

  // The blank film is New film's "Blank film", not a template card.
  const list = (templates.data ?? []).filter((entry) => entry.id !== BLANK_TEMPLATE_ID);
  const kairos = list.filter((entry) => entry.source === "kairos");
  const yours = list.filter((entry) => entry.source === "yours");

  const newButton = (
    <PixelButton icon="plus" onClick={() => navigate("/templates/new")}>
      New template
    </PixelButton>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Templates</h1>
        <p>
          Starting points for new films: a look, and the questions to answer before Claude builds
          it.
        </p>
      </div>

      {templates.isError && (
        <Notice title="Kairos can't list the templates">{templates.error.message}</Notice>
      )}

      {kairos.length > 0 && (
        <PixelPanel title="Kairos templates">
          <div className="stack">
            <p className="hint">Duplicate one to make your own copy to change.</p>
            <div className="film-grid">
              {kairos.map((template) => (
                <TemplateTile
                  key={template.id}
                  template={template}
                  canCopy={hasWorkspace}
                  onUse={() => setUsing(template.id)}
                />
              ))}
            </div>
          </div>
        </PixelPanel>
      )}

      <PixelPanel
        title="Your templates"
        actions={hasWorkspace && yours.length > 0 ? newButton : undefined}
      >
        {!hasWorkspace ? (
          <p>
            Your templates live in your workspace folder. Choose it on the{" "}
            <Link to="/films">Films page</Link> first.
          </p>
        ) : templates.isPending ? (
          <p>Loading templates...</p>
        ) : yours.length === 0 ? (
          <EmptyState icon="template" title="No templates of yours yet" actions={newButton}>
            Make one here with its own questions, or open a film you like and press Save as
            template.
          </EmptyState>
        ) : (
          <div className="film-grid">
            {yours.map((template) => (
              <TemplateTile
                key={template.id}
                template={template}
                canCopy
                onUse={() => setUsing(template.id)}
              />
            ))}
          </div>
        )}
      </PixelPanel>

      <NewFilmDialog
        open={using !== null}
        onClose={() => setUsing(null)}
        templateId={using ?? undefined}
      />
    </div>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function TemplateTile({
  template,
  canCopy,
  onUse,
}: {
  template: TemplateSummary;
  canCopy: boolean;
  onUse: () => void;
}) {
  const navigate = useNavigate();
  const duplicate = useDuplicateTemplate();
  const openFolder = useOpenTemplateFolder();
  const remove = useDeleteTemplate();
  const [confirm, setConfirm] = useState(false);
  const mine = template.source === "yours";
  const questions = template.kinds.reduce((sum, kind) => sum + kind.fields.length, 0);
  const error = duplicate.error ?? openFolder.error ?? remove.error;

  return (
    <div className="template-tile px-box">
      <span className="template-preview">
        {template.hasPreview ? (
          <img src={templatePreviewUrl(template.id)} alt="" />
        ) : (
          <PixelIcon name="template" size={32} />
        )}
      </span>
      <div className="template-tile-body">
        <h3 className="film-card-title">{template.name}</h3>
        {template.problem ? (
          <p className="film-card-problem">{template.problem}</p>
        ) : (
          <>
            {template.description && <p className="template-description">{template.description}</p>}
            <p className="film-card-meta">
              {template.kinds.length > 1 ? `${plural(template.kinds.length, "kind")} · ` : ""}
              {plural(questions, "question")}
            </p>
          </>
        )}
        <span className="px-tag">{mine ? "Yours" : "Kairos"}</span>
        <div className="note-actions">
          <PixelButton
            data-size="small"
            icon="plus"
            disabled={Boolean(template.problem)}
            onClick={onUse}
          >
            Use
          </PixelButton>
          {mine ? (
            <>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="pen"
                disabled={Boolean(template.problem)}
                onClick={() => navigate(`/templates/${encodeURIComponent(template.id)}`)}
              >
                Edit
              </PixelButton>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="folder"
                title="Open this template's files"
                onClick={() => openFolder.mutate(template.id)}
              >
                Folder
              </PixelButton>
            </>
          ) : (
            <PixelButton
              variant="ghost"
              data-size="small"
              disabled={!canCopy || Boolean(template.problem)}
              onClick={() =>
                duplicate.mutate(template.id, {
                  onSuccess: (copy) => navigate(`/templates/${encodeURIComponent(copy.id)}`),
                })
              }
            >
              Duplicate
            </PixelButton>
          )}
        </div>
        {mine &&
          (confirm ? (
            <div className="note-actions">
              <span className="note-confirm">Delete this template?</span>
              <PixelButton
                data-size="small"
                data-tone="danger"
                icon="trash"
                disabled={remove.isPending}
                onClick={() => remove.mutate(template.id)}
              >
                Delete
              </PixelButton>
              <PixelButton variant="ghost" data-size="small" onClick={() => setConfirm(false)}>
                Keep
              </PixelButton>
            </div>
          ) : (
            <PixelButton
              variant="ghost"
              data-size="small"
              data-tone="danger"
              icon="trash"
              onClick={() => setConfirm(true)}
            >
              Delete
            </PixelButton>
          ))}
        {error && <p className="field-error">{error.message}</p>}
      </div>
    </div>
  );
}
