import type { CSSProperties } from "react";
import styles from "./spec.module.css";

export type LoadState = "ok" | "loading" | "error" | "empty";
export type SpecStyle = CSSProperties & { [key: `--spec-${string}`]: string | number };

export function LoadingSkeleton({ height = 160, label = "Carregando" }: { height?: number; label?: string }) {
  return <div role="status" aria-label={label} className={styles.loading} style={{ minHeight: height }}>
    {[70, 100, 85].map((width) => <span key={width} aria-hidden="true" className={styles.skeleton} style={{ width: `${width}%`, minHeight: 16 }} />)}
  </div>;
}

export function ErrorMessage({ onRetry }: { onRetry?: () => void }) {
  return <div role="alert" className={styles.error}>
    <div className={styles.errorValue}>Indisponível</div>
    <p>Não foi possível carregar.</p>
    {onRetry && <button type="button" className={styles.sortButton} style={{ color: "var(--primary)" }} onClick={onRetry}>Tentar de novo</button>}
  </div>;
}
