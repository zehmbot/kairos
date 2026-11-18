import type { ButtonHTMLAttributes } from "react";
import type { IconName } from "../icons/icons.ts";
import { PixelIcon } from "./PixelIcon.tsx";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  variant?: "primary" | "ghost";
}

export function PixelButton({ icon, variant = "primary", children, ...rest }: PixelButtonProps) {
  return (
    <button type="button" className="px-btn" data-variant={variant} {...rest}>
      {icon && <PixelIcon name={icon} size={16} />}
      {children != null && <span>{children}</span>}
    </button>
  );
}
