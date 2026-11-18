import { EmptyState } from "../components/EmptyState.tsx";
import { PixelButton } from "../components/PixelButton.tsx";
import { PixelPanel } from "../components/PixelPanel.tsx";

export function FilmsPage() {
  return (
    <div className="page">
      <div className="page-head">
        <h1>Films</h1>
        <p>Every video you make with Claude Code lives here.</p>
      </div>
      <PixelPanel title="Your films">
        <EmptyState
          icon="film"
          title="No films yet"
          actions={
            <>
              <PixelButton icon="plus" disabled>
                New film
              </PixelButton>
              <span className="px-tag">Coming soon</span>
            </>
          }
        >
          Create a film, then ask Claude Code to bring it to life. You will watch it change live,
          right here.
        </EmptyState>
      </PixelPanel>
    </div>
  );
}
