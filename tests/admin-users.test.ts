import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const usersRouteSource = readFileSync(join(process.cwd(), "src/app/api/admin/users/route.ts"), "utf8");
const userRouteSource = readFileSync(join(process.cwd(), "src/app/api/admin/users/[id]/route.ts"), "utf8");
const userManagementSource = readFileSync(join(process.cwd(), "src/lib/admin/users.ts"), "utf8");
const settingsPageSource = readFileSync(join(process.cwd(), "src/app/(internal)/configuracoes/page.tsx"), "utf8");
const settingsFormSource = readFileSync(join(process.cwd(), "src/app/(internal)/configuracoes/configuracoes-form.tsx"), "utf8");

describe("admin user management", () => {
  it("valida admin antes de usar service role nas rotas de usuarios", () => {
    for (const source of [usersRouteSource, userRouteSource]) {
      const authIndex = source.indexOf("requireApiUser(ADMIN_ROLES)");
      const adminIndex = source.indexOf("createSupabaseAdminClient()");

      expect(authIndex).toBeGreaterThanOrEqual(0);
      expect(adminIndex).toBeGreaterThan(authIndex);
      expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("cria usuarios pelo Supabase Auth Admin sem devolver senha", () => {
    expect(usersRouteSource).toContain("admin.auth.admin.createUser");
    expect(usersRouteSource).toContain("email_confirm: true");
    expect(usersRouteSource).toContain("user_profiles");
    expect(usersRouteSource).toContain("criar_usuario");
    expect(usersRouteSource).not.toContain("password:");
  });

  it("bloqueia autoexclusao e remocao do ultimo administrador ativo", () => {
    expect(userRouteSource).toContain("autoexclusao_bloqueada");
    expect(userRouteSource).toContain("auto_rebaixamento_bloqueado");
    expect(userRouteSource).toContain("ultimo_admin_bloqueado");
    expect(userRouteSource).toContain("hasAnotherActiveAdmin");
    expect(userRouteSource).toContain("admin.auth.admin.deleteUser");
  });

  it("normaliza permissao e lista usuarios com dados seguros para a interface", () => {
    expect(userManagementSource).toContain('z.enum(["admin", "financeiro"])');
    expect(userManagementSource).toContain("listManagedInternalUsers");
    expect(userManagementSource).toContain("toManagedInternalUser");
    expect(userManagementSource).toContain("lastSignInAt");
    expect(userManagementSource).not.toContain("password_hash");
    expect(userManagementSource).not.toContain("service_role");
  });

  it("expõe a aba de usuarios apenas na pagina administrativa de configuracoes", () => {
    expect(settingsPageSource).toContain("requireAdmin()");
    expect(settingsPageSource).toContain("listManagedInternalUsers");
    expect(settingsPageSource).toContain("initialUsers={internalUsers}");
    expect(settingsFormSource).toContain('key: "usuarios"');
    expect(settingsFormSource).toContain("Criar usuário");
    expect(settingsFormSource).toContain("saveManagedUser");
    expect(settingsFormSource).toContain("removeManagedUser");
    expect(settingsFormSource).toContain("Financeiro pode operar certificados");
  });
});
