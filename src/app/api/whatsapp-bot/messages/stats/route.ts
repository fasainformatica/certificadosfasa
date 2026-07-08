import { NextResponse } from "next/server";

import { SETTINGS_ID, getTodayDateString } from "@/lib/notifications/engine";
import { authenticateQwepRequest } from "@/lib/qwep/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const STATUSES = ["pending", "reserved", "processing", "retry", "sent", "failed", "cancelled", "skipped"] as const;

export async function GET(request: Request) {
  const auth = await authenticateQwepRequest(request, {
    bodyText: "",
    rateLimitKey: "qwep-stats",
  });

  if (!auth.ok) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin.from("notification_settings").select("timezone").eq("id", SETTINGS_ID).maybeSingle();
  const today = getTodayDateString(settings?.timezone ?? "America/Sao_Paulo");
  const stats: Record<string, number> = {};

  for (const status of STATUSES) {
    let query = admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", status);

    if (status === "pending" || status === "retry") {
      query = query.lte("send_date", today);
    }

    const { count } = await query;

    stats[status] = count ?? 0;
  }

  return NextResponse.json({ stats });
}
