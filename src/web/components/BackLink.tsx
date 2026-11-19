import { Link } from "react-router";
import { PixelIcon } from "./PixelIcon.tsx";

/** "← All films"-style link back to a list page. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="back-link">
      <PixelIcon name="arrowLeft" size={16} />
      {label}
    </Link>
  );
}
