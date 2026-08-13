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
  const auditSql = read("database/scripts/SECURITY_AUDIT_SUPABASE.sql");
  const packageJson = read("package.json");
  const envExample = read(".env.example");

  it("mantem secrets server-side fora de modulos client", () => {
    expect(adminEnv).toContain('import "server-only";');
    expect(adminClient).toContain('import "server-only";');
    expect(adminClient).toContain("getSupabaseServiceRoleKey()");
    expect(adminClient).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
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
    expect(packageJson).toContain('"security:audit": "node scripts/security-audit-local.mjs"');
    expect(envExample).toContain("SUPABASE_SECRET_KEY=coloque_a_secret_key_apenas_no_backend");
    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=opcional_legado_apenas_no_backend");
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
