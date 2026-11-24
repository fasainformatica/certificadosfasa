import "server-only";

import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { CentralEvent, CentralFilters } from "./central-list";
import { buildNotificationEventSearchFilter } from "./event-search";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type EventRow = Database["public"]["Tables"]["notification_events"]["Row"];
const selection = "id, certificado_id, recipient_id, telefone_destino, type, audience, provider, payload, dias_restantes, send_date, status, sent_at, failed_at, attempt_count, next_retry_at, error_message, provider_message_id, created_at, updated_at, clientes(nome_razao_social, cnpj, telefone, whatsapp), certificados(nome_titular, cnpj, data_vencimento), notification_recipients(nome)";
const batchSize = 500;

/** Read-only. Loads the whole filtered set so counts, order and grouping never depend on the page. */
export async function readCentralEvents(admin: AdminClient, filters: CentralFilters): Promise<CentralEvent[] | null> {
  try {
    const search = filters.search ? await buildNotificationEventSearchFilter(admin, filters.search) : null;
    const events: CentralEvent[] = [];
    for (;;) {
      let query = admin.from("notification_events").select(selection, { count: "exact" })
        .order("id").range(events.length, events.length + batchSize - 1);
      if (filters.type) query = query.eq("type", filters.type as EventRow["type"]);
      if (filters.audience) query = query.eq("audience", filters.audience as EventRow["audience"]);
      if (filters.provider) query = query.eq("provider", filters.provider as EventRow["provider"]);
      if (filters.recipientId) query = query.eq("recipient_id", filters.recipientId);
      if (filters.date) query = query.eq("send_date", filters.date);
      if (search) query = query.or(search);
      const { data, error, count } = await query;
      if (error || !data || count === null || (!data.length && events.length < count)) return null;
      events.push(...data);
      if (events.length >= count) return events;
    }
  } catch {
    return null;
  }
}
