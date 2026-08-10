import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiRoots = [
  path.join(root, "src", "app", "api"),
  path.join(root, "src", "app", "sistema", "api"),
];
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const allowedPublicPrefixes = [
  path.join("src", "app", "api", "cron") + path.sep,
  path.join("src", "app", "api", "download") + path.sep,
];

function listRouteFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return listRouteFiles(fullPath);
    }

    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function isAllowedPublicRoute(filePath) {
  const relative = path.relative(root, filePath);
  return allowedPublicPrefixes.some((prefix) => relative.startsWith(prefix));
}

function findFunctionBody(source, methodName) {
  const match = new RegExp(`export\\s+async\\s+function\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{`).exec(source);

  if (!match) {
    return null;
  }

  let depth = 0;
  let start = match.index + match[0].length - 1;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start + 1, index);
      }
    }
  }

  return null;
}

const failures = [];

for (const filePath of apiRoots.flatMap((apiRoot) => listRouteFiles(apiRoot))) {
  const source = fs.readFileSync(filePath, "utf8");
  const usesServiceRole = source.includes("createSupabaseAdminClient");

  if (!usesServiceRole || isAllowedPublicRoute(filePath)) {
    continue;
  }

  const relative = path.relative(root, filePath);

  const usesInternalRbac = source.includes("requireApiUser(");
  const usesExtensionAuth = source.includes("authenticateWhatsAppExtension(");
  const usesWindowsNotifierAuth = source.includes("authenticateWindowsNotifier(");

  if (!usesInternalRbac && !usesExtensionAuth && !usesWindowsNotifierAuth) {
    failures.push(`${relative}: usa service role sem requireApiUser, authenticateWhatsAppExtension ou authenticateWindowsNotifier.`);
    continue;
  }

  for (const method of methods) {
    const body = findFunctionBody(source, method);

    if (!body || !body.includes("createSupabaseAdminClient(")) {
      continue;
    }

    const authIndexes = [
      body.indexOf("requireApiUser("),
      body.indexOf("authenticateWhatsAppExtension("),
      body.indexOf("authenticateWindowsNotifier("),
    ].filter((index) => index >= 0);
    const authIndex = authIndexes.length ? Math.min(...authIndexes) : -1;
    const adminIndex = body.indexOf("createSupabaseAdminClient(");

    if (authIndex < 0 || adminIndex < authIndex) {
      failures.push(`${relative}: ${method} cria Supabase Admin antes de validar autenticacao.`);
    }
  }
}

if (failures.length > 0) {
  console.error("Falha na checagem service-role/RBAC:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Service-role/RBAC check passed.");
