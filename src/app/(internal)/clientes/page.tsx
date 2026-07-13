import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCnpj, formatDateTime, formatPhone } from "@/lib/utils/format";

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
    .select("id, nome_razao_social, cnpj, email, telefone, whatsapp, responsavel, created_at, updated_at", {
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

  return (
    <section>
      <SectionHeader
        title="Clientes"
        description="Clientes vinculados a certificados. Cadastros e edições acontecem pelo fluxo de certificados."
      />
      <FilterBar columns="md:grid-cols-[minmax(320px,1fr)_auto]">
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder="Buscar por razão social ou CNPJ"
          className={inputClass}
        />
        <button type="submit" className={buttonClass("secondary", "h-10")}>
          Filtrar
        </button>
      </FilterBar>

      {!clientes?.length ? (
        <EmptyState title="Nenhum cliente encontrado" description="Clientes aparecem aqui depois que um certificado é cadastrado ou renovado." />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:hidden">
            {clientes.map((cliente) => (
              <article
                key={cliente.id}
                className="rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80"
              >
                <h3 className="text-sm font-semibold leading-5 text-slate-950">{cliente.nome_razao_social}</h3>
                <p className="mt-1 text-xs text-slate-500">{formatCnpj(cliente.cnpj)}</p>

                <dl className="mt-3 grid gap-2 text-sm">
                  <div className="rounded-2xl bg-blue-50/65 p-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">WhatsApp</dt>
                    <dd className="mt-1 text-slate-800">{formatPhone(cliente.whatsapp ?? cliente.telefone)}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">E-mail</dt>
                      <dd className="mt-1 break-words text-slate-800">{cliente.email ?? "-"}</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responsável</dt>
                      <dd className="mt-1 text-slate-800">{cliente.responsavel ?? "-"}</dd>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Atualizado</dt>
                    <dd className="mt-1 text-slate-800">{formatDateTime(cliente.updated_at)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="hidden md:block">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Razão social</TableHeaderCell>
                  <TableHeaderCell>CNPJ</TableHeaderCell>
                  <TableHeaderCell>E-mail</TableHeaderCell>
                  <TableHeaderCell>WhatsApp</TableHeaderCell>
                  <TableHeaderCell>Responsável</TableHeaderCell>
                  <TableHeaderCell>Atualizado</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {clientes.map((cliente) => (
                  <tr key={cliente.id} className="transition duration-200 hover:bg-blue-50/48">
                    <TableCell className="font-semibold text-slate-950">{cliente.nome_razao_social}</TableCell>
                    <TableCell className="text-slate-700">{formatCnpj(cliente.cnpj)}</TableCell>
                    <TableCell className="text-slate-700">{cliente.email ?? "-"}</TableCell>
                    <TableCell className="text-slate-700">{formatPhone(cliente.whatsapp ?? cliente.telefone)}</TableCell>
                    <TableCell className="text-slate-700">{cliente.responsavel ?? "-"}</TableCell>
                    <TableCell className="text-slate-700">{formatDateTime(cliente.updated_at)}</TableCell>
                  </tr>
                ))}
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
