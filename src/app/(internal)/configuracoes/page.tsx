import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  SETTINGS_ID,
  clampNotificationDelaySettings,
  clampNotificationPollingInterval,
  ensureDefaultNotificationTemplates,
} from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { ConfiguracoesForm } from "./configuracoes-form";

export default async function ConfiguracoesPage() {
  const user = await requireAdmin();
  const admin = createSupabaseAdminClient();
  await ensureDefaultNotificationTemplates();
  const { data: notificationSettings } = await admin
    .from("notification_settings")
    .select("*")
    .eq("id", SETTINGS_ID)
    .single();
  const { data: templates } = await admin
    .from("notification_templates")
    .select("id, type, content")
    .in("type", ["certificate_expiring", "certificate_expired", "client_certificate_expiring", "client_certificate_expired"])
    .order("type", { ascending: true });
  const { data: recipients } = await admin
    .from("notification_recipients")
    .select("id, nome, telefone, telefone_normalizado, ativo, created_at, updated_at")
    .order("created_at", { ascending: true });
  const delaySettings = clampNotificationDelaySettings(notificationSettings);
  const pollingInterval = clampNotificationPollingInterval(notificationSettings?.polling_interval_seconds);
  const expiringTemplate = templates?.find((item) => item.type === "certificate_expiring");
  const expiredTemplate = templates?.find((item) => item.type === "certificate_expired");
  const clientExpiringTemplate = templates?.find((item) => item.type === "client_certificate_expiring");
  const clientExpiredTemplate = templates?.find((item) => item.type === "client_certificate_expired");

  return (
    <section>
      <SectionHeader
        title="Configurações do sistema"
        description="Configure regras de envio, mensagens, destinatários e segurança."
      />
      <ConfiguracoesForm
        canEdit={user.role === "admin"}
        userEmail={user.email}
        userRole={user.role}
        initialSettings={{
          enabled: notificationSettings?.enabled ?? false,
          expired_notifications_enabled: notificationSettings?.expired_notifications_enabled ?? true,
          dias_aviso_vencimento: notificationSettings?.dias_aviso_vencimento ?? [30, 15, 1],
          delay_minimo_segundos: delaySettings.delay_minimo_segundos,
          delay_maximo_segundos: delaySettings.delay_maximo_segundos,
          max_attempts: notificationSettings?.max_attempts ?? 3,
          polling_interval_seconds: pollingInterval,
          send_window_start: notificationSettings?.send_window_start ?? "08:00",
          send_window_end: notificationSettings?.send_window_end ?? "18:00",
          timezone: notificationSettings?.timezone ?? "America/Sao_Paulo",
        }}
        initialExpiringTemplate={{
          id: expiringTemplate?.id ?? "",
          content: expiringTemplate?.content ?? "",
        }}
        initialExpiredTemplate={{
          id: expiredTemplate?.id ?? "",
          content: expiredTemplate?.content ?? "",
        }}
        initialClientExpiringTemplate={{
          id: clientExpiringTemplate?.id ?? "",
          content: clientExpiringTemplate?.content ?? "",
        }}
        initialClientExpiredTemplate={{
          id: clientExpiredTemplate?.id ?? "",
          content: clientExpiredTemplate?.content ?? "",
        }}
        initialRecipients={recipients ?? []}
      />
    </section>
  );
}

