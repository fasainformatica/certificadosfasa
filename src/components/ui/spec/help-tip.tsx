"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import styles from "./spec.module.css";

export function HelpTip({ subject, children }: { subject: string; children: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ right: 0 });
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  function toggle() {
    const bounds = button.current?.getBoundingClientRect();
    if (bounds) setPosition(bounds.left < 280 ? { left: 0 } : { right: 0 });
    setOpen(!open);
  }
  return <span ref={root} className={cn(styles.root, styles.help)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={button} type="button" className={styles.helpButton} aria-label={`Ajuda: ${subject}`} aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} onClick={toggle}><HelpCircle size={14} aria-hidden="true" /></button>
    <span id={id} role="note" hidden={!open} className={styles.popover} style={position}>{children}</span>
  </span>;
}
