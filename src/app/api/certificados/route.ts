import { NextRequest, NextResponse } from "next/server";

import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { CERTIFICATE_STATUSES } from "@/lib/certificados/status-labels";
import { requireApiUser } from "@/lib/auth/api";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CertificadoStatus } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

function cleanSearch(value: string | null) {
  return value?.trim().replace(/[%,()]/g, "") ?? "";
}

type FilterableQuery = {
  eq: (column: string, value: string) => FilterableQuery;
  neq: (column: string, value: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lt: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  gt: (column: string, value: string) => FilterableQuery;
};

function applyStatusFilter<T extends FilterableQuery>(query: T, status: CertificadoStatus | null, today: string, warningDate: string) {
  const builder = query as FilterableQuery;

  if (status === "substituido") {
    return builder.eq("status", "substituido") as T;
  }

  if (status === "vencido") {
    return builder.neq("status", "substituido").lt("data_vencimento", today) as T;
  }

  if (status === "vencendo") {
    return builder.neq("status", "substituido").gte("data_vencimento", today).lte("data_vencimento", warningDate) as T;
  }

  if (status === "ativo") {
    return builder.neq("status", "substituido").gt("data_vencimento", warningDate) as T;
  }

  return query;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  const supabase = await createServerSupabaseClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") as CertificadoStatus | null;
  const search = cleanSearch(url.searchParams.get("q"));
  const pagination = parsePagination(url.searchParams);
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const warningDays = settings?.dias_aviso_vencimento ?? [30, 15, 7];
  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const { today, warningDate } = getCertificateStatusReferenceDates(warningDays, timezone);

  let query = supabase
    .from("certificados")
    .select(
      "id, cliente_id, cnpj, nome_titular, data_emissao, data_vencimento, status, nome_arquivo_original, hash_arquivo, ultimo_upload_em, created_at, clientes(nome_razao_social)",
      { count: "exact" },
    )
    .order("data_vencimento", { ascending: true })
    .range(pagination.from, pagination.to);

  if (status && CERTIFICATE_STATUSES.includes(status)) {
    query = applyStatusFilter(query, status, today, warningDate);
  }

  if (search) {
    const digits = search.replace(/\D/g, "");
    query =
      digits.length === 14
        ? query.eq("cnpj", digits)
        : query.or(`nome_titular.ilike.%${search}%,cnpj.ilike.%${digits || search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: { message: "Falha ao listar certificados." } }, { status: 500 });
  }

  return NextResponse.json({
    certificados: (data ?? []).map((certificado) => ({
      ...certificado,
      status:
        certificado.status === "substituido"
          ? certificado.status
          : calculateCertificateStatus(certificado.data_vencimento, warningDays, timezone),
    })),
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}
