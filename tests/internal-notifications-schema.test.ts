import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(process.cwd(), "database/migrations/20260810100000_create_internal_notifications.sql"),
  "utf8",
).toLowerCase();

const consolidatedSchemaSql = readFileSync(
  join(process.cwd(), "database/schema/supabase_schema.sql"),
  "utf8",
).toLowerCase();

const databaseTypes = readFileSync(join(process.cwd(), "src/lib/supabase/database.types.ts"), "utf8");

describe("internal notifications schema", () => {
  it("cria a fila interna e o estado individual de leitura", () => {
    expect(migrationSql).toContain("create table if not exists public.internal_notifications");
    expect(migrationSql).toContain("create table if not exists public.internal_notification_reads");
    expect(migrationSql).toContain("target_role public.user_role");
    expect(migrationSql).toContain("dedupe_key");
    expect(migrationSql).toContain("internal_notifications_dedupe_key_unique_idx");
  });

  it("mantem rls e leitura limitada a usuarios internos", () => {
    expect(migrationSql).toContain("alter table public.internal_notifications enable row level security");
    expect(migrationSql).toContain("alter table public.internal_notification_reads enable row level security");
    expect(migrationSql).toContain("public.can_read_internal()");
    expect(migrationSql).toContain("target_user_id is null or target_user_id = auth.uid()");
    expect(migrationSql).toContain("target_role is null or target_role = public.current_user_role()");
    expect(migrationSql).toContain("user_id = auth.uid()");
  });

  it("nao concede escrita direta na fila para clientes autenticados comuns", () => {
    expect(migrationSql).toContain("revoke all on public.internal_notifications from anon, authenticated");
    expect(migrationSql).toContain("grant select");
    expect(migrationSql).not.toContain("grant insert on public.internal_notifications to authenticated");
    expect(migrationSql).not.toContain("grant update on public.internal_notifications to authenticated");
    expect(migrationSql).toContain("grant update (read_at, dismissed_at) on public.internal_notification_reads");
  });

  it("mantem schema consolidado e tipos do Supabase atualizados", () => {
    expect(consolidatedSchemaSql).toContain("create table if not exists public.internal_notifications");
    expect(consolidatedSchemaSql).toContain("create table if not exists public.internal_notification_reads");
    expect(databaseTypes).toContain("export type InternalNotificationType");
    expect(databaseTypes).toContain("internal_notifications");
    expect(databaseTypes).toContain("internal_notification_reads");
  });
});
