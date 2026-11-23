import { Children, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { LoadingSkeleton, type SpecStyle } from "./shared";
import styles from "./spec.module.css";

export type KpiCardProps = {
  label: string; value: number | null; description: string; tone?: "none" | "warning" | "danger";
  href?: string; state?: "ok" | "loading" | "error";
};
export function KpiCard({ label, value, description, tone = "none", href, state = "ok" }: KpiCardProps) {
  const content = state === "loading" ? <LoadingSkeleton height={70} label={`Carregando ${label}`} /> : <>
    <div className={styles.kpiLabel}>{label}</div>
    <div className={cn(styles.kpiValue, (value === null || state === "error") && styles.kpiMissing)} data-tone={state === "ok" && value !== null && value > 0 ? tone : "none"}>
      {state === "error" ? "Indisponível" : formatCount(value)}
    </div>
    <div className={styles.kpiDescription} title={state === "error" ? "Não foi possível carregar." : description}>
      {state === "error" ? "Não foi possível carregar." : description}
    </div>
    {state === "error" && href && <span className={styles.link}>Tentar de novo</span>}
  </>;
  const props = { className: cn(styles.root, styles.surface, styles.kpi), "aria-busy": state === "loading" };
  return href ? <a {...props} href={href}>{content}<ChevronRight size={16} className={styles.kpiArrow} aria-hidden="true" /></a> : <div {...props}>{content}</div>;
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className={cn(styles.root, styles.kpiGrid)} style={{ "--spec-kpi-columns": Math.max(1, Math.min(6, Children.toArray(children).length)) } as SpecStyle}>{children}</div>;
}
