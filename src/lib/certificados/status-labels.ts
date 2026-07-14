import type { CertificadoStatus } from "@/lib/supabase/database.types";

export const CERTIFICATE_STATUS_LABEL: Record<CertificadoStatus, string> = {
  ativo: "Válido",
  vencendo: "Vence em breve",
  vencido: "Vencido",
  invalido: "Inválido",
};

export const CERTIFICATE_STATUS_CLASS: Record<CertificadoStatus, string> = {
  ativo: "bg-green-50 text-green-700 ring-green-200",
  vencendo: "bg-orange-50 text-orange-700 ring-orange-200",
  vencido: "bg-red-50 text-red-700 ring-red-200",
  invalido: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const CERTIFICATE_STATUSES: CertificadoStatus[] = ["ativo", "vencendo", "vencido", "invalido"];
