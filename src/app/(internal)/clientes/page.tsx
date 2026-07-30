import { MessageCircle, MessageCircleOff, UserCheck, Users } from "lucide-react";
import Link from "next/link";

import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";
import { buildClientPageSummary, getClientContactSummary, getClientNoticePresentation } from "@/lib/clientes/presentation";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCnpj, formatDateTimeShort, formatDisplayName, formatPhone } from "@/lib/utils/format";

type ClientesPageProps = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function cleanSearch(value?: string) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

function optionalText(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = await searchParams;
  const search = cleanSearch(params.q);
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set("page", params.page);
  if (params.pageSize) urlParams.set("pageSize", params.pageSize);
  const pagination = parsePagination(urlParams);
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("clientes")
    .select("id, nome_razao_social, cnpj, email, telefone, whatsapp, whatsapp_notifications_enabled, responsavel, created_at, updated_at", {
      count: "exact",
    })
    .order("nome_razao_social", { ascending: true })
    .range(pagination.from, pagination.to);

  if (search) {
    const digits = search.replace(/\D/g, "");
    query =
      digits.length === 14
        ? query.eq("cnpj", digits)
        : query.or(`nome_razao_social.ilike.%${search}%,cnpj.ilike.%${digits || search}%`);
  }

  const { data: clientes, count } = await query;
  const paginationMeta = createPaginationMeta(count, pagination.page, pagination.pageSize);
  const hasSearch = Boolean(search);
  const clientSummary = buildClientPageSummary(clientes ?? [], paginationMeta.total);

  return (
    <section>
      <SectionHeader
        title="Clientes"
        description="Consulte os clientes vinculados aos certificados e seus dados de contato."
        actions={
          <Link href="/certificados/novo" className={buttonClass("primary")}>
            Novo certificado
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Clientes encontrados"
          value={clientSummary.totalClients}
          description={hasSearch ? "Resultado dos filtros aplicados" : "Total da base consultada"}
          icon={Users}
          tone="blue"
        />
        <StatCard
          title="Com telefone"
          value={clientSummary.withPhone}
          description={`Nesta página de ${clientSummary.currentPageClients} cliente(s)`}
          icon={MessageCircle}
          tone="green"
        />
        <StatCard
          title="Sem contato"
          value={clientSummary.withoutPhone}
          description="Precisam de WhatsApp ou telefone para aviso ao cliente"
          icon={MessageCircleOff}
          tone={clientSummary.withoutPhone > 0 ? "amber" : "slate"}
        />
        <StatCard
          title="Sem responsável"
          value={clientSummary.withoutResponsible}
          description="Nesta página, sem responsável cadastrado"
          icon={UserCheck}
          tone={clientSummary.withoutResponsible > 0 ? "amber" : "green"}
        />
      </div>
      <FilterBar columns="md:grid-cols-[minmax(320px,1fr)_auto_auto]">
        <input
          id="clientes-search"
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por razão social ou CNPJ"
          className={inputClass}
          aria-label="Buscar clientes"
        />
        <button type="submit" className={buttonClass("secondary", "h-10")}>
          Aplicar filtros
        </button>
        {hasSearch ? (
          <Link href="/clientes" className={buttonClass("ghost", "h-10")}>
            Limpar filtros
          </Link>
        ) : null}
      </FilterBar>

      {!clientes?.length ? (
        <EmptyState
          title={hasSearch ? "Nenhum resultado encontrado" : "Nenhum cliente encontrado"}
          description={
            hasSearch
              ? "Revise o termo pesquisado ou limpe os filtros."
              : "Os clientes são cadastrados manualmente ou durante o envio de certificados."
          }
          action={
            hasSearch ? (
              <Link href="/clientes" className={buttonClass("secondary")}>
                Limpar filtros
              </Link>
            ) : (
              <Link href="/certificados/novo" className={buttonClass("primary")}>
                Enviar certificado
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:hidden">
            {clientes.map((cliente) => {
              const notice = getClientNoticePresentation(cliente);
              const contact = getClientContactSummary(cliente);

              return (
                <article
                  key={cliente.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5"
                >
                  <div className="flex flex-col gap-2">
                    <div>
                      <h2 className="text-sm font-semibold leading-5 text-slate-950">{formatDisplayName(cliente.nome_razao_social)}</h2>
                      <p className="mt-1 text-xs text-slate-500">{formatCnpj(cliente.cnpj)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={contact.tone}>{contact.label}</Badge>
                      <Badge tone={notice.tone}>{notice.label}</Badge>
                    </div>
                  </div>

                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contato</dt>
                      <dd className="mt-1 break-words text-slate-800">{optionalText(cliente.email)}</dd>
                      <dd className="mt-1 text-slate-800">{formatPhone(cliente.whatsapp ?? cliente.telefone)}</dd>
                      <dd className="mt-1 text-xs text-slate-500">{notice.description}</dd>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responsável</dt>
                        <dd className="mt-1 text-slate-800">{optionalText(cliente.responsavel)}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atualizado em</dt>
                        <dd className="mt-1 text-slate-800">{formatDateTimeShort(cliente.updated_at)}</dd>
                      </div>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="hidden md:block">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Contato</TableHeaderCell>
                  <TableHeaderCell>Avisos</TableHeaderCell>
                  <TableHeaderCell>Responsável</TableHeaderCell>
                  <TableHeaderCell>Atualização</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {clientes.map((cliente) => {
                  const notice = getClientNoticePresentation(cliente);
                  const contact = getClientContactSummary(cliente);

                  return (
                    <tr key={cliente.id} className="transition duration-150 hover:bg-slate-50">
                      <TableCell className="max-w-[420px]">
                        <p className="font-semibold text-slate-950">{formatDisplayName(cliente.nome_razao_social)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatCnpj(cliente.cnpj)}</p>
                      </TableCell>
                      <TableCell className="text-slate-700">
                        <Badge tone={contact.tone}>{contact.label}</Badge>
                        <p className="mt-2 break-words">{optionalText(cliente.email)}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatPhone(cliente.whatsapp ?? cliente.telefone)}</p>
                      </TableCell>
                      <TableCell>
                        <Badge tone={notice.tone}>{notice.label}</Badge>
                        <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">{notice.description}</p>
                      </TableCell>
                      <TableCell className="text-slate-700">{optionalText(cliente.responsavel)}</TableCell>
                      <TableCell className="text-slate-700">{formatDateTimeShort(cliente.updated_at)}</TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>
          <PaginationBar
            basePath="/clientes"
            searchParams={{ q: search || undefined }}
            page={paginationMeta.page}
            pageSize={paginationMeta.pageSize}
            total={paginationMeta.total}
            totalPages={paginationMeta.totalPages}
            itemLabel="clientes"
          />
        </div>
      )}
    </section>
  );
}
