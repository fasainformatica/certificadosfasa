import type { ReactNode } from "react";
import { AlertTriangle, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

export type AlertBannerProps = {
  tone: "warning" | "danger" | "info"; children: ReactNode; link?: { href: string; label: string };
};
export function AlertBanner({ tone, children, link }: AlertBannerProps) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return <div role={tone === "danger" ? "alert" : "status"} className={cn(styles.root, styles.alert)} data-tone={tone}>
    <Icon size={16} aria-hidden="true" className={styles.alertIcon} /><div className={styles.alertContent}>{children}</div>
    {link && <a className={styles.link} href={link.href}>{link.label}<ChevronRight size={16} aria-hidden="true" /></a>}
  </div>;
}
