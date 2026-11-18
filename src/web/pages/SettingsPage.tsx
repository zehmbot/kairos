import { useHealth } from "../api.ts";
import { PixelPanel } from "../components/PixelPanel.tsx";

export function SettingsPage() {
  const health = useHealth();

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
      <PixelPanel title="Workspace" actions={<span className="px-tag">Coming soon</span>}>
        <p>Choose the folder where your films are saved.</p>
      </PixelPanel>
    </div>
  );
}
