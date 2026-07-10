import { SectionHeader } from "@/components/ui/section-header";
import { requireAdmin } from "@/lib/auth/rbac";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { WhatsappDevicesPanel } from "./whatsapp-devices-panel";

function numberFromStats(stats: Json | null, key: string) {
  if (typeof stats !== "object" || stats === null || Array.isArray(stats)) {
    return 0;
  }

  const value = stats[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

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
  const [statsResult, plannedResult, sentTodayResult, lastSentResult] = await Promise.all([
    admin.rpc("get_whatsapp_bot_message_stats"),
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
      .select("sent_at")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const stats = statsResult.data ?? null;
  const readyToday = numberFromStats(stats, "waiting_to_send");
  const waiting =
    readyToday +
    numberFromStats(stats, "reserved") +
    numberFromStats(stats, "processing");

  return (
    <section>
      <SectionHeader
        title="WhatsApp Bot"
        description="Dispositivos autorizados para enviar avisos internos de vencimento pelo WhatsApp Web."
      />
      <WhatsappDevicesPanel
        devices={devices ?? []}
        stats={{
          waiting,
          readyToday,
          planned: plannedResult.count ?? 0,
          sentToday: sentTodayResult.count ?? 0,
          failed: numberFromStats(stats, "failed"),
          lastSentAt: lastSentResult.data?.sent_at ?? null,
        }}
      />
    </section>
  );
}
