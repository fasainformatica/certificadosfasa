import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

export type KeyValueItem = { id: string; label: string; value: ReactNode; secondary?: ReactNode; href?: string };
export function KeyValueList({ items }: { items: readonly KeyValueItem[] }) {
  return <dl className={cn(styles.root, styles.keyValues)}>{items.map((item) => {
    const value = <span>{item.value}{item.secondary && <span className={styles.secondary}>{item.secondary}</span>}</span>;
    return <div key={item.id} className={cn(styles.keyRow, item.href && styles.keyLinked)}><dt>{item.label}</dt><dd>
      {item.href ? <a href={item.href} className={styles.keyValueLink} aria-label={`${item.label}: ${typeof item.value === "string" || typeof item.value === "number" ? item.value : "Ver detalhes"}`}>{value}<ChevronRight size={16} aria-hidden="true" /></a> : value}
    </dd></div>;
  })}</dl>;
}
