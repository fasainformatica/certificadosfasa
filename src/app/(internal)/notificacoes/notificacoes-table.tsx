"use client";

import { useRouter } from "next/navigation";
import { DataTable, HelpTip, StatusBadge, TableText, type DataColumn, type DetailItem } from "@/components/ui/spec";
import spec from "@/components/ui/spec/spec.module.css";
import { getClientDisplayName } from "@/lib/clientes/list-presentation";
import { formatCnpj, formatDate, formatDateTime, formatDays, formatRelative } from "@/lib/format";
import { centralHref, type CentralFilters } from "@/lib/notifications/central-list";
import { NOTICE_DISPLAY_STATUS } from "@/lib/status-labels";
import { RetryEventButton } from "./retry-event-button";
import styles from "./notificacoes.module.css";

/** Presentation data only: the raw payload and phones stay on the server. */
export type CentralRow = {
  id: string; status: string; type: string; typeLabel: string; original: string; repeats: string[];
  clientName: string | null; clientCnpj: string | null;
  certificate: { name: string; cnpj: string; validity: string; days: number } | null;
  reference: string | null; audienceLabel: string; channel: string; phone: string; removed: boolean; currentPhone: string | null;
  sendDate: string; attempts: number; lastAttempt: string | null; reason: { short: string; full: string } | null;
  recommendation: string; technicalId: string | null; retry: "allowed" | "renewed" | "none";
};

function clientText(row: CentralRow) {
  if (row.clientName) return { primary: getClientDisplayName(row.clientName, row.clientCnpj ?? ""), secondary: formatCnpj(row.clientCnpj) };
  if (row.type === "certificate_expired") return { primary: "Resumo consolidado", secondary: "Vários clientes" };
  if (row.type === "internal_notice") return { primary: "Comunicado interno", secondary: "Equipe interna" };
  return { primary: "Não informado", secondary: "Certificado não vinculado" };
}

export function centralDetails(row: CentralRow): DetailItem[] {
  return [
    { label: "Certificado", value: row.certificate ? `${row.certificate.name} · ${formatCnpj(row.certificate.cnpj)}` : "Certificado não vinculado" },
    ...(row.certificate ? [{ label: "Validade atual", value: `${formatDate(row.certificate.validity)} · ${formatDays(row.certificate.days)}` }] : []),
    { label: "Validade de referência do aviso", value: row.reference ? formatDate(row.reference) : "Não registrada" },
    { label: "Enviado para", value: `${row.audienceLabel} · ${row.phone}${row.removed ? " · Contato removido" : ""}` },
    ...(row.currentPhone ? [{ label: "Contato atual do cliente", value: row.currentPhone }] : []),
    { label: "Tentativas", value: row.lastAttempt ? `${row.attempts} · última em ${formatDateTime(row.lastAttempt)}` : String(row.attempts) },
    ...(row.reason ? [{ label: "Motivo", value: row.reason.full }] : []),
    { label: "Recomendação", value: row.recommendation },
    { label: "Programado", value: <span className={styles.scheduledDetail}>{formatDate(row.sendDate)} · {formatRelative(row.sendDate)}</span> },
    ...(row.repeats.length > 1 ? [{ label: "Envios agrupados", value: <>{row.repeats.map((time, index) => <span key={`${time}-${index}`} className={styles.time}>{formatDateTime(time)}</span>)}</> }] : []),
    ...(row.technicalId ? [{ label: "ID técnico", value: row.technicalId }] : []),
  ];
}

export function NotificacoesTable({ rows, filters, total, page, canManage, error = false }: {
  rows: CentralRow[]; filters: CentralFilters; total: number; page: number; canManage: boolean; error?: boolean;
}) {
  const router = useRouter();
  const status = (row: CentralRow) => <StatusBadge domain="aviso" status={NOTICE_DISPLAY_STATUS[row.status] ?? "na_fila"} />;
  const columns: DataColumn<CentralRow>[] = [
    { key: "cliente", label: "Cliente", render: (row) => <TableText {...clientText(row)} /> },
    { key: "aviso", label: "Aviso", width: 220, render: (row) => <>
      <span className={styles.notice}><span className={spec.cellPrimary} title={row.typeLabel}>{row.typeLabel}</span>
        {row.repeats.length > 1 && <span className={`${spec.badge} ${styles.repeat}`} data-tone="neutral">×{row.repeats.length}</span>}</span>
      <span className={spec.cellSecondary} title={`Original: ${row.original}`}>Original: {row.original}</span>
    </> },
    { key: "destinatario", label: "Destinatário", width: 220, render: (row) => <TableText primary={row.audienceLabel} secondary={`${row.channel} · ${row.removed ? "Contato removido" : row.phone}`} /> },
    { key: "programado", label: "Programado", width: 130, sortable: true, render: (row) => <TableText primary={formatDate(row.sendDate)} secondary={formatRelative(row.sendDate)} /> },
    { key: "situacao", label: "Situação", width: 170, render: (row) => <>{status(row)}{row.reason && <span className={spec.cellSecondary} title={row.reason.short}>{row.reason.short}</span>}</> },
  ];
  const direction = filters.order ?? (filters.tab === "pendentes" ? "asc" : null);
  return <div className={styles.table}>
    <DataTable label="Avisos" rows={rows} columns={columns} getRowKey={(row) => row.id} getRowLabel={(row) => `${row.typeLabel}, ${clientText(row).primary}`}
      mobile={(row) => ({ primary: clientText(row).primary, secondary: `${row.typeLabel} · ${formatDate(row.sendDate)}`, badge: status(row) })}
      details={centralDetails} actionsWidth={170}
      actions={(row) => row.retry === "renewed"
        ? <span className={`${spec.secondary} ${styles.renewed}`}>Certificado renovado<HelpTip subject="Certificado renovado">A validade mudou depois deste aviso. Reenviar mandaria uma data que não vale mais.</HelpTip></span>
        : canManage && row.retry === "allowed" ? <RetryEventButton eventId={row.id} /> : undefined}
      state={error ? "error" : "ok"} onRetry={() => router.refresh()} emptyMessage="Nenhum aviso encontrado com esses filtros."
      sort={direction ? { key: "programado", direction } : undefined} onSort={(_, order) => router.push(centralHref(filters, { order, page: 1 }))}
      pagination={{ page, total, unit: "avisos", onPageChange: (next) => router.push(centralHref(filters, { page: next })) }} />
  </div>;
}
