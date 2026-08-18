import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiRoots = [
  path.join(root, "src", "app", "api"),
  path.join(root, "src", "app", "sistema", "api"),
];
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const apiRoutePolicies = [
  {
    name: "cron protegido por CRON_SECRET",
    matches: (relativePath) => relativePath.startsWith(path.join("src", "app", "api", "cron") + path.sep),
    requiredSource: ["CRON_SECRET", "getBearerSecret"],
    requiredMethodGuard: "handleCronRequest(",
  },
  {
    name: "download publico protegido por token, senha e rate limit",
    matches: (relativePath) => relativePath.startsWith(path.join("src", "app", "api", "download") + path.sep),
    requiredSource: [
      "hashPublicDownloadToken",
      "verifyDownloadPassword",
      "tentativas_invalidas",
      "bloqueado_ate",
      "createSignedUrl",
    ],
    allowServiceRole: true,
  },
  {
    name: "logout publico sem service role",
    matches: (relativePath) => relativePath === path.join("src", "app", "api", "auth", "logout", "route.ts"),
    requiredSource: ["createServerSupabaseClient", "clearSupabaseAuthCookies"],
    forbiddenSource: ["createSupabaseAdminClient"],
  },
  {
    name: "extensao WhatsApp protegida por Basic Auth",
    matches: (relativePath) => relativePath.startsWith(path.join("src", "app", "sistema", "api", "whatsapp") + path.sep),
    requiredSource: ["authenticateWhatsAppExtension"],
    requiredMethodGuard: "authenticateWhatsAppExtension(",
    optionsGuard: "extensionOptions(",
    allowServiceRole: true,
  },
  {
    name: "notificador Windows protegido por bearer token",
    matches: (relativePath) =>
      relativePath.startsWith(path.join("src", "app", "api", "internal-notifications", "windows") + path.sep),
    requiredSource: ["authenticateWindowsNotifier"],
    requiredMethodGuard: "authenticateWindowsNotifier(",
    allowServiceRole: true,
  },
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

function findFunctionBody(source, methodName) {
  const match = new RegExp(`export\\s+(?:async\\s+)?function\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{`).exec(source);

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

function findMethodBody(source, methodName) {
  const directBody = findFunctionBody(source, methodName);

  if (directBody) {
    return directBody;
  }

  const aliasMatch = new RegExp(`export\\s+const\\s+${methodName}\\s*=\\s*([A-Z]+)\\s*;`).exec(source);

  if (!aliasMatch) {
    return null;
  }

  return findFunctionBody(source, aliasMatch[1]);
}

function listExportedMethods(source) {
  const exported = new Set();

  for (const method of methods) {
    if (new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`).test(source)) {
      exported.add(method);
    }

    if (new RegExp(`export\\s+const\\s+${method}\\s*=`).test(source)) {
      exported.add(method);
    }
  }

  return [...exported];
}

function routePolicyFor(relativePath) {
  return apiRoutePolicies.find((policy) => policy.matches(relativePath)) ?? null;
}

const failures = [];
const routeFiles = apiRoots.flatMap((apiRoot) => listRouteFiles(apiRoot));

for (const filePath of routeFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  const usesServiceRole = source.includes("createSupabaseAdminClient");
  const relative = path.relative(root, filePath);
  const routePolicy = routePolicyFor(relative);
  const exportedMethods = listExportedMethods(source);

  if (routePolicy) {
    for (const required of routePolicy.requiredSource ?? []) {
      if (!source.includes(required)) {
        failures.push(`${relative}: rota ${routePolicy.name} sem ${required}.`);
      }
    }

    for (const forbidden of routePolicy.forbiddenSource ?? []) {
      if (source.includes(forbidden)) {
        failures.push(`${relative}: rota ${routePolicy.name} nao pode conter ${forbidden}.`);
      }
    }

    if (routePolicy.requiredMethodGuard) {
      for (const method of exportedMethods) {
        const body = findMethodBody(source, method);

        if (!body) {
          failures.push(`${relative}: nao foi possivel ler o metodo ${method}.`);
          continue;
        }

        if (!body.includes(routePolicy.requiredMethodGuard)) {
          failures.push(`${relative}: ${method} nao aplica ${routePolicy.requiredMethodGuard}.`);
        }
      }
    }

    if (routePolicy.optionsGuard && /export\s+function\s+OPTIONS\s*\(/.test(source)) {
      const optionsBody = findFunctionBody(source, "OPTIONS");

      if (!optionsBody?.includes(routePolicy.optionsGuard)) {
        failures.push(`${relative}: OPTIONS nao aplica ${routePolicy.optionsGuard}.`);
      }
    }

    if (!usesServiceRole || routePolicy.allowServiceRole) {
      continue;
    }
  }

  if (!routePolicy) {
    const usesInternalRbac = source.includes("requireApiUser(");

    if (!usesInternalRbac) {
      failures.push(`${relative}: rota interna sem requireApiUser ou politica publica explicita.`);
      continue;
    }

    for (const method of exportedMethods) {
      const body = findMethodBody(source, method);

      if (!body) {
        failures.push(`${relative}: nao foi possivel ler o metodo ${method}.`);
        continue;
      }

      if (!body.includes("requireApiUser(")) {
        failures.push(`${relative}: ${method} nao valida requireApiUser.`);
      }
    }
  }

  if (!usesServiceRole) {
    continue;
  }

  const usesInternalRbac = source.includes("requireApiUser(");
  const usesExtensionAuth = source.includes("authenticateWhatsAppExtension(");
  const usesWindowsNotifierAuth = source.includes("authenticateWindowsNotifier(");

  if (!usesInternalRbac && !usesExtensionAuth && !usesWindowsNotifierAuth) {
    failures.push(`${relative}: usa service role sem requireApiUser, authenticateWhatsAppExtension ou authenticateWindowsNotifier.`);
    continue;
  }

  for (const method of methods) {
    const body = findMethodBody(source, method);

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
