import { useState } from "react";
import type { Skill } from "../../shared/types.ts";
import {
  useDeleteSkill,
  useOpenSkillFolder,
  usePickSkill,
  useSkillSwitch,
  useSkills,
} from "../api.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { NewSkillDialog } from "../components/NewSkillDialog.tsx";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

const STATE_LABEL: Record<Skill["state"], string> = {
  on: "On",
  off: "Off",
  update: "Update ready",
  taken: "Name taken",
};

/** Kairos skills (the defaults) and the user's own, each on or off in Claude Code. */
export function SkillsPage() {
  const skills = useSkills();
  const pick = usePickSkill();
  const [creating, setCreating] = useState(false);
  const list = skills.data ?? [];
  const ours = list.filter((skill) => skill.source === "kairos");
  const yours = list.filter((skill) => skill.source === "yours");

  return (
    <div className="page">
      <div className="page-head">
        <h1>Skills</h1>
        <p>
          Skills teach Claude how to make good videos. Turned-on skills are copied into Claude Code,
          which uses each one when it fits the work.
        </p>
      </div>

      {skills.isError && (
        <Notice title="Kairos can't read the skills">{skills.error.message}</Notice>
      )}

      <PixelPanel title="Kairos skills">
        {skills.isPending ? (
          <p>Loading skills...</p>
        ) : (
          <ul className="skill-list">
            {ours.map((skill) => (
              <SkillRow key={skill.name} skill={skill} />
            ))}
          </ul>
        )}
      </PixelPanel>

      <PixelPanel
        title="Your skills"
        actions={
          <div className="panel-actions">
            <PixelButton
              variant="ghost"
              icon="folder"
              disabled={pick.isPending}
              onClick={() => pick.mutate()}
            >
              {pick.isPending ? "Choosing..." : "Add folder"}
            </PixelButton>
            <PixelButton icon="plus" onClick={() => setCreating(true)}>
              New skill
            </PixelButton>
          </div>
        }
      >
        <div className="stack">
          {pick.isError && <p className="field-error">{pick.error.message}</p>}
          {pick.data?.status === "unsupported" && (
            <p className="field-error">
              This computer can't show a folder window. Copy the skill folder into ~/.kairos/skills
              instead, then reload this page.
            </p>
          )}
          {yours.length > 0 ? (
            <ul className="skill-list">
              {yours.map((skill) => (
                <SkillRow key={skill.name} skill={skill} />
              ))}
            </ul>
          ) : (
            !skills.isPending && (
              <EmptyState icon="skill" title="No skills of your own yet">
                Add a folder that holds a SKILL.md, or write a new skill: your style, your brand
                colors, how you like your captions...
              </EmptyState>
            )
          )}
        </div>
      </PixelPanel>

      <NewSkillDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const toggle = useSkillSwitch();
  const remove = useDeleteSkill();
  const openFolder = useOpenSkillFolder();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busy = toggle.isPending || remove.isPending;
  const on = skill.state === "on" || skill.state === "update";
  const error = toggle.error ?? remove.error ?? openFolder.error;

  return (
    <li className="skill-row px-box" data-state={skill.state}>
      <div className="skill-head">
        <h3 className="skill-name">/{skill.name}</h3>
        <span className="px-tag skill-state" data-state={skill.state}>
          {STATE_LABEL[skill.state]}
        </span>
      </div>
      <p className="skill-description">{skill.description || "No description."}</p>
      {skill.state === "taken" && (
        <p className="hint">
          Claude Code already has a different skill called {skill.name}. Kairos leaves it alone.
        </p>
      )}
      {skill.state === "update" && (
        <p className="hint">
          This skill changed since it was copied into Claude Code. Update copies the new version.
        </p>
      )}
      <div className="note-actions">
        {skill.state !== "taken" && (
          <PixelButton
            variant={on ? "ghost" : "primary"}
            data-size="small"
            disabled={busy}
            onClick={() => toggle.mutate({ name: skill.name, to: on ? "off" : "on" })}
          >
            {on ? "Turn off" : "Turn on"}
          </PixelButton>
        )}
        {skill.state === "update" && (
          <PixelButton
            data-size="small"
            disabled={busy}
            onClick={() => toggle.mutate({ name: skill.name, to: "update" })}
          >
            Update
          </PixelButton>
        )}
        {skill.source === "yours" &&
          (confirmDelete ? (
            <>
              <span className="note-confirm">Delete this skill?</span>
              <PixelButton
                data-size="small"
                icon="trash"
                disabled={busy}
                onClick={() => remove.mutate(skill.name)}
              >
                Delete
              </PixelButton>
              <PixelButton
                variant="ghost"
                data-size="small"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </PixelButton>
            </>
          ) : (
            <>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="folder"
                title="Open the skill's folder to edit its files, then press Update"
                onClick={() => openFolder.mutate(skill.name)}
              >
                Edit files
              </PixelButton>
              <PixelButton
                variant="ghost"
                data-size="small"
                icon="trash"
                aria-label="Delete"
                tip="Delete"
                onClick={() => setConfirmDelete(true)}
              />
            </>
          ))}
      </div>
      {error && <p className="field-error">{error.message}</p>}
    </li>
  );
}
