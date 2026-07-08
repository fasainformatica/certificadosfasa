import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { calculateCertificateStatus } from "@/lib/certificados/status";
import { requireApiUser } from "@/lib/auth/api";
import { encryptSecret } from "@/lib/crypto/secrets";
import { rebuildNotificationSchedule, SETTINGS_ID } from "@/lib/notifications/engine";
import { parsePfx, PfxParseError } from "@/lib/pfx/parse";
import { CERTIFICATES_BUCKET, getCertificateStoragePath } from "@/lib/storage/certificates";
import {
  createStorageReconciliationJob,
  logStorageReconciliationFailure,
  markStorageReconciliationJob,
} from "@/lib/storage/reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_PFX_SIZE_BYTES, uploadCertificateFieldsSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

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

function isPfxFile(file: File, buffer: Buffer) {
  return file.name.toLowerCase().endsWith(".pfx") && buffer.length > 0 && buffer[0] === 0x30;
}

async function backupExistingCertificateObject(admin: AdminClient, storagePath: string): Promise<StorageBackup> {
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

async function restoreCertificateObject(admin: AdminClient, storagePath: string, backup: StorageBackup) {
  if (backup.existed) {
    await admin.storage.from(CERTIFICATES_BUCKET).upload(storagePath, backup.content, {
      contentType: backup.contentType,
      upsert: true,
    });
    return;
  }

  await admin.storage.from(CERTIFICATES_BUCKET).remove([storagePath]);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(["admin"]);

  if ("response" in auth) {
    return auth.response;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return jsonError("Requisicao invalida.", 400, "form_data_invalido");
  }

  const file = formData.get("arquivo") ?? formData.get("file");
  const fields = uploadCertificateFieldsSchema.safeParse({
    senha: formData.get("senha"),
    cliente_id_manual: formData.get("cliente_id_manual"),
    cnpj_manual: formData.get("cnpj_manual"),
    nome_razao_social: formData.get("nome_razao_social"),
    email: formData.get("email"),
    telefone: formData.get("telefone"),
    whatsapp: formData.get("whatsapp"),
    responsavel: formData.get("responsavel"),
    observacoes: formData.get("observacoes"),
  });

  if (!fields.success) {
    return jsonError(fields.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  if (!(file instanceof File)) {
    return jsonError("Envie um arquivo .pfx.", 400, "arquivo_obrigatorio");
  }

  if (file.size <= 0) {
    return jsonError("O arquivo enviado esta vazio.", 400, "arquivo_vazio");
  }

  if (file.size > MAX_PFX_SIZE_BYTES) {
    return jsonError("O arquivo excede o limite de 10 MB.", 413, "arquivo_muito_grande");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (!isPfxFile(file, buffer)) {
    return jsonError("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
  }

  let parsedPfx;

  try {
    parsedPfx = parsePfx(buffer, fields.data.senha);
  } catch (error) {
    if (error instanceof PfxParseError) {
      return jsonError("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
    }

    return jsonError("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
  }

  const admin = createSupabaseAdminClient();
  let cnpj = parsedPfx.cnpj ?? fields.data.cnpj_manual;
  const nomeRazaoSocial = fields.data.nome_razao_social;

  if (!cnpj) {
    if (!fields.data.cliente_id_manual) {
      return jsonError(
        "CNPJ nao identificado no certificado. Informe o CNPJ manual ou selecione um cliente existente.",
        422,
        "cnpj_nao_identificado",
      );
    }

    const { data: manualClient, error: manualClientError } = await admin
      .from("clientes")
      .select("cnpj")
      .eq("id", fields.data.cliente_id_manual)
      .maybeSingle();

    if (manualClientError || !manualClient) {
      return jsonError("Cliente manual nao encontrado.", 404, "cliente_nao_encontrado");
    }

    cnpj = manualClient.cnpj;
  }

  if (parsedPfx.cnpj && fields.data.cnpj_manual && parsedPfx.cnpj !== fields.data.cnpj_manual) {
    return jsonError("O CNPJ manual nao corresponde ao CNPJ extraido do certificado.", 409, "cnpj_divergente");
  }

  if (fields.data.cliente_id_manual && parsedPfx.cnpj) {
    const { data: manualClient, error: manualClientError } = await admin
      .from("clientes")
      .select("cnpj")
      .eq("id", fields.data.cliente_id_manual)
      .maybeSingle();

    if (manualClientError || !manualClient) {
      return jsonError("Cliente manual nao encontrado.", 404, "cliente_nao_encontrado");
    }

    if (manualClient.cnpj !== parsedPfx.cnpj) {
      return jsonError("O CNPJ do certificado nao corresponde ao cliente selecionado.", 409, "cnpj_divergente");
    }
  }

  const hashArquivo = createHash("sha256").update(buffer).digest("hex");
  const { data: duplicateCertificate } = await admin
    .from("certificados")
    .select("id")
    .eq("hash_arquivo", hashArquivo)
    .maybeSingle();

  if (duplicateCertificate) {
    return jsonError("Este arquivo de certificado ja foi cadastrado.", 409, "certificado_duplicado");
  }

  const { data: settings } = await admin
    .from("notification_settings")
    .select("dias_aviso_vencimento")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const status = calculateCertificateStatus(parsedPfx.dataVencimento, settings?.dias_aviso_vencimento ?? [30, 15, 7]);
  const encryptedPassword = encryptSecret(fields.data.senha);
  const storagePath = getCertificateStoragePath(cnpj, hashArquivo);
  const backup = await backupExistingCertificateObject(admin, storagePath);
  const reconciliationJobId = await createStorageReconciliationJob({
    admin,
    operationType: "upload",
    certificadoId: null,
    storagePath,
    metadata: {
      hash_arquivo: hashArquivo,
      nome_arquivo_original: file.name,
    },
  });

  const { error: uploadError } = await admin.storage.from(CERTIFICATES_BUCKET).upload(storagePath, buffer, {
    contentType: "application/x-pkcs12",
    upsert: true,
  });

  if (uploadError) {
    await markStorageReconciliationJob({
      admin,
      jobId: reconciliationJobId,
      status: "failed",
      error: uploadError.message,
      metadata: { stage: "storage_upload" },
    });
    await logStorageReconciliationFailure({
      admin,
      userId: auth.user.id,
      action: "storage_upload_failed",
      error: uploadError.message,
      metadata: { hash_arquivo: hashArquivo },
    });
    return jsonError("Falha ao salvar o certificado no Storage.", 502, "storage_upload");
  }

  const { data: certificadoId, error: registerError } = await admin.rpc("registrar_upload_certificado", {
    p_cnpj: cnpj,
    p_nome_razao_social: nomeRazaoSocial,
    p_email: fields.data.email,
    p_telefone: fields.data.telefone,
    p_whatsapp: fields.data.whatsapp,
    p_responsavel: fields.data.responsavel,
    p_observacoes: fields.data.observacoes,
    p_nome_titular: parsedPfx.nomeTitular,
    p_senha_ciphertext: encryptedPassword.ciphertext,
    p_senha_iv: encryptedPassword.iv,
    p_senha_auth_tag: encryptedPassword.authTag,
    p_data_emissao: parsedPfx.dataEmissao,
    p_data_vencimento: parsedPfx.dataVencimento,
    p_status: status,
    p_storage_path: storagePath,
    p_nome_arquivo_original: file.name,
    p_hash_arquivo: hashArquivo,
    p_criado_por: auth.user.id,
    p_ip: getClientIp(request),
  });

  if (registerError || !certificadoId) {
    try {
      await restoreCertificateObject(admin, storagePath, backup);
    } catch (restoreError) {
      await markStorageReconciliationJob({
        admin,
        jobId: reconciliationJobId,
        status: "failed",
        error: restoreError,
        metadata: { stage: "database_register_failed_restore_failed" },
      });
      await logStorageReconciliationFailure({
        admin,
        userId: auth.user.id,
        action: "storage_upload_reconcile_failed",
        error: restoreError,
        metadata: { hash_arquivo: hashArquivo },
      });
      return jsonError("Falha ao registrar no banco e reconciliar o Storage.", 500, "registro_certificado");
    }

    await markStorageReconciliationJob({
      admin,
      jobId: reconciliationJobId,
      status: "failed",
      error: registerError?.message ?? "registro_certificado",
      metadata: { stage: "database_register_failed_storage_restored" },
    });
    return jsonError("Falha ao registrar o certificado no banco de dados.", 500, "registro_certificado");
  }

  await markStorageReconciliationJob({
    admin,
    jobId: reconciliationJobId,
    certificadoId,
    status: "completed",
    metadata: {
      certificado_id: certificadoId,
      hash_arquivo: hashArquivo,
      stage: "upload_and_database_registered",
    },
  });

  const notificacaoRebuild = await rebuildNotificationSchedule({
    triggeredBy: "system",
    userId: auth.user.id,
  });

  return NextResponse.json(
    {
      certificado: {
        id: certificadoId,
        cnpj,
        nome_titular: parsedPfx.nomeTitular,
        data_emissao: parsedPfx.dataEmissao,
        data_vencimento: parsedPfx.dataVencimento,
        status,
      },
      notificacao_rebuild: notificacaoRebuild,
    },
    { status: 201 },
  );
}
