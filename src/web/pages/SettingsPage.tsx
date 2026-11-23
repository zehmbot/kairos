import { useState } from "react";
import { Link } from "react-router";
import {
  useCamera,
  useClaude,
  useConnectClaude,
  useExportInfo,
  useHealth,
  useWorkspace,
} from "../api.ts";
import { Notice } from "../components/Notice.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { VoiceSettings } from "../components/VoiceSettings.tsx";
import { WorkspacePicker } from "../components/WorkspacePicker.tsx";
import { setSetupHidden, useSetup } from "../setup.ts";

/** Setup not finished and its card hidden: one line to bring the card back on the Films page. */
function SetupLine() {
  const { progress } = useSetup();
  if (!progress.known || progress.complete) return null;
  return (
    <p className="hint">
      Setup: {progress.count} of {progress.total} done.{" "}
      <Link to="/films" onClick={() => setSetupHidden(false)}>
        Show the setup card
      </Link>
    </p>
  );
}

/** What you set up first (Claude, voices, your films folder), then the computer's details, folded away. */
export function SettingsPage() {
  const workspace = useWorkspace();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Connect Claude, add your voice key, and choose where your films live.</p>
        <SetupLine />
      </div>
      <ClaudePanel />
      <VoiceSettings />
      <PixelPanel title="Films folder">
        {workspace.data ? (
          <div className="stack">
            <p>The folder where Kairos keeps your films. Films already in it show up right away.</p>
            <WorkspacePicker
              workspace={workspace.data}
              chooseLabel={workspace.data.path ? "Change folder" : "Choose folder"}
            />
          </div>
        ) : (
          <p>{workspace.isPending ? "Checking..." : "Kairos isn't running."}</p>
        )}
      </PixelPanel>
      <ComputerPanel />
    </div>
  );
}

/** Claude Code: is it installed, and are the Kairos tools added to it? */
function ClaudePanel() {
  const claude = useClaude();
  const connect = useConnectClaude();
  const status = claude.data;

  return (
    <PixelPanel
      title="Claude Code"
      actions={
        status?.cli && (
          <PixelButton
            variant={status.connected ? "ghost" : "primary"}
            icon="terminal"
            disabled={connect.isPending}
            onClick={() => connect.mutate(!status.connected)}
          >
            {connect.isPending ? "Working..." : status.connected ? "Disconnect" : "Connect"}
          </PixelButton>
        )
      }
    >
      {status?.cli ? (
        <div className="stack">
          <p>
            Connect so Claude can read your notes, look at any frame and make your films. It also
            turns on Kairos' guides for Claude (Skills page).
          </p>
          <dl className="kv">
            <dt>Claude Code</dt>
            <dd>Version {status.cli.version}</dd>
            <dt>Kairos tools</dt>
            <dd>{status.connected ? "Connected" : "Not connected"}</dd>
          </dl>
          {connect.isError && <p className="field-error">{connect.error.message}</p>}
        </div>
      ) : status ? (
        <Notice title="Claude Code isn't installed">
          Kairos works with Claude Code, which writes and fixes your films. Install it (see
          code.claude.com), then come back to this page.
        </Notice>
      ) : (
        <p>{claude.isPending ? "Looking for Claude Code..." : "Kairos isn't running."}</p>
      )}
    </PixelPanel>
  );
}

/**
 * Kairos itself, the browser that takes pictures of frames and ffmpeg for videos: one line, and the details when
 * you open it. A missing browser or ffmpeg shows even when it's closed.
 */
function ComputerPanel() {
  const health = useHealth();
  const camera = useCamera();
  const info = useExportInfo();
  const [open, setOpen] = useState(false);
  const browser = camera.data?.browser ?? null;
  const ffmpeg = info.data?.ffmpeg ?? null;
  const summary = [
    health.data ? `Kairos ${health.data.version}` : null,
    browser ? `${browser.name} for pictures` : null,
    ffmpeg ? `ffmpeg ${ffmpeg.version.split("-")[0]} for videos` : null,
  ].filter(Boolean);

  return (
    <PixelPanel
      title="This computer"
      actions={
        <PixelButton variant="ghost" onClick={() => setOpen((now) => !now)} aria-expanded={open}>
          {open ? "Hide details" : "Details"}
        </PixelButton>
      }
    >
      <div className="stack">
        {!health.isSuccess && !health.isPending && (
          <Notice title="Kairos isn't running">
            Start it again with npm start (or npm run dev), then reload this page.
          </Notice>
        )}
        {camera.data && !browser && (
          <Notice title="No browser found">
            Kairos could not find Google Chrome or Microsoft Edge on this computer. Notes still
            work, but without pictures. Install one of them (or set KAIROS_BROWSER to a browser's
            path), then restart Kairos.
          </Notice>
        )}
        {info.data && !ffmpeg && (
          <Notice title="ffmpeg is missing">
            Kairos uses ffmpeg to turn films into videos. Install it (on Windows: winget install
            Gyan.FFmpeg, on macOS: brew install ffmpeg), then restart Kairos.
          </Notice>
        )}
        {!open ? (
          <p className="hint">{summary.length ? summary.join(" · ") : "Checking..."}</p>
        ) : (
          <dl className="kv">
            {health.data && (
              <>
                <dt>Kairos</dt>
                <dd>
                  Version {health.data.version} · {health.data.url}
                  {health.data.dev ? " · development" : ""}
                </dd>
              </>
            )}
            {browser && (
              <>
                <dt>Pictures</dt>
                <dd>
                  {browser.name}, hidden in the background: {browser.path}
                </dd>
              </>
            )}
            {ffmpeg && info.data && (
              <>
                <dt>Videos</dt>
                <dd>
                  ffmpeg {ffmpeg.version}: {ffmpeg.path}
                </dd>
                <dt>Encoders</dt>
                <dd>
                  {info.data.encoders.map((encoder) => encoder.name).join(", ") || "None work"}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>
    </PixelPanel>
  );
}
