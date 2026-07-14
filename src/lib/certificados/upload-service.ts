import "server-only";

import { createHash } from "crypto";

import { calculateCertificateStatus } from "@/lib/certificados/status";
import { encryptSecret } from "@/lib/crypto/secrets";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { parsePfx, PfxParseError } from "@/lib/pfx/parse";
import { CERTIFICATES_BUCKET, getCertificateStoragePath } from "@/lib/storage/certificates";
import {
  createStorageReconciliationJob,
  logStorageReconciliationFailure,
  markStorageReconciliationJob,
} from "@/lib/storage/reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MAX_PFX_SIZE_BYTES } from "@/lib/validations/certificados";

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

export class CertificateUploadError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CertificateUploadError";
    this.status = status;
    this.code = code;
  }
}

export type CertificateUploadClientData = {
  cliente_id_manual?: string | null;
  cnpj_manual?: string | null;
  nome_razao_social: string;
  email?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
};

export type RegisterCertificateUploadInput = {
  admin: AdminClient;
  userId: string;
  ip: string | null;
  fileName: string;
  buffer: Buffer;
  password: string;
  clientData: CertificateUploadClientData;
  metadata?: Record<string, unknown>;
  preserveExistingClientData?: boolean;
};

type ExistingCertificate = {
  id: string;
  cliente_id: string;
  storage_path: string;
  hash_arquivo: string;
};

function normalizeCnpj(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

export function isPfxUploadFile(fileName: string, buffer: Buffer) {
  return fileName.toLowerCase().endsWith(".pfx") && buffer.length > 0 && buffer[0] === 0x30;
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

async function findExistingCertificateForUpload({
  admin,
  cnpj,
  clienteIdManual,
}: {
  admin: AdminClient;
  cnpj: string;
  clienteIdManual?: string | null;
}): Promise<ExistingCertificate | null> {
  if (clienteIdManual) {
    const { data } = await admin
      .from("certificados")
      .select("id, cliente_id, storage_path, hash_arquivo")
      .eq("cliente_id", clienteIdManual)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return data;
    }
  }

  const { data: client } = await admin
    .from("clientes")
    .select("id")
    .eq("cnpj", cnpj)
    .maybeSingle();

  if (!client) {
    return null;
  }

  const { data } = await admin
    .from("certificados")
    .select("id, cliente_id, storage_path, hash_arquivo")
    .eq("cliente_id", client.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

function fail(message: string, status: number, code: string): never {
  throw new CertificateUploadError(message, status, code);
}

export async function registerCertificateUpload({
  admin,
  userId,
  ip,
  fileName,
  buffer,
  password,
  clientData,
  metadata = {},
  preserveExistingClientData = false,
}: RegisterCertificateUploadInput) {
  if (buffer.length <= 0) {
    fail("O arquivo enviado esta vazio.", 400, "arquivo_vazio");
  }

  if (buffer.length > MAX_PFX_SIZE_BYTES) {
    fail("O arquivo excede o limite de 10 MB.", 413, "arquivo_muito_grande");
  }

  if (!isPfxUploadFile(fileName, buffer)) {
    fail("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
  }

  let parsedPfx;

  try {
    parsedPfx = parsePfx(buffer, password);
  } catch (error) {
    if (error instanceof PfxParseError) {
      fail("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
    }

    fail("Senha incorreta ou certificado invalido.", 400, "pfx_invalido");
  }

  let cnpj = parsedPfx.cnpj ?? normalizeCnpj(clientData.cnpj_manual);

  if (!cnpj) {
    if (!clientData.cliente_id_manual) {
      fail(
        "CNPJ nao identificado no certificado. Informe o CNPJ manual ou selecione um cliente existente.",
        422,
        "cnpj_nao_identificado",
      );
    }

    const { data: manualClient, error: manualClientError } = await admin
      .from("clientes")
      .select("cnpj")
      .eq("id", clientData.cliente_id_manual)
      .maybeSingle();

    if (manualClientError || !manualClient) {
      fail("Cliente manual nao encontrado.", 404, "cliente_nao_encontrado");
    }

    cnpj = manualClient.cnpj;
  }

  const cnpjManual = normalizeCnpj(clientData.cnpj_manual);

  if (parsedPfx.cnpj && cnpjManual && parsedPfx.cnpj !== cnpjManual && !clientData.cliente_id_manual) {
    fail("O CNPJ manual nao corresponde ao CNPJ extraido do certificado.", 409, "cnpj_divergente");
  }

  if (clientData.cliente_id_manual && parsedPfx.cnpj) {
    const { data: conflictingClient } = await admin
      .from("clientes")
      .select("id")
      .eq("cnpj", parsedPfx.cnpj)
      .maybeSingle();

    if (conflictingClient && conflictingClient.id !== clientData.cliente_id_manual) {
      fail("O CNPJ do certificado ja pertence a outro cliente.", 409, "cnpj_divergente");
    }
  }

  let effectiveClientData = clientData;

  if (preserveExistingClientData) {
    const { data: existingClient } = await admin
      .from("clientes")
      .select("nome_razao_social, email, telefone, whatsapp, responsavel, observacoes")
      .eq("cnpj", cnpj)
      .maybeSingle();

    if (existingClient) {
      effectiveClientData = {
        ...clientData,
        nome_razao_social: existingClient.nome_razao_social || clientData.nome_razao_social,
        email: existingClient.email ?? clientData.email ?? null,
        telefone: existingClient.telefone ?? clientData.telefone ?? null,
        whatsapp: existingClient.whatsapp ?? clientData.whatsapp ?? null,
        responsavel: existingClient.responsavel ?? clientData.responsavel ?? null,
        observacoes: existingClient.observacoes ?? clientData.observacoes ?? null,
      };
    }
  }

  const hashArquivo = createHash("sha256").update(buffer).digest("hex");
  const existingCertificate = await findExistingCertificateForUpload({
    admin,
    cnpj,
    clienteIdManual: clientData.cliente_id_manual,
  });
  const { data: duplicateCertificate } = await admin
    .from("certificados")
    .select("id")
    .eq("hash_arquivo", hashArquivo)
    .maybeSingle();

  if (duplicateCertificate && duplicateCertificate.id !== existingCertificate?.id) {
    fail("Este arquivo de certificado ja foi cadastrado.", 409, "certificado_duplicado");
  }

  const { data: settings } = await admin
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();

  const status = calculateCertificateStatus(
    parsedPfx.dataVencimento,
    settings?.dias_aviso_vencimento ?? [30, 15, 7],
    settings?.timezone ?? "America/Sao_Paulo",
  );
  const encryptedPassword = encryptSecret(password);
  const storagePath = getCertificateStoragePath(cnpj);
  const previousStoragePath = existingCertificate?.storage_path ?? null;
  const backup = await backupExistingCertificateObject(admin, storagePath);
  const reconciliationJobId = await createStorageReconciliationJob({
    admin,
    operationType: "upload",
    certificadoId: existingCertificate?.id ?? null,
    storagePath,
    metadata: {
      hash_arquivo: hashArquivo,
      nome_arquivo_original: fileName,
      certificado_existente_id: existingCertificate?.id ?? null,
      storage_path_anterior: previousStoragePath,
      ...metadata,
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
      metadata: { stage: "storage_upload", ...metadata },
    });
    await logStorageReconciliationFailure({
      admin,
      userId,
      action: "storage_upload_failed",
      error: uploadError.message,
      metadata: { hash_arquivo: hashArquivo, ...metadata },
    });
    fail("Falha ao salvar o certificado no Storage.", 502, "storage_upload");
  }

  const nomeRazaoSocial =
    effectiveClientData.nome_razao_social.trim() || parsedPfx.nomeTitular || fileName.replace(/\.pfx$/i, "");
  const { data: certificadoId, error: registerError } = await admin.rpc("registrar_upload_certificado", {
    p_cnpj: cnpj,
    p_nome_razao_social: nomeRazaoSocial,
    p_email: effectiveClientData.email ?? null,
    p_telefone: effectiveClientData.telefone ?? null,
    p_whatsapp: effectiveClientData.whatsapp ?? null,
    p_responsavel: effectiveClientData.responsavel ?? null,
    p_observacoes: effectiveClientData.observacoes ?? null,
    p_nome_titular: parsedPfx.nomeTitular,
    p_senha_ciphertext: encryptedPassword.ciphertext,
    p_senha_iv: encryptedPassword.iv,
    p_senha_auth_tag: encryptedPassword.authTag,
    p_data_emissao: parsedPfx.dataEmissao,
    p_data_vencimento: parsedPfx.dataVencimento,
    p_status: status,
    p_storage_path: storagePath,
    p_nome_arquivo_original: fileName,
    p_hash_arquivo: hashArquivo,
    p_criado_por: userId,
    p_ip: ip,
    p_certificado_id_existente: existingCertificate?.id ?? null,
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
        metadata: { stage: "database_register_failed_restore_failed", ...metadata },
      });
      await logStorageReconciliationFailure({
        admin,
        userId,
        action: "storage_upload_reconcile_failed",
        error: restoreError,
        metadata: { hash_arquivo: hashArquivo, ...metadata },
      });
      fail("Falha ao registrar no banco e reconciliar o Storage.", 500, "registro_certificado");
    }

    await markStorageReconciliationJob({
      admin,
      jobId: reconciliationJobId,
      status: "failed",
      error: registerError?.message ?? "registro_certificado",
      metadata: { stage: "database_register_failed_storage_restored", ...metadata },
    });
    fail("Falha ao registrar o certificado no banco de dados.", 500, "registro_certificado");
  }

  const { data: registeredCertificate } = await admin
    .from("certificados")
    .select("status")
    .eq("id", certificadoId)
    .maybeSingle();
  const savedStatus = registeredCertificate?.status ?? status;

  if (previousStoragePath && previousStoragePath !== storagePath) {
    const deleteOldJobId = await createStorageReconciliationJob({
      admin,
      operationType: "delete",
      certificadoId,
      storagePath: previousStoragePath,
      metadata: {
        stage: "remove_previous_certificate_object_after_renewal",
        novo_storage_path: storagePath,
        ...metadata,
      },
    });
    const { error: removeOldError } = await admin.storage.from(CERTIFICATES_BUCKET).remove([previousStoragePath]);

    if (removeOldError) {
      await markStorageReconciliationJob({
        admin,
        jobId: deleteOldJobId,
        status: "failed",
        error: removeOldError.message,
        metadata: { stage: "remove_previous_certificate_object_failed", ...metadata },
      });
      await logStorageReconciliationFailure({
        admin,
        certificadoId,
        userId,
        action: "storage_remove_previous_certificate_failed",
        error: removeOldError.message,
        metadata: { previous_storage_path: previousStoragePath, storage_path: storagePath, ...metadata },
      });
    } else {
      await markStorageReconciliationJob({
        admin,
        jobId: deleteOldJobId,
        certificadoId,
        status: "completed",
        metadata: { stage: "previous_certificate_object_removed", ...metadata },
      });
    }
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
      ...metadata,
    },
  });

  return {
    id: certificadoId,
    cnpj,
    nome_titular: parsedPfx.nomeTitular,
    data_emissao: parsedPfx.dataEmissao,
    data_vencimento: parsedPfx.dataVencimento,
    status: savedStatus,
    hash_arquivo: hashArquivo,
  };
}
