import "server-only";

import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type StorageReconciliationOperation = "upload" | "delete" | "restore" | "verify";
export type StorageReconciliationStatus = "pending" | "processing" | "completed" | "failed";

function sanitizeStorageError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/certificados\/[0-9]{14}\/(?:[a-f0-9]{64}|certificado)\.pfx/gi, "[storage_path]")
    .slice(0, 500);
}

export async function createStorageReconciliationJob({
  admin,
  operationType,
  certificadoId,
  storagePath,
  metadata = {},
}: {
  admin: AdminClient;
  operationType: StorageReconciliationOperation;
  certificadoId?: string | null;
  storagePath: string;
  metadata?: Json;
}) {
  const { data } = await admin
    .from("storage_reconciliation_jobs")
    .insert({
      operation_type: operationType,
      certificado_id: certificadoId ?? null,
      storage_path: storagePath,
      status: "pending",
      metadata,
    })
    .select("id")
    .maybeSingle();

  return data?.id ?? null;
}

export async function markStorageReconciliationJob({
  admin,
  jobId,
  certificadoId,
  status,
  error,
  metadata,
}: {
  admin: AdminClient;
  jobId: string | null;
  certificadoId?: string | null;
  status: StorageReconciliationStatus;
  error?: unknown;
  metadata?: Json;
}) {
  if (!jobId) {
    return;
  }

  const updatePayload: {
    status: StorageReconciliationStatus;
    certificado_id?: string | null;
    last_error: string | null;
    metadata?: Json;
    processed_at: string | null;
  } = {
    status,
    last_error: error ? sanitizeStorageError(error) : null,
    processed_at: status === "completed" || status === "failed" ? new Date().toISOString() : null,
  };

  if (certificadoId !== undefined) {
    updatePayload.certificado_id = certificadoId;
  }

  if (metadata !== undefined) {
    updatePayload.metadata = metadata;
  }

  await admin
    .from("storage_reconciliation_jobs")
    .update(updatePayload)
    .eq("id", jobId);
}

export async function certificateObjectExists(admin: AdminClient, storagePath: string) {
  const parent = storagePath.split("/").slice(0, -1).join("/");
  const name = storagePath.split("/").pop() ?? storagePath;
  const { data, error } = await admin.storage.from(CERTIFICATES_BUCKET).list(parent, {
    limit: 1,
    search: name,
  });

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data?.some((item) => item.name === name));
}

async function listStoragePathsRecursive(admin: AdminClient, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 6) {
    return [];
  }

  const { data, error } = await admin.storage.from(CERTIFICATES_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error(error.message);
  }

  const paths: string[] = [];

  for (const item of data ?? []) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

    if (item.id === null) {
      paths.push(...(await listStoragePathsRecursive(admin, itemPath, depth + 1)));
      continue;
    }

    paths.push(itemPath);
  }

  return paths;
}

export async function runStorageReconciliationReport({ reprocess = false }: { reprocess?: boolean } = {}) {
  const admin = createSupabaseAdminClient();
  const reprocessed = reprocess ? await reprocessStorageReconciliationJobs(admin) : 0;
  const { data: certificados, error: certificadosError } = await admin
    .from("certificados")
    .select("id, storage_path");

  if (certificadosError) {
    throw new Error(certificadosError.message);
  }

  const knownPaths = new Map((certificados ?? []).map((item) => [item.storage_path, item.id]));
  const recordsWithoutFile: Array<{ certificado_id: string; storage_path: string }> = [];

  for (const certificado of certificados ?? []) {
    const exists = await certificateObjectExists(admin, certificado.storage_path);

    if (!exists) {
      recordsWithoutFile.push({
        certificado_id: certificado.id,
        storage_path: certificado.storage_path,
      });
    }
  }

  const storagePaths = await listStoragePathsRecursive(admin, "certificados");
  const orphanFiles = storagePaths.filter((path) => !knownPaths.has(path));
  const { data: jobs } = await admin
    .from("storage_reconciliation_jobs")
    .select("id, operation_type, certificado_id, storage_path, status, attempts, max_attempts, last_error, created_at, updated_at, processed_at")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    checked_at: new Date().toISOString(),
    bucket: CERTIFICATES_BUCKET,
    jobs_reprocessados: reprocessed,
    registros_verificados: certificados?.length ?? 0,
    arquivos_orfaos: orphanFiles.map((storage_path) => ({ storage_path })),
    registros_sem_arquivo: recordsWithoutFile,
    operacoes_pendentes_ou_falhas: jobs ?? [],
  };
}

async function reprocessStorageReconciliationJobs(admin: AdminClient) {
  const { data: jobs, error } = await admin
    .from("storage_reconciliation_jobs")
    .select("id, operation_type, certificado_id, storage_path, status, attempts, max_attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", 20)
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    throw new Error(error.message);
  }

  let processed = 0;

  for (const job of jobs ?? []) {
    if (job.attempts >= job.max_attempts) {
      continue;
    }

    await admin
      .from("storage_reconciliation_jobs")
      .update({
        status: "processing",
        attempts: job.attempts + 1,
        last_error: null,
      })
      .eq("id", job.id);

    try {
      const fileExists = await certificateObjectExists(admin, job.storage_path);
      const certificateExists = job.certificado_id
        ? Boolean(
            (
              await admin
                .from("certificados")
                .select("id")
                .eq("id", job.certificado_id)
                .maybeSingle()
            ).data,
          )
        : false;
      const completed =
        (["upload", "verify", "restore"].includes(job.operation_type) && certificateExists && fileExists) ||
        (job.operation_type === "delete" && !certificateExists && !fileExists);

      await admin
        .from("storage_reconciliation_jobs")
        .update({
          status: completed ? "completed" : "failed",
          last_error: completed ? null : "Inconsistencia ainda presente apos reprocessamento seguro.",
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      processed += 1;
    } catch (jobError) {
      await admin
        .from("storage_reconciliation_jobs")
        .update({
          status: "failed",
          last_error: sanitizeStorageError(jobError),
          processed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      processed += 1;
    }
  }

  return processed;
}

export async function logStorageReconciliationFailure({
  admin,
  certificadoId,
  userId,
  action,
  error,
  metadata = {},
}: {
  admin: AdminClient;
  certificadoId?: string | null;
  userId?: string | null;
  action: string;
  error: unknown;
  metadata?: Json;
}) {
  await admin.from("audit_logs").insert({
    user_id: userId ?? null,
    acao: action,
    certificado_id: certificadoId ?? null,
    metadata: {
      ...((metadata as Record<string, Json>) ?? {}),
      error: sanitizeStorageError(error),
    },
  });
}
