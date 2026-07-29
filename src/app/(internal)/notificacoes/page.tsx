import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, SendHorizonal, XCircle } from "lucide-react";
import Link from "next/link";

import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { daysUntilDate } from "@/lib/certificados/status";
import { buildNotificationEventSearchFilter } from "@/lib/notifications/event-search";
import { getTodayDateString, SETTINGS_ID } from "@/lib/notifications/engine";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NotificationEventStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils/cn";
import {
  EUATENDO_PROVIDER,
  WHATSAPP_EXTENSION_PROVIDER,
  getWhatsAppProviderLabel,
} from "@/lib/whatsapp/providers";
import {
  formatCertificateTitle,
  formatCnpj,
  formatDate,
  formatDateTimeShort,
  formatDisplayName,
  formatRelativeExpiration,
} from "@/lib/utils/format";
import { maskPhone } from "@/lib/utils/phone";

import { RetryEventButton } from "./retry-event-button";

type NotificacoesPageProps = {
  searchParams: Promise<{
    status?: string;
    type?: string;
    send_date?: string;
    recipient_id?: string;
    provider?: string;
    audience?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
};

const statuses = ["pending", "reserved", "processing", "retry", "sent", "failed", "cancelled", "skipped"] as const;
const types = ["certificate_expiring", "certificate_expired"] as const;
const providers = [EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER] as const;
const audiences = ["internal", "client"] as const;

const TYPE_LABELS: Record<(typeof types)[number], string> = {
  certificate_expiring: "Aviso de vencimento",
  certificate_expired: "Resumo de vencidos",
};

const STATUS_LABELS: Record<NotificationEventStatus, { label: string; tone: Tone }> = {
  pending: { label: "Na fila", tone: "blue" },
  reserved: { label: "Reservado", tone: "blue" },
  processing: { label: "Em processamento", tone: "blue" },
  retry: { label: "Nova tentativa agendada", tone: "amber" },
  sent: { label: "Enviado", tone: "green" },
  failed: { label: "Falha no envio", tone: "red" },
  cancelled: { label: "Cancelado", tone: "slate" },
  skipped: { label: "Ignorado", tone: "slate" },
};

const PROVIDER_LABELS: Record<string, string> = {
  [EUATENDO_PROVIDER]: "WhatsApp euAtendo",
  [WHATSAPP_EXTENSION_PROVIDER]: "Extensao do Chrome",
};

const AUDIENCE_LABELS: Record<(typeof audiences)[number], string> = {
  internal: "Equipe interna",
  client: "Cliente",
};

function getProviderLabel(provider: string | null | undefined) {
  return provider ? (PROVIDER_LABELS[provider] ?? getWhatsAppProviderLabel(provider)) : "WhatsApp";
}

function getQuickFilters(today: string) {
  return [
    { key: "all", label: "Todos", href: "/notificacoes" },
    { key: "today", label: "Hoje", href: `/notificacoes?send_date=${today}` },
    { key: "queue", label: "Na fila", href: "/notificacoes?status=pending" },
    { key: "sent", label: "Enviados", href: "/notificacoes?status=sent" },
    { key: "failed", label: "Com falha", href: "/notificacoes?status=failed" },
    { key: "expired", label: "Vencidos", href: "/notificacoes?type=certificate_expired" },
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
  if (status === "pending") return "queue";
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  if (sendDate === today) return "today";
  if (type === "certificate_expired") return "expired";
  return "all";
}

function getClienteTelefone(cliente: { whatsapp?: string | null; telefone?: string | null } | null | undefined) {
  return cliente?.whatsapp ?? cliente?.telefone ?? "Telefone não cadastrado";
}

function getNoticeText(event: { type: string; dias_restantes: number | null; certificados?: { data_vencimento: string | null } | null }) {
  if (event.type === "certificate_expired") {
    return "Resumo diário de certificados vencidos";
  }

  if (typeof event.dias_restantes === "number") {
    return formatRelativeExpiration(event.dias_restantes);
  }

  if (event.certificados?.data_vencimento) {
    return formatRelativeExpiration(daysUntilDate(event.certificados.data_vencimento));
  }

  return "Aviso planejado";
}

function getRecommendedAction(event: { status: string; type: string; next_retry_at?: string | null }) {
  if (event.status === "failed") {
    return "Verificar conexão do WhatsApp e tentar novamente";
  }

  if (event.status === "retry" && event.next_retry_at) {
    return `Nova tentativa às ${formatDateTimeShort(event.next_retry_at)}`;
  }

  return event.type === "certificate_expired" ? "Revisar certificados vencidos" : "Acompanhar renovação";
}

async function loadNotificationSummary(admin: ReturnType<typeof createSupabaseAdminClient>, today: string) {
  const [queueResult, processingResult, sentTodayResult, failedResult, expiredResult, expiringResult] = await Promise.all([
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retry"])
      .lte("send_date", today),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["reserved", "processing"]),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", `${today}T00:00:00`),
    admin.from("notification_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin.from("notification_events").select("id", { count: "exact", head: true }).eq("type", "certificate_expired"),
    admin.from("notification_events").select("id", { count: "exact", head: true }).eq("type", "certificate_expiring"),
  ]);

  return {
    queue: queueResult.count ?? 0,
    processing: processingResult.count ?? 0,
    sentToday: sentTodayResult.count ?? 0,
    failed: failedResult.count ?? 0,
    expired: expiredResult.count ?? 0,
    expiring: expiringResult.count ?? 0,
  };
}

export default async function NotificacoesPage({ searchParams }: NotificacoesPageProps) {
  const params = await searchParams;
  const user = await requireInternalUser();
  const canManageNotifications = canManageOperationalData(user.role);
  const status = params.status && statuses.includes(params.status as NotificationEventStatus)
    ? (params.status as NotificationEventStatus)
    : null;
  const type = params.type && types.includes(params.type as (typeof types)[number])
    ? (params.type as (typeof types)[number])
    : null;
  const sendDate = params.send_date && /^\d{4}-\d{2}-\d{2}$/.test(params.send_date) ? params.send_date : "";
  const recipientId = params.recipient_id ?? "";
  const provider = params.provider && providers.includes(params.provider as (typeof providers)[number])
    ? (params.provider as (typeof providers)[number])
    : "";
  const audience = params.audience && audiences.includes(params.audience as (typeof audiences)[number])
    ? (params.audience as (typeof audiences)[number])
    : "";
  const search = params.q?.trim().replace(/[%,()]/g, "") ?? "";
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set("page", params.page);
  if (params.pageSize) urlParams.set("pageSize", params.pageSize);
  const pagination = parsePagination(urlParams);
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("notification_settings")
    .select("timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const today = getTodayDateString(settings?.timezone || "America/Sao_Paulo");
  const activeQuickFilter = getActiveQuickFilter({ status, type, sendDate, today });
  const { data: recipients } = await admin
    .from("notification_recipients")
    .select("id, nome, telefone_normalizado, ativo")
    .order("nome", { ascending: true });

  let query = admin
    .from("notification_events")
    .select(
      "id, recipient_id, telefone_destino, type, audience, provider, dias_restantes, send_date, status, sent_at, failed_at, attempt_count, max_attempts, next_retry_at, error_message, created_at, clientes(nome_razao_social, cnpj, telefone, whatsapp), certificados(nome_titular, cnpj, data_vencimento), notification_recipients(nome, telefone_normalizado, ativo)",
      { count: "exact" },
    )
    .order("send_date", { ascending: true })
    .order("created_at", { ascending: false })
    .range(pagination.from, pagination.to);
  const searchFilter = search ? await buildNotificationEventSearchFilter(admin, search) : null;

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

  if (provider) {
    query = query.eq("provider", provider);
  }

  if (audience) {
    query = query.eq("audience", audience);
  }

  if (search && searchFilter) {
    query = query.or(searchFilter);
  }

  const { data: rawEvents, count } = await query;
  const events = rawEvents ?? [];
  const paginationMeta = createPaginationMeta(count, pagination.page, pagination.pageSize);
  const summary = await loadNotificationSummary(admin, today);
  const hasFilters = Boolean(search || status || type || sendDate || recipientId || provider || audience);

  return (
    <section>
      <SectionHeader
        title="Central de avisos"
        description="Acompanhe mensagens planejadas, enviadas e que precisam de atenção."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard title="Na fila" value={summary.queue} description="Mensagens aguardando envio" icon={Clock3} tone="blue" />
        <StatCard title="Processando" value={summary.processing} description="Reservadas ou enviando agora" icon={SendHorizonal} tone="blue" />
        <StatCard title="Enviadas hoje" value={summary.sentToday} description="Aceitas pelo provedor" icon={CheckCircle2} tone="green" />
        <StatCard title="Com falha" value={summary.failed} description="Precisam de revisão" icon={AlertTriangle} tone="red" />
        <StatCard title="Vencidos" value={summary.expired} description="Resumos de vencidos" icon={XCircle} tone="red" />
        <StatCard title="Próximos" value={summary.expiring} description="Avisos de vencimento" icon={CalendarClock} tone="amber" />
      </div>

      <div className="mb-3 grid gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categorias</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {getQuickFilters(today).map((item) => {
            const active = activeQuickFilter === item.key;

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition duration-150",
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/15 ring-blue-600"
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Refinar por</p>
          <p className="text-xs text-slate-500">{paginationMeta.total} avisos encontrados</p>
        </div>
        <FilterBar columns="lg:grid-cols-[1fr_210px_170px_160px_160px_auto_auto]">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {type ? <input type="hidden" name="type" value={type} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Buscar por cliente, certificado ou destinatário"
            className={inputClass}
            aria-label="Buscar avisos"
          />
          <select name="recipient_id" defaultValue={recipientId} className={selectClass} aria-label="Filtrar por destinatário">
            <option value="">Todos os destinatários</option>
            {(recipients ?? []).map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.nome}
              </option>
            ))}
          </select>
          <input type="date" name="send_date" defaultValue={sendDate} className={inputClass} aria-label="Filtrar por data planejada" />
          <select name="provider" defaultValue={provider} className={selectClass} aria-label="Filtrar por canal">
            <option value="">Todos os canais</option>
            {providers.map((item) => (
              <option key={item} value={item}>
                {PROVIDER_LABELS[item]}
              </option>
            ))}
          </select>
          <select name="audience" defaultValue={audience} className={selectClass} aria-label="Filtrar por público">
            <option value="">Todos os públicos</option>
            {audiences.map((item) => (
              <option key={item} value={item}>
                {AUDIENCE_LABELS[item]}
              </option>
            ))}
          </select>
          <button type="submit" className={buttonClass("secondary", "h-10")}>
            Aplicar filtros
          </button>
          {hasFilters ? (
            <Link href="/notificacoes" className={buttonClass("ghost", "h-10")}>
              Limpar filtros
            </Link>
          ) : null}
        </FilterBar>
      </div>

      {!events.length ? (
        <EmptyState
          title={hasFilters ? "Nenhum resultado encontrado" : "Nenhum aviso nesta categoria"}
          description={hasFilters ? "Revise o termo pesquisado ou limpe os filtros." : "Altere os filtros ou consulte outra categoria."}
        />
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
                <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {formatDisplayName(cliente?.nome_razao_social ?? (event.type === "certificate_expired" ? "Resumo diário" : "-"))}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{cliente?.cnpj ? formatCnpj(cliente.cnpj) : "Lista consolidada"}</p>
                    </div>
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                    <p><span className="font-medium text-slate-950">Certificado:</span> {certificadoNome}</p>
                    <p><span className="font-medium text-slate-950">Tipo:</span> {TYPE_LABELS[event.type as keyof typeof TYPE_LABELS] ?? "Aviso"}</p>
                    <p><span className="font-medium text-slate-950">Prazo:</span> {getNoticeText({ ...event, certificados: certificado ?? null })}</p>
                    <p>
                      <span className="font-medium text-slate-950">Destinatário:</span>{" "}
                      {event.audience === "client" ? "Cliente" : recipient?.nome ?? "Destinatário removido"} ({maskPhone(event.telefone_destino)})
                    </p>
                    <p><span className="font-medium text-slate-950">Programado para:</span> {formatDate(event.send_date)}</p>
                    <p><span className="font-medium text-slate-950">Última tentativa:</span> {formatDateTimeShort(lastAttempt)}</p>
                    <p className="sm:col-span-2"><span className="font-medium text-slate-950">Próxima ação:</span> {getRecommendedAction(event)}</p>
                  </div>
                  {canManageNotifications && ["failed", "cancelled", "skipped"].includes(event.status) ? (
                    <div className="mt-3">
                      <RetryEventButton eventId={event.id} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>

          <div className="hidden xl:block">
            <TableShell minWidth="1120px">
              <TableHead>
                <tr>
                  <TableHeaderCell>Cliente</TableHeaderCell>
                  <TableHeaderCell>Certificado</TableHeaderCell>
                  <TableHeaderCell>Aviso</TableHeaderCell>
                  <TableHeaderCell>Destinatário</TableHeaderCell>
                  <TableHeaderCell>Planejado</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Próxima ação</TableHeaderCell>
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
                    <tr key={event.id} className="transition duration-150 hover:bg-slate-50">
                      <TableCell className="max-w-[250px]">
                        <p className="font-semibold text-slate-950">
                          {formatDisplayName(cliente?.nome_razao_social ?? (event.type === "certificate_expired" ? "Resumo diário" : "-"))}
                        </p>
                        <p className="text-xs text-slate-500">{cliente?.cnpj ? formatCnpj(cliente.cnpj) : "Lista consolidada"}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px] text-slate-700">
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
                        <p className="font-medium text-slate-950">
                          {event.audience === "client" ? "Cliente" : recipient?.nome ?? "Destinatário removido"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {AUDIENCE_LABELS[(event.audience as keyof typeof AUDIENCE_LABELS) ?? "internal"] ?? "Equipe interna"} via{" "}
                          {getProviderLabel(event.provider)}
                        </p>
                        <p className="text-xs text-slate-500">{maskPhone(event.telefone_destino)}</p>
                      </TableCell>
                      <TableCell className="text-slate-700">{formatDate(event.send_date)}</TableCell>
                      <TableCell>
                        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[230px] text-slate-700">
                        <p>{getRecommendedAction(event)}</p>
                        <p className="mt-1 text-xs text-slate-500">Última tentativa: {formatDateTimeShort(lastAttempt)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Cliente: {event.type === "certificate_expired" ? "Lista consolidada" : getClienteTelefone(cliente)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {canManageNotifications && ["failed", "cancelled", "skipped"].includes(event.status) ? (
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
              provider: provider || undefined,
              audience: audience || undefined,
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
