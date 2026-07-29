import type { CertificateRenewalStatus } from "@/lib/supabase/database.types";

export type CertificateRenewalFilter = "todos" | "acompanhamento" | CertificateRenewalStatus;

export const CERTIFICATE_RENEWAL_STATUSES = [
  "em_acompanhamento",
  "renovou_fasa",
  "renovou_externo",
  "nao_renovar",
  "cliente_inativo",
] as const satisfies readonly CertificateRenewalStatus[];

export const PLANNABLE_CERTIFICATE_RENEWAL_STATUSES: readonly CertificateRenewalStatus[] = [
  "em_acompanhamento",
  "renovou_fasa",
] as const;

export const DEFAULT_CERTIFICATE_RENEWAL_FILTER: CertificateRenewalFilter = "acompanhamento";

export const CERTIFICATE_RENEWAL_STATUS_LABEL: Record<CertificateRenewalStatus, string> = {
  em_acompanhamento: "Em acompanhamento",
  renovou_fasa: "Renovou com a Fasa",
  renovou_externo: "Renovou em outro lugar",
  nao_renovar: "Não vai renovar agora",
  cliente_inativo: "Cliente inativo",
};

export const CERTIFICATE_RENEWAL_FILTER_LABEL: Record<CertificateRenewalFilter, string> = {
  todos: "Todos",
  acompanhamento: "Em acompanhamento",
  ...CERTIFICATE_RENEWAL_STATUS_LABEL,
};

export const CERTIFICATE_RENEWAL_STATUS_TONE: Record<CertificateRenewalStatus, "blue" | "green" | "amber" | "red" | "slate"> = {
  em_acompanhamento: "blue",
  renovou_fasa: "green",
  renovou_externo: "slate",
  nao_renovar: "amber",
  cliente_inativo: "red",
};

export function isCertificateRenewalStatus(value: unknown): value is CertificateRenewalStatus {
  return typeof value === "string" && CERTIFICATE_RENEWAL_STATUSES.includes(value as CertificateRenewalStatus);
}

export function isCertificateRenewalFilter(value: unknown): value is CertificateRenewalFilter {
  return value === "todos" || value === "acompanhamento" || isCertificateRenewalStatus(value);
}

export function parseCertificateRenewalFilter(value: string | null | undefined) {
  return isCertificateRenewalFilter(value) ? value : DEFAULT_CERTIFICATE_RENEWAL_FILTER;
}

export function isCertificateRenewalPlannable(value: string | null | undefined) {
  return PLANNABLE_CERTIFICATE_RENEWAL_STATUSES.includes(
    (value ?? "em_acompanhamento") as CertificateRenewalStatus,
  );
}

export function shouldShowRenewalBadge(
  value: string | null | undefined,
): value is Exclude<CertificateRenewalStatus, "em_acompanhamento"> {
  return isCertificateRenewalStatus(value) && value !== "em_acompanhamento";
}
