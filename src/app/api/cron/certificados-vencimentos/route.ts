import { NextResponse } from "next/server";

import { runDueNotificationJob } from "@/lib/notifications/engine";
import { getOptionalEnv } from "@/lib/supabase/env";

export const runtime = "nodejs";

function getBearerSecret(request: Request) {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

export async function POST(request: Request) {
  const expectedSecret = getOptionalEnv("CRON_SECRET");
  const receivedSecret = getBearerSecret(request);

  if (!expectedSecret || !receivedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }

  const result = await runDueNotificationJob({
    triggeredBy: "cron",
  });

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
