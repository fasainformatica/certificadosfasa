import { Upload } from "lucide-react";
import Link from "next/link";

import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { CERTIFICATE_STATUS_LABEL, CERTIFICATE_STATUSES } from "@/lib/certificados/status-labels";
import { requireInternalUser } from "@/lib/auth/rbac";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CertificadoStatus } from "@/lib/supabase/database.types";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime } from "@/lib/utils/format";

type CertificadosPageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function cleanSearch(value?: string) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

type FilterableQuery = {
  eq: (column: string, value: string) => FilterableQuery;
  neq: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lt: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  gt: (column: string, value: string) => FilterableQuery;
};

function applyStatusFilter<T extends FilterableQuery>(query: T, status: CertificadoStatus | "", today: string, warningDate: string) {
  const builder = query as FilterableQuery;

  if (status === "substituido") {
    return builder.eq("status", "substituido") as T;
  }

  if (status === "vencido") {
    return builder.neq("status", "substituido").lt("data_vencimento", today) as T;
  }

  if (status === "vencendo") {
    return builder.neq("status", "substituido").gte("data_vencimento", today).lte("data_vencimento", warningDate) as T;
  }

  if (status === "ativo") {
    return builder.neq("status", "substituido").gt("data_vencimento", warningDate) as T;
  }

  return query;
}

export default async function CertificadosPage({ searchParams }: CertificadosPageProps) {
  const user = await requireInternalUser();
  const params = await searchParams;
  const selectedStatus = CERTIFICATE_STATUSES.includes(params.status as CertificadoStatus)
    ? (params.status as CertificadoStatus)
    : "";
  const search = cleanSearch(params.q);
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set("page", params.page);
  if (params.pageSize) urlParams.set("pageSize", params.pageSize);
  const pagination = parsePagination(urlParams);
  const supabase = await createServerSupabaseClient();
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const warningDays = settings?.dias_aviso_vencimento ?? [30, 15, 7];
  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const { today, warningDate } = getCertificateStatusReferenceDates(warningDays, timezone);
  let query = supabase
    .from("certificados")
    .select(
      "id, cnpj, nome_titular, data_emissao, data_vencimento, status, nome_arquivo_original, ultimo_upload_em, clientes(nome_razao_social)",
      { count: "exact" },
    )
    .order("data_vencimento", { ascending: true })
    .range(pagination.from, pagination.to);

  query = applyStatusFilter(query, selectedStatus, today, warningDate);

  if (search) {
    const digits = search.replace(/\D/g, "");
    query =
      digits.length === 14
        ? query.eq("cnpj", digits)
        : query.or(`nome_titular.ilike.%${search}%,cnpj.ilike.%${digits || search}%`);
  }

  const { data: certificados, count } = await query;
  const certificadosWithStatus = (certificados ?? []).map((certificado) => ({
    ...certificado,
    status:
      certificado.status === "substituido"
        ? certificado.status
        : calculateCertificateStatus(certificado.data_vencimento, warningDays, timezone),
  }));
  const paginationMeta = createPaginationMeta(count, pagination.page, pagination.pageSize);

  return (
    <section>
      <SectionHeader
        title="Certificados"
        description="Acompanhe vencimentos, status e ações de renovação dos certificados cadastrados."
        actions={user.role === "admin" ? (
          <Link
            href="/certificados/novo"
            className={buttonClass("primary")}
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            Novo upload
          </Link>
        ) : null}
      />
      <FilterBar columns="md:grid-cols-[minmax(320px,1fr)_240px_auto]">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por titular ou CNPJ"
          className={inputClass}
        />
        <select
          name="status"
          defaultValue={selectedStatus}
          className={selectClass}
        >
          <option value="">Todos os status</option>
          {CERTIFICATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CERTIFICATE_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className={buttonClass("secondary", "h-10")}
        >
          Filtrar
        </button>
      </FilterBar>

      {!certificadosWithStatus.length ? (
        <EmptyState title="Nenhum certificado encontrado" description="Ajuste os filtros ou envie um novo certificado para iniciar o controle." />
      ) : (
        <div className="grid gap-2.5">
        <TableShell>
          <TableHead>
            <tr>
              <TableHeaderCell>Titular</TableHeaderCell>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>CNPJ</TableHeaderCell>
              <TableHeaderCell>Vencimento</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Último upload</TableHeaderCell>
              <TableHeaderCell>Ações</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {certificadosWithStatus.map((certificado) => (
              <tr key={certificado.id} className="transition duration-200 hover:bg-blue-50/48">
                <TableCell className="font-semibold text-slate-950">{formatCertificateTitle(certificado.nome_titular, certificado.cnpj)}</TableCell>
                <TableCell className="text-slate-700">{certificado.clientes?.nome_razao_social ?? "-"}</TableCell>
                <TableCell className="text-slate-700">{formatCnpj(certificado.cnpj)}</TableCell>
                <TableCell className="text-slate-700">{formatDate(certificado.data_vencimento)}</TableCell>
                <TableCell>
                  <StatusBadge status={certificado.status} />
                </TableCell>
                <TableCell className="text-slate-700">{formatDateTime(certificado.ultimo_upload_em)}</TableCell>
                <TableCell>
                  <Link className={buttonClass("secondary", "min-h-8 px-3 text-xs")} href={`/certificados/${certificado.id}`}>
                    Abrir detalhes
                  </Link>
                </TableCell>
              </tr>
            ))}
          </TableBody>
        </TableShell>
        <PaginationBar
          basePath="/certificados"
          searchParams={{ q: search || undefined, status: selectedStatus || undefined }}
          page={paginationMeta.page}
          pageSize={paginationMeta.pageSize}
          total={paginationMeta.total}
          totalPages={paginationMeta.totalPages}
          itemLabel="certificados"
        />
        </div>
      )}
    </section>
  );
}
