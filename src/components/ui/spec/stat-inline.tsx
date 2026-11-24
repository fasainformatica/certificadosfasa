import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

export function StatInline({ label, value, description, href }: { label: string; value: ReactNode; description?: string; href?: string }) {
  return <div className={cn(styles.root, styles.stat)}><div className={styles.statLabel}>{label}</div>
    <div className={styles.statValue}>{href ? <a className={styles.link} href={href}>{value}</a> : value}</div>
    {description && <div className={styles.secondary}>{description}</div>}
  </div>;
}
