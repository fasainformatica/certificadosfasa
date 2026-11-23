"use client";

import { Fragment, useId, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";
import { ErrorMessage, LoadingSkeleton, type LoadState } from "./shared";
import styles from "./spec.module.css";

export type DataColumn<T> = {
  key: string; label: string; render: (row: T) => ReactNode; sortable?: boolean;
  width?: CSSProperties["width"]; minWidth?: CSSProperties["minWidth"];
};
export type DetailItem = { label: string; value: ReactNode };
export type DataTableProps<T> = {
  label: string; rows: readonly T[]; columns: readonly DataColumn<T>[];
  getRowKey: (row: T) => string; getRowLabel: (row: T) => string;
  mobile: (row: T) => { primary: string; secondary?: string; badge?: ReactNode };
  details?: (row: T) => readonly DetailItem[];
  actions?: (row: T) => ReactNode; actionsWidth?: number;
  state?: LoadState; emptyMessage?: string; onRetry?: () => void;
  sort?: { key: string; direction: "asc" | "desc" }; onSort?: (key: string, direction: "asc" | "desc") => void;
  pagination?: { page: number; total: number; unit: string; onPageChange: (page: number) => void };
  defaultExpanded?: readonly string[];
};

export function TableText({ primary, secondary }: { primary: string; secondary?: string }) {
  return <><span className={styles.cellPrimary} title={primary}>{primary}</span>{secondary && <span className={styles.cellSecondary} title={secondary}>{secondary}</span>}</>;
}

function Details({ items }: { items: readonly DetailItem[] }) {
  return <dl className={styles.details}>{items.map((item, index) => <div key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function DataTable<T>({ label, rows, columns, getRowKey, getRowLabel, mobile, details, actions, actionsWidth = 200, state = "ok", emptyMessage = "Nenhum item encontrado.", onRetry, sort, onSort, pagination, defaultExpanded = [] }: DataTableProps<T>) {
  const id = useId();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(defaultExpanded));
  const toggle = (key: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  function expandButton(row: T, target: string) {
    const key = getRowKey(row);
    return <Button iconOnly icon={ChevronRight} aria-label={`${expanded.has(key) ? "Recolher" : "Expandir"} detalhes de ${getRowLabel(row)}`} aria-expanded={expanded.has(key)} aria-controls={target} variant="ghost" size="sm" onClick={() => toggle(key)} style={{ transform: expanded.has(key) ? "rotate(90deg)" : undefined }} />;
  }
  if (state === "loading") return <div className={cn(styles.root, styles.state)} aria-busy="true"><LoadingSkeleton label={`Carregando ${label}`} /></div>;
  if (state === "error") return <div className={cn(styles.root, styles.state)}><ErrorMessage onRetry={onRetry} /></div>;
  if (state === "empty" || rows.length === 0) return <div role="status" className={cn(styles.root, styles.state)}>{emptyMessage}</div>;
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / 25)) : 1;
  const page = pagination ? Math.max(1, Math.min(pageCount, pagination.page)) : 1;
  return <div className={styles.root}>
    <div className={styles.desktopTable}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{label}</caption>
        <colgroup>{details && <col style={{ width: 40 }} />}{columns.map((column) => <col key={column.key} style={{ width: column.width, minWidth: column.minWidth }} />)}{actions && <col style={{ width: actionsWidth }} />}</colgroup>
        <thead><tr>{details && <th scope="col" className={styles.expandCell}><span className={styles.srOnly}>Detalhes</span></th>}
          {columns.map((column) => <th key={column.key} scope="col" aria-sort={column.sortable ? sort?.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none" : undefined}>
            {column.sortable && onSort ? <button type="button" className={styles.sortButton} onClick={() => onSort(column.key, sort?.key === column.key && sort.direction === "asc" ? "desc" : "asc")}>
              {column.label}{sort?.key === column.key ? sort.direction === "asc" ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" /> : <ArrowUpDown size={16} aria-hidden="true" />}
            </button> : column.label}
          </th>)}{actions && <th scope="col" className={styles.actions}>Ações</th>}
        </tr></thead>
        <tbody>{rows.map((row) => {
          const key = getRowKey(row);
          const target = `${id}-desktop-${encodeURIComponent(key)}`;
          return <Fragment key={key}><tr>
            {details && <td className={styles.expandCell}>{expandButton(row, target)}</td>}
            {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
            {actions && <td className={styles.actions}><div>{actions(row) ?? <span className={styles.srOnly}>Nenhuma ação disponível</span>}</div></td>}
          </tr>{details && <tr className={styles.expanded} hidden={!expanded.has(key)} id={target}><td colSpan={columns.length + 1 + (actions ? 1 : 0)}><Details items={details(row)} /></td></tr>}</Fragment>;
        })}</tbody>
      </table>
    </div>
    <div className={styles.mobileList} role="list" aria-label={label}>
      {rows.map((row) => {
        const key = getRowKey(row);
        const target = `${id}-mobile-${encodeURIComponent(key)}`;
        const summary = mobile(row);
        return <div key={key} role="listitem" className={styles.mobileRow}>
          <div className={styles.mobileTop}><div><TableText primary={summary.primary} secondary={summary.secondary} /></div>{summary.badge}</div>
          <div className={styles.mobileActions}>{details && expandButton(row, target)}{actions?.(row)}</div>
          {details && <div className={styles.mobileDetails} hidden={!expanded.has(key)} id={target}><Details items={details(row)} /></div>}
        </div>;
      })}
    </div>
    {pagination && <div className={styles.tableFooter}>
      <span>Mostrando {formatCount((page - 1) * 25 + 1)}–{formatCount(Math.min(page * 25, pagination.total))} de {formatCount(pagination.total)} {pagination.unit}</span>
      <nav className={styles.pagination} aria-label={`Paginação: ${label}`}>
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => pagination.onPageChange(page - 1)}>Anterior</Button>
        <span aria-live="polite">Página {formatCount(page)} de {formatCount(pageCount)}</span>
        <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => pagination.onPageChange(page + 1)}>Próxima</Button>
      </nav>
    </div>}
  </div>;
}
