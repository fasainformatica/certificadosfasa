import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

type CommonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  icon?: LucideIcon;
};
export type ButtonProps = CommonProps & (
  | { iconOnly: true; icon: LucideIcon; "aria-label": string; children?: never }
  | { iconOnly?: false; children: ReactNode }
);

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = "primary", size = "md", icon: Icon, iconOnly = false, children, className, type = "button", ...props
}, ref) {
  const tooltipId = useId();
  const button = <button {...props} ref={ref} type={type} data-variant={variant} data-size={size} data-icon-only={iconOnly}
    aria-describedby={iconOnly ? [props["aria-describedby"], tooltipId].filter(Boolean).join(" ") : props["aria-describedby"]}
    className={cn(styles.root, styles.button, className)}>
    {Icon && <Icon size={16} aria-hidden="true" />}{!iconOnly && children}
  </button>;
  return iconOnly ? <span className={styles.tooltipWrap}>{button}<span id={tooltipId} role="tooltip" className={styles.tooltip}>{props["aria-label"]}</span></span> : button;
});
