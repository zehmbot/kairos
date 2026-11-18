import { EmptyState } from "../components/EmptyState.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

export function RendersPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Renders</h1>
        <p>Turn your films into video files.</p>
      </div>
      <PixelPanel title="Render queue">
        <EmptyState
          icon="render"
          title="Nothing rendering"
          actions={<span className="px-tag">Coming soon</span>}
        >
          Renders and finished videos will show up here, newest first.
        </EmptyState>
      </PixelPanel>
    </div>
  );
}
