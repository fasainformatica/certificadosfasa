import type { Json } from "@/lib/supabase/database.types";

function recordedDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

// Only the immutable event payload is evidence. Never infer validity from send_date.
export function getRenewalRetryPresentation(payload: Json | null | undefined, currentValidity: string | null | undefined) {
  const referenceDate = payload && typeof payload === "object" && !Array.isArray(payload)
    ? recordedDate(payload.data_vencimento) : null;
  const current = recordedDate(currentValidity);
  return { referenceDate, renewed: Boolean(referenceDate && current && current > referenceDate) };
}

export function getNotificationRetryDecision(payload: Json | null | undefined, currentValidity: string | null | undefined, sendDate: string, now = new Date()) {
  const { referenceDate } = getRenewalRetryPresentation(payload, currentValidity);
  if (referenceDate) {
    const current = recordedDate(currentValidity);
    if (!current) return { allowed: false, message: "Não foi possível confirmar a validade atual do certificado. Atualize a página e tente novamente." };
    if (current !== referenceDate) return { allowed: false, message: "A validade do certificado mudou depois deste aviso. Crie um novo aviso com a validade atual." };
    return { allowed: true, message: null };
  }
  const scheduled = recordedDate(sendDate);
  if (!scheduled) return { allowed: false, message: "Este aviso não tem data de programação válida. Crie um novo aviso." };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${scheduled}T00:00:00Z`)) / 86_400_000;
  if (age > 30) return { allowed: false, message: "Este aviso não tem validade de referência e foi programado há mais de 30 dias. Crie um novo aviso." };
  return { allowed: true, message: null };
}
