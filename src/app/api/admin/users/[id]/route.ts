import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import {
  getManagedInternalUser,
  hasAnotherActiveAdmin,
  updateInternalUserSchema,
} from "@/lib/admin/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type UserRouteProps = {
  params: Promise<{
    id: string;
  }>;
};

function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

export async function PATCH(request: NextRequest, { params }: UserRouteProps) {
  const auth = await requireApiUser(ADMIN_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateInternalUserSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const current = await getManagedInternalUser(admin, id);

  if (!current) {
    return jsonError("Usuario nao encontrado.", 404, "usuario_nao_encontrado");
  }

  const nextRole = parsed.data.role ?? current.role;
  const nextActive = parsed.data.active ?? current.active;

  if (id === auth.user.id && (nextRole !== "admin" || !nextActive)) {
    return jsonError("Voce nao pode remover seu proprio acesso de administrador.", 409, "auto_rebaixamento_bloqueado");
  }

  if (current.role === "admin" && current.active && (nextRole !== "admin" || !nextActive)) {
    const hasBackupAdmin = await hasAnotherActiveAdmin(admin, id);

    if (!hasBackupAdmin) {
      return jsonError("Mantenha ao menos um administrador ativo no sistema.", 409, "ultimo_admin_bloqueado");
    }
  }

  const { error } = await admin
    .from("user_profiles")
    .upsert({
      id,
      role: nextRole,
      active: nextActive,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return jsonError("Nao foi possivel atualizar a permissao do usuario.", 500, "usuario_atualizar");
  }

  const user = await getManagedInternalUser(admin, id);

  if (!user) {
    return jsonError("Permissao atualizada, mas nao foi possivel recarregar o usuario.", 500, "usuario_recarregar");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "alterar_usuario",
    certificado_id: null,
    ip: getRequestIp(request),
    metadata: {
      target_user_id: id,
      target_email: current.email,
      role_anterior: current.role,
      role_novo: nextRole,
      active_anterior: current.active,
      active_novo: nextActive,
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(request: NextRequest, { params }: UserRouteProps) {
  const auth = await requireApiUser(ADMIN_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await params;

  if (id === auth.user.id) {
    return jsonError("Voce nao pode remover seu proprio usuario.", 409, "autoexclusao_bloqueada");
  }

  const admin = createSupabaseAdminClient();
  const current = await getManagedInternalUser(admin, id);

  if (!current) {
    return jsonError("Usuario nao encontrado.", 404, "usuario_nao_encontrado");
  }

  if (current.role === "admin" && current.active) {
    const hasBackupAdmin = await hasAnotherActiveAdmin(admin, id);

    if (!hasBackupAdmin) {
      return jsonError("Mantenha ao menos um administrador ativo no sistema.", 409, "ultimo_admin_bloqueado");
    }
  }

  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    return jsonError("Nao foi possivel remover o usuario.", 500, "usuario_remover");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "remover_usuario",
    certificado_id: null,
    ip: getRequestIp(request),
    metadata: {
      target_user_id: id,
      target_email: current.email,
      role: current.role,
      active: current.active,
    },
  });

  return NextResponse.json({ ok: true });
}
