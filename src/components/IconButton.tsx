import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, className = "", type = "button", ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`icon-button ${className}`.trim()}
      aria-label={label}
      data-tooltip={label}
    >
      <Icon aria-hidden="true" size={19} strokeWidth={2.4} />
    </button>
  );
}
