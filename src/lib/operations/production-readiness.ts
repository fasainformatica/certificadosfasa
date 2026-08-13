import "server-only";

import { SETTINGS_ID } from "@/lib/notifications/engine";
import { CERTIFICATES_BUCKET } from "@/lib/storage/certificates";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { EuAtendoWhatsAppProvider } from "@/lib/whatsapp/euatendo/provider";
import { EUATENDO_PROVIDER, WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type ReadinessSeverity = "critical" | "warning";

export type ReadinessCheck = {
  id: string;
  label: string;
  ok: boolean;
  severity: ReadinessSeverity;
  message: string;
};

export type ProductionReadinessReport = {
  ready: boolean;
  generated_at: string;
  checks: ReadinessCheck[];
};

function check({
  id,
  label,
  ok,
  severity = "critical",
  okMessage,
  failMessage,
}: {
  id: string;
  label: string;
  ok: boolean;
  severity?: ReadinessSeverity;
  okMessage: string;
  failMessage: string;
}): ReadinessCheck {
  return {
    id,
    label,
    ok,
    severity,
    message: ok ? okMessage : failMessage,
  };
}

function hasValue(env: NodeJS.ProcessEnv, name: string) {
  return Boolean(env[name]?.trim());
}

function isUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidEncryptionKey(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

function isStrongSecret(value: string | undefined) {
  return Boolean(value && value.trim().length >= 32);
}

function finalize(checks: ReadinessCheck[]): ProductionReadinessReport {
  return {
    ready: checks.every((item) => item.ok || item.severity === "warning"),
    generated_at: new Date().toISOString(),
    checks,
  };
}

export function evaluateProductionEnvironment(env: NodeJS.ProcessEnv = process.env): ReadinessCheck[] {
  const euAtendoEnabled = ["1", "true", "yes", "sim"].includes(
    (env.EUATENDO_PROVIDER_ENABLED ?? "false").trim().toLowerCase(),
  );
  const activeProvider = (env.WHATSAPP_PROVIDER ?? EUATENDO_PROVIDER).trim().toLowerCase();
  const extensionSelected = activeProvider === WHATSAPP_EXTENSION_PROVIDER;
  const extensionEnabled = ["1", "true", "yes", "sim"].includes(
    (env.WHATSAPP_EXTENSION_ENABLED ?? "false").trim().toLowerCase(),
  );
  const extensionTokenConfigured = hasValue(env, "WHATSAPP_EXTENSION_TOKEN") || hasValue(env, "WHATSAPP_EXTENSION_API_TOKEN");

  return [
    check({
      id: "supabase_url",
      label: "Supabase URL publica",
      ok: isUrl(env.NEXT_PUBLIC_SUPABASE_URL),
      okMessage: "NEXT_PUBLIC_SUPABASE_URL configurada.",
      failMessage: "Configure NEXT_PUBLIC_SUPABASE_URL com uma URL valida.",
    }),
    check({
      id: "supabase_anon_key",
      label: "Supabase anon key",
      ok: hasValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      okMessage: "NEXT_PUBLIC_SUPABASE_ANON_KEY configurada.",
      failMessage: "Configure NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }),
    check({
      id: "supabase_admin_key",
      label: "Chave administrativa Supabase",
      ok: hasValue(env, "SUPABASE_SECRET_KEY") || hasValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
      okMessage: hasValue(env, "SUPABASE_SECRET_KEY")
        ? "SUPABASE_SECRET_KEY configurada no servidor."
        : "SUPABASE_SERVICE_ROLE_KEY configurada no servidor. Migre para SUPABASE_SECRET_KEY quando concluir a rotacao.",
      failMessage: "Configure SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY apenas no ambiente server-side.",
    }),
    check({
      id: "cert_encryption_key",
      label: "Chave de criptografia PFX",
      ok: isValidEncryptionKey(env.CERT_ENCRYPTION_KEY),
      okMessage: "CERT_ENCRYPTION_KEY tem 32 bytes em base64.",
      failMessage: "CERT_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.",
    }),
    check({
      id: "cron_secret",
      label: "Segredo dos crons",
      ok: isStrongSecret(env.CRON_SECRET),
      okMessage: "CRON_SECRET configurado com tamanho minimo.",
      failMessage: "Configure CRON_SECRET com pelo menos 32 caracteres.",
    }),
    check({
      id: "vercel_project",
      label: "Projeto Vercel",
      ok: Boolean(env.VERCEL === "1" || env.VERCEL_URL || isUrl(env.NEXT_PUBLIC_SITE_URL)),
      severity: "warning",
      okMessage: "Ambiente Vercel ou URL publica detectada.",
      failMessage: "Confirme que o deploy roda na Vercel e que os crons de vercel.json aparecem em Settings > Cron Jobs.",
    }),
    check({
      id: "whatsapp_provider",
      label: "Provider WhatsApp ativo",
      ok: activeProvider === EUATENDO_PROVIDER || activeProvider === WHATSAPP_EXTENSION_PROVIDER,
      okMessage: `WHATSAPP_PROVIDER configurado como ${activeProvider}.`,
      failMessage: "WHATSAPP_PROVIDER deve ser euatendo ou whatsapp_extension.",
    }),
    check({
      id: "euatendo_credentials",
      label: "Credenciais euAtendo",
      ok: !euAtendoEnabled || (hasValue(env, "EUATENDO_API_TOKEN") && hasValue(env, "EUATENDO_INSTANCE_ID")),
      okMessage: euAtendoEnabled
        ? "euAtendo habilitado com token e instancia configurados."
        : "euAtendo automatico desabilitado; credenciais nao sao obrigatorias para deploy.",
      failMessage: "EUATENDO_PROVIDER_ENABLED=true exige EUATENDO_API_TOKEN e EUATENDO_INSTANCE_ID.",
    }),
    check({
      id: "whatsapp_extension_credentials",
      label: "Credenciais da extensao WhatsApp",
      ok: !extensionSelected || (extensionEnabled && extensionTokenConfigured),
      okMessage: extensionSelected
        ? "Extensao selecionada com feature flag e token configurados."
        : "Extensao nao selecionada como provider ativo.",
      failMessage: "WHATSAPP_PROVIDER=whatsapp_extension exige WHATSAPP_EXTENSION_ENABLED=true e WHATSAPP_EXTENSION_TOKEN.",
    }),
  ];
}

async function appendAsyncCheck(
  checks: ReadinessCheck[],
  id: string,
  label: string,
  severity: ReadinessSeverity,
  run: () => Promise<string>,
) {
  try {
    checks.push({
      id,
      label,
      ok: true,
      severity,
      message: await run(),
    });
  } catch (error) {
    checks.push({
      id,
      label,
      ok: false,
      severity,
      message: error instanceof Error ? error.message : "Falha desconhecida na verificação.",
    });
  }
}

export async function getProductionReadinessReport({
  checkEuAtendoLive = false,
  admin,
}: {
  checkEuAtendoLive?: boolean;
  admin?: AdminClient;
} = {}): Promise<ProductionReadinessReport> {
  const checks = evaluateProductionEnvironment();
  let effectiveAdmin = admin;

  if (!effectiveAdmin) {
    try {
      effectiveAdmin = createSupabaseAdminClient();
    } catch (error) {
      checks.push({
        id: "supabase_admin_client",
        label: "Client Supabase Admin",
        ok: false,
        severity: "critical",
        message: error instanceof Error ? error.message : "Falha ao criar client Supabase Admin.",
      });

      return finalize(checks);
    }
  }
  const readyAdmin = effectiveAdmin;

  await appendAsyncCheck(checks, "supabase_schema", "Schema Supabase", "critical", async () => {
    const { data, error } = await readyAdmin
      .from("notification_settings")
      .select("id")
      .eq("id", SETTINGS_ID)
      .maybeSingle();

    if (error || !data) {
      throw new Error("Schema/migrations nao confirmados: notification_settings nao retornou o registro padrao.");
    }

    return "Schema operacional respondeu com notification_settings padrao.";
  });

  await appendAsyncCheck(checks, "storage_bucket", "Bucket privado de PFX", "critical", async () => {
    const { data, error } = await readyAdmin.storage.getBucket(CERTIFICATES_BUCKET);

    if (error || !data) {
      throw new Error("Bucket certificados-pfx nao encontrado no Supabase Storage.");
    }

    if (data.public) {
      throw new Error("Bucket certificados-pfx existe, mas esta publico. Ele deve ser privado.");
    }

    return "Bucket certificados-pfx existe e nao esta publico.";
  });

  await appendAsyncCheck(checks, "admin_user", "Usuario admin ativo", "critical", async () => {
    const { count, error } = await readyAdmin
      .from("user_profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true);

    if (error || !count) {
      throw new Error("Nenhum usuario admin ativo confirmado em user_profiles.");
    }

    return `${count} usuario(s) admin ativo(s) confirmado(s).`;
  });

  await appendAsyncCheck(checks, "dispatcher_tables", "Tabelas euAtendo", "critical", async () => {
    const { error } = await readyAdmin.from("whatsapp_dispatcher_state").select("provider").limit(1);

    if (error) {
      throw new Error("Tabelas/RLS euAtendo nao confirmadas. Aplique as migrations mais recentes.");
    }

    return "Tabelas do dispatcher euAtendo acessiveis via service role.";
  });

  const euAtendoStatus = getEuAtendoConfigStatus();

  checks.push({
    id: "euatendo_config",
    label: "Configuração euAtendo",
    ok: !euAtendoStatus.enabled || (euAtendoStatus.tokenConfigured && euAtendoStatus.instanceConfigured),
    severity: "critical",
    message: euAtendoStatus.enabled
      ? "Provider euAtendo habilitado e credenciais essenciais configuradas."
      : "Provider euAtendo automatico esta desabilitado por feature flag.",
  });

  if (checkEuAtendoLive && euAtendoStatus.tokenConfigured && euAtendoStatus.instanceConfigured) {
    await appendAsyncCheck(checks, "euatendo_live", "Conexao euAtendo", "critical", async () => {
      const health = await new EuAtendoWhatsAppProvider().checkHealth();

      if (!health.ok) {
        throw new Error(health.errorMessage ?? "Instancia euAtendo nao esta pronta.");
      }

      return "Instancia euAtendo localizada e conectada.";
    });
  } else {
    checks.push({
      id: "euatendo_live",
      label: "Conexao euAtendo",
      ok: true,
      severity: "warning",
      message: "Validação ao vivo não executada. Use ?live_euatendo=1 após configurar token e instância.",
    });
  }

  checks.push({
    id: "vercel_cron",
    label: "Cron Vercel",
    ok: true,
    severity: "warning",
    message: "Confirmação final exige logs da Vercel e Cron Jobs ativos; o app valida CRON_SECRET e expõe handlers GET/POST protegidos.",
  });

  return finalize(checks);
}
