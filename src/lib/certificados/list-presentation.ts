import { PLANNABLE_CERTIFICATE_RENEWAL_STATUSES } from "./renewal-status";
import { STATUS_LABELS, type StatusValue } from "@/lib/status-labels";
import type { CertificateRenewalStatus, CertificadoStatus } from "@/lib/supabase/database.types";

export type CertificateSituation = StatusValue<"validade"> | "invalido" | "";
export type CertificateRenewalSelection = StatusValue<"renovacao"> | "pausado_inativo" | "";
export type CertificateListParams = {
  situacao?: string; status?: string; renovacao?: string; q?: string;
  page?: string; pageSize?: string; ordem?: string;
};
const validityAliases: Record<string, CertificateSituation> = {
  ativo: "em_dia", vencendo: "vence_em_breve", vencido: "vencido", invalido: "invalido",
  em_dia: "em_dia", vence_em_breve: "vence_em_breve",
};
const renewalAliases: Record<string, CertificateRenewalSelection> = {
  todos: "", acompanhamento: "em_acompanhamento", em_acompanhamento: "em_acompanhamento",
  renovou_fasa: "renovado_fasa", renovado_fasa: "renovado_fasa",
  renovou_externo: "renovado_fora", renovado_fora: "renovado_fora",
  nao_renovar: "pausado", pausado: "pausado", sem_retorno: "sem_retorno",
  cliente_inativo: "inativo", inativo: "inativo", pausado_inativo: "pausado_inativo",
};
export const RENEWAL_DISPLAY_STATUS = {
  em_acompanhamento: "em_acompanhamento", renovou_fasa: "renovado_fasa",
  renovou_externo: "renovado_fora", nao_renovar: "pausado", sem_retorno: "sem_retorno",
  cliente_inativo: "inativo",
} as const satisfies Record<CertificateRenewalStatus, StatusValue<"renovacao">>;
export const VALIDITY_DISPLAY_STATUS = {
  ativo: "em_dia", vencendo: "vence_em_breve", vencido: "vencido",
} as const satisfies Record<Exclude<CertificadoStatus, "invalido">, StatusValue<"validade">>;

export function parseCertificateListParams(params: CertificateListParams) {
  const situation = validityAliases[params.situacao ?? params.status ?? ""] ?? "";
  const renewal = renewalAliases[params.renovacao ?? ""] ?? "";
  const search = params.q?.trim().replace(/[%,().]/g, "") ?? "";
  const direction: "asc" | "desc" = params.ordem === "desc" ? "desc" : "asc";
  const query = new URLSearchParams();
  if (situation) query.set("situacao", situation);
  if (renewal) query.set("renovacao", renewal);
  if (search) query.set("q", search);
  if (params.page) query.set("page", params.page);
  if (params.pageSize) query.set("pageSize", params.pageSize);
  if (direction === "desc") query.set("ordem", direction);
  return { situation, renewal, search, direction, query: query.toString(), hasFilters: Boolean(situation || renewal || search) };
}

type FilterableQuery = {
  eq: (column: string, value: string) => FilterableQuery;
  neq: (column: string, value: string) => FilterableQuery;
  in: (column: string, values: readonly string[]) => FilterableQuery;
  lt: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  gt: (column: string, value: string) => FilterableQuery;
};

export function applyCertificateSituation<T extends FilterableQuery>(query: T, situation: CertificateSituation, today: string, warningDate: string): T {
  if (!situation) return query;
  if (situation === "invalido") return query.eq("status", "invalido") as T;
  const valid = query.neq("status", "invalido");
  if (situation === "vencido") return valid.lt("data_vencimento", today) as T;
  if (situation === "vence_em_breve") return valid.gte("data_vencimento", today).lte("data_vencimento", warningDate) as T;
  return valid.gt("data_vencimento", warningDate) as T;
}

export function applyCertificateRenewal<T extends FilterableQuery>(query: T, renewal: CertificateRenewalSelection): T {
  if (!renewal) return query;
  // Same read-only operational scope as X06; renewed-with-Fasa overlaps card 1.
  if (renewal === "em_acompanhamento") return query.neq("status", "invalido").in("renovacao_status", [...PLANNABLE_CERTIFICATE_RENEWAL_STATUSES]) as T;
  if (renewal === "pausado_inativo") return query.in("renovacao_status", ["nao_renovar", "cliente_inativo"]) as T;
  const stored = Object.entries(RENEWAL_DISPLAY_STATUS).find(([, display]) => display === renewal)![0];
  return query.eq("renovacao_status", stored) as T;
}

export function certificateFilterFields(situation: CertificateSituation, renewal: CertificateRenewalSelection) {
  return [
    { name: "situacao", label: "Situação", options: [
      { value: "", label: "Todas" },
      ...Object.entries(STATUS_LABELS.validade).map(([value, status]) => ({ value, label: status.label })),
      ...(situation === "invalido" ? [{ value: "invalido", label: "Inválido" }] : []),
    ] },
    { name: "renovacao", label: "Renovação", options: [
      { value: "", label: "Todas" },
      ...Object.entries(STATUS_LABELS.renovacao).map(([value, status]) => ({ value, label: status.label })),
      ...(renewal === "pausado_inativo" ? [{ value: "pausado_inativo", label: "Pausados ou inativos" }] : []),
    ] },
  ];
}

export function certificateListHref(query: string, changes: Record<string, string | null>) {
  const params = new URLSearchParams(query);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name); else params.set(name, value);
  }
  return `/certificados${params.size ? `?${params.toString()}` : ""}`;
}
