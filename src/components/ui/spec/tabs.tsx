"use client";

import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { queryHref, useQueryString } from "./url-state";
import styles from "./spec.module.css";

export type TabItem = { value: string; label: string; count?: number };
export type TabsProps = { items: readonly TabItem[]; defaultValue: string; label: string; query?: string };
export function Tabs({ items, defaultValue, label, query }: TabsProps) {
  const browserQuery = useQueryString();
  const currentQuery = browserQuery || query || "";
  const requested = new URLSearchParams(currentQuery).get("aba");
  const active = items.some((item) => item.value === requested) ? requested : defaultValue;
  // These tabs navigate documents via URL; native links keep keyboard and browser navigation semantics.
  return <nav aria-label={label} className={cn(styles.root, styles.tabs)}>
    {items.map((item) => <a key={item.value} className={styles.tab} href={queryHref(currentQuery, "aba", item.value)} aria-current={active === item.value ? "page" : undefined}>
      {item.label}{item.count !== undefined && <span className={styles.badge} data-tone={active === item.value ? "info" : "neutral"}>{formatCount(item.count)}</span>}
    </a>)}
  </nav>;
}
