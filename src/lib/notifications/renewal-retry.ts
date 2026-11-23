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
