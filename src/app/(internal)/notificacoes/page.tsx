import Link from "next/link";

import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { requireInternalUser } from "@/lib/auth/rbac";
import { daysUntilDate } from "@/lib/certificados/status";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationEventStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils/cn";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime, formatDaysLabel } from "@/lib/utils/format";
import { maskPhone } from "@/lib/utils/phone";

import { RetryEventButton } from "./retry-event-button";

type NotificacoesPageProps = {
  searchParams: Promise<{
    status?: string;
    type?: string;
    send_date?: string;
    recipient_id?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
};

const statuses = ["pending", "reserved", "processing", "retry", "sent", "failed", "cancelled", "skipped"] as const;
const types = ["certificate_expiring", "certificate_expired"] as const;

const TYPE_LABELS: Record<(typeof types)[number], string> = {
  certificate_expiring: "Vencendo",
  certificate_expired: "Vencidos",
};

const STATUS_LABELS: Record<NotificationEventStatus, { label: string; tone: Tone }> = {
  pending: { label: "Aguardando envio", tone: "blue" },
  reserved: { label: "Preparando envio", tone: "blue" },
  processing: { label: "Enviando", tone: "blue" },
  retry: { label: "Tentando novamente", tone: "amber" },
  sent: { label: "Aviso enviado", tone: "green" },
  failed: { label: "Falha no envio", tone: "red" },
  cancelled: { label: "Cancelado", tone: "slate" },
  skipped: { label: "Ignorado", tone: "slate" },
};

function getQuickFilters(today: string) {
  return [
    { key: "all", label: "Todos", href: "/notificacoes" },
    { key: "expired", label: "Vencidos", href: "/notificacoes?type=certificate_expired" },
    { key: "expiring", label: "Vencendo", href: "/notificacoes?type=certificate_expiring" },
    { key: "today", label: "Avisos de hoje", href: `/notificacoes?send_date=${today}` },
    { key: "sent", label: "Enviados", href: "/notificacoes?status=sent" },
    { key: "failed", label: "Falhas", href: "/notificacoes?status=failed" },
  ];
}

function getActiveQuickFilter({
  status,
  type,
  sendDate,
  today,
}: {
  status: NotificationEventStatus | null;
  type: (typeof types)[number] | null;
  sendDate: string;
  today: string;
}) {
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  if (sendDate === today) return "today";
  if (type === "certificate_expired") return "expired";
  if (type === "certificate_expiring") return "expiring";
  return "all";
}

function getClienteTelefone(cliente: { whatsapp?: string | null; telefone?: string | null } | null | undefined) {
  return cliente?.whatsapp ?? cliente?.telefone ?? "Telefone não cadastrado";
}

function getNoticeText(event: { type: string; dias_restantes: number | null; certificados?: { data_vencimento: string | null } | null }) {
  if (event.type === "certificate_expired") {
    return "Resumo diário de vencidos";
  }

  if (typeof event.dias_restantes === "number") {
    return `Vence em ${formatDaysLabel(event.dias_restantes)}`;
  }

  if (event.certificados?.data_vencimento) {
    const days = daysUntilDate(event.certificados.data_vencimento);
    return days < 0 ? `Vencido há ${formatDaysLabel(Math.abs(days))}` : `Vence em ${formatDaysLabel(days)}`;
  }

  return "Aviso planejado";
}

function getRecommendedAction(event: { status: string; type: string }) {
  if (event.status === "failed") {
    return "Revisar e tentar novamente";
  }

  return event.type === "certificate_expired" ? "Contatar clientes vencidos" : "Acompanhar renovação";
}

export default async function NotificacoesPage({ searchParams }: NotificacoesPageProps) {
  const params = await searchParams;
  const user = await requireInternalUser();
  const status = params.status && statuses.includes(params.status as NotificationEventStatus)
    ? (params.status as NotificationEventStatus)
    : null;
  const type = params.type && types.includes(params.type as (typeof types)[number])
    ? (params.type as (typeof types)[number])
    : null;
  const sendDate = params.send_date && /^\d{4}-\d{2}-\d{2}$/.test(params.send_date) ? params.send_date : "";
  const recipientId = params.recipient_id ?? "";
  const search = params.q?.trim().replace(/[%,()]/g, "") ?? "";
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set("page", params.page);
  if (params.pageSize) urlParams.set("pageSize", params.pageSize);
  const pagination = parsePagination(urlParams);
  const today = new Date().toISOString().slice(0, 10);
  const activeQuickFilter = getActiveQuickFilter({ status, type, sendDate, today });
  const admin = createSupabaseAdminClient();
  const { data: recipients } = await admin
    .from("notification_recipients")
    .select("id, nome, telefone_normalizado, ativo")
    .order("nome", { ascending: true });

  let query = admin
    .from("notification_events")
    .select(
      "id, recipient_id, telefone_destino, type, dias_restantes, send_date, status, sent_at, failed_at, attempt_count, max_attempts, next_retry_at, error_message, created_at, clientes(nome_razao_social, cnpj, telefone, whatsapp), certificados(nome_titular, cnpj, data_vencimento), notification_recipients(nome, telefone_normalizado, ativo), whatsapp_devices(name)",
      { count: "exact" },
    )
    .order("send_date", { ascending: true })
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);

  if (status) {
    query = query.eq("status", status);
  }

  if (type) {
    query = query.eq("type", type);
  }

  if (sendDate) {
    query = query.eq("send_date", sendDate);
  }

  if (recipientId) {
    query = query.eq("recipient_id", recipientId);
  }

  if (search) {
    query = query.or(`mensagem_renderizada.ilike.%${search}%,telefone_destino.ilike.%${search.replace(/\D/g, "") || search}%`);
  }

  const { data: rawEvents, count } = await query;
  const events = rawEvents ?? [];
  const paginationMeta = createPaginationMeta(count, pagination.page, pagination.pageSize);

  return (
    <section>
      <SectionHeader
        title="Avisos"
        description="Acompanhe avisos planejados, envios do dia, falhas e certificados que exigem contato."
      />

      <div className="mb-3 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {getQuickFilters(today).map((item) => {
            const active = activeQuickFilter === item.key;

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition duration-200 hover:-translate-y-0.5",
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20 ring-blue-600"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:ring-blue-200",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refinar por</p>
        <FilterBar columns="lg:grid-cols-[1fr_220px_180px_auto]">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Cliente, CNPJ ou certificado"
            className={inputClass}
          />
          <select name="recipient_id" defaultValue={recipientId} className={selectClass}>
            <option value="">Todos os destinatários</option>
            {(recipients ?? []).map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.nome}
              </option>
            ))}
          </select>
          <input type="date" name="send_date" defaultValue={sendDate} className={inputClass} />
          <button type="submit" className={buttonClass("secondary", "h-10")}>
            Filtrar
          </button>
        </FilterBar>
      </div>

      {!events.length ? (
        <EmptyState title="Nenhum aviso encontrado" description="Ajuste os filtros ou execute a verificação automática para planejar novos avisos." />
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 xl:hidden">
            {events.map((event) => {
              const cliente = Array.isArray(event.clientes) ? event.clientes[0] : event.clientes;
              const certificado = Array.isArray(event.certificados) ? event.certificados[0] : event.certificados;
              const recipient = Array.isArray(event.notification_recipients)
                ? event.notification_recipients[0]
                : event.notification_recipients;
              const statusMeta = STATUS_LABELS[event.status as NotificationEventStatus] ?? STATUS_LABELS.pending;
              const lastAttempt = event.failed_at ?? event.sent_at ?? event.next_retry_at ?? event.created_at;
              const certificadoNome = certificado?.nome_titular
                ? formatCertificateTitle(certificado.nome_titular, certificado.cnpj ?? cliente?.cnpj)
                : event.type === "certificate_expired"
                  ? "Certificados vencidos"
                  : "-";

              return (
                <article key={event.id} className="rounded-2xl border border-white/75 bg-white/82 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {cliente?.nome_razao_social ?? (event.type === "certificate_expired" ? "Resumo diário" : "-")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{cliente?.cnpj ? formatCnpj(cliente.cnpj) : "Lista consolidada"}</p>
                    </div>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <p><span className="font-medium text-slate-950">Certificado:</span> {certificadoNome}</p>
                    <p><span className="font-medium text-slate-950">Aviso:</span> {getNoticeText({ ...event, certificados: certificado ?? null })}</p>
                    <p><span className="font-medium text-slate-950">Contato do cliente:</span> {event.type === "certificate_expired" ? "Lista consolidada" : getClienteTelefone(cliente)}</p>
                    <p><span className="font-medium text-slate-950">Destinatário:</span> {recipient?.nome ?? "Destinatário removido"} ({maskPhone(event.telefone_destino)})</p>
                    <p><span className="font-medium text-slate-950">Envio:</span> {formatDate(event.send_date)}</p>
                    <p><span className="font-medium text-slate-950">Última tentativa:</span> {formatDateTime(lastAttempt)}</p>
                    <p className="sm:col-span-2"><span className="font-medium text-slate-950">Ação recomendada:</span> {getRecommendedAction(event)}</p>
                  </div>
                  {user.role === "admin" && ["failed", "cancelled", "skipped"].includes(event.status) ? (
                    <div className="mt-3">
                      <RetryEventButton eventId={event.id} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="hidden xl:block">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Certificado</TableHeaderCell>
                  <TableHeaderCell>Aviso</TableHeaderCell>
                  <TableHeaderCell>Destinatário interno</TableHeaderCell>
                  <TableHeaderCell>Envio</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Detalhes</TableHeaderCell>
                  <TableHeaderCell>Ações</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {events.map((event) => {
                  const cliente = Array.isArray(event.clientes) ? event.clientes[0] : event.clientes;
                  const certificado = Array.isArray(event.certificados) ? event.certificados[0] : event.certificados;
                  const recipient = Array.isArray(event.notification_recipients)
                    ? event.notification_recipients[0]
                    : event.notification_recipients;
                  const statusMeta = STATUS_LABELS[event.status as NotificationEventStatus] ?? STATUS_LABELS.pending;
                  const lastAttempt = event.failed_at ?? event.sent_at ?? event.next_retry_at ?? event.created_at;
                  const certificadoNome = certificado?.nome_titular
                    ? formatCertificateTitle(certificado.nome_titular, certificado.cnpj ?? cliente?.cnpj)
                    : event.type === "certificate_expired"
                      ? "Certificados vencidos"
                      : "-";

                  return (
                    <tr key={event.id} className="transition duration-200 hover:bg-blue-50/48">
                      <TableCell>
                        <p className="font-semibold text-slate-950">
                          {cliente?.nome_razao_social ?? (event.type === "certificate_expired" ? "Resumo diário" : "-")}
                        </p>
                        <p className="text-xs text-slate-500">{cliente?.cnpj ? formatCnpj(cliente.cnpj) : "Lista consolidada"}</p>
                      </TableCell>
                      <TableCell className="max-w-[190px] text-slate-700">
                        <p className="line-clamp-2">{certificadoNome}</p>
                        {certificado?.data_vencimento ? (
                          <p className="mt-1 text-xs text-slate-500">Vencimento: {formatDate(certificado.data_vencimento)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-950">{TYPE_LABELS[event.type as keyof typeof TYPE_LABELS] ?? "Aviso"}</p>
                        <p className="mt-1 text-xs text-slate-500">{getNoticeText({ ...event, certificados: certificado ?? null })}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-slate-950">{recipient?.nome ?? "Destinatário removido"}</p>
                        <p className="text-xs text-slate-500">{maskPhone(event.telefone_destino)}</p>
                      </TableCell>
                      <TableCell className="text-slate-700">{formatDate(event.send_date)}</TableCell>
                      <TableCell>
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[210px] text-slate-700">
                        <p>{getRecommendedAction(event)}</p>
                        <p className="mt-1 text-xs text-slate-500">Última tentativa: {formatDateTime(lastAttempt)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Cliente: {event.type === "certificate_expired" ? "Lista consolidada" : getClienteTelefone(cliente)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {user.role === "admin" && ["failed", "cancelled", "skipped"].includes(event.status) ? (
                          <RetryEventButton eventId={event.id} />
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>
          <PaginationBar
            basePath="/notificacoes"
            searchParams={{
              q: params.q || undefined,
              status: status || undefined,
              type: type || undefined,
              send_date: sendDate || undefined,
              recipient_id: recipientId || undefined,
            }}
            page={paginationMeta.page}
            pageSize={paginationMeta.pageSize}
            total={paginationMeta.total}
            totalPages={paginationMeta.totalPages}
            itemLabel="avisos"
          />
        </div>
      )}
    </section>
  );
}
