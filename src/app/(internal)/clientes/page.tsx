import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildClientList, parseClientListFilters, type ClientListParams } from "@/lib/clientes/list-presentation";
import { readClientList } from "@/lib/clientes/read";
import { ClientesView } from "./clientes-view";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<ClientListParams> }) {
  const filters = parseClientListFilters(await searchParams);
  const records = await readClientList(await createServerSupabaseClient());
  return <ClientesView filters={filters} result={records === null ? null : buildClientList(records, filters)} />;
}
