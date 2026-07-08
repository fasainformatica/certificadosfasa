import { NextRequest, NextResponse } from "next/server";

import { refreshCertificateStatuses } from "@/lib/certificados/status";
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
    .select("dias_aviso_vencimento")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  await refreshCertificateStatuses(settings?.dias_aviso_vencimento ?? [30, 15, 7]);

  let query = supabase
    .from("certificados")
    .select(
      "id, cliente_id, cnpj, nome_titular, data_emissao, data_vencimento, status, nome_arquivo_original, hash_arquivo, ultimo_upload_em, created_at, clientes(nome_razao_social)",
      { count: "exact" },
    )
    .order("data_vencimento", { ascending: true })
    .range(pagination.from, pagination.to);

  if (status && CERTIFICATE_STATUSES.includes(status)) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`nome_titular.ilike.%${search}%,cnpj.ilike.%${search.replace(/\D/g, "") || search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: { message: "Falha ao listar certificados." } }, { status: 500 });
  }

  return NextResponse.json({
    certificados: data ?? [],
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}
