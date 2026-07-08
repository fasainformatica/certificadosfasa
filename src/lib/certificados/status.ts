import type { CertificadoStatus } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function dateOnlyToUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function daysUntilDate(date: string) {
  return Math.ceil((dateOnlyToUtc(date) - todayUtc()) / DAY_IN_MS);
}

export function calculateCertificateStatus(
  dataVencimento: string,
  diasAvisoVencimento: number[] = [30, 15, 7],
): CertificadoStatus {
  const days = daysUntilDate(dataVencimento);

  if (days <= 0) {
    return "vencido";
  }

  const maxWarningDays = Math.max(...diasAvisoVencimento, 30);
  return days <= maxWarningDays ? "vencendo" : "ativo";
}

export async function refreshCertificateStatuses(diasAvisoVencimento: number[] = [30, 15, 7]) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("refresh_certificado_statuses", {
    p_dias_aviso: diasAvisoVencimento,
  });

  if (error) {
    return { updated: 0, error: error.message };
  }

  return { updated: Number(data ?? 0), error: null };
}
