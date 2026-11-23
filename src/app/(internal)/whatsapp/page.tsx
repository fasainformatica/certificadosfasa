import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth/rbac";
import { getMetricDateContext, getOperationProviderLabel, lerMetricasOperacao } from "@/lib/metricas/operacao";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveNotificationProvider, getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { getWhatsAppExtensionConfigStatus } from "@/lib/whatsapp/extension/config";
import { getWhatsAppOperationalSafetySnapshot } from "@/lib/whatsapp/operational-safety";
import { analyzeWhatsAppPhoneQuality } from "@/lib/whatsapp/phone-quality";
import { WHATSAPP_NOTIFICATION_PROVIDERS } from "@/lib/whatsapp/providers";

import { CanalWhatsAppPanel } from "./canal-whatsapp-panel";

const CLIENT_PHONE_QUALITY_LIMIT = 5000;

export default async function WhatsappPage() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const euAtendoConfig = getEuAtendoConfigStatus();
  const extensionConfig = getWhatsAppExtensionConfigStatus();
  const activeProvider = getActiveNotificationProvider();
  const [
    operation,
    euAtendoLogsResult,
    notificationSettingsResult,
    clientPhoneQualityResult,
  ] = await Promise.all([
    lerMetricasOperacao(admin, activeProvider).catch(() => null),
    admin
      .from("whatsapp_provider_logs")
      .select("id, event_id, audience, operation, telefone_mascarado, template_type, duration_ms, status, attempt_count, error_code, error_message, response_id, created_at")
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
  ]);
  const dates = operation ?? getMetricDateContext();
  const euAtendoAvgDurationResult = await admin
    .from("whatsapp_provider_logs")
    .select("duration_ms")
    .in("provider", [...WHATSAPP_NOTIFICATION_PROVIDERS])
    .eq("status", "sent")
    .not("duration_ms", "is", null)
    .gte("created_at", dates.dayStart)
    .lt("created_at", dates.dayEnd)
    .limit(100);
  const safety = await getWhatsAppOperationalSafetySnapshot({
    admin,
    provider: activeProvider,
    settings: notificationSettingsResult.data ?? null,
  });
  const phoneQuality = analyzeWhatsAppPhoneQuality(clientPhoneQualityResult.data ?? [], {
    totalCount: clientPhoneQualityResult.count ?? clientPhoneQualityResult.data?.length ?? 0,
  });
  const stats = operation?.queue && operation.failed !== null && operation.sentToday !== null
    && operation.sentMonth !== null && operation.processing !== null
    && !operation.unavailable.includes("lastSentAt") && !euAtendoAvgDurationResult.error
    ? {
        pending: operation.queue.pending,
        retry: operation.queue.retry,
        failed: operation.failed,
        sentToday: operation.sentToday,
        sentMonth: operation.sentMonth,
        processing: operation.processing,
        lastSentAt: operation.lastSentAt,
        averageDurationMs: euAtendoAvgDurationResult.data?.length
          ? Math.round(euAtendoAvgDurationResult.data.reduce((total, item) => total + (item.duration_ms ?? 0), 0)
            / euAtendoAvgDurationResult.data.length)
          : null,
      }
    : null;

  return (
    <section>
      <SectionHeader
        title="Automação do WhatsApp"
        description="Valide a integração e acompanhe o envio automático de mensagens."
      />
      {operation?.unavailable.includes("state") ? <p>Estado de despacho indisponível. Não foi possível carregar.</p> : null}
      {stats ? <CanalWhatsAppPanel
        euAtendo={{
          config: euAtendoConfig,
          extensionConfig,
          activeProvider,
          activeProviderLabel: getOperationProviderLabel(activeProvider),
          notificationSettingsEnabled: notificationSettingsResult.data?.enabled === true,
          safety,
          phoneQuality,
          state: operation?.state ?? null,
          logs: euAtendoLogsResult.data ?? [],
          stats,
        }}
      /> : <p>Indisponível. Não foi possível carregar as métricas do painel do WhatsApp.</p>}
    </section>
  );
}
