import { Link } from "react-router";
import { useHealth } from "../api.ts";
import { PixelIcon } from "./PixelIcon.tsx";

export function TopBar() {
  const health = useHealth();
  const state = health.isPending ? "checking" : health.isSuccess ? "online" : "offline";
  // Nothing to say while Kairos runs; a clear warning when it doesn't answer.
  const label = { checking: "Starting...", online: null, offline: "Kairos isn't running" }[state];

  return (
    <header className="topbar">
      <Link to="/" className="logo" aria-label="Kairos: your films">
        <PixelIcon name="logo" size={32} />
      </Link>
      <div className="topbar-spacer" />
      {label && (
        <output className="status" data-state={state}>
          <span className="status-dot" />
          {label}
        </output>
      )}
    </header>
  );
}
