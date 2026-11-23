"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { ManualNoticeButton } from "./manual-notice-button";
import styles from "./certificates.module.css";
import spec from "@/components/ui/spec/spec.module.css";
import { Button } from "@/components/ui/spec/button";
import { DataTable, TableText, type DataColumn, type DetailItem } from "@/components/ui/spec/data-table";
import { FilterBar } from "@/components/ui/spec/filter-bar";
import { Panel } from "@/components/ui/spec/panel";
import { StatusBadge } from "@/components/ui/spec/status-badge";
import { certificateFilterFields, certificateListHref, RENEWAL_DISPLAY_STATUS, VALIDITY_DISPLAY_STATUS, type parseCertificateListParams } from "@/lib/certificados/list-presentation";
import { getCertificateRenewalPresentation } from "@/lib/certificados/renewal-status";
import { formatCnpj, formatCount, formatDate, formatDateTime, formatDays } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";

export type CertificateListRow = Pick<Database["public"]["Tables"]["certificados"]["Row"],
  "id" | "cnpj" | "nome_titular" | "data_emissao" | "data_vencimento" | "status" | "renovacao_status" | "renovacao_observacao" | "renovacao_atualizado_em" | "nome_arquivo_original" | "ultimo_upload_em" | "created_at" | "updated_at"
> & { clientes: { nome_razao_social: string; cnpj: string } | null; renovado: boolean; dias_restantes: number };
export type CertificateListProps = {
  rows: readonly CertificateListRow[]; filters: ReturnType<typeof parseCertificateListParams>;
  canManage: boolean; error?: boolean; page: number; pageSize: number; total: number;
};

function Validity({ row }: { row: CertificateListRow }) {
  return row.status === "invalido" ? <span className={spec.badge} data-tone="neutral">Inválido</span> : <StatusBadge domain="validade" status={VALIDITY_DISPLAY_STATUS[row.status]} />;
}
function Renewal({ row }: { row: CertificateListRow }) {
  return <StatusBadge domain="renovacao" status={RENEWAL_DISPLAY_STATUS[row.renovacao_status]} />;
}

function RowActions({ row, canManage }: { row: CertificateListRow; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const actions = (compact: boolean) => <>
    <Link className={`${spec.root} ${spec.button}`} data-variant="secondary" data-size="sm" href={`/certificados/${row.id}`}>Ver detalhes</Link>
    {canManage && getCertificateRenewalPresentation(row.renovacao_status).plannable && <ManualNoticeButton certificadoId={row.id} titular={row.nome_titular} compact={compact} />}
  </>;
  return <>
    <div className={styles.fullActions}>{actions(true)}</div>
    <div className={styles.menuActions} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); event.currentTarget.querySelector("button")?.focus(); }
    }}>
      <Button iconOnly icon={MoreHorizontal} variant="secondary" size="sm" aria-label={`Ações de ${row.nome_titular}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} />
      <div id={id} className={styles.actionMenu} hidden={!open}>{actions(false)}</div>
    </div>
  </>;
}

export function certificateDetails(row: CertificateListRow): DetailItem[] {
  const renewal = getCertificateRenewalPresentation(row.renovacao_status);
  return [
    { label: "Cliente vinculado", value: row.clientes?.nome_razao_social || "Não informado" },
    { label: "CNPJ do cliente", value: formatCnpj(row.clientes?.cnpj) },
    { label: "Orientação de renovação", value: renewal.nextAction },
    { label: "Impacto no planejamento", value: renewal.planningImpact },
    { label: "Última atualização do cadastro", value: formatDateTime(row.updated_at) },
    // Section 8.3: the renewal column moves here below 1280 px.
    { label: "Renovação", value: <span className={styles.renewalDetail}><Renewal row={row} /></span> },
    ...(row.renovacao_observacao?.trim() ? [{ label: "Observação de renovação", value: row.renovacao_observacao }] : []),
    ...(row.renovado ? [{ label: "Arquivo do certificado", value: `Atualizado em ${formatDateTime(row.ultimo_upload_em)}` }] : []),
  ];
}

export function CertificateList({ rows, filters, canManage, error = false, page, pageSize, total }: CertificateListProps) {
  const navigate = (changes: Record<string, string | null>) => window.location.assign(certificateListHref(filters.query, changes));
  const columns: DataColumn<CertificateListRow>[] = [
    { key: "titular", label: "Titular", render: (row) => <TableText primary={row.nome_titular || "Não informado"} secondary={formatCnpj(row.cnpj)} /> },
    { key: "vencimento", label: "Vencimento", width: 160, sortable: true, render: (row) => <>
      <span className={spec.cellPrimary}>{formatDate(row.data_vencimento)}</span>
      <span className={`${spec.cellSecondary} ${styles.expiration}`} data-tone={row.status === "vencido" ? "danger" : row.status === "vencendo" ? "warning" : "none"}>{formatDays(row.dias_restantes)}</span>
    </> },
    { key: "situacao", label: "Situação", width: 150, minWidth: 150, render: (row) => <Validity row={row} /> },
    { key: "renovacao", label: "Renovação", width: 190, render: (row) => <Renewal row={row} /> },
  ];
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return <Panel flush header={<FilterBar action="/certificados" query={filters.query} search={{ name: "q", placeholder: "Titular, cliente ou CNPJ" }} filters={certificateFilterFields(filters.situation, filters.renewal)} />}>
    <div className={styles.table}>
      <DataTable label="Certificados" rows={rows} columns={columns} getRowKey={(row) => row.id} getRowLabel={(row) => row.nome_titular}
        mobile={(row) => ({ primary: row.nome_titular || "Não informado", secondary: `${formatCnpj(row.cnpj)} · ${formatDate(row.data_vencimento)} · ${formatDays(row.dias_restantes)}`, badge: <Validity row={row} /> })}
        details={certificateDetails} actions={(row) => <RowActions row={row} canManage={canManage} />} actionsWidth={200}
        state={error ? "error" : "ok"} onRetry={() => window.location.reload()}
        emptyMessage={filters.hasFilters ? "Nenhum certificado encontrado com esses filtros." : "Nenhum certificado cadastrado."}
        sort={{ key: "vencimento", direction: filters.direction }} onSort={(_, direction) => navigate({ ordem: direction, page: null })}
        pagination={pageSize === 25 ? { page, total, unit: "certificados", onPageChange: (next) => navigate({ page: String(next) }) } : undefined}
      />
      {!error && rows.length === 0 && filters.hasFilters && <div className={styles.emptyActions}><Link className={`${spec.root} ${spec.button}`} data-variant="ghost" data-size="sm" href="/certificados">Limpar filtros</Link></div>}
      {!error && rows.length > 0 && pageSize !== 25 && <div className={spec.tableFooter}>
        <span>Mostrando {formatCount((page - 1) * pageSize + 1)}–{formatCount(Math.min(page * pageSize, total))} de {formatCount(total)} certificados</span>
        <nav className={spec.pagination} aria-label="Paginação: Certificados">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => navigate({ page: String(page - 1) })}>Anterior</Button>
          <span>Página {formatCount(page)} de {formatCount(totalPages)}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => navigate({ page: String(page + 1) })}>Próxima</Button>
        </nav>
      </div>}
    </div>
  </Panel>;
}
