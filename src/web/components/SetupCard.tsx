import { type ReactNode, useEffect, useId, useState } from "react";
import { useConnectClaude, useRecheck, useVoiceKey } from "../api.ts";
import { ffmpegInstall, setSetupHidden, setupHidden, useSetup } from "../setup.ts";
import { PixelButton } from "./PixelButton.tsx";
import { PixelIcon } from "./PixelIcon.tsx";
import { PixelPanel } from "./PixelPanel.tsx";
import { WorkspacePicker } from "./WorkspacePicker.tsx";

/** fish.audio, where you get your key. */
export const FISH_AUDIO_URL = "https://fish.audio/?aff=AZHXPV6VQJL22";
const CLAUDE_CODE_URL = "https://code.claude.com";
const CHROME_URL = "https://www.google.com/chrome/";

/** One step of the card: its number (a check once done), its title, and what to do (or what's done). */
function Step({
  n,
  done,
  title,
  summary,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="setup-step" data-done={done ? "" : undefined}>
      <span className="setup-mark" aria-hidden="true">
        {done ? <PixelIcon name="check" size={16} /> : n}
      </span>
      <div className="setup-body">
        <h3 className="setup-title">
          {title}
          {done && <span className="visually-hidden"> (done)</span>}
        </h3>
        {done ? <p className="setup-summary">{summary}</p> : children}
      </div>
    </li>
  );
}

/** A link that opens in a new tab, drawn as a quiet button. */
function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="px-btn" data-variant="ghost" href={href} target="_blank" rel="noreferrer">
      <span>{children}</span>
    </a>
  );
}

/** Claude Code: install it, then connect it (which also turns on Kairos' guides for Claude). */
function ClaudeStep({ setup }: { setup: ReturnType<typeof useSetup> }) {
  const connect = useConnectClaude();
  const cli = setup.claude?.cli;
  return (
    <Step
      n={2}
      done={setup.state.claude === "connected"}
      title="Claude Code"
      summary={`Claude Code ${cli?.version ?? ""} is connected: Claude can make your films and see your notes.`}
    >
      {setup.state.claude === null ? (
        <p className="hint">Looking for Claude Code...</p>
      ) : setup.state.claude === "missing" ? (
        <>
          <p>
            Claude Code writes and fixes your films. Install it, then come back: Kairos finds it by
            itself.
          </p>
          <div className="setup-actions">
            <LinkButton href={CLAUDE_CODE_URL}>Install Claude Code</LinkButton>
            <PixelButton variant="ghost" icon="refresh" onClick={setup.refetchClaude}>
              Check again
            </PixelButton>
          </div>
        </>
      ) : (
        <>
          <p>Connect it, so Claude can make your films, read your notes and look at any frame.</p>
          <div className="setup-actions">
            <PixelButton
              icon="terminal"
              disabled={connect.isPending}
              onClick={() => connect.mutate(true)}
            >
              {connect.isPending ? "Connecting..." : "Connect"}
            </PixelButton>
          </div>
          {connect.isError && <p className="field-error">{connect.error.message}</p>}
        </>
      )}
    </Step>
  );
}

/** Voices: a fish.audio key, checked with fish.audio before it's saved. */
function VoicesStep({ setup }: { setup: ReturnType<typeof useSetup> }) {
  const saveKey = useVoiceKey();
  const [key, setKey] = useState("");
  const [justConnected, setJustConnected] = useState(false);
  const keyId = useId();
  const free = setup.voice?.model.endsWith("-free");
  return (
    <Step
      n={3}
      done={setup.state.voices === true}
      title="Voices (fish.audio)"
      summary={
        <>
          <span className="voice-ok">Connected</span>{" "}
          {justConnected
            ? "Your key works: fish.audio is connected."
            : `fish.audio is connected (key ${setup.voice?.hint ?? ""}).`}{" "}
          {free
            ? "Kairos uses fish.audio's free model; you can change it in Settings → Voice."
            : "You can change the voice model in Settings → Voice."}
        </>
      }
    >
      <p>
        <strong>For the full experience, don't skip this.</strong> Your films get a narrator, voices
        for the characters, and captions that follow every word.
      </p>
      <div className="setup-actions">
        <LinkButton href={FISH_AUDIO_URL}>Get your fish.audio key</LinkButton>
        <span className="hint">Then copy it from API keys, in your fish.audio account.</span>
      </div>
      <form
        className="voice-key-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!key.trim()) return;
          saveKey.mutate(key.trim(), {
            onSuccess: () => {
              setKey("");
              setJustConnected(true);
            },
          });
        }}
      >
        <label htmlFor={keyId} className="visually-hidden">
          Your fish.audio API key
        </label>
        <input
          id={keyId}
          className="px-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          placeholder="Paste your fish.audio key"
          onChange={(event) => setKey(event.target.value)}
        />
        <PixelButton type="submit" disabled={!key.trim() || saveKey.isPending}>
          {saveKey.isPending ? "Checking..." : "Check and save"}
        </PixelButton>
      </form>
      {saveKey.error && <p className="field-error">{saveKey.error.message}</p>}
    </Step>
  );
}

/** Your computer: ffmpeg (videos) and Chrome or Edge (pictures, rendering), looked for again on demand. */
function ComputerStep({ setup }: { setup: ReturnType<typeof useSetup> }) {
  const recheck = useRecheck();
  const [copied, setCopied] = useState(false);
  const command = ffmpegInstall(setup.platform);
  const missing = recheck.isSuccess && !(setup.ffmpeg && setup.browser);
  const copy = () => {
    navigator.clipboard
      ?.writeText(command)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };
  return (
    <Step
      n={4}
      done={setup.state.ffmpeg === true && setup.state.browser === true}
      title="Your computer"
      summary={`ffmpeg ${setup.ffmpeg?.version.split("-")[0] ?? ""} and ${setup.browser?.name ?? "the browser"} are ready to make your videos.`}
    >
      {setup.state.ffmpeg === false && (
        <>
          <p>ffmpeg turns your films into videos. Install it with this command, in a terminal:</p>
          <div className="setup-command">
            <code>{command}</code>
            <PixelButton
              variant="ghost"
              data-size="small"
              icon={copied ? "check" : "copy"}
              aria-label="Copy the command"
              tip={copied ? "Copied" : "Copy"}
              onClick={copy}
            />
          </div>
        </>
      )}
      {setup.state.browser === false && (
        <>
          <p>Chrome or Edge takes the pictures of your frames and draws your videos.</p>
          <div className="setup-actions">
            <LinkButton href={CHROME_URL}>Get Chrome</LinkButton>
          </div>
        </>
      )}
      <div className="setup-actions">
        <PixelButton
          variant="ghost"
          icon="refresh"
          disabled={recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          {recheck.isPending ? "Checking..." : "Check again"}
        </PixelButton>
        {missing && (
          <span className="hint">Not found yet. When the install has finished, check again.</span>
        )}
      </div>
      {recheck.isError && <p className="field-error">{recheck.error.message}</p>}
    </Step>
  );
}

/**
 * Get set up (Films page): your films folder, Claude Code, voices and your computer, each with one thing to do and
 * a check once done. When the last one turns green it says you're ready, then it doesn't come back. × hides it
 * (Settings shows it again).
 */
export function SetupCard({ onNewFilm }: { onNewFilm: () => void }) {
  const setup = useSetup();
  const { state, progress } = setup;
  const [hidden, setHidden] = useState(setupHidden);
  const [closed, setClosed] = useState(false);
  // Seen unfinished while this page is open: when the last step turns green, the card says you're ready.
  const [sawUnfinished, setSawUnfinished] = useState(false);
  useEffect(() => {
    if (progress.known && !progress.complete) setSawUnfinished(true);
  }, [progress.known, progress.complete]);

  // Without a films folder the card shows at once (it's where you choose it); otherwise it waits for every answer,
  // so a finished setup never flashes.
  if (state.folder === null || closed) return null;
  if (state.folder && !progress.known) return null;
  if (progress.complete && !sawUnfinished) return null;
  if (hidden && state.folder && !progress.complete) return null;

  if (progress.complete) {
    return (
      <PixelPanel title="You're ready">
        <div className="setup-ready">
          <PixelIcon name="logo" size={48} />
          <p>Claude, the voices and your computer are all set. Time to make your first film!</p>
          <div className="setup-actions">
            <PixelButton icon="plus" onClick={onNewFilm}>
              New film
            </PixelButton>
            <PixelButton variant="ghost" onClick={() => setClosed(true)}>
              Close
            </PixelButton>
          </div>
        </div>
      </PixelPanel>
    );
  }

  return (
    <PixelPanel
      title="Get set up"
      actions={
        <div className="panel-actions">
          <span className="px-tag setup-count">
            {progress.count} of {progress.total}
          </span>
          {state.folder && (
            <PixelButton
              variant="ghost"
              icon="close"
              aria-label="Hide the setup"
              tip="Hide (Settings shows it again)"
              onClick={() => {
                setSetupHidden(true);
                setHidden(true);
              }}
            />
          )}
        </div>
      }
    >
      <ol className="setup-steps">
        <Step
          n={1}
          done={state.folder}
          title="Your films folder"
          summary={`Your films live in ${setup.workspace?.path ?? ""}.`}
        >
          <p>
            Kairos keeps all your films in one folder on this computer. Choose it, or make a new one
            (for example "Kairos") in the window that opens.
          </p>
          {setup.workspace && (
            <WorkspacePicker workspace={setup.workspace} chooseLabel="Choose folder" />
          )}
        </Step>
        <ClaudeStep setup={setup} />
        <VoicesStep setup={setup} />
        <ComputerStep setup={setup} />
      </ol>
    </PixelPanel>
  );
}
