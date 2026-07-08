import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { rebuildNotificationSchedule } from "@/lib/notifications/engine";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import {
  createStorageReconciliationJob,
  logStorageReconciliationFailure,
  markStorageReconciliationJob,
} from "@/lib/storage/reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type CertificadoRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

type StorageBackup =
  | {
      existed: true;
      content: Buffer;
      contentType: string;
    }
  | {
      existed: false;
    };

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
}

async function backupStorageObject(storagePath: string): Promise<StorageBackup> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(CERTIFICATES_BUCKET).download(storagePath);

  if (error || !data) {
    return { existed: false };
  }

  return {
    existed: true,
    content: Buffer.from(await data.arrayBuffer()),
    contentType: data.type || "application/x-pkcs12",
  };
}

async function restoreStorageObject(storagePath: string, backup: StorageBackup) {
  if (!backup.existed) {
    return;
  }

  const admin = createSupabaseAdminClient();
  await admin.storage.from(CERTIFICATES_BUCKET).upload(storagePath, backup.content, {
    contentType: backup.contentType,
    upsert: true,
  });
}

export async function GET(_request: NextRequest, { params }: CertificadoRouteProps) {
  const auth = await requireApiUser(["admin", "financeiro"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("certificados")
    .select(
      "id, cliente_id, cnpj, nome_titular, data_emissao, data_vencimento, status, nome_arquivo_original, hash_arquivo, ultimo_upload_em, created_at, clientes(nome_razao_social)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return jsonError("Falha ao buscar certificado.", 500, "certificado_erro");
  }

  if (!data) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  return NextResponse.json({ certificado: data });
}

export async function DELETE(request: NextRequest, { params }: CertificadoRouteProps) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: certificado, error: fetchError } = await admin
    .from("certificados")
    .select("id, status, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return jsonError("Falha ao buscar certificado.", 500, "certificado_erro");
  }

  if (!certificado) {
    return jsonError("Certificado nao encontrado.", 404, "certificado_nao_encontrado");
  }

  const { data: samePathReferences } = await admin
    .from("certificados")
    .select("id")
    .eq("storage_path", certificado.storage_path)
    .neq("id", id)
    .limit(1);

  const shouldRemoveStorageObject = !samePathReferences?.length;
  const backup = shouldRemoveStorageObject ? await backupStorageObject(certificado.storage_path) : { existed: false as const };
  const reconciliationJobId = await createStorageReconciliationJob({
    admin,
    operationType: "delete",
    certificadoId: id,
    storagePath: certificado.storage_path,
    metadata: {
      should_remove_storage_object: shouldRemoveStorageObject,
      status: certificado.status,
    },
  });

  if (shouldRemoveStorageObject) {
    const { error: removeError } = await admin.storage.from(CERTIFICATES_BUCKET).remove([certificado.storage_path]);

    if (removeError) {
      await markStorageReconciliationJob({
        admin,
        jobId: reconciliationJobId,
        status: "failed",
        error: removeError.message,
        metadata: { stage: "storage_delete_failed" },
      });
      await logStorageReconciliationFailure({
        admin,
        certificadoId: id,
        userId: auth.user.id,
        action: "storage_delete_failed",
        error: removeError.message,
      });
      return jsonError("Falha ao remover o arquivo do Storage. A exclusao foi cancelada.", 502, "storage_excluir");
    }
  }

  const { data: deletionResult, error: deleteError } = await admin.rpc("excluir_certificado_com_cliente", {
    p_certificado_id: id,
    p_user_id: auth.user.id,
    p_ip: getClientIp(request),
    p_metadata: {
      status: certificado.status,
      storage_path_removido: shouldRemoveStorageObject,
    },
  });

  if (deleteError) {
    try {
      await restoreStorageObject(certificado.storage_path, backup);
    } catch (restoreError) {
      await markStorageReconciliationJob({
        admin,
        jobId: reconciliationJobId,
        status: "failed",
        error: restoreError,
        metadata: { stage: "database_delete_failed_restore_failed" },
      });
      await logStorageReconciliationFailure({
        admin,
        certificadoId: id,
        userId: auth.user.id,
        action: "storage_delete_reconcile_failed",
        error: restoreError,
      });
      return jsonError("Falha ao excluir no banco e reconciliar o Storage.", 500, "certificado_excluir");
    }

    await markStorageReconciliationJob({
      admin,
      jobId: reconciliationJobId,
      status: "failed",
      error: deleteError.message,
      metadata: { stage: "database_delete_failed_storage_restored" },
    });
    return jsonError("Falha ao excluir no banco de dados. O arquivo foi restaurado quando possivel.", 500, "certificado_excluir");
  }

  await markStorageReconciliationJob({
    admin,
    jobId: reconciliationJobId,
    status: "completed",
    metadata: {
      stage: shouldRemoveStorageObject ? "storage_and_database_deleted" : "database_deleted_shared_storage_kept",
      result: deletionResult,
    },
  });

  const notificationRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json({ ok: true, result: deletionResult, notificacao_rebuild: notificationRebuild });
}
