import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, SendHorizonal, XCircle } from "lucide-react";
import Link from "next/link";

import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { buildNotificationEventSearchFilter } from "@/lib/notifications/event-search";
import {
  NOTIFICATION_EVENT_STATUSES,
  NOTIFICATION_EVENT_STATUS_META,
  NOTIFICATION_EVENT_TYPE_LABELS,
  NOTIFICATION_EVENT_TYPES,
  getNotificationLastAttemptAt,
  getNotificationNoticeText,
  getNotificationRecommendedAction,
  getSafeNotificationErrorMessage,
  isRetryableNotificationStatus,
} from "@/lib/notifications/event-presentation";
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

const statuses = NOTIFICATION_EVENT_STATUSES;
const types = NOTIFICATION_EVENT_TYPES;
const providers = [EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER] as const;
const audiences = ["internal", "client"] as const;

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
    { key: "retry", label: "Nova tentativa", href: "/notificacoes?status=retry" },
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
  if (status === "retry") return "retry";
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  if (sendDate === today) return "today";
  if (type === "certificate_expired") return "expired";
  return "all";
}

function getMaskedClienteTelefone(cliente: { whatsapp?: string | null; telefone?: string | null } | null | undefined) {
  const rawPhone = cliente?.whatsapp ?? cliente?.telefone;
  return rawPhone ? maskPhone(rawPhone) : "Telefone não cadastrado";
}

async function loadNotificationSummary(admin: ReturnType<typeof createSupabaseAdminClient>, today: string) {
  const [queueResult, retryResult, processingResult, sentTodayResult, failedResult, expiredResult, expiringResult] = await Promise.all([
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("send_date", today),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "retry")
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
    retry: retryResult.count ?? 0,
    processing: processingResult.count ?? 0,
    sentToday: sentTodayResult.count ?? 0,
    failed: failedResult.count ?? 0,
    expired: expiredResult.count ?? 0,
    expiring: expiringResult.count ?? 0,
  };
}

type NotificationSummary = Awaited<ReturnType<typeof loadNotificationSummary>>;

function buildOperationalFocus(summary: NotificationSummary) {
  const items: Array<{
    title: string;
    description: string;
    href: string;
    action: string;
    tone: "blue" | "green" | "amber" | "red" | "slate";
  }> = [];

  if (summary.failed > 0) {
    items.push({
      title: `${summary.failed} ${summary.failed === 1 ? "envio com falha" : "envios com falha"}`,
      description: "Revise o motivo apresentado e reenfileire apenas o que ainda deve ser enviado.",
      href: "/notificacoes?status=failed",
      action: "Revisar falhas",
      tone: "red",
    });
  }

  if (summary.retry > 0) {
    items.push({
      title: `${summary.retry} ${summary.retry === 1 ? "nova tentativa agendada" : "novas tentativas agendadas"}`,
      description: "Esses avisos aguardam a próxima janela de envio definida pelo dispatcher.",
      href: "/notificacoes?status=retry",
      action: "Ver tentativas",
      tone: "amber",
    });
  }

  if (summary.queue > 0) {
    items.push({
      title: `${summary.queue} ${summary.queue === 1 ? "mensagem na fila" : "mensagens na fila"}`,
      description: "A fila será consumida respeitando pausa, limites e intervalo seguro entre mensagens.",
      href: "/notificacoes?status=pending",
      action: "Ver fila",
      tone: "blue",
    });
  }

  if (summary.processing > 0) {
    items.push({
      title: `${summary.processing} ${summary.processing === 1 ? "envio em processamento" : "envios em processamento"}`,
      description: "Acompanhe se esses avisos concluem ou voltam para nova tentativa.",
      href: "/notificacoes?status=processing",
      action: "Acompanhar",
      tone: "blue",
    });
  }

  if (!items.length) {
    items.push({
      title: "Sem pendências críticas",
      description: "Não há falhas, retries ou mensagens vencidas aguardando envio neste momento.",
      href: "/notificacoes",
      action: "Ver todos os avisos",
      tone: "green",
    });
  }

  return items;
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
  const operationalFocus = buildOperationalFocus(summary);
  const hasFilters = Boolean(search || status || type || sendDate || recipientId || provider || audience);

  return (
    <section>
      <SectionHeader
        title="Central de avisos"
        description="Acompanhe mensagens planejadas, enviadas e que precisam de atenção."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          title="Na fila"
          value={summary.queue + summary.retry}
          description={`${summary.queue} aguardando envio, ${summary.retry} em nova tentativa`}
          icon={Clock3}
          tone="blue"
        />
        <StatCard title="Processando" value={summary.processing} description="Reservadas ou enviando agora" icon={SendHorizonal} tone="blue" />
        <StatCard title="Enviadas hoje" value={summary.sentToday} description="Aceitas pelo provedor" icon={CheckCircle2} tone="green" />
        <StatCard title="Com falha" value={summary.failed} description="Precisam de revisão" icon={AlertTriangle} tone="red" />
        <StatCard title="Vencidos" value={summary.expired} description="Resumos de vencidos" icon={XCircle} tone="red" />
        <StatCard title="Próximos" value={summary.expiring} description="Avisos de vencimento" icon={CalendarClock} tone="amber" />
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Prioridade agora</h2>
            <p className="mt-1 text-sm text-slate-600">Itens que podem exigir revisão antes do próximo disparo automático.</p>
          </div>
          <p className="text-xs font-medium text-slate-500">Data operacional: {formatDate(today)}</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
          {operationalFocus.map((item) => (
            <article key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Badge tone={item.tone}>{item.title}</Badge>
                  <p className="mt-2 text-sm leading-5 text-slate-600">{item.description}</p>
                </div>
              </div>
              <Link
                href={item.href}
                className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {item.action}
              </Link>
            </article>
          ))}
        </div>
      </section>

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
              const statusMeta =
                NOTIFICATION_EVENT_STATUS_META[event.status as NotificationEventStatus] ?? NOTIFICATION_EVENT_STATUS_META.pending;
              const lastAttempt = getNotificationLastAttemptAt(event);
              const safeError = getSafeNotificationErrorMessage(event.error_message);
              const noticeText = getNotificationNoticeText({ ...event, certificados: certificado ?? null });
              const recommendedAction = getNotificationRecommendedAction({ ...event, certificados: certificado ?? null }, { today });
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
                    <p><span className="font-medium text-slate-950">Tipo:</span> {NOTIFICATION_EVENT_TYPE_LABELS[event.type as keyof typeof NOTIFICATION_EVENT_TYPE_LABELS] ?? "Aviso"}</p>
                    <p><span className="font-medium text-slate-950">Prazo:</span> {noticeText}</p>
                    <p>
                      <span className="font-medium text-slate-950">Destinatário:</span>{" "}
                      {event.audience === "client" ? "Cliente" : recipient?.nome ?? "Destinatário removido"} ({maskPhone(event.telefone_destino)})
                    </p>
                    <p><span className="font-medium text-slate-950">Programado para:</span> {formatDate(event.send_date)}</p>
                    <p><span className="font-medium text-slate-950">Última tentativa:</span> {formatDateTimeShort(lastAttempt)}</p>
                    <p className="sm:col-span-2"><span className="font-medium text-slate-950">Próxima ação:</span> {recommendedAction}</p>
                  </div>
                  {safeError ? (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {safeError}
                    </p>
                  ) : null}
                  {canManageNotifications && isRetryableNotificationStatus(event.status) ? (
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
                  <TableHeaderCell>Programado</TableHeaderCell>
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
                  const statusMeta =
                    NOTIFICATION_EVENT_STATUS_META[event.status as NotificationEventStatus] ?? NOTIFICATION_EVENT_STATUS_META.pending;
                  const lastAttempt = getNotificationLastAttemptAt(event);
                  const safeError = getSafeNotificationErrorMessage(event.error_message);
                  const noticeText = getNotificationNoticeText({ ...event, certificados: certificado ?? null });
                  const recommendedAction = getNotificationRecommendedAction({ ...event, certificados: certificado ?? null }, { today });
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
                        <p className="font-medium text-slate-950">{NOTIFICATION_EVENT_TYPE_LABELS[event.type as keyof typeof NOTIFICATION_EVENT_TYPE_LABELS] ?? "Aviso"}</p>
                        <p className="mt-1 text-xs text-slate-500">{noticeText}</p>
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
                        <p>{recommendedAction}</p>
                        {safeError ? <p className="mt-1 text-xs font-medium text-amber-700">{safeError}</p> : null}
                        <p className="mt-1 text-xs text-slate-500">Última tentativa: {formatDateTimeShort(lastAttempt)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Cliente: {event.type === "certificate_expired" ? "Lista consolidada" : getMaskedClienteTelefone(cliente)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {canManageNotifications && isRetryableNotificationStatus(event.status) ? (
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
