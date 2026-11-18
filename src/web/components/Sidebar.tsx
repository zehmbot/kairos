import { NavLink } from "react-router";
import type { IconName } from "../icons/icons.ts";
import { PixelIcon } from "./PixelIcon.tsx";

const LINKS: { to: string; label: string; icon: IconName }[] = [
  { to: "/films", label: "Films", icon: "film" },
  { to: "/renders", label: "Renders", icon: "render" },
  { to: "/assets", label: "Assets", icon: "folder" },
  { to: "/settings", label: "Settings", icon: "gear" },
];

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main">
      <ul className="nav">
        {LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} className="nav-link">
              <PixelIcon name={link.icon} size={32} />
              <span className="nav-label">{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
