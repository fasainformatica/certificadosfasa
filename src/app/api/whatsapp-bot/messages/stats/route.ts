import { NextResponse } from "next/server";

import { authenticateQwepRequest } from "@/lib/qwep/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export const runtime = "nodejs";

const STATUSES = ["pending", "reserved", "processing", "retry", "sent", "failed", "cancelled", "skipped"] as const;
const STATS_CACHE_TTL_MS = 5_000;

let statsCache: { expiresAt: number; stats: Record<string, number> } | null = null;

function normalizeStats(value: Json | null) {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
  const stats: Record<string, number> = {};

  for (const status of STATUSES) {
    const count = Number(raw[status]);
    stats[status] = Number.isFinite(count) ? count : 0;
  }

  return stats;
}

export async function GET(request: Request) {
  const auth = await authenticateQwepRequest(request, {
    bodyText: "",
    rateLimitKey: "qwep-stats",
  });

  if (!auth.ok) {
    return auth.response;
  }

  if (statsCache && statsCache.expiresAt > Date.now()) {
    return NextResponse.json({ stats: statsCache.stats });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_whatsapp_bot_message_stats");

  if (error) {
    return NextResponse.json({ error: "Falha ao consultar estatisticas." }, { status: 500 });
  }

  const stats = normalizeStats(data ?? null);
  statsCache = { expiresAt: Date.now() + STATS_CACHE_TTL_MS, stats };

  return NextResponse.json({ stats });
}
