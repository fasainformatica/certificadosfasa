import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/api";
import { rebuildNotificationSchedule } from "@/lib/notifications/engine";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const result = await rebuildNotificationSchedule({
    triggeredBy: "manual",
    userId: auth.user.id,
  });

  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}
