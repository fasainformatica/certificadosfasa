import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ClientListRecord } from "./list-presentation";

const selection = "id, nome_razao_social, cnpj, email, telefone, whatsapp, whatsapp_notifications_enabled, responsavel, updated_at, certificados(id)";
const batchSize = 500;

// Counts linked ids: the aggregate needs whole-row access that the session role does not have.
// Read through the caller's session/RLS. No service-role access or mutations.
export async function readClientList(client: SupabaseClient<Database>): Promise<ClientListRecord[] | null> {
  const records: ClientListRecord[] = [];
  try {
    for (let from = 0; ; from = records.length) {
      const { data, error, count } = await client.from("clientes").select(selection, { count: "exact" })
        .order("id", { ascending: true }).range(from, from + batchSize - 1);
      if (error || !data || count === null || (!data.length && records.length < count)) return null;
      records.push(...data.map(({ certificados, ...row }) => ({ ...row, certificateCount: certificados.length })));
      if (records.length >= count) return records;
    }
  } catch {
    return null;
  }
}

export async function readClientDetail(client: SupabaseClient<Database>, id: string) {
  try {
    const { data, error } = await client.from("clientes").select(selection).eq("id", id).maybeSingle();
    if (error) return { state: "error" as const, client: null };
    if (!data) return { state: "missing" as const, client: null };
    const { certificados, ...row } = data;
    return { state: "ok" as const, client: { ...row, certificateCount: certificados.length } };
  } catch {
    return { state: "error" as const, client: null };
  }
}
