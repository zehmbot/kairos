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
import { WorkspacePicker } from "../components/WorkspacePicker.tsx";

export function SettingsPage() {
  const health = useHealth();
  const workspace = useWorkspace();
  const camera = useCamera();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Settings</h1>
        <p>How Kairos runs on this computer.</p>
      </div>
      <PixelPanel title="Hub">
        {health.isSuccess ? (
          <dl className="kv">
            <dt>Status</dt>
            <dd>Online</dd>
            <dt>Version</dt>
            <dd>{health.data.version}</dd>
            <dt>Address</dt>
            <dd>{health.data.url}</dd>
            <dt>Mode</dt>
            <dd>{health.data.dev ? "Development" : "Normal"}</dd>
          </dl>
        ) : (
          <p>{health.isPending ? "Checking the hub..." : "The hub is not reachable."}</p>
        )}
      </PixelPanel>
      <PixelPanel title="Workspace">
        {workspace.data ? (
          <div className="stack">
            <p>The folder where Kairos keeps your films. Films already in it show up right away.</p>
            <WorkspacePicker
              workspace={workspace.data}
              chooseLabel={workspace.data.path ? "Change folder" : "Choose folder"}
            />
          </div>
        ) : (
          <p>{workspace.isPending ? "Checking..." : "The hub is not reachable."}</p>
        )}
      </PixelPanel>
      <PixelPanel title="Frame camera">
        {camera.data?.browser ? (
          <div className="stack">
            <p>
              Kairos takes the pictures of your notes with this browser, hidden in the background.
            </p>
            <dl className="kv">
              <dt>Browser</dt>
              <dd>{camera.data.browser.name}</dd>
              <dt>Path</dt>
              <dd>{camera.data.browser.path}</dd>
            </dl>
          </div>
        ) : camera.data ? (
          <Notice title="No browser found">
            Kairos could not find Google Chrome or Microsoft Edge on this computer. Notes still
            work, but without pictures. Install one of them (or set KAIROS_BROWSER to a browser's
            path), then restart Kairos.
          </Notice>
        ) : (
          <p>{camera.isPending ? "Checking..." : "The hub is not reachable."}</p>
        )}
      </PixelPanel>
      <ExportPanel />
      <ClaudePanel />
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
            Connect Kairos to Claude Code so Claude can read your notes with their pictures, look at
            any frame to check its work, and mark notes fixed. This adds Kairos to Claude Code for
            all your projects, and turns on the Kairos skills (see the Skills page).
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
        <p>{claude.isPending ? "Looking for Claude Code..." : "The hub is not reachable."}</p>
      )}
    </PixelPanel>
  );
}

/** ffmpeg and the encoders that work here. */
function ExportPanel() {
  const info = useExportInfo();
  const data = info.data;
  return (
    <PixelPanel title="Video export">
      {data?.ffmpeg ? (
        <div className="stack">
          <p>
            Kairos makes videos with ffmpeg. Renders use the first encoder below that you allow.
          </p>
          <dl className="kv">
            <dt>ffmpeg</dt>
            <dd>Version {data.ffmpeg.version}</dd>
            <dt>Path</dt>
            <dd>{data.ffmpeg.path}</dd>
            <dt>Encoders</dt>
            <dd>{data.encoders.map((encoder) => encoder.name).join(", ") || "None work"}</dd>
          </dl>
        </div>
      ) : data ? (
        <Notice title="ffmpeg is missing">
          Kairos uses ffmpeg to turn films into videos. Install it (on Windows: winget install
          Gyan.FFmpeg, on macOS: brew install ffmpeg), then restart Kairos.
        </Notice>
      ) : (
        <p>{info.isPending ? "Checking the video tools..." : "The hub is not reachable."}</p>
      )}
    </PixelPanel>
  );
}
