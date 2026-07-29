import { FolderUp, Upload } from "lucide-react";
import Link from "next/link";

import { ManualNoticeButton } from "@/app/(internal)/certificados/manual-notice-button";
import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { wasCertificateRenewed } from "@/lib/certificados/renewal";
import {
  CERTIFICATE_RENEWAL_FILTER_LABEL,
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  CERTIFICATE_RENEWAL_STATUS_TONE,
  DEFAULT_CERTIFICATE_RENEWAL_FILTER,
  isCertificateRenewalPlannable,
  parseCertificateRenewalFilter,
  PLANNABLE_CERTIFICATE_RENEWAL_STATUSES,
  shouldShowRenewalBadge,
  type CertificateRenewalFilter,
} from "@/lib/certificados/renewal-status";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { CERTIFICATE_STATUS_LABEL, CERTIFICATE_STATUSES } from "@/lib/certificados/status-labels";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CertificadoStatus } from "@/lib/supabase/database.types";
import {
  formatCertificateTitle,
  formatCnpj,
  formatDate,
  formatDateTimeShort,
  formatDisplayName,
  formatRelativeExpiration,
} from "@/lib/utils/format";

type CertificadosPageProps = {
  searchParams: Promise<{
    status?: string;
    renovacao?: string;
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
  in: (column: string, value: readonly string[]) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lt: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  gt: (column: string, value: string) => FilterableQuery;
};

function applyStatusFilter<T extends FilterableQuery>(query: T, status: CertificadoStatus | "", today: string, warningDate: string) {
  const builder = query as FilterableQuery;

  if (status === "vencido") {
    return builder.lt("data_vencimento", today) as T;
  }

  if (status === "vencendo") {
    return builder.gte("data_vencimento", today).lte("data_vencimento", warningDate) as T;
  }

  if (status === "ativo") {
    return builder.gt("data_vencimento", warningDate) as T;
  }

  if (status === "invalido") {
    return builder.eq("status", "invalido") as T;
  }

  return query;
}

function applyRenewalFilter<T extends FilterableQuery>(query: T, renewalFilter: CertificateRenewalFilter) {
  const builder = query as FilterableQuery;

  if (renewalFilter === "todos") {
    return query;
  }

  if (renewalFilter === "acompanhamento") {
    return builder.in("renovacao_status", [...PLANNABLE_CERTIFICATE_RENEWAL_STATUSES]) as T;
  }

  return builder.eq("renovacao_status", renewalFilter) as T;
}

function calculateRemainingDays(expirationDate: string, today: string) {
  return Math.round(
    (new Date(`${expirationDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );
}

export default async function CertificadosPage({ searchParams }: CertificadosPageProps) {
  const user = await requireInternalUser();
  const params = await searchParams;
  const selectedStatus = CERTIFICATE_STATUSES.includes(params.status as CertificadoStatus)
    ? (params.status as CertificadoStatus)
    : "";
  const selectedRenewal = parseCertificateRenewalFilter(params.renovacao);
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
      "id, cnpj, nome_titular, data_emissao, data_vencimento, status, renovacao_status, nome_arquivo_original, ultimo_upload_em, created_at, clientes(nome_razao_social)",
      { count: "exact" },
    )
    .order("data_vencimento", { ascending: true })
    .range(pagination.from, pagination.to);

  query = applyStatusFilter(query, selectedStatus, today, warningDate);
  query = applyRenewalFilter(query, selectedRenewal);

  if (search) {
    const digits = search.replace(/\D/g, "");
    query =
      digits.length === 14
        ? query.eq("cnpj", digits)
        : query.or(`nome_titular.ilike.%${search}%,cnpj.ilike.%${digits || search}%`);
  }

  const { data: certificados, count } = await query;
  const canManageCertificates = canManageOperationalData(user.role);
  const certificadosWithStatus = (certificados ?? []).map((certificado) => ({
    ...certificado,
    status: certificado.status === "invalido"
      ? certificado.status
      : calculateCertificateStatus(certificado.data_vencimento, warningDays, timezone),
    renovacao_status: certificado.renovacao_status ?? "em_acompanhamento",
    renovado: wasCertificateRenewed(certificado.created_at, certificado.ultimo_upload_em),
    dias_restantes: calculateRemainingDays(certificado.data_vencimento, today),
  }));
  const paginationMeta = createPaginationMeta(count, pagination.page, pagination.pageSize);
  const hasFilters = Boolean(search || selectedStatus || selectedRenewal !== DEFAULT_CERTIFICATE_RENEWAL_FILTER);

  return (
    <section>
      <SectionHeader
        title="Certificados"
        description="Gerencie certificados, acompanhe vencimentos e inicie ações de renovação."
        actions={
          canManageCertificates ? (
            <>
              <Link href="/certificados/novo" className={buttonClass("primary", "w-full sm:w-auto")}>
                <Upload aria-hidden="true" className="h-4 w-4" />
                Novo certificado
              </Link>
              <Link href="/certificados/importar" className={buttonClass("secondary", "w-full sm:w-auto")}>
                <FolderUp aria-hidden="true" className="h-4 w-4" />
                Importar certificados
              </Link>
            </>
          ) : null
        }
      />
      <FilterBar columns="lg:grid-cols-[minmax(260px,1fr)_220px_230px_auto_auto]">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por titular, cliente ou CNPJ"
          className={inputClass}
          aria-label="Buscar certificados"
        />
        <select name="status" defaultValue={selectedStatus} className={selectClass} aria-label="Filtrar por status">
          <option value="">Todos os status</option>
          {CERTIFICATE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CERTIFICATE_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select name="renovacao" defaultValue={selectedRenewal} className={selectClass} aria-label="Filtrar por renovacao">
          <option value="todos">{CERTIFICATE_RENEWAL_FILTER_LABEL.todos}</option>
          <option value="acompanhamento">{CERTIFICATE_RENEWAL_FILTER_LABEL.acompanhamento}</option>
          <option value="renovou_fasa">{CERTIFICATE_RENEWAL_STATUS_LABEL.renovou_fasa}</option>
          <option value="renovou_externo">{CERTIFICATE_RENEWAL_STATUS_LABEL.renovou_externo}</option>
          <option value="nao_renovar">{CERTIFICATE_RENEWAL_STATUS_LABEL.nao_renovar}</option>
          <option value="cliente_inativo">{CERTIFICATE_RENEWAL_STATUS_LABEL.cliente_inativo}</option>
        </select>
        <button type="submit" className={buttonClass("secondary", "h-10")}>
          Aplicar filtros
        </button>
        {hasFilters ? (
          <Link href="/certificados" className={buttonClass("ghost", "h-10")}>
            Limpar filtros
          </Link>
        ) : null}
      </FilterBar>

      {!certificadosWithStatus.length ? (
        <EmptyState
          title={hasFilters ? "Nenhum resultado encontrado" : "Nenhum certificado cadastrado"}
          description={
            hasFilters
              ? "Revise o termo pesquisado ou limpe os filtros."
              : "Envie o primeiro certificado para começar a acompanhar vencimentos."
          }
          action={
            canManageCertificates && !hasFilters ? (
              <Link href="/certificados/novo" className={buttonClass("primary")}>
                Enviar certificado
              </Link>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:hidden">
            {certificadosWithStatus.map((certificado) => (
              <article
                key={certificado.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
                      {formatCertificateTitle(certificado.nome_titular, certificado.cnpj)}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">{formatCnpj(certificado.cnpj)}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      {formatDisplayName(certificado.clientes?.nome_razao_social ?? "Cliente não vinculado")}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StatusBadge status={certificado.status} />
                    {certificado.renovado ? <Badge tone="blue">Atualizado</Badge> : null}
                    {shouldShowRenewalBadge(certificado.renovacao_status) ? (
                      <Badge tone={CERTIFICATE_RENEWAL_STATUS_TONE[certificado.renovacao_status]}>
                        {CERTIFICATE_RENEWAL_STATUS_LABEL[certificado.renovacao_status]}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Vencimento</dt>
                    <dd className="mt-1 font-semibold text-slate-950">{formatDate(certificado.data_vencimento)}</dd>
                    <dd className="text-xs text-slate-500">{formatRelativeExpiration(certificado.dias_restantes)}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atualizado em</dt>
                    <dd className="mt-1 text-slate-800">{formatDateTimeShort(certificado.ultimo_upload_em)}</dd>
                  </div>
                </dl>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Link className={buttonClass("secondary", "min-h-10 w-full px-3 text-sm")} href={`/certificados/${certificado.id}`}>
                    Ver detalhes
                  </Link>
                  {canManageCertificates && isCertificateRenewalPlannable(certificado.renovacao_status) ? (
                    <ManualNoticeButton certificadoId={certificado.id} />
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <div className="hidden md:block">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Titular</TableHeaderCell>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Vencimento</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Atualização</TableHeaderCell>
                  <TableHeaderCell>Ações</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {certificadosWithStatus.map((certificado) => (
                  <tr key={certificado.id} className="transition duration-150 hover:bg-slate-50">
                    <TableCell className="max-w-[320px]">
                      <p className="font-semibold text-slate-950">{formatCertificateTitle(certificado.nome_titular, certificado.cnpj)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCnpj(certificado.cnpj)}</p>
                    </TableCell>
                    <TableCell className="max-w-[300px] text-slate-700">
                      <p className="line-clamp-2">{formatDisplayName(certificado.clientes?.nome_razao_social ?? "Cliente não vinculado")}</p>
                    </TableCell>
                    <TableCell className="text-slate-700">
                      <p className="font-medium text-slate-950">{formatDate(certificado.data_vencimento)}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatRelativeExpiration(certificado.dias_restantes)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={certificado.status} />
                        {certificado.renovado ? <Badge tone="blue">Atualizado</Badge> : null}
                        {shouldShowRenewalBadge(certificado.renovacao_status) ? (
                          <Badge tone={CERTIFICATE_RENEWAL_STATUS_TONE[certificado.renovacao_status]}>
                            {CERTIFICATE_RENEWAL_STATUS_LABEL[certificado.renovacao_status]}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-700">{formatDateTimeShort(certificado.ultimo_upload_em)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-start gap-2">
                        <Link className={buttonClass("secondary", "min-h-8 px-3 text-xs")} href={`/certificados/${certificado.id}`}>
                          Ver detalhes
                        </Link>
                        {canManageCertificates && isCertificateRenewalPlannable(certificado.renovacao_status) ? (
                          <ManualNoticeButton certificadoId={certificado.id} />
                        ) : null}
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </TableBody>
            </TableShell>
          </div>
          <PaginationBar
            basePath="/certificados"
            searchParams={{
              q: search || undefined,
              status: selectedStatus || undefined,
              renovacao: selectedRenewal !== DEFAULT_CERTIFICATE_RENEWAL_FILTER ? selectedRenewal : undefined,
            }}
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
