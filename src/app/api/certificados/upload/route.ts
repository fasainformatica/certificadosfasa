import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { CertificateUploadError, registerCertificateUpload } from "@/lib/certificados/upload-service";
import { rebuildNotificationSchedule, runDueNotificationJob } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { uploadCertificateFieldsSchema } from "@/lib/validations/certificados";

export const runtime = "nodejs";

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || null;
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

  const admin = createSupabaseAdminClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const certificado = await registerCertificateUpload({
      admin,
      userId: auth.user.id,
      ip: getClientIp(request),
      fileName: file.name,
      buffer,
      password: fields.data.senha,
      clientData: fields.data,
    });
    const notificacaoRebuild = await rebuildNotificationSchedule({
      triggeredBy: "system",
      userId: auth.user.id,
    });
    const notificacaoDia = await runDueNotificationJob({
      triggeredBy: "system",
      userId: auth.user.id,
    });

    return NextResponse.json(
      {
        certificado: {
          id: certificado.id,
          cnpj: certificado.cnpj,
          nome_titular: certificado.nome_titular,
          data_emissao: certificado.data_emissao,
          data_vencimento: certificado.data_vencimento,
          status: certificado.status,
        },
        notificacao_rebuild: notificacaoRebuild,
        notificacao_dia: notificacaoDia,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CertificateUploadError) {
      return jsonError(error.message, error.status, error.code);
    }

    return jsonError("Falha ao registrar o certificado.", 500, "registro_certificado");
  }
}
