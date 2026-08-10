import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type InternalNotificationInsert = Database["public"]["Tables"]["internal_notifications"]["Insert"];

export type CertificateUploadNotificationOperation = "created" | "updated";

export type InternalNotificationCreateResult =
  | {
      created: true;
      id: string | null;
    }
  | {
      created: false;
      error: string;
    };

export type CertificateUploadInternalNotificationInput = {
  admin: AdminClient;
  operation: CertificateUploadNotificationOperation;
  certificadoId: string;
  clienteId: string | null;
  actorUserId: string;
  cnpj: string;
  nomeTitular: string;
  dataVencimento: string;
  hashArquivo: string;
  source?: "upload_individual" | "importacao_em_massa" | "certificate_upload_service";
};

function formatDatePtBr(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    return date;
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(maxLength - 3, 0))}...`;
}

export function buildCertificateUploadInternalNotificationPayload(
  input: Omit<CertificateUploadInternalNotificationInput, "admin">,
): InternalNotificationInsert {
  const isUpdate = input.operation === "updated";
  const dataVencimento = formatDatePtBr(input.dataVencimento);
  const title = isUpdate ? "Certificado atualizado" : "Novo certificado cadastrado";
  const body = isUpdate
    ? `${input.nomeTitular} foi atualizado no sistema. Novo vencimento: ${dataVencimento}.`
    : `${input.nomeTitular} foi cadastrado no sistema. Vencimento: ${dataVencimento}.`;

  return {
    type: isUpdate ? "certificate_updated" : "certificate_created",
    severity: isUpdate ? "info" : "success",
    title,
    body: truncateText(body, 500),
    href: `/certificados/${input.certificadoId}`,
    entity_type: "certificado",
    entity_id: input.certificadoId,
    certificado_id: input.certificadoId,
    cliente_id: input.clienteId,
    actor_user_id: input.actorUserId,
    dedupe_key: `certificate_upload:${input.operation}:${input.certificadoId}:${input.hashArquivo}`,
    metadata: {
      source: input.source ?? "certificate_upload_service",
      operation: input.operation,
      cnpj: input.cnpj,
    },
  };
}

export async function createInternalNotification(
  admin: AdminClient,
  payload: InternalNotificationInsert,
): Promise<InternalNotificationCreateResult> {
  try {
    const { data, error } = await admin.from("internal_notifications").insert(payload).select("id").maybeSingle();

    if (error) {
      return {
        created: false,
        error: error.code === "23505" ? "duplicate_internal_notification" : "internal_notification_insert_failed",
      };
    }

    return {
      created: true,
      id: data?.id ?? null,
    };
  } catch {
    return {
      created: false,
      error: "internal_notification_insert_failed",
    };
  }
}

export async function createCertificateUploadInternalNotification(
  input: CertificateUploadInternalNotificationInput,
): Promise<InternalNotificationCreateResult> {
  return createInternalNotification(
    input.admin,
    buildCertificateUploadInternalNotificationPayload({
      operation: input.operation,
      certificadoId: input.certificadoId,
      clienteId: input.clienteId,
      actorUserId: input.actorUserId,
      cnpj: input.cnpj,
      nomeTitular: input.nomeTitular,
      dataVencimento: input.dataVencimento,
      hashArquivo: input.hashArquivo,
      source: input.source,
    }),
  );
}
