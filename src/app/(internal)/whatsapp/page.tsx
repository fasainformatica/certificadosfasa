import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth/rbac";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { WhatsappDevicesPanel } from "./whatsapp-devices-panel";

export default async function WhatsappPage() {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const { data: devices } = await admin
    .from("whatsapp_devices")
    .select(
      "id, name, status, is_primary_sender, connected_phone, last_seen_at, created_at, revoked_at",
    )
    .order("created_at", { ascending: false });
  const today = new Date().toISOString().slice(0, 10);
  const [waitingResult, readyTodayResult, plannedResult, sentResult, failedResult, lastSentResult] = await Promise.all([
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retry", "reserved", "processing"])
      .lte("send_date", today),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retry"])
      .lte("send_date", today),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "retry"])
      .gt("send_date", today),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", `${today}T00:00:00`),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("notification_events")
      .select("sent_at")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <section>
      <SectionHeader
        title="WhatsApp Bot"
        description="Dispositivos autorizados para enviar avisos internos de vencimento pelo WhatsApp Web."
      />
      <WhatsappDevicesPanel
        devices={devices ?? []}
        stats={{
          waiting: waitingResult.count ?? 0,
          readyToday: readyTodayResult.count ?? 0,
          planned: plannedResult.count ?? 0,
          sentToday: sentResult.count ?? 0,
          failed: failedResult.count ?? 0,
          lastSentAt: lastSentResult.data?.sent_at ?? null,
        }}
      />
    </section>
  );
}
