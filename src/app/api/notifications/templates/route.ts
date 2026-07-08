import { NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { ensureDefaultNotificationTemplate } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  await ensureDefaultNotificationTemplate();

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("notification_templates")
    .select("id, type, title, content, active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonError("Falha ao carregar templates.", 500, "templates_erro");
  }

  return NextResponse.json({ templates: data ?? [] });
}
