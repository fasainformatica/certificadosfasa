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

  return (
    <section>
      <SectionHeader
        title="WhatsApp Bot"
        description="Dispositivos autorizados para enviar avisos internos de vencimento pelo WhatsApp Web."
      />
      <WhatsappDevicesPanel devices={devices ?? []} />
    </section>
  );
}
