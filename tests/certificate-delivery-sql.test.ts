import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(resolve("database/schema/supabase_schema.sql"), "utf8").replace(/\r\n/g, "\n");
const migration = readFileSync(resolve("database/migrations/20261006152037_certificate_delivery_links.sql"), "utf8");
const recipientsMigration = readFileSync(resolve("database/migrations/20261001133454_recipient_notification_preferences.sql"), "utf8");
const certificate = "10000000-0000-4000-8000-000000000001";
const passwordHash = "scrypt-test-placeholder-for-sql-tests";
const sessionHash = "b".repeat(64);
const encryptedCredentials = { ciphertext: "encrypted-not-plaintext", iv: "iv", authTag: "tag" };
type Result = { status: string; id?: string; credentials?: unknown; retry_until?: string; filename?: string };
let db: PGlite;

function table(name: string) {
  const start = schema.indexOf(`create table if not exists public.${name} (`);
  const end = schema.indexOf("\n);", start);
  if (start < 0 || end < 0) throw new Error(`Missing table ${name}`);
  return schema.slice(start, end + 3);
}
async function issue(eventId: string | null = null, reservation: string | null = null) {
  const hash = randomUUID().replaceAll("-", "").repeat(2);
  const { rows } = await db.query<{ result: Result }>(
    "select issue_certificate_download($1,$2,$3,$4,$5,$6) result",
    [certificate, hash, passwordHash, JSON.stringify(encryptedCredentials), eventId, reservation]);
  return { ...rows[0].result, hash };
}
async function access(hash: string, action: string, transfer: string | null = null, session = sessionHash, password = passwordHash) {
  return (await db.query<{ result: Result }>("select access_certificate_download($1,$2,$3,$4,$5) result",
    [hash, action, session, password, transfer])).rows[0].result;
}
async function queue() {
  const { rows } = await db.query<{ id: string }>(`insert into internal_notifications(type,title,body,certificado_id,metadata)
    values('certificate_updated','Atualizado','Novo vencimento', $1, $2) returning id`,
  [certificate, JSON.stringify({ certificate_hash: "a".repeat(64), whatsapp_provider: "whatsapp_extension" })]);
  return rows[0].id;
}
async function reserveEvents() {
  const reservation = randomUUID();
  const { rows } = await db.query<{ id: string }>("update notification_events set status='reserved', reservation_id=$1 returning id", [reservation]);
  return { reservation, ids: rows.map((row) => row.id) };
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create type public.user_role as enum ('admin','financeiro');
    create type public.certificado_status as enum ('ativo','vencido','invalido');
    create type public.notification_event_status as enum ('pending','reserved','processing','retry','sent','failed','cancelled','skipped');
    create table clientes(id uuid primary key, whatsapp_notifications_enabled boolean default true);
    create table certificados(id uuid primary key, hash_arquivo text, storage_path text default 'private/file.pfx',
      nome_arquivo_original text default 'certificate.pfx', senha_ciphertext text default 'encrypted', senha_iv text default 'iv', senha_auth_tag text default 'tag',
      status certificado_status default 'ativo', renovacao_status text default 'em_acompanhamento', data_vencimento date default current_date+30);
    ${table("internal_notifications")}
    ${table("notification_settings")}
    ${table("notification_templates")}
    ${table("notification_recipients")}
    ${table("notification_events")}
    alter table notification_events add column audience text not null default 'internal';
    ${table("whatsapp_dispatcher_state")}
    ${table("links_download")}
    create unique index notification_events_idempotency_key_unique_idx on notification_events(idempotency_key) where idempotency_key is not null;
    create unique index links_download_token_hash_key on links_download(token_hash);`);
  await db.exec(recipientsMigration);
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec(`begin; insert into certificados(id,hash_arquivo) values('${certificate}','${"a".repeat(64)}');
    insert into notification_recipients(nome,telefone,telefone_normalizado,notify_certificate_updates)
    values('One','5511999990001','5511999990001',true),('Two','5511999990002','5511999990002',true);`);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db?.close(); });

describe("certificate delivery SQL", () => {
  it("isolates each recipient and the manual link; retries reuse the same encrypted credentials", async () => {
    await queue();
    const { ids, reservation } = await reserveEvents();
    const manual = await issue();
    const first = await issue(ids[0], reservation);
    const second = await issue(ids[1], reservation);
    expect(first.status).toBe("ready");
    expect(second.id).not.toBe(first.id);
    expect((await issue(ids[0], reservation)).id).toBe(first.id);
    expect(first.credentials).toEqual(encryptedCredentials);
    expect((await db.query("select id from links_download where ativo")).rows).toHaveLength(3);
    await issue();
    expect((await db.query("select id from links_download where ativo")).rows).toHaveLength(3);
    expect((await access(manual.hash, "authorize")).status).toBe("unavailable");
    expect((await access(first.hash, "authorize")).status).toBe("authorized");
  });
  it("does not generate automatic links with only one selected recipient", async () => {
    await db.exec("update notification_recipients set notify_certificate_updates=false where nome='Two'");
    await queue();
    await db.exec("update notification_recipients set notify_certificate_updates=true");
    const { ids, reservation } = await reserveEvents();
    expect((await issue(ids[0], reservation)).status).toBe("text_only");
    expect((await db.query("select id from links_download")).rows).toHaveLength(0);
  });
  it("rejects forged/stale reservations and recipient opt-out", async () => {
    await queue();
    const { ids, reservation } = await reserveEvents();
    expect((await issue(ids[0], randomUUID())).status).toBe("unavailable");
    const link = await issue(ids[0], reservation);
    await db.exec("update notification_recipients set notify_certificate_updates=false");
    expect((await access(link.hash, "authorize")).status).toBe("unavailable");
  });
  it("rejects an expired event reservation", async () => {
    await queue();
    const { ids, reservation } = await reserveEvents();
    await db.exec("update notification_events set reservation_expires_at=now()-interval '1 second'");
    expect((await issue(ids[0], reservation)).status).toBe("unavailable");
  });
  it("gives two minutes for recovery even when download starts near session expiry", async () => {
    const link = await issue();
    await access(link.hash, "authorize");
    await db.exec("update links_download set session_expires_at=now()+interval '5 seconds'");
    const result = await access(link.hash, "download", randomUUID());
    expect(result.status).toBe("ready");
    const { rows } = await db.query<{ valid: boolean }>("select session_expires_at >= retry_until as valid from links_download");
    expect(rows[0].valid).toBe(true);
  });
  it("allows one password claim, never a second tab or refresh", async () => {
    const link = await issue();
    const results = await Promise.all([access(link.hash, "authorize"), access(link.hash, "authorize")]);
    expect(results.map((row) => row.status)).toEqual(["authorized", "unavailable"]);
    expect((await db.query<{ ativo: boolean }>("select ativo from links_download")).rows[0].ativo).toBe(false);
  });
  it("rejects a password changed during verification", async () => {
    const link = await issue();
    await db.query("update links_download set senha_hash=$1", ["new-password-hash-long-enough"]);
    expect((await access(link.hash, "authorize")).status).toBe("unavailable");
  });
  it("increments failed attempts atomically and blocks after five", async () => {
    const link = await issue();
    for (let attempt = 0; attempt < 4; attempt++) expect((await access(link.hash, "failed_password")).status).toBe("wrong_password");
    expect((await access(link.hash, "failed_password")).status).toBe("rate_limited");
    expect((await access(link.hash, "authorize")).status).toBe("rate_limited");
    await db.exec("update links_download set bloqueado_ate=now()-interval '1 second'");
    expect((await access(link.hash, "authorize")).status).toBe("authorized");
  });
  it("rejects file access before authorization and from another session", async () => {
    const link = await issue();
    expect((await access(link.hash, "download", randomUUID())).status).toBe("unavailable");
    await access(link.hash, "authorize");
    expect((await access(link.hash, "download", randomUUID(), "c".repeat(64))).status).toBe("unavailable");
  });
  it("locks simultaneous transfers and permanently consumes on browser receipt", async () => {
    const link = await issue();
    await access(link.hash, "authorize");
    const transfer = randomUUID();
    expect((await access(link.hash, "download", transfer)).status).toBe("ready");
    expect((await access(link.hash, "download", randomUUID())).status).toBe("busy");
    expect((await access(link.hash, "complete", randomUUID())).status).toBe("unavailable");
    expect((await access(link.hash, "complete", transfer)).status).toBe("complete");
    expect((await access(link.hash, "complete", transfer)).status).toBe("complete");
    expect((await access(link.hash, "download", randomUUID())).status).toBe("unavailable");
  });
  it("allows failed-transfer recovery without extending two minutes; stale releases cannot unlock a new transfer", async () => {
    const link = await issue();
    await access(link.hash, "authorize");
    const firstTransfer = randomUUID();
    const first = await access(link.hash, "download", firstTransfer);
    await access(link.hash, "release", firstTransfer);
    const second = await access(link.hash, "download", randomUUID());
    expect(second.status).toBe("ready");
    expect(second.retry_until).toBe(first.retry_until);
    await access(link.hash, "release", firstTransfer);
    expect((await access(link.hash, "download", randomUUID())).status).toBe("busy");
    await db.exec("update links_download set retry_until=now()-interval '1 second'");
    expect((await access(link.hash, "download", randomUUID())).status).toBe("unavailable");
  });
  it("invalidates sessions and old links when PFX is replaced", async () => {
    const link = await issue();
    await access(link.hash, "authorize");
    await db.exec(`update certificados set hash_arquivo='${"d".repeat(64)}'`);
    expect((await access(link.hash, "download", randomUUID())).status).toBe("unavailable");
  });
  it("does not send an older queued update using the new certificate", async () => {
    await queue();
    const { ids, reservation } = await reserveEvents();
    await db.exec(`update certificados set hash_arquivo='${"d".repeat(64)}'`);
    expect((await issue(ids[0], reservation)).status).toBe("unavailable");
  });
  it("enforces link and session expiry", async () => {
    const link = await issue();
    await db.exec("update links_download set expires_at=now()-interval '1 second'");
    expect((await access(link.hash, "authorize")).status).toBe("unavailable");
    const fresh = await issue();
    await access(fresh.hash, "authorize");
    await db.exec("update links_download set session_expires_at=now()-interval '1 second'");
    expect((await access(fresh.hash, "download", randomUUID())).status).toBe("unavailable");
  });
  it("revokes RPC execution from public/anon/authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      const result = await db.query<{ allowed: boolean }>(`select has_function_privilege($1,'public.access_certificate_download(text,text,text,text,uuid)','EXECUTE') allowed`, [role]);
      expect(result.rows[0].allowed).toBe(false);
    }
  });
});
