import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { runStorageReconciliationReport } from "@/lib/storage/reconciliation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const report = await runStorageReconciliationReport({ reprocess: body?.reprocess === true });
    return NextResponse.json({ report });
  } catch {
    return jsonError("Falha ao reconciliar Storage e banco.", 500, "storage_reconcile");
  }
}
