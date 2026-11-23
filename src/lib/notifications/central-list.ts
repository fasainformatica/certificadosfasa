import { formatRelativeExpiration } from "@/lib/utils/format";
import type { Json } from "@/lib/supabase/database.types";

export const CENTRAL_TABS = [
  { value: "pendentes", label: "Pendentes" }, { value: "hoje", label: "Hoje" }, { value: "fila", label: "Na fila" },
  { value: "nova_tentativa", label: "Nova tentativa" }, { value: "falhas", label: "Falhas" },
  { value: "enviados", label: "Enviados" }, { value: "cancelados", label: "Cancelados" }, { value: "todos", label: "Todos" },
] as const;
export type CentralTab = (typeof CENTRAL_TABS)[number]["value"];

export type CentralEvent = {
  id: string; certificado_id: string | null; recipient_id: string | null; telefone_destino: string; type: string; audience: string;
  provider: string; payload: Json; dias_restantes: number | null; send_date: string; status: string; sent_at: string | null;
  failed_at: string | null; attempt_count: number; next_retry_at: string | null; error_message: string | null;
  provider_message_id: string | null; created_at: string; updated_at: string;
  clientes: { nome_razao_social: string; cnpj: string; telefone: string | null; whatsapp: string | null } | null;
  certificados: { nome_titular: string; cnpj: string; data_vencimento: string } | null;
  notification_recipients: { nome: string } | null;
};
export type CentralGroup = { event: CentralEvent; times: string[] };

export type CentralParams = Partial<Record<"aba" | "q" | "destinatario" | "canal" | "tipo" | "data" | "recipient_id" | "ordem" | "page"
  | "status" | "type" | "send_date" | "provider" | "audience", string>>;
const legacyTabs: Record<string, CentralTab> = { pending: "fila", retry: "nova_tentativa", sent: "enviados", failed: "falhas", cancelled: "cancelados" };
const legacyTypes: Record<string, string> = { certificate_expired: "resumo_vencidos", certificate_expiring: "aviso_vencimento" };
const types: Record<string, string> = { resumo_vencidos: "certificate_expired", aviso_vencimento: "certificate_expiring" };
const audiences: Record<string, string> = { cliente: "client", equipe: "internal" };

export function parseCentralParams(params: CentralParams) {
  const type = types[params.tipo ?? ""] ?? types[legacyTypes[params.type ?? ""] ?? ""] ?? "";
  const date = params.data ?? params.send_date ?? "";
  const requested = CENTRAL_TABS.find((tab) => tab.value === params.aba)?.value;
  const tab: CentralTab = requested ?? legacyTabs[params.status ?? ""] ?? (params.type || params.send_date ? "todos" : "pendentes");
  const page = Number(params.page);
  const order: "asc" | "desc" | null = params.ordem === "asc" || params.ordem === "desc" ? params.ordem : null;
  return {
    tab, search: params.q?.trim().replace(/[%,()]/g, "") ?? "", type,
    audience: audiences[params.destinatario ?? ""] ?? (params.audience === "client" || params.audience === "internal" ? params.audience : ""),
    provider: params.canal ?? params.provider ?? "", recipientId: params.recipient_id ?? "",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "", order,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export type CentralFilters = ReturnType<typeof parseCentralParams>;

export function centralHref(filters: CentralFilters, patch: Partial<CentralFilters> = {}) {
  const state = { ...filters, ...patch };
  const query = new URLSearchParams({ aba: state.tab });
  const keyOf = (map: Record<string, string>, value: string) => Object.keys(map).find((key) => map[key] === value);
  if (state.search) query.set("q", state.search);
  if (state.audience) query.set("destinatario", keyOf(audiences, state.audience)!);
  if (state.recipientId) query.set("recipient_id", state.recipientId);
  if (state.provider) query.set("canal", state.provider);
  if (state.type) query.set("tipo", keyOf(types, state.type)!);
  if (state.date) query.set("data", state.date);
  if (state.order) query.set("ordem", state.order);
  if (state.page > 1) query.set("page", String(state.page));
  return `/notificacoes?${query}`;
}

/** The queue keeps the X02 definition: pending or retry scheduled up to today. Future events are only in "Todos". */
export function matchesCentralTab(event: Pick<CentralEvent, "status" | "send_date">, tab: CentralTab, today: string) {
  const queued = (event.status === "pending" || event.status === "retry") && event.send_date <= today;
  if (tab === "fila" || tab === "hoje") return queued;
  if (tab === "pendentes") return queued || ["retry", "reserved", "processing", "failed"].includes(event.status);
  if (tab === "nova_tentativa") return event.status === "retry";
  if (tab === "falhas") return event.status === "failed";
  if (tab === "enviados") return event.status === "sent";
  if (tab === "cancelados") return event.status === "cancelled" || event.status === "skipped";
  return true;
}

export function getCentralLastActivity(event: Pick<CentralEvent, "sent_at" | "failed_at" | "updated_at">) {
  return event.sent_at ?? event.failed_at ?? event.updated_at;
}

/** N12: only sent repeats are grouped, so every actionable row keeps its own retry. */
export function groupCentralEvents(events: readonly CentralEvent[]): CentralGroup[] {
  const groups = new Map<string, CentralGroup>();
  for (const event of events) {
    const key = event.status === "sent"
      ? JSON.stringify([event.type, event.certificado_id, event.recipient_id, event.telefone_destino, event.send_date]) : event.id;
    const group = groups.get(key);
    if (group) group.times.push(getCentralLastActivity(event));
    else groups.set(key, { event, times: [getCentralLastActivity(event)] });
  }
  for (const group of groups.values()) group.times.sort();
  return [...groups.values()];
}

export function buildCentralList(events: readonly CentralEvent[], filters: CentralFilters, today: string) {
  const counts = Object.fromEntries(CENTRAL_TABS.map(({ value }) =>
    [value, events.filter((event) => matchesCentralTab(event, value, today)).length])) as Record<CentralTab, number>;
  const bySchedule = (a: CentralEvent, b: CentralEvent) =>
    a.send_date.localeCompare(b.send_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  const sorted = events.filter((event) => matchesCentralTab(event, filters.tab, today)).sort((a, b) => {
    if (filters.order) return (filters.order === "asc" ? 1 : -1) * bySchedule(a, b);
    if (filters.tab === "pendentes") return bySchedule(a, b);
    return Date.parse(getCentralLastActivity(b)) - Date.parse(getCentralLastActivity(a)) || a.id.localeCompare(b.id);
  });
  const groups = groupCentralEvents(sorted);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(groups.length / 25)));
  return { counts, rows: groups.slice((page - 1) * 25, page * 25), total: groups.length, page };
}

/** N06: the recorded deadline is history. Never recalculate it from the current validity. */
export function getOriginalNoticeText(event: Pick<CentralEvent, "type" | "dias_restantes">) {
  if (event.type === "certificate_expired") return "resumo diário de certificados vencidos";
  if (event.type === "certificate_updated") return "certificado atualizado";
  if (event.type === "internal_notice") return "comunicado interno";
  return event.dias_restantes === null ? "não registrado" : formatRelativeExpiration(event.dias_restantes).toLocaleLowerCase("pt-BR");
}
