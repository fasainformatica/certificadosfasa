import type { Database } from "@/lib/supabase/database.types";
import { analyzeWhatsAppPhoneQuality } from "@/lib/whatsapp/phone-quality";
import type { StatusValue } from "@/lib/status-labels";

export type ClientListRecord = Pick<Database["public"]["Tables"]["clientes"]["Row"],
  "id" | "nome_razao_social" | "cnpj" | "email" | "telefone" | "whatsapp" |
  "whatsapp_notifications_enabled" | "responsavel" | "updated_at"> & { certificateCount: number };
export type ClientListParams = { q?: string; contato?: string; responsavel?: string; ordem?: string; page?: string };
export type ClientListFilters = {
  q: string; contato: "" | "com_whatsapp" | "sem_contato";
  responsavel: "" | "informado" | "nao_informado"; ordem: "asc" | "desc"; page: number;
};

export function parseClientListFilters(params: ClientListParams): ClientListFilters {
  const page = Number(params.page);
  return {
    q: params.q?.trim() ?? "",
    contato: params.contato === "com_whatsapp" || params.contato === "sem_contato" ? params.contato : "",
    responsavel: params.responsavel === "informado" || params.responsavel === "nao_informado" ? params.responsavel : "",
    ordem: params.ordem === "desc" ? "desc" : "asc",
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function clientListHref(filters: ClientListFilters, patch: Partial<ClientListFilters> = {}) {
  const state = { ...filters, ...patch };
  const query = new URLSearchParams();
  if (state.q) query.set("q", state.q);
  if (state.contato) query.set("contato", state.contato);
  if (state.responsavel) query.set("responsavel", state.responsavel);
  if (state.ordem === "desc") query.set("ordem", "desc");
  if (state.page > 1) query.set("page", String(state.page));
  return `/clientes${query.size ? `?${query}` : ""}`;
}

export function getClientDisplayName(name: string, cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14 || !name.endsWith(digits)) return name;
  const prefix = name.slice(0, -14);
  // A longer numeric identifier or an all-document name is not this suffix pattern.
  if (/\d$/.test(prefix) || !prefix.trim()) return name;
  return prefix.trimEnd();
}

export function getClientPreferredPhone(client: Pick<ClientListRecord, "whatsapp" | "telefone">) {
  return client.whatsapp?.trim() || client.telefone?.trim() || null;
}

export function getClientContactState(client: ClientListRecord): "ready" | "missing" | "invalid" | "disabled" {
  const quality = analyzeWhatsAppPhoneQuality([client], { sampleLimit: 0 });
  if (quality.notificationsDisabledCount) return "disabled";
  if (quality.missingPhoneCount) return "missing";
  if (quality.invalidPhoneCount) return "invalid";
  return "ready";
}

export function getClientListNoticeStatus(client: ClientListRecord): StatusValue<"cliente"> {
  const state = getClientContactState(client);
  return state === "disabled" ? "avisos_desativados" : state === "ready" ? "avisos_permitidos" : "sem_whatsapp";
}

export function buildClientList(records: readonly ClientListRecord[], filters: ClientListFilters) {
  const search = filters.q.toLocaleLowerCase("pt-BR");
  const digits = search.replace(/\D/g, "");
  const filtered = records.filter((client) => {
    if (search && !client.nome_razao_social.toLocaleLowerCase("pt-BR").includes(search)
      && !(digits && client.cnpj.replace(/\D/g, "").includes(digits))) return false;
    const state = getClientContactState(client);
    if (filters.contato === "com_whatsapp" && state !== "ready") return false;
    if (filters.contato === "sem_contato" && state !== "missing") return false;
    const responsible = Boolean(client.responsavel?.trim());
    if (filters.responsavel === "informado" && !responsible) return false;
    if (filters.responsavel === "nao_informado" && responsible) return false;
    return true;
  });
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  filtered.sort((a, b) => (filters.ordem === "asc" ? 1 : -1)
    * (collator.compare(a.nome_razao_social, b.nome_razao_social) || a.id.localeCompare(b.id)));
  const quality = analyzeWhatsAppPhoneQuality(filtered, { sampleLimit: 0 });
  const total = filtered.length;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / 25)));
  return {
    rows: filtered.slice((page - 1) * 25, page * 25), page, total,
    withWhatsApp: quality.readyToSendCount, withoutContact: quality.missingPhoneCount,
    withoutResponsible: filtered.filter((client) => !client.responsavel?.trim()).length,
    withoutCertificate: filtered.filter((client) => client.certificateCount === 0).length,
  };
}
