import { requireAdmin } from "@/lib/auth/rbac";
import { formatMaskedPhone } from "@/lib/format";
import { getMetricDateContext, getOperationProviderLabel, lerMetricasOperacao } from "@/lib/metricas/operacao";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveNotificationProvider, getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { getWhatsAppExtensionConfigStatus } from "@/lib/whatsapp/extension/config";
import { getWhatsAppOperationalSafetySnapshot } from "@/lib/whatsapp/operational-safety";
import { analyzeWhatsAppPhoneQuality } from "@/lib/whatsapp/phone-quality";
import { WHATSAPP_EXTENSION_PROVIDER, WHATSAPP_NOTIFICATION_PROVIDERS } from "@/lib/whatsapp/providers";

import { CanalWhatsAppPanel } from "./canal-whatsapp-panel";

const CLIENT_PHONE_QUALITY_LIMIT = 5000;
const VISIBLE_MISSING_PHONES = 6;

export default async function WhatsappPage() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const euAtendoConfig = getEuAtendoConfigStatus();
  const extensionConfig = getWhatsAppExtensionConfigStatus();
  const activeProvider = getActiveNotificationProvider();
  const now = new Date();
  const dates = getMetricDateContext(now);
  const [operation, logsResult, settingsResult, clientsResult, durationResult] = await Promise.all([
    lerMetricasOperacao(admin, activeProvider, now).catch(() => null),
    admin
      .from("whatsapp_provider_logs")
      .select("id, provider, audience, operation, duration_ms, status, attempt_count, response_id, created_at")
      .in("provider", [...WHATSAPP_NOTIFICATION_PROVIDERS])
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("notification_settings")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle(),
    admin
      .from("clientes")
      .select("id, nome_razao_social, cnpj, telefone, whatsapp, whatsapp_notifications_enabled", { count: "exact" })
      .order("nome_razao_social", { ascending: true })
      .range(0, CLIENT_PHONE_QUALITY_LIMIT - 1),
    admin
      .from("whatsapp_provider_logs")
      .select("duration_ms")
      .in("provider", [...WHATSAPP_NOTIFICATION_PROVIDERS])
      .eq("status", "sent")
      .not("duration_ms", "is", null)
      .gte("created_at", dates.dayStart)
      .lt("created_at", dates.dayEnd)
      .limit(100),
  ]);
  const safety = settingsResult.error ? null : await getWhatsAppOperationalSafetySnapshot({
    admin,
    provider: activeProvider,
    settings: settingsResult.data ?? null,
  }).catch(() => null);

  const isExtension = activeProvider === WHATSAPP_EXTENSION_PROVIDER;
  const configured = isExtension
    ? extensionConfig.enabled && extensionConfig.tokenConfigured
    : euAtendoConfig.apiUrlConfigured && euAtendoConfig.tokenConfigured && euAtendoConfig.instanceConfigured;
  const automationEnabled = settingsResult.data?.enabled === true
    && (isExtension ? extensionConfig.enabled && extensionConfig.tokenConfigured : euAtendoConfig.enabled);

  const quality = clientsResult.error || !clientsResult.data ? null : analyzeWhatsAppPhoneQuality(clientsResult.data, {
    totalCount: clientsResult.count ?? clientsResult.data.length,
    sampleLimit: clientsResult.data.length,
  });

  const queueTotal = operation?.queue?.total ?? null;
  const lastSentAt = operation?.lastSentAt ?? null;
  const nextAllowedAt = operation?.state?.next_allowed_send_at ?? null;
  const intervalRunning = Boolean(nextAllowedAt && Date.parse(nextAllowedAt) > now.getTime());
  const sentAfterInterval = Boolean(lastSentAt && nextAllowedAt && Date.parse(lastSentAt) >= Date.parse(nextAllowedAt));
  const lockedUntil = operation?.state?.locked_until ?? null;
  const durations = durationResult.error ? null : (durationResult.data ?? []).map((item) => item.duration_ms ?? 0);
  // W15: only a cause the system already records; anything else stays unidentified.
  const knownReason = !automationEnabled && !settingsResult.error
    ? "A automação está desligada."
    : safety?.blockedMessage ?? "Motivo não identificado. Valide a conexão.";

  return (
    <CanalWhatsAppPanel
      key={String(safety?.dispatchPaused)}
      channel={getOperationProviderLabel(activeProvider)}
      configured={configured}
      automationEnabled={settingsResult.error ? null : automationEnabled}
      safety={safety}
      queue={{
        total: queueTotal,
        failed: operation?.failed ?? null,
        lastSentAt,
        lastSentUnavailable: !operation || operation.unavailable.includes("lastSentAt"),
        notice: queueTotal === null || operation?.unavailable.includes("state") ? "unavailable"
          : queueTotal === 0 ? "empty" : intervalRunning ? "interval" : sentAfterInterval ? "none" : "stalled",
        nextAllowedAt,
        knownReason,
        lockedUntil: lockedUntil && Date.parse(lockedUntil) > now.getTime() ? lockedUntil : null,
        sentMonth: operation?.sentMonth ?? null,
        processing: operation?.processing ?? null,
        averageMs: durations === null ? "unavailable" : durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length) : null,
      }}
      logs={logsResult.error ? null : (logsResult.data ?? []).map((log) => ({
        ...log,
        // The extension stores its acknowledgement code here, which is not a message ID.
        response_id: log.provider === WHATSAPP_EXTENSION_PROVIDER ? null : log.response_id,
      }))}
      quality={quality ? {
        ready: quality.readyToSendCount, missing: quality.missingPhoneCount, invalid: quality.invalidPhoneCount,
        repeated: quality.duplicateClientCount, groups: quality.duplicateGroupCount, blocked: quality.notificationsDisabledCount,
        limited: quality.analysisLimited ? { analyzed: quality.analyzedClients, total: quality.totalClients } : null,
        missingSamples: quality.issueSamples.filter((issue) => issue.type === "missing_phone").slice(0, VISIBLE_MISSING_PHONES)
          .map((issue) => ({ id: issue.clientId, name: issue.clientName, cnpj: issue.cnpj })),
        duplicates: quality.duplicateGroups.map((group) => ({ phone: formatMaskedPhone(group.normalizedPhone), clients: group.clients })),
      } : null}
    />
  );
}
