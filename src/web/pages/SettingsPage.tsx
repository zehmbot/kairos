import { useHealth, useWorkspace } from "../api.ts";
import { PixelPanel } from "../components/PixelPanel.tsx";
import { WorkspacePicker } from "../components/WorkspacePicker.tsx";

export function SettingsPage() {
  const health = useHealth();
  const workspace = useWorkspace();

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
    </div>
  );
}
