import { EmptyState } from "../components/EmptyState.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

export function AssetsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Assets</h1>
        <p>Your videos, images, fonts and sounds, ready to use in any film.</p>
      </div>
      <PixelPanel title="Library">
        <EmptyState
          icon="folder"
          title="No assets yet"
          actions={<span className="px-tag">Coming soon</span>}
        >
          Drag files here to import them. Claude Code will be able to use them too.
        </EmptyState>
      </PixelPanel>
    </div>
  );
}
