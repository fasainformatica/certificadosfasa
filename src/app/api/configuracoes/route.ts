import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configuracoesSistemaInputSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

const SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("configuracoes_sistema")
    .select("id, dias_aviso_vencimento, created_at, updated_at")
    .eq("id", SETTINGS_ID)
    .single();

  if (error || !data) {
    return jsonError("Falha ao carregar configuracoes.", 500, "configuracoes_erro");
  }

  return NextResponse.json({ configuracoes: data });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = configuracoesSistemaInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("configuracoes_sistema")
    .update({
      dias_aviso_vencimento: parsed.data.dias_aviso_vencimento,
      updated_at: new Date().toISOString(),
    })
    .eq("id", SETTINGS_ID)
    .select("id, dias_aviso_vencimento, created_at, updated_at")
    .single();

  if (error || !data) {
    return jsonError("Falha ao salvar configuracoes.", 500, "configuracoes_salvar");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_configuracoes",
    certificado_id: null,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip"),
    metadata: {
      campos: ["dias_aviso_vencimento"],
    },
  });

  return NextResponse.json({ configuracoes: data });
}
