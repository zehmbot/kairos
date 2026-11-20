import type { ButtonHTMLAttributes } from "react";
import type { IconName } from "../icons/icons.ts";
import { PixelIcon } from "./PixelIcon.tsx";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  variant?: "primary" | "ghost";
  /**
   * The button's short name, shown as a tooltip ("Delete", "Go to"). An icon-only button needs one: it is also
   * its name for screen readers, unless `aria-label` says more.
   */
  tip?: string;
}

export function PixelButton({
  icon,
  variant = "primary",
  className,
  children,
  tip,
  ...rest
}: PixelButtonProps) {
  return (
    <button
      type="button"
      className={className ? `px-btn ${className}` : "px-btn"}
      data-variant={variant}
      // An icon-only button always shows its name when pointed at.
      data-tip={tip ?? (children == null ? rest["aria-label"] : undefined)}
      aria-label={rest["aria-label"] ?? (children == null ? tip : undefined)}
      {...rest}
    >
      {icon && <PixelIcon name={icon} size={16} />}
      {children != null && <span>{children}</span>}
    </button>
  );
}
