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

export const CERTIFICATE_RENEWAL_STATUS_DESCRIPTION: Record<CertificateRenewalStatus, string> = {
  em_acompanhamento: "O certificado continua sendo acompanhado pela operação.",
  renovou_fasa: "O certificado foi renovado pela Fasa e continua no acompanhamento do próximo ciclo.",
  renovou_externo: "O cliente renovou em outro lugar. O certificado sai da fila automática sem apagar o histórico.",
  nao_renovar: "O cliente não vai renovar agora. O certificado fica fora dos avisos automáticos.",
  cliente_inativo: "O cliente está inativo. O certificado fica fora da rotina de avisos.",
};

export const CERTIFICATE_RENEWAL_NEXT_ACTION: Record<CertificateRenewalStatus, string> = {
  em_acompanhamento: "Acompanhar vencimento e acionar renovação quando necessário.",
  renovou_fasa: "Conferir o novo certificado e acompanhar o próximo vencimento.",
  renovou_externo: "Manter registrado e revisar apenas se o cliente voltar para a Fasa.",
  nao_renovar: "Registrar o motivo e revisar futuramente se o cliente solicitar.",
  cliente_inativo: "Confirmar se o cadastro deve permanecer inativo.",
};

export const CERTIFICATE_RENEWAL_PLANNING_IMPACT: Record<CertificateRenewalStatus, string> = {
  em_acompanhamento: "Entra na dashboard operacional e no planejamento de avisos.",
  renovou_fasa: "Entra na dashboard operacional e no planejamento de avisos.",
  renovou_externo: "Não entra na dashboard operacional nem no planejamento automático.",
  nao_renovar: "Não entra na dashboard operacional nem no planejamento automático.",
  cliente_inativo: "Não entra na dashboard operacional nem no planejamento automático.",
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

export function getCertificateRenewalPresentation(value: string | null | undefined) {
  const status = isCertificateRenewalStatus(value) ? value : "em_acompanhamento";

  return {
    status,
    label: CERTIFICATE_RENEWAL_STATUS_LABEL[status],
    tone: CERTIFICATE_RENEWAL_STATUS_TONE[status],
    description: CERTIFICATE_RENEWAL_STATUS_DESCRIPTION[status],
    nextAction: CERTIFICATE_RENEWAL_NEXT_ACTION[status],
    planningImpact: CERTIFICATE_RENEWAL_PLANNING_IMPACT[status],
    plannable: isCertificateRenewalPlannable(status),
  };
}
