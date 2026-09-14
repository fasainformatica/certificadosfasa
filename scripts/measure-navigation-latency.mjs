import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Configure o ambiente local antes de medir as consultas.");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tables = ["notification_settings", "certificados", "notification_events"];

// Apenas HEAD: nao transfere registros nem grava dados ou dispara notificacoes.
async function measure(table) {
  const start = performance.now();
  const result = await db.from(table)
    .select("id", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(10000));
  return { table, ms: Math.round(performance.now() - start), status: result.status, ok: !result.error };
}

await measure(tables[0]);

for (const mode of ["sequential", "parallel"]) {
  const start = performance.now();
  const results = [];
  if (mode === "parallel") {
    results.push(...await Promise.all(tables.map(measure)));
  } else {
    for (const table of tables) results.push(await measure(table));
  }
  console.log(JSON.stringify({ mode, totalMs: Math.round(performance.now() - start), results }));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
