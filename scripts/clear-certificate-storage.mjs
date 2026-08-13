import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const BUCKET = "certificados-pfx";
const PREFIX = "certificados";
const REMOVE_CHUNK_SIZE = 100;

function parseEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = parseEnvValue(trimmed.slice(separatorIndex + 1));

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

async function listStoragePathsRecursive(supabase, prefix, depth = 0) {
  if (depth > 8) {
    return [];
  }

  const paths = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const item of data) {
      const itemPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.id === null) {
        paths.push(...(await listStoragePathsRecursive(supabase, itemPath, depth + 1)));
        continue;
      }

      paths.push(itemPath);
    }

    if (data.length < 1000) {
      break;
    }

    offset += data.length;
  }

  return paths;
}

async function main() {
  const args = new Set(process.argv.slice(2));

  if (!args.has("--confirm")) {
    console.error("Operacao bloqueada. Execute com --confirm para apagar os PFX do Storage.");
    process.exit(1);
  }

  loadLocalEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !adminKey) {
    console.error("Variaveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY sao obrigatorias.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const paths = await listStoragePathsRecursive(supabase, PREFIX);

  if (paths.length === 0) {
    console.log("Nenhum arquivo PFX encontrado no Storage.");
    return;
  }

  let removed = 0;

  for (let index = 0; index < paths.length; index += REMOVE_CHUNK_SIZE) {
    const chunk = paths.slice(index, index + REMOVE_CHUNK_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);

    if (error) {
      throw new Error(error.message);
    }

    removed += chunk.length;
    console.log(`Removidos ${removed}/${paths.length} arquivos do Storage.`);
  }

  console.log(`Limpeza concluida. Arquivos removidos: ${removed}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha ao limpar Storage.");
  process.exit(1);
});
