"use client";

import { useRouter } from "next/navigation";
import { Button, DataTable, StatusBadge, TableText, type DataColumn, type DetailItem } from "@/components/ui/spec";
import spec from "@/components/ui/spec/spec.module.css";
import { formatCnpj, formatCount, formatDateTime, formatPhone } from "@/lib/format";
import { clientListHref, getClientDisplayName, getClientListNoticeStatus, getClientPreferredPhone, type ClientListFilters, type ClientListRecord } from "@/lib/clientes/list-presentation";
import styles from "./clientes.module.css";

export const noticeHelp = "Clientes com avisos permitidos entram na fila quando um certificado chega na janela de aviso. Sem WhatsApp, o aviso não é criado.";

export function clientDetailItems(row: ClientListRecord): DetailItem[] {
  const name = getClientDisplayName(row.nome_razao_social, row.cnpj);
  const phone = row.telefone?.trim();
  const whatsapp = row.whatsapp?.trim();
  const samePhone = Boolean(whatsapp && phone && phone.replace(/\D/g, "") === whatsapp.replace(/\D/g, ""));
  return [
    { label: "E-mail", value: row.email?.trim() || "Não informado" },
    ...(phone && !samePhone ? [{ label: "Telefone", value: formatPhone(phone) }] : []),
    ...(name !== row.nome_razao_social ? [{ label: "Nome original do cadastro", value: row.nome_razao_social }] : []),
    { label: "Responsável", value: <span className={styles.responsibleDetail}>{row.responsavel?.trim() || "Não informado"}</span> },
    { label: "Certificados vinculados", value: formatCount(row.certificateCount) },
    { label: "Última atualização", value: formatDateTime(row.updated_at) },
  ];
}

export function ClientesTable({ rows, filters, total, state = "ok" }: {
  rows: ClientListRecord[]; filters: ClientListFilters; total: number; state?: "ok" | "error" | "loading";
}) {
  const router = useRouter();
  const columns: DataColumn<ClientListRecord>[] = [
    { key: "nome_razao_social", label: "Cliente", sortable: true,
      render: (row) => <TableText primary={getClientDisplayName(row.nome_razao_social, row.cnpj)} secondary={formatCnpj(row.cnpj)} /> },
    { key: "whatsapp", label: "WhatsApp", width: 200, render: (row) => <span className={getClientPreferredPhone(row) ? spec.cellPrimary : spec.cellSecondary}>{formatPhone(getClientPreferredPhone(row))}</span> },
    { key: "avisos", label: "Avisos", help: noticeHelp, width: 180, render: (row) => <StatusBadge domain="cliente" status={getClientListNoticeStatus(row)} /> },
    { key: "responsavel", label: "Responsável", width: 180, render: (row) => <span className={row.responsavel?.trim() ? spec.cellPrimary : spec.cellSecondary} title={row.responsavel?.trim() || undefined}>{row.responsavel?.trim() || "Não informado"}</span> },
  ];
  return <div className={styles.tableFrame}>
    <DataTable label="Clientes" rows={rows} columns={columns}
      getRowKey={(row) => row.id} getRowLabel={(row) => getClientDisplayName(row.nome_razao_social, row.cnpj)}
      mobile={(row) => ({ primary: getClientDisplayName(row.nome_razao_social, row.cnpj), secondary: formatCnpj(row.cnpj), badge: <StatusBadge domain="cliente" status={getClientListNoticeStatus(row)} /> })}
      details={clientDetailItems} actionsWidth={150}
      actions={(row) => <a href={`/clientes/${encodeURIComponent(row.id)}`} className={`${spec.root} ${spec.button}`} data-variant="secondary" data-size="sm">Abrir cadastro</a>}
      sort={{ key: "nome_razao_social", direction: filters.ordem }}
      onSort={(_, direction) => router.push(clientListHref(filters, { ordem: direction, page: 1 }))}
      pagination={{ page: filters.page, total, unit: "clientes", onPageChange: (page) => router.push(clientListHref(filters, { page })) }}
      state={state} onRetry={() => router.refresh()} emptyMessage="Nenhum cliente encontrado com esses filtros." />
    {state === "ok" && !rows.length && (filters.q || filters.contato || filters.responsavel) && <div className={styles.emptyAction}>
      <Button variant="secondary" size="sm" onClick={() => router.push("/clientes")}>Limpar filtros</Button>
    </div>}
  </div>;
}
