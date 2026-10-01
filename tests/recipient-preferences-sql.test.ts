import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(resolve("database/schema/supabase_schema.sql"), "utf8").replace(/\r\n/g, "\n");
const migration = readFileSync(resolve("database/migrations/20261001133454_recipient_notification_preferences.sql"), "utf8");
const ids = {
  general: "10000000-0000-4000-8000-000000000001",
  updates: "10000000-0000-4000-8000-000000000002",
  both: "10000000-0000-4000-8000-000000000003",
  inactive: "10000000-0000-4000-8000-000000000004",
};
let db: PGlite;

function table(name: string) {
  const start = schema.indexOf(`create table if not exists public.${name} (`);
  const end = schema.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error(`Missing table DDL: ${name}`);
  return schema.slice(start, end + 3);
}

async function notice(type = "certificate_updated", provider = "whatsapp_extension", extra: {
  metadata?: Record<string, unknown>;
  dedupe?: string;
  target_role?: string;
  expires_at?: string;
  created_at?: string;
} = {}) {
  const { rows } = await db.query<{ id: string }>(`
    insert into public.internal_notifications(type, title, body, metadata, dedupe_key, target_role, expires_at, created_at)
    values ($1, 'Aviso de teste', 'Mensagem para a equipe', $2::jsonb, $3, $4, $5, $6)
    returning id`, [type, JSON.stringify({ whatsapp_provider: provider, source: "manual_internal_broadcast", ...extra.metadata }),
    extra.dedupe ?? null, extra.target_role ?? null, extra.expires_at ?? null, extra.created_at ?? new Date().toISOString()]);
  return rows[0].id;
}

async function reserve(provider = "whatsapp_extension") {
  const fn = provider === "euatendo" ? "reserve_euatendo_notification_event" : "reserve_whatsapp_extension_notification_event";
  const { rows } = await db.query<{ result: { status: string; event?: { id: string; type: string }; reason?: string } }>(
    `select public.${fn}() as result`,
  );
  return rows[0].result;
}

beforeAll(async () => {
  db = new PGlite();
  // Real notification table DDL; unrelated Auth/Storage/certificate fields are not needed in this isolated database.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create type public.user_role as enum ('admin','financeiro');
    create type public.certificado_status as enum ('ativo','vencido','invalido');
    create type public.notification_event_status as enum ('pending','reserved','processing','retry','sent','failed','cancelled','skipped');
    create table public.clientes(id uuid primary key, whatsapp_notifications_enabled boolean default true);
    create table public.certificados(id uuid primary key, status public.certificado_status default 'ativo',
      renovacao_status text default 'em_acompanhamento', data_vencimento date default current_date + 30);
    ${table("internal_notifications")}
    ${table("notification_settings")}
    ${table("notification_templates")}
    ${table("notification_recipients")}
    ${table("notification_events")}
    alter table public.notification_events add column audience text not null default 'internal';
    ${table("whatsapp_dispatcher_state")}
    create unique index notification_events_idempotency_key_unique_idx
      on public.notification_events(idempotency_key) where idempotency_key is not null;
    create unique index internal_notifications_dedupe_key_unique_idx
      on public.internal_notifications(dedupe_key) where dedupe_key is not null;
    insert into notification_recipients(id,nome,telefone,telefone_normalizado)
      values ('${ids.general}', 'Geral', '5511999990001', '5511999990001');
  `);
  await db.exec(migration);
  await db.exec(migration); // Re-applying must preserve preferences and existing records.
}, 30000);

beforeEach(async () => {
  await db.exec(`begin;
    insert into notification_settings(enabled) values(true);
    insert into notification_recipients(id,nome,telefone,telefone_normalizado,ativo,notify_general,notify_certificate_updates) values
      ('${ids.updates}','Atualizacoes','5511999990002','5511999990002',true,false,true),
      ('${ids.both}','Ambos','5511999990003','5511999990003',true,true,true),
      ('${ids.inactive}','Inativo','5511999990004','5511999990004',false,true,true);`);
});
afterEach(async () => { await db.exec("rollback;"); });
afterAll(async () => { await db?.close(); });

describe("recipient preferences migration (isolated PostgreSQL)", () => {
  it("preserves legacy recipients as general-only", async () => {
    const { rows } = await db.query("select notify_general, notify_certificate_updates from notification_recipients where id=$1", [ids.general]);
    expect(rows).toEqual([{ notify_general: true, notify_certificate_updates: false }]);
  });

  it.each(["certificate_updated", "system_notice"])("queues %s only for opted-in active recipients", async (type) => {
    const id = await notice(type);
    const { rows } = await db.query("select recipient_id, status, audience, type, mensagem_renderizada from notification_events where internal_notification_id=$1 order by recipient_id", [id]);
    expect(rows).toEqual([ids.updates, ids.both].map((recipient_id) => ({
      recipient_id, status: "pending", audience: "internal",
      type: type === "system_notice" ? "internal_notice" : "certificate_updated",
      mensagem_renderizada: "Aviso de teste\n\nMensagem para a equipe",
    })));
  });

  it.each(["certificate_created", "client_updated", "notification_failed"])("does not fan out %s", async (type) => {
    await notice(type);
    expect((await db.query("select id from notification_events")).rows).toHaveLength(0);
  });

  it("does not broadcast private, expired, automatic system notices or unknown channels", async () => {
    await notice("certificate_updated", "whatsapp_extension", { target_role: "admin" });
    await notice("system_notice", "whatsapp_extension", { metadata: { source: "automatic_health_check" } });
    await notice("system_notice", "whatsapp_extension", { created_at: "2020-01-01", expires_at: "2020-01-02" });
    await notice("certificate_updated", "unknown");
    expect((await db.query("select id from notification_events")).rows).toHaveLength(0);
  });

  it("queues nothing without opt-in; enabling later does not replay old notices", async () => {
    await db.exec("update notification_recipients set notify_certificate_updates=false");
    await notice();
    await db.exec("update notification_recipients set notify_certificate_updates=true");
    expect((await db.query("select id from notification_events")).rows).toHaveLength(0);
  });

  it("keeps internal and Windows notices even with zero WhatsApp recipients", async () => {
    await db.exec("update notification_recipients set ativo=false");
    const id = await notice();
    expect((await db.query("select id from internal_notifications where id=$1", [id])).rows).toHaveLength(1);
    expect((await db.query("select id from notification_events")).rows).toHaveLength(0);
  });

  it("does not duplicate notices or queue rows on repeated upload keys", async () => {
    await notice("certificate_updated", "whatsapp_extension", { dedupe: "upload:unique:hash" });
    await db.exec("savepoint duplicate_test");
    await expect(notice("certificate_updated", "whatsapp_extension", { dedupe: "upload:unique:hash" })).rejects.toThrow(/duplicate key/i);
    await db.exec("rollback to savepoint duplicate_test");
    expect((await db.query("select id from notification_events")).rows).toHaveLength(2);
  });

  it("rolls back the internal insert when fanout fails, without partial queue rows", async () => {
    await db.exec("alter table notification_events add constraint test_queue_failure check (mensagem_renderizada <> 'Aviso de teste' || E'\\n\\n' || 'Mensagem para a equipe'); savepoint atomic_test");
    await expect(notice()).rejects.toThrow(/test_queue_failure/);
    await db.exec("rollback to savepoint atomic_test");
    expect((await db.query("select id from internal_notifications")).rows).toHaveLength(0);
    expect((await db.query("select id from notification_events")).rows).toHaveLength(0);
  });

  it.each(["whatsapp_extension", "euatendo"])("reserves only one opted-in message with %s and preserves the lock", async (provider) => {
    await notice("certificate_updated", provider);
    expect(await reserve(provider)).toMatchObject({ status: "reserved", event: { type: "certificate_updated" } });
    expect(await reserve(provider)).toMatchObject({ status: "locked" });
    expect((await db.query("select id from notification_events where status='reserved'")).rows).toHaveLength(1);
  });

  it.each(["whatsapp_extension", "euatendo"])("respects automatic sending disabled and next allowed time with %s", async (provider) => {
    await db.exec("update notification_settings set enabled=false");
    await notice("system_notice", provider);
    expect(await reserve(provider)).toMatchObject({ status: "skipped", reason: "notifications_disabled" });
    await db.exec("update notification_settings set enabled=true");
    await db.query("insert into whatsapp_dispatcher_state(provider,next_allowed_send_at) values($1,now()+interval '5 minutes')", [provider]);
    expect(await reserve(provider)).toMatchObject({ status: "waiting" });
    expect((await db.query("select id from notification_events where status='pending'")).rows).toHaveLength(2);
  });

  it("cancels unsent notices on opt-out and blocks manual retry without reviving them on opt-in", async () => {
    await notice();
    await db.query("update notification_recipients set notify_certificate_updates=false where id=$1", [ids.updates]);
    await db.query("update notification_events set status='retry' where recipient_id=$1", [ids.updates]);
    expect((await db.query("select status from notification_events where recipient_id=$1", [ids.updates])).rows).toEqual([{ status: "cancelled" }]);
    await db.query("update notification_recipients set notify_certificate_updates=true where id=$1", [ids.updates]);
    expect((await db.query("select status from notification_events where recipient_id=$1", [ids.updates])).rows).toEqual([{ status: "cancelled" }]);
  });

  it("blocks general notices for update-only recipients, leaving client notices unchanged", async () => {
    await db.query(`insert into notification_events(recipient_id,telefone_destino,type,dias_restantes,mensagem_renderizada)
      values($1,'5511999990002','certificate_expired',0,'Resumo')`, [ids.updates]);
    await db.exec(`insert into notification_events(audience,telefone_destino,type,dias_restantes,mensagem_renderizada)
      values('client','5511999990010','certificate_expired',0,'Cliente');`);
    expect((await db.query("select status from notification_events order by audience")).rows).toEqual([{ status: "pending" }, { status: "cancelled" }]);
  });

  it("updates the phone of queued notices, never a reserved notice", async () => {
    await notice();
    const reservation = await reserve();
    await db.exec("update notification_recipients set telefone_normalizado='5511999999999', notify_certificate_updates=false");
    expect((await db.query("select status, telefone_destino from notification_events where id=$1", [reservation.event?.id])).rows[0]).toMatchObject({ status: "reserved" });
    expect((await db.query("select telefone_destino from notification_events where id=$1", [reservation.event?.id])).rows[0]).not.toEqual({ telefone_destino: "5511999999999" });
    expect((await db.query("select status, telefone_destino from notification_events where id<>$1", [reservation.event?.id])).rows).toEqual([
      { status: "cancelled", telefone_destino: "5511999999999" },
    ]);
  });

  it.each(["whatsapp_extension", "euatendo"])("filters legacy general queue at reservation with %s", async (provider) => {
    await db.exec("alter table notification_events disable trigger notification_events_recipient_preferences");
    await db.query(`insert into notification_events(recipient_id,telefone_destino,type,dias_restantes,mensagem_renderizada,provider)
      values ($1,'5511999990002','certificate_expired',0,'Legacy notice',$3),
             ($2,'5511999990001','certificate_expired',0,'General notice',$3)`, [ids.updates, ids.general, provider]);
    await db.exec("alter table notification_events enable trigger notification_events_recipient_preferences");
    expect(await reserve(provider)).toMatchObject({ status: "reserved", event: { type: "certificate_expired" } });
    expect((await db.query("select recipient_id, status from notification_events order by recipient_id")).rows).toEqual([
      { recipient_id: ids.general, status: "reserved" }, { recipient_id: ids.updates, status: "cancelled" },
    ]);
  });

  it("cancels notices when their internal source is deleted", async () => {
    const id = await notice();
    await db.query("delete from internal_notifications where id=$1", [id]);
    expect(await reserve()).toMatchObject({ status: "empty" });
    expect((await db.query("select distinct status from notification_events")).rows).toEqual([{ status: "cancelled" }]);
  });

  it.each(["whatsapp_extension", "euatendo"])("cancels expired broadcasts at reservation with %s", async (provider) => {
    const id = await notice("system_notice", provider);
    await db.query("update internal_notifications set created_at='2020-01-01', expires_at='2020-01-02' where id=$1", [id]);
    expect(await reserve(provider)).toMatchObject({ status: "empty" });
    expect((await db.query("select distinct status from notification_events")).rows).toEqual([{ status: "cancelled" }]);
  });

  it("does not grant privileged helper or reservation execution to public clients", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ allowed: boolean }>(`select has_function_privilege($1,
        'public.notification_event_recipient_allowed(public.notification_events)', 'execute') as allowed`, [role]);
      expect(rows[0].allowed).toBe(false);
      const reservePermission = await db.query<{ allowed: boolean }>(`select has_function_privilege($1,
        'public.reserve_whatsapp_extension_notification_event(integer,boolean)', 'execute') as allowed`, [role]);
      expect(reservePermission.rows[0].allowed).toBe(false);
    }
  });
});
