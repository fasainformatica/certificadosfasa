import type { CertificadoStatus } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function dateOnlyToUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayUtc(timeZone = "America/Sao_Paulo") {
  const today = getDatePartsInTimeZone(new Date(), timeZone);
  return Date.UTC(today.year, today.month - 1, today.day);
}

function normalizeWarningDays(diasAvisoVencimento: number[] = [30, 15, 7]) {
  const validDays = diasAvisoVencimento.filter((day) => Number.isInteger(day) && day > 0);
  return validDays.length > 0 ? Math.max(...validDays) : 30;
}

export function daysUntilDate(date: string, timeZone = "America/Sao_Paulo") {
  return Math.round((dateOnlyToUtc(date) - todayUtc(timeZone)) / DAY_IN_MS);
}

export function calculateCertificateStatus(
  dataVencimento: string,
  diasAvisoVencimento: number[] = [30, 15, 7],
  timeZone = "America/Sao_Paulo",
): CertificadoStatus {
  const days = daysUntilDate(dataVencimento, timeZone);

  if (days < 0) {
    return "vencido";
  }

  const maxWarningDays = normalizeWarningDays(diasAvisoVencimento);
  return days <= maxWarningDays ? "vencendo" : "ativo";
}

export function getCertificateStatusReferenceDates(
  diasAvisoVencimento: number[] = [30, 15, 7],
  timeZone = "America/Sao_Paulo",
) {
  const warningDays = normalizeWarningDays(diasAvisoVencimento);
  const todayReference = todayUtc(timeZone);
  const today = new Date(todayReference).toISOString().slice(0, 10);
  const warningDate = new Date(todayReference + warningDays * DAY_IN_MS).toISOString().slice(0, 10);

  return { today, warningDate, warningDays };
}

export async function refreshCertificateStatuses(diasAvisoVencimento: number[] = [30, 15, 7], today?: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("refresh_certificado_statuses", {
    p_dias_aviso: diasAvisoVencimento,
    ...(today ? { p_today: today } : {}),
  });

  if (error) {
    return { updated: 0, error: error.message };
  }

  return { updated: Number(data ?? 0), error: null };
}
