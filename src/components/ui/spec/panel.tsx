import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { ErrorMessage, LoadingSkeleton, type LoadState } from "./shared";
import styles from "./spec.module.css";

export type PanelProps = {
  title?: string; description?: string; actions?: ReactNode; header?: ReactNode; children?: ReactNode;
  flush?: boolean; state?: LoadState; emptyMessage?: string; onRetry?: () => void; loadingHeight?: number;
};
export function Panel({ title, description, actions, header, children, flush = false, state = "ok", emptyMessage = "Nenhum item encontrado.", onRetry, loadingHeight }: PanelProps) {
  const titleId = useId();
  return <section className={cn(styles.root, styles.surface, styles.panel)} aria-labelledby={title && !header ? titleId : undefined} aria-busy={state === "loading"}>
    {(title || description || actions || header) && <div className={styles.panelHeader} data-flush={flush}>
      {header ?? <><div>{title && <h2 className={styles.title} id={titleId}>{title}</h2>}{description && <p className={styles.description}>{description}</p>}</div>{actions}</>}
    </div>}
    <div className={styles.panelBody} data-flush={flush}>
      {state === "loading" ? <div className={styles.state}><LoadingSkeleton height={loadingHeight} /></div> : state === "error" ? <div className={styles.state}><ErrorMessage onRetry={onRetry} /></div> : state === "empty" ? <div role="status" className={styles.state}>{emptyMessage}</div> : children}
    </div>
  </section>;
}
