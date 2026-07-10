import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { rebuildNotificationSchedule } from "@/lib/notifications/engine";
import { createPaginationMeta, parsePagination } from "@/lib/pagination";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { clienteInputSchema } from "@/lib/validations/certificados";

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
  const search = cleanSearch(url.searchParams.get("q"));
  const pagination = parsePagination(url.searchParams);

  let query = supabase
    .from("clientes")
    .select("id, nome_razao_social, cnpj, email, telefone, whatsapp, responsavel, observacoes, created_at, updated_at", {
      count: "exact",
    })
    .order("nome_razao_social", { ascending: true })
    .range(pagination.from, pagination.to);

  if (search) {
    const digits = search.replace(/\D/g, "");
    query =
      digits.length === 14
        ? query.eq("cnpj", digits)
        : query.or(`nome_razao_social.ilike.%${search}%,cnpj.ilike.%${digits || search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonError("Falha ao listar clientes.", 500, "clientes_erro");
  }

  return NextResponse.json({
    clientes: data ?? [],
    pagination: createPaginationMeta(count, pagination.page, pagination.pageSize),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = clienteInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clientes")
    .upsert(parsed.data, { onConflict: "cnpj" })
    .select("id, nome_razao_social, cnpj, email, telefone, whatsapp, responsavel, observacoes, created_at, updated_at")
    .single();

  if (error) {
    return jsonError("Falha ao salvar cliente.", 500, "cliente_salvar");
  }

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ cliente: data, notificacao_rebuild: notificationRebuild }, { status: 201 });
}
