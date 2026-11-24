import Link from "next/link";
import { FilterBar, KpiCard, KpiGrid, Panel } from "@/components/ui/spec";
import spec from "@/components/ui/spec/spec.module.css";
import { clientListHref, type ClientListFilters, type buildClientList } from "@/lib/clientes/list-presentation";
import { ClientesTable } from "./clientes-table";
import styles from "./clientes.module.css";

export function ClientesView({ filters, result }: {
  filters: ClientListFilters; result: ReturnType<typeof buildClientList> | null;
}) {
  const query = clientListHref(filters).split("?")[1] ?? "";
  const state = result ? "ok" : "error";
  return <section className={styles.page}>
    <header className={styles.header}>
      <div><h1>Clientes</h1><p>Contato e responsável de cada cliente para os avisos de vencimento.</p></div>
      <Link href="/certificados/novo" className={`${spec.root} ${spec.button}`} data-variant="secondary" data-size="md">Novo certificado</Link>
    </header>
    <KpiGrid>
      <KpiCard label="Clientes" value={result?.total ?? null} description={result?.withoutCertificate ? `${result.withoutCertificate} sem certificado vinculado` : "Total cadastrado"} state={state} />
      <KpiCard label="Com WhatsApp" value={result?.withWhatsApp ?? null} description="Podem receber avisos" href={clientListHref(filters, { contato: "com_whatsapp", page: 1 })} state={state} />
      <KpiCard label="Sem contato" value={result?.withoutContact ?? null} description="Sem WhatsApp nem telefone para aviso" tone="warning" href={clientListHref(filters, { contato: "sem_contato", page: 1 })} state={state} />
      <KpiCard label="Sem responsável" value={result?.withoutResponsible ?? null} description="Nenhum responsável cadastrado" href={clientListHref(filters, { responsavel: "nao_informado", page: 1 })} state={state} />
    </KpiGrid>
    <Panel flush header={<FilterBar action="/clientes" query={query} search={{ name: "q", label: "Busca", placeholder: "Razão social ou CNPJ" }} filters={[
      { name: "contato", label: "Contato", options: [{ value: "", label: "Todos" }, { value: "com_whatsapp", label: "Com WhatsApp" }, { value: "sem_contato", label: "Sem contato" }] },
      { name: "responsavel", label: "Responsável", options: [{ value: "", label: "Todos" }, { value: "informado", label: "Informado" }, { value: "nao_informado", label: "Não informado" }] },
    ]} />}>
      <ClientesTable rows={result?.rows ?? []} filters={{ ...filters, page: result?.page ?? filters.page }} total={result?.total ?? 0} state={state} />
    </Panel>
  </section>;
}
