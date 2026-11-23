import { getStatusPresentation, type StatusSelection } from "@/lib/status-labels";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

export type StatusBadgeProps = StatusSelection & { className?: string };
export function StatusBadge({ className, ...selection }: StatusBadgeProps) {
  const { label, tone } = getStatusPresentation(selection);
  return <span className={cn(styles.root, styles.badge, className)} data-tone={tone}>{label}</span>;
}
