import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const failures = [];
const warnings = [];
const checks = [];

function ok(name, detail = "") {
  checks.push({ name, detail });
}

function fail(name, detail) {
  failures.push({ name, detail });
}

function warn(name, detail) {
  warnings.push({ name, detail });
}

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), "utf8");
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function isProbablyTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ![
    ".avif",
    ".bmp",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lock",
    ".pdf",
    ".pfx",
    ".png",
    ".webp",
    ".zip",
    ".exe",
  ].includes(ext);
}

function trackedFiles() {
  return git(["ls-files"]).split(/\r?\n/).filter(Boolean);
}

const tracked = trackedFiles();
const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);

const forbiddenTrackedFiles = [
  ".env",
  ".env.local",
  ".env.production",
  "tools/windows-notifier/config.local.json",
  "tools/windows-notifier-app/config.local.json",
  "tools/windows-notifier-app/dist/InstalarNotificadorFasa-Unico.exe",
];

for (const filePath of forbiddenTrackedFiles) {
  if (tracked.includes(filePath)) {
    fail("Arquivo sensivel rastreado pelo Git", filePath);
  }
}

if (!failures.some((entry) => entry.name === "Arquivo sensivel rastreado pelo Git")) {
  ok("Arquivos sensiveis locais nao estao rastreados", forbiddenTrackedFiles.join(", "));
}

const envHistory = git(["log", "--all", "--name-only", "--pretty=format:", "--", ".env", ".env.*"])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const envHistoryLeaks = envHistory.filter((filePath) => filePath !== ".env.example");

if (envHistoryLeaks.length > 0) {
  fail("Historico Git contem arquivo .env real", Array.from(new Set(envHistoryLeaks)).join(", "));
} else {
  ok("Historico local nao aponta .env real", "Apenas .env.example foi encontrado, quando aplicavel.");
}

const secretPatterns = [
  {
    name: "JWT/API key hardcoded",
    regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Supabase secret key hardcoded",
    regex: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: "Private key hardcoded",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: "Service role publica por engano",
    regex: /NEXT_PUBLIC_[A-Z0-9_]*SERVICE[_A-Z0-9]*ROLE[A-Z0-9_]*/g,
  },
];

const secretScanExcludedFiles = new Set([
  ...forbiddenTrackedFiles,
  ".env.local.example",
]);
const secretScanFiles = Array.from(new Set([...tracked, ...untracked])).filter((filePath) => {
  if (secretScanExcludedFiles.has(filePath)) {
    return false;
  }

  if (/^\.env(?:\.|$)/.test(filePath) && filePath !== ".env.example") {
    return false;
  }

  return true;
});

for (const filePath of secretScanFiles) {
  if (!isProbablyTextFile(filePath)) {
    continue;
  }

  const absolutePath = path.join(root, filePath);
  let source = "";

  try {
    source = fs.readFileSync(absolutePath, "utf8");
  } catch {
    continue;
  }

  for (const pattern of secretPatterns) {
    for (const match of source.matchAll(pattern.regex)) {
      fail(pattern.name, `${filePath}:${lineNumber(source, match.index ?? 0)}`);
    }
  }
}

if (!failures.some((entry) => entry.name.endsWith("hardcoded") || entry.name === "Service role publica por engano")) {
  ok("Scan local de secrets em arquivos versionados e novos nao encontrou valores criticos", "Padroes JWT, sb_secret e private key.");
}

const nextConfig = read("next.config.ts");

for (const expected of [
  "productionBrowserSourceMaps: false",
  "poweredByHeader: false",
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Frame-Options",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "frame-ancestors 'none'",
]) {
  if (!nextConfig.includes(expected)) {
    fail("Hardening HTTP ausente no Next.js", expected);
  }
}

if (!failures.some((entry) => entry.name === "Hardening HTTP ausente no Next.js")) {
  ok("Headers de seguranca e sourcemaps configurados", "next.config.ts");
}

for (const filePath of ["src/lib/supabase/admin.ts", "src/lib/supabase/env.ts"]) {
  if (!read(filePath).includes('import "server-only";')) {
    fail("Modulo server-side sem server-only", filePath);
  }
}

if (!failures.some((entry) => entry.name === "Modulo server-side sem server-only")) {
  ok("Modulos de Supabase server-side protegidos por server-only", "admin.ts e env.ts");
}

const hardeningMigration = "database/migrations/20260813100000_security_incident_hardening.sql";
const hardeningSql = read(hardeningMigration);
const signupLockMigration = "database/migrations/20260813103000_lock_public_signup_profiles_and_rpc_privileges.sql";
const signupLockSql = read(signupLockMigration);
const requiredTables = [
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

for (const tableName of requiredTables) {
  if (!hardeningSql.includes(`alter table public.${tableName} enable row level security;`)) {
    fail("Migration de RLS incompleta", tableName);
  }
}

for (const expected of [
  "revoke usage on schema public from public, anon;",
  "revoke all privileges on all tables in schema public from public, anon;",
  "grant all privileges on all tables in schema public to service_role;",
  "grant execute on function public.can_read_internal() to authenticated;",
  "revoke all privileges on storage.buckets from public, anon, authenticated;",
  "revoke all privileges on storage.objects from public, anon, authenticated;",
  "grant all privileges on storage.objects to service_role;",
  "public = false",
]) {
  if (!hardeningSql.includes(expected)) {
    fail("Migration de hardening incompleta", expected);
  }
}

if (!failures.some((entry) => entry.name.startsWith("Migration"))) {
  ok("Migration de hardening cobre RLS, anon e bucket privado", hardeningMigration);
}

for (const expected of [
  "create or replace function public.handle_new_user()",
  "values (new.id, 'financeiro', false)",
  "revoke execute on function public.handle_new_user() from public, anon, authenticated;",
  "grant execute on function public.is_admin() to authenticated, service_role;",
]) {
  if (!signupLockSql.includes(expected)) {
    fail("Migration de bloqueio de signup incompleta", expected);
  }
}

if (!failures.some((entry) => entry.name === "Migration de bloqueio de signup incompleta")) {
  ok("Novos usuarios do Supabase Auth nascem inativos ate aprovacao administrativa", signupLockMigration);
}

if (!fs.existsSync(path.join(root, "database/scripts/SECURITY_AUDIT_SUPABASE.sql"))) {
  fail("SQL de auditoria Supabase ausente", "database/scripts/SECURITY_AUDIT_SUPABASE.sql");
} else {
  ok("SQL de auditoria Supabase criado", "database/scripts/SECURITY_AUDIT_SUPABASE.sql");
}

if (!fs.existsSync(path.join(root, "database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql"))) {
  fail("SQL de lockdown do projeto mftv ausente", "database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql");
} else {
  const mftvSql = read("database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql");

  for (const expected of ["modulos", "user_roles", "suporte_tickets", "enable row level security", "revoke usage on schema public from public, anon"]) {
    if (!mftvSql.includes(expected)) {
      fail("SQL de lockdown do projeto mftv incompleto", expected);
    }
  }

  if (!failures.some((entry) => entry.name === "SQL de lockdown do projeto mftv incompleto")) {
    ok("SQL separado de lockdown para mftvsgzrujkalssiriny criado", "database/scripts/SECURITY_LOCKDOWN_MFTVSGZRUJKALSSIRINY.sql");
  }
}

if (!fs.existsSync(path.join(root, "database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql"))) {
  fail("SQL de auditoria de logs historicos ausente", "database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql");
} else {
  const legacyAuditSql = read("database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql");

  for (const expected of [
    "security_redact_text",
    "audit_logs",
    "storage_reconciliation_jobs",
    "notification_events",
    "whatsapp_provider_logs",
    "provider_response",
    "payload",
    "redacted_sample",
  ]) {
    if (!legacyAuditSql.includes(expected)) {
      fail("SQL de auditoria de logs historicos incompleto", expected);
    }
  }

  if (!failures.some((entry) => entry.name === "SQL de auditoria de logs historicos incompleto")) {
    ok("SQL read-only audita exposicao historica em logs", "database/scripts/SECURITY_AUDIT_LEGACY_LOG_EXPOSURE.sql");
  }
}

if (!fs.existsSync(path.join(root, "database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql"))) {
  fail("SQL de limpeza controlada de logs historicos ausente", "database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql");
} else {
  const sanitizeLegacySql = read("database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql");

  for (const expected of [
    "begin;",
    "security_safe_operational_message",
    "security_sanitized_json_log",
    "security_redact_notification_payload",
    "notification_events.payload.phone_keys",
    "whatsapp_provider_logs.metadata",
    "rollback;",
  ]) {
    if (!sanitizeLegacySql.includes(expected)) {
      fail("SQL de limpeza controlada de logs historicos incompleto", expected);
    }
  }

  if (sanitizeLegacySql.includes("\ncommit;")) {
    fail("SQL de limpeza controlada nao pode comitar por padrao", "Troque manualmente ROLLBACK por COMMIT apenas apos revisar.");
  }

  if (!failures.some((entry) => entry.name === "SQL de limpeza controlada de logs historicos incompleto")) {
    ok("SQL de limpeza de logs historicos usa ROLLBACK por padrao", "database/scripts/SECURITY_SANITIZE_LEGACY_LOGS.sql");
  }
}

try {
  execFileSync(process.execPath, ["scripts/check-service-role-rbac.mjs"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  ok("Rotas API e service role continuam protegidos por autenticacao explicita", "scripts/check-service-role-rbac.mjs");
} catch (error) {
  fail("Service role/RBAC falhou", error.stderr?.toString() || error.message);
}

if (tracked.includes(".env.example")) {
  const envExample = read(".env.example");

  if (envExample.includes("SUPABASE_SECRET_KEY=coloque_a_secret_key_apenas_no_backend")) {
    ok("Template de env prioriza secret key moderna do Supabase", ".env.example");
  } else {
    fail("Template de env sem SUPABASE_SECRET_KEY", ".env.example");
  }

  if (envExample.includes("SUPABASE_SERVICE_ROLE_KEY=opcional_legado_apenas_no_backend")) {
    warn(
      ".env.example mantem fallback legado SUPABASE_SERVICE_ROLE_KEY",
      "Valor e placeholder; use apenas se ainda nao migrou para SUPABASE_SECRET_KEY.",
    );
  }
}

console.log("Auditoria local de seguranca - certificadosfasa");
console.log("");

for (const check of checks) {
  console.log(`OK  ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

for (const warning of warnings) {
  console.log(`AVISO  ${warning.name}: ${warning.detail}`);
}

if (failures.length > 0) {
  console.error("");
  console.error("FALHAS:");

  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.detail}`);
  }

  process.exit(1);
}

console.log("");
console.log("Resultado: nenhuma falha local encontrada.");
