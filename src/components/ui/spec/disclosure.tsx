"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

const changedEvent = "fasa-spec-disclosure";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changedEvent, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(changedEvent, callback); };
}

export type DisclosureProps = { title: string; description?: string; storageKey: string; defaultOpen?: boolean; children: ReactNode };
export function Disclosure({ title, description, storageKey, defaultOpen = false, children }: DisclosureProps) {
  const id = useId();
  const [fallback, setFallback] = useState<{ key: string; value: boolean } | null>(null);
  const stored = useSyncExternalStore(subscribe, () => {
    try { const value = localStorage.getItem(storageKey); return value === "true" ? true : value === "false" ? false : null; }
    catch { return null; }
  }, () => null);
  const open = (fallback?.key === storageKey ? fallback.value : undefined) ?? stored ?? defaultOpen;
  function toggle() {
    try {
      localStorage.setItem(storageKey, String(!open));
      setFallback(null);
      window.dispatchEvent(new Event(changedEvent));
    } catch {
      // A failed write must override even a previously readable persisted value.
      setFallback({ key: storageKey, value: !open });
    }
  }
  return <section className={cn(styles.root, styles.surface)} aria-labelledby={`${id}-title`}>
    <h2 style={{ margin: 0 }}><button type="button" className={styles.disclosureButton} aria-expanded={open} aria-controls={`${id}-content`} onClick={toggle}>
      <span><span id={`${id}-title`} className={styles.title}>{title}</span>{description && <span className={styles.description} style={{ display: "block" }}>{description}</span>}</span>
      <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : undefined }} />
    </button></h2>
    <div id={`${id}-content`} hidden={!open} className={styles.disclosureContent}>{children}</div>
  </section>;
}
