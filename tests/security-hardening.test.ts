import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("security hardening", () => {
  const nextConfig = read("next.config.ts");
  const adminEnv = read("src/lib/supabase/env.ts");
  const adminClient = read("src/lib/supabase/admin.ts");
  const hardeningMigration = read("database/migrations/20260813100000_security_incident_hardening.sql");
  const signupLockMigration = read("database/migrations/20260813103000_lock_public_signup_profiles_and_rpc_privileges.sql");
  const auditSql = read("database/scripts/SECURITY_AUDIT_SUPABASE.sql");
  const mftvLockdownSql = read("database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql");
  const legacyLogAuditSql = read("database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql");
  const legacyLogSanitizeSql = read("database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql");
  const routeSecurityCheck = read("scripts/check-service-role-rbac.mjs");
  const localSecurityAudit = read("scripts/security-audit-local.mjs");
  const notificationEngine = read("src/lib/notifications/engine.ts");
  const sensitiveDataHelper = read("src/lib/security/sensitive-data.ts");
  const packageJson = read("package.json");
  const envExample = read(".env.example");

  it("mantem secrets server-side fora de modulos client", () => {
    expect(adminEnv).toContain('import "server-only";');
    expect(adminClient).toContain('import "server-only";');
    expect(adminClient).toContain("getSupabaseServiceRoleKey()");
    const forbiddenPublicServiceRoleName = ["NEXT_PUBLIC", "SUPABASE", "SERVICE_ROLE_KEY"].join("_");
    expect(adminClient).not.toContain(forbiddenPublicServiceRoleName);
  });

  it("desativa source maps de producao e aplica headers de seguranca", () => {
    expect(nextConfig).toContain("productionBrowserSourceMaps: false");
    expect(nextConfig).toContain("poweredByHeader: false");
    expect(nextConfig).toContain("Content-Security-Policy");
    expect(nextConfig).toContain("frame-ancestors 'none'");
    expect(nextConfig).toContain("Strict-Transport-Security");
    expect(nextConfig).toContain("X-Frame-Options");
    expect(nextConfig).toContain("X-Content-Type-Options");
    expect(nextConfig).toContain("Referrer-Policy");
    expect(nextConfig).toContain("Permissions-Policy");
  });

  it("garante RLS, anon bloqueado e bucket PFX privado na migration de hardening", () => {
    const tables = [
      "user_profiles",
      "clientes",
      "certificados",
      "configuracoes_sistema",
      "links_download",
      "audit_logs",
      "internal_notifications",
      "internal_notification_reads",
      "storage_reconciliation_jobs",
      "notification_settings",
      "notification_templates",
      "notification_recipients",
      "notification_events",
      "notification_runs",
      "whatsapp_dispatcher_state",
      "whatsapp_provider_logs",
    ];

    for (const table of tables) {
      expect(hardeningMigration).toContain(`alter table public.${table} enable row level security;`);
    }

    expect(hardeningMigration).toContain("revoke usage on schema public from public, anon;");
    expect(hardeningMigration).toContain("revoke all privileges on all tables in schema public from public, anon;");
    expect(hardeningMigration).toContain("grant all privileges on all tables in schema public to service_role;");
    expect(hardeningMigration).toContain("grant execute on function public.can_read_internal() to authenticated;");
    expect(hardeningMigration).toContain("revoke all privileges on storage.buckets from public, anon, authenticated;");
    expect(hardeningMigration).toContain("revoke all privileges on storage.objects from public, anon, authenticated;");
    expect(hardeningMigration).toContain("grant all privileges on storage.objects to service_role;");
    expect(hardeningMigration).toContain("public = false");
    expect(hardeningMigration).not.toContain("senha_ciphertext) on public.certificados to authenticated");
    expect(hardeningMigration).not.toContain("storage_path) on public.certificados to authenticated");
  });

  it("inclui auditoria manual do banco real e comando npm local", () => {
    expect(auditSql).toContain("pg_policies");
    expect(auditSql).toContain("storage.buckets");
    expect(auditSql).toContain("auth.users");
    expect(auditSql).toContain("information_schema.role_table_grants");
    expect(auditSql).toContain("p.prosecdef as security_definer");
    expect(auditSql).toContain("information_schema.routine_privileges");
    expect(auditSql).toContain("group by role, active");
    expect(packageJson).toContain('"security:audit": "node scripts/security-audit-local.mjs"');
    expect(envExample).toContain("SUPABASE_SECRET_KEY=coloque_a_secret_key_apenas_no_backend");
    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=opcional_legado_apenas_no_backend");
  });

  it("mantem novos signups internos inativos ate aprovacao administrativa", () => {
    expect(signupLockMigration).toContain("create or replace function public.handle_new_user()");
    expect(signupLockMigration).toContain("values (new.id, 'financeiro', false)");
    expect(signupLockMigration).toContain("revoke execute on function public.handle_new_user() from public, anon, authenticated");
    expect(signupLockMigration).toContain("grant execute on function public.is_admin() to authenticated, service_role");
  });

  it("inclui lockdown separado para o projeto Supabase mftvsgzrujkalssiriny", () => {
    for (const table of [
      "modulos",
      "user_roles",
      "usuario_tipos",
      "clientes",
      "fornecedores",
      "produtos",
      "metas",
      "banco_lancamentos",
      "tipos_servico",
      "fiscal_logs",
      "indicacoes",
      "funcionario_ferias",
      "suporte_tickets",
    ]) {
      expect(mftvLockdownSql).toContain(`'${table}'`);
    }

    expect(mftvLockdownSql).toContain("enable row level security");
    expect(mftvLockdownSql).toContain("revoke usage on schema public from public, anon");
    expect(mftvLockdownSql).toContain("grantee in ('PUBLIC', 'anon')");
    expect(mftvLockdownSql).toContain("Execute apenas no SQL Editor desse projeto");
  });

  it("audita superficie das APIs internas e excecoes publicas", () => {
    expect(routeSecurityCheck).toContain("apiRoutePolicies");
    expect(routeSecurityCheck).toContain("rota interna sem requireApiUser ou politica publica explicita");
    expect(routeSecurityCheck).toContain("CRON_SECRET");
    expect(routeSecurityCheck).toContain("hashPublicDownloadToken");
    expect(routeSecurityCheck).toContain("verifyDownloadPassword");
    expect(routeSecurityCheck).toContain("authenticateWhatsAppExtension");
    expect(routeSecurityCheck).toContain("authenticateWindowsNotifier");
    expect(routeSecurityCheck).toContain("createSupabaseAdminClient");
    expect(routeSecurityCheck).toContain("cria Supabase Admin antes de validar autenticacao");
  });

  it("mantem sanitizacao de dados sensiveis e scan de arquivos novos", () => {
    expect(sensitiveDataHelper).toContain("redactSensitiveText");
    expect(sensitiveDataHelper).toContain("getSafeOperationalErrorMessage");
    expect(sensitiveDataHelper).toContain("[storage_path]");
    expect(sensitiveDataHelper).toContain("[phone]");
    expect(localSecurityAudit).toContain("ls-files\", \"--others\", \"--exclude-standard");
    expect(localSecurityAudit).toContain("Scan local de secrets em arquivos versionados e novos");
  });

  it("audita e limpa logs historicos sensiveis com rollback por padrao", () => {
    for (const table of [
      "audit_logs",
      "storage_reconciliation_jobs",
      "notification_events",
      "whatsapp_provider_logs",
    ]) {
      expect(legacyLogAuditSql).toContain(table);
      expect(legacyLogSanitizeSql).toContain(table);
    }

    for (const expected of [
      "security_redact_text",
      "provider_response",
      "payload",
      "redacted_sample",
      "security_safe_operational_message",
      "security_redact_notification_payload",
      "notification_events.payload.phone_keys",
      "rollback;",
    ]) {
      expect(legacyLogAuditSql + legacyLogSanitizeSql).toContain(expected);
    }

    expect(legacyLogSanitizeSql).not.toContain("\ncommit;");
    expect(localSecurityAudit).toContain("SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql");
    expect(localSecurityAudit).toContain("SECURITY_SANITIZE_LEGACY_LOGS.sql");
    expect(notificationEngine).toContain("getClienteTelefoneForPayload");
    expect(notificationEngine).toContain("maskPhone(telefone)");
  });

  it("nao rastreia env real no git local", () => {
    const trackedEnv = execFileSync("git", ["ls-files", "--", ".env", ".env.*"], {
      cwd: root,
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .filter(Boolean);

    expect(trackedEnv).toEqual([".env.example"]);
  });
});
