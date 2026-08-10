import { NextRequest, NextResponse } from "next/server";

import { jsonError } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth/api";
import { ADMIN_ROLES } from "@/lib/auth/permissions";
import {
  createInternalUserSchema,
  listManagedInternalUsers,
  toManagedInternalUser,
} from "@/lib/admin/users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
}

export async function GET() {
  const auth = await requireApiUser(ADMIN_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const admin = createSupabaseAdminClient();

  try {
    const users = await listManagedInternalUsers(admin);
    return NextResponse.json({ users });
  } catch {
    return jsonError("Nao foi possivel carregar os usuarios internos.", 500, "usuarios_listar");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(ADMIN_ROLES);

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  const parsed = createInternalUserSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Dados invalidos.", 400, "validacao");
  }

  const admin = createSupabaseAdminClient();
  const { email, password, role, active } = parsed.data;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    return jsonError("Nao foi possivel criar o usuario. Verifique se o e-mail ja esta cadastrado.", 409, "usuario_criar");
  }

  const createdUser = created.data.user;
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .upsert({
      id: createdUser.id,
      role,
      active,
      updated_at: new Date().toISOString(),
    })
    .select("id, role, active, created_at, updated_at")
    .single();

  if (profileError || !profile) {
    await admin.auth.admin.deleteUser(createdUser.id).catch(() => null);
    return jsonError("Nao foi possivel definir a permissao do usuario.", 500, "usuario_permissao");
  }

  await admin.from("audit_logs").insert({
    user_id: auth.user.id,
    acao: "criar_usuario",
    certificado_id: null,
    ip: getRequestIp(request),
    metadata: {
      target_user_id: createdUser.id,
      target_email: createdUser.email,
      role,
      active,
    },
  });

  return NextResponse.json({ user: toManagedInternalUser(createdUser, profile) }, { status: 201 });
}
