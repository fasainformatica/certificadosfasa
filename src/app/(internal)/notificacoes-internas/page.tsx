import { AlertTriangle, ArchiveX, Bell, Inbox, Search } from "lucide-react";
import Link from "next/link";

import { NotificationStateButton } from "@/app/(internal)/notificacoes-internas/notification-state-button";
import { buttonClass, inputClass, selectClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { requireInternalUser } from "@/lib/auth/rbac";
import {
  buildInternalNotificationIdFilter,
  createInternalNotificationReadStateMap,
  isInternalNotificationSeverity,
  isInternalNotificationType,
  parseInternalNotificationState,
  toInternalNotificationDto,
  type InternalNotificationApiRow,
  type InternalNotificationDto,
  type InternalNotificationReadRow,
  type InternalNotificationState,
} from "@/lib/internal-notifications/presentation";
import { buildInternalNotificationVisibilityFilters, formatPostgrestInFilter } from "@/lib/internal-notifications/query";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { InternalNotificationSeverity, InternalNotificationType, Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils/cn";
import { formatCertificateTitle, formatCnpj, formatDateTimeShort, formatDisplayName } from "@/lib/utils/format";

type InternalNotificationsPageProps = {
  searchParams: Promise<{
    state?: string;
    type?: string;
    severity?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
};

type ClienteRelation = {
  nome_razao_social: string | null;
  cnpj: string | null;
};

type CertificadoRelation = {
  nome_titular: string | null;
  cnpj: string | null;
  data_vencimento: string | null;
};

type InternalNotificationPageRow = InternalNotificationApiRow & {
  clientes?: ClienteRelation | ClienteRelation[] | null;
  certificados?: CertificadoRelation | CertificadoRelation[] | null;
};

const NOTIFICATION_SELECT =
  "id, type, severity, title, body, href, entity_type, entity_id, certificado_id, cliente_id, target_role, target_user_id, actor_user_id, metadata, created_at, expires_at, clientes(nome_razao_social, cnpj), certificados(nome_titular, cnpj, data_vencimento)";

const STATE_FILTERS = [
  { value: "active", label: "Ativas" },
  { value: "unread", label: "Não lidas" },
  { value: "read", label: "Lidas" },
  { value: "dismissed", label: "Dispensadas" },
  { value: "all", label: "Todas" },
] as const satisfies readonly { value: InternalNotificationState; label: string }[];

const TYPE_LABELS = {
  certificate_created: "Novo certificado",
  certificate_updated: "Certificado atualizado",
  certificate_status_changed: "Status alterado",
  certificate_renewal_status_changed: "Renovação alterada",
  client_updated: "Cliente atualizado",
  notification_failed: "Falha operacional",
  whatsapp_status_changed: "WhatsApp",
  system_notice: "Sistema",
} satisfies Record<InternalNotificationType, string>;

const SEVERITY_LABELS = {
  info: "Informação",
  success: "Concluído",
  warning: "Atenção",
  error: "Falha",
} satisfies Record<InternalNotificationSeverity, string>;

const SEVERITY_TONE = {
  info: "blue",
  success: "green",
  warning: "amber",
  error: "red",
} satisfies Record<InternalNotificationSeverity, Tone>;

function cleanSearch(value?: string) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function jsonStringValue(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function getStateMeta(notification: InternalNotificationDto): { label: string; tone: Tone } {
  if (notification.isDismissed) {
    return { label: "Dispensada", tone: "slate" };
  }

  if (notification.isRead) {
    return { label: "Lida", tone: "green" };
  }

  return { label: "Não lida", tone: "blue" };
}

function getQuickFilterHref(state: InternalNotificationState, params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  searchParams.set("state", state);

  for (const key of ["type", "severity", "q"] as const) {
    const value = params[key];

    if (value) {
      searchParams.set(key, value);
    }
  }

  return `/notificacoes-internas?${searchParams.toString()}`;
}

function applyStateFilter<T extends { in: (column: string, values: string[]) => T; not: (column: string, operator: string, value: string) => T }>(
  query: T,
  stateFilter: ReturnType<typeof buildInternalNotificationIdFilter>,
) {
  let nextQuery = query;

  if (stateFilter.includeIds.length > 0) {
    nextQuery = nextQuery.in("id", stateFilter.includeIds);
  }

  if (stateFilter.excludeIds.length > 0) {
    nextQuery = nextQuery.not("id", "in", formatPostgrestInFilter(stateFilter.excludeIds));
  }

  return nextQuery;
}

async function countVisibleNotifications({
  admin,
  readStates,
  state,
  severities,
  visibility,
}: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  readStates: InternalNotificationReadRow[];
  state: InternalNotificationState;
  severities?: InternalNotificationSeverity[];
  visibility: ReturnType<typeof buildInternalNotificationVisibilityFilters>;
}) {
  const stateFilter = buildInternalNotificationIdFilter(state, readStates);

  if (stateFilter.shouldReturnEmpty) {
    return 0;
  }

  let query = admin
    .from("internal_notifications")
    .select("id", { count: "exact", head: true })
    .or(visibility.expiresAt)
    .or(visibility.targetUser)
    .or(visibility.targetRole);

  query = applyStateFilter(query, stateFilter);

  if (severities?.length) {
    query = query.in("severity", severities);
  }

  const { count } = await query;
  return count ?? 0;
}

function NotificationCard({
  notification,
  cliente,
  certificado,
}: {
  notification: InternalNotificationDto;
  cliente: ClienteRelation | null;
  certificado: CertificadoRelation | null;
}) {
  const state = getStateMeta(notification);
  const cnpj = cliente?.cnpj ?? certificado?.cnpj ?? jsonStringValue(notification.metadata, "cnpj");
  const subject =
    certificado?.nome_titular
      ? formatCertificateTitle(certificado.nome_titular, certificado.cnpj)
      : cliente?.nome_razao_social
        ? formatDisplayName(cliente.nome_razao_social)
        : notification.title;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[notification.severity]}>{SEVERITY_LABELS[notification.severity]}</Badge>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <h2 className="mt-3 text-sm font-semibold text-slate-950">{notification.title}</h2>
      {notification.body ? <p className="mt-1 text-sm leading-5 text-slate-600">{notification.body}</p> : null}
      <dl className="mt-3 grid gap-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Referência</dt>
          <dd className="mt-0.5 font-medium text-slate-800">{subject}</dd>
          {cnpj ? <dd className="text-xs text-slate-500">{formatCnpj(cnpj)}</dd> : null}
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Criada em</dt>
          <dd className="mt-0.5 text-slate-700">{formatDateTimeShort(notification.createdAt)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {notification.href ? (
          <Link href={notification.href} className={buttonClass("secondary", "min-h-9 px-3 text-xs")}>
            Ver certificado
          </Link>
        ) : null}
        {!notification.isRead ? <NotificationStateButton notificationId={notification.id} action="read" /> : null}
        {!notification.isDismissed ? <NotificationStateButton notificationId={notification.id} action="dismiss" /> : null}
      </div>
    </article>
  );
}

export default async function InternalNotificationsPage({ searchParams }: InternalNotificationsPageProps) {
  const user = await requireInternalUser();
  const params = await searchParams;
  const selectedState = parseInternalNotificationState(params.state ?? null);
  const selectedType = isInternalNotificationType(params.type ?? null) ? (params.type as InternalNotificationType) : "";
  const selectedSeverity = isInternalNotificationSeverity(params.severity ?? null)
    ? (params.severity as InternalNotificationSeverity)
    : "";
  const search = cleanSearch(params.q);
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set("page", params.page);
  if (params.pageSize) urlParams.set("pageSize", params.pageSize);
  const pagination = parsePagination(urlParams);
  const admin = createSupabaseAdminClient();
  const visibility = buildInternalNotificationVisibilityFilters({
    userId: user.id,
    role: user.role,
    nowIso: new Date().toISOString(),
  });
  const { data: rawReadStates } = await admin
    .from("internal_notification_reads")
    .select("notification_id, user_id, read_at, dismissed_at")
    .eq("user_id", user.id);
  const readStates = (rawReadStates ?? []) as InternalNotificationReadRow[];
  const stateFilter = buildInternalNotificationIdFilter(selectedState, readStates);

  const [activeCount, unreadCount, dismissedCount, attentionCount] = await Promise.all([
    countVisibleNotifications({ admin, readStates, state: "active", visibility }),
    countVisibleNotifications({ admin, readStates, state: "unread", visibility }),
    countVisibleNotifications({ admin, readStates, state: "dismissed", visibility }),
    countVisibleNotifications({ admin, readStates, state: "active", severities: ["warning", "error"], visibility }),
  ]);

  let rows: InternalNotificationPageRow[] = [];
  let total = 0;

  if (!stateFilter.shouldReturnEmpty) {
    let query = admin
      .from("internal_notifications")
      .select(NOTIFICATION_SELECT, { count: "exact" })
      .or(visibility.expiresAt)
      .or(visibility.targetUser)
      .or(visibility.targetRole)
      .order("created_at", { ascending: false })
      .range(pagination.from, pagination.to);

    query = applyStateFilter(query, stateFilter);

    if (selectedType) {
      query = query.eq("type", selectedType);
    }

    if (selectedSeverity) {
      query = query.eq("severity", selectedSeverity);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    }

    const { data, count } = await query;
    rows = (data ?? []) as unknown as InternalNotificationPageRow[];
    total = count ?? 0;
  }

  const readStateMap = createInternalNotificationReadStateMap(readStates);
  const notifications = rows.map((row) => ({
    notification: toInternalNotificationDto(row, readStateMap.get(row.id)),
    cliente: firstRelation(row.clientes),
    certificado: firstRelation(row.certificados),
  }));
  const paginationMeta = createPaginationMeta(total, pagination.page, pagination.pageSize);
  const hasFilters = Boolean(
    selectedState !== "active" || selectedType || selectedSeverity || search,
  );
  const currentSearchParams = {
    state: selectedState,
    type: selectedType || undefined,
    severity: selectedSeverity || undefined,
    q: search || undefined,
  };

  return (
    <section>
      <SectionHeader
        title="Notificações internas"
        description="Acompanhe atualizações de certificados e eventos internos do sistema."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Ativas"
          value={activeCount}
          description="Visíveis na central e no sininho"
          icon={Bell}
          tone="blue"
        />
        <StatCard
          title="Não lidas"
          value={unreadCount}
          description="Ainda precisam de conferência"
          icon={Inbox}
          tone={unreadCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          title="Precisam de atenção"
          value={attentionCount}
          description="Com tom de atenção ou falha"
          icon={AlertTriangle}
          tone={attentionCount > 0 ? "red" : "green"}
        />
        <StatCard
          title="Dispensadas"
          value={dismissedCount}
          description="Ocultas apenas para você"
          icon={ArchiveX}
          tone="slate"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2" aria-label="Filtros rápidos de notificações internas">
        {STATE_FILTERS.map((filter) => {
          const active = selectedState === filter.value;

          return (
            <Link
              key={filter.value}
              href={getQuickFilterHref(filter.value, currentSearchParams)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      <FilterBar columns="lg:grid-cols-[minmax(260px,1fr)_220px_180px_auto_auto]">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Buscar por título ou conteúdo"
            className={cn(inputClass, "pl-9")}
            aria-label="Buscar notificações internas"
          />
        </div>
        <select name="type" defaultValue={selectedType} className={selectClass} aria-label="Filtrar por tipo">
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="severity"
          defaultValue={selectedSeverity}
          className={selectClass}
          aria-label="Filtrar por prioridade"
        >
          <option value="">Todas as prioridades</option>
          {Object.entries(SEVERITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input type="hidden" name="state" value={selectedState} />
        <button type="submit" className={buttonClass("secondary", "h-10")}>
          Aplicar filtros
        </button>
        {hasFilters ? (
          <Link href="/notificacoes-internas" className={buttonClass("ghost", "h-10")}>
            Limpar filtros
          </Link>
        ) : null}
      </FilterBar>

      {!notifications.length ? (
        <EmptyState
          title={hasFilters ? "Nenhum resultado encontrado" : "Nenhuma notificação interna"}
          description={
            hasFilters
              ? "Revise o termo pesquisado ou limpe os filtros."
              : "Atualizações de certificados aparecerão aqui após o próximo cadastro ou substituição de PFX."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {notifications.map(({ notification, cliente, certificado }) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                cliente={cliente}
                certificado={certificado}
              />
            ))}
          </div>

          <div className="hidden md:block">
            <TableShell minWidth="980px">
              <TableHead>
                <tr>
                  <TableHeaderCell>Notificação</TableHeaderCell>
                  <TableHeaderCell>Referência</TableHeaderCell>
                  <TableHeaderCell>Tipo</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell>Criada em</TableHeaderCell>
                  <TableHeaderCell>Ações</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {notifications.map(({ notification, cliente, certificado }) => {
                  const state = getStateMeta(notification);
                  const cnpj = cliente?.cnpj ?? certificado?.cnpj ?? jsonStringValue(notification.metadata, "cnpj");
                  const subject =
                    certificado?.nome_titular
                      ? formatCertificateTitle(certificado.nome_titular, certificado.cnpj)
                      : cliente?.nome_razao_social
                        ? formatDisplayName(cliente.nome_razao_social)
                        : "-";

                  return (
                    <tr
                      key={notification.id}
                      className={cn(
                        "transition hover:bg-blue-50/40 focus-within:bg-blue-50/40",
                        !notification.isRead && "bg-blue-50/30",
                      )}
                    >
                      <TableCell>
                        <div className="max-w-xl">
                          <p className="font-semibold text-slate-950">{notification.title}</p>
                          {notification.body ? (
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{notification.body}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="max-w-64 truncate font-medium text-slate-800">{subject}</p>
                        {cnpj ? <p className="mt-1 text-xs text-slate-500">{formatCnpj(cnpj)}</p> : null}
                      </TableCell>
                      <TableCell>
                        <div className="grid gap-1">
                          <Badge tone={SEVERITY_TONE[notification.severity]}>
                            {SEVERITY_LABELS[notification.severity]}
                          </Badge>
                          <span className="text-xs text-slate-500">{TYPE_LABELS[notification.type]}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={state.tone}>{state.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-600">{formatDateTimeShort(notification.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {notification.href ? (
                            <Link href={notification.href} className={buttonClass("secondary", "min-h-9 px-3 text-xs")}>
                              Ver certificado
                            </Link>
                          ) : null}
                          {!notification.isRead ? (
                            <NotificationStateButton notificationId={notification.id} action="read" />
                          ) : null}
                          {!notification.isDismissed ? (
                            <NotificationStateButton notificationId={notification.id} action="dismiss" />
                          ) : null}
                        </div>
                      </TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>

          <div className="mt-4">
            <PaginationBar
              basePath="/notificacoes-internas"
              searchParams={currentSearchParams}
              page={paginationMeta.page}
              pageSize={paginationMeta.pageSize}
              total={paginationMeta.total}
              totalPages={paginationMeta.totalPages}
              itemLabel="notificações"
            />
          </div>
        </>
      )}
    </section>
  );
}
