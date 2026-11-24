import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyValueList, Panel, StatusBadge } from "@/components/ui/spec";
import spec from "@/components/ui/spec/spec.module.css";
import { getClientDisplayName, getClientListNoticeStatus, getClientPreferredPhone } from "@/lib/clientes/list-presentation";
import { readClientDetail } from "@/lib/clientes/read";
import { formatCnpj, formatCount, formatDateTime, formatPhone } from "@/lib/format";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import styles from "../clientes.module.css";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readClientDetail(await createServerSupabaseClient(), id);
  if (result.state === "missing") notFound();
  const client = result.client;
  const name = client ? getClientDisplayName(client.nome_razao_social, client.cnpj) : "Cadastro do cliente";
  return <section className={styles.page}>
    <header className={styles.header}><div><h1>{name}</h1><p>{client ? formatCnpj(client.cnpj) : "Indisponível"}</p></div>
      <Link href="/clientes" className={`${spec.root} ${spec.button}`} data-variant="secondary">Voltar para clientes</Link>
    </header>
    {result.state === "error" ? <Panel title="Cadastro do cliente"><p>Indisponível</p><p>Não foi possível carregar.</p><Link href={`/clientes/${encodeURIComponent(id)}`} className={spec.link}>Tentar de novo</Link></Panel> :
      <Panel title="Cadastro do cliente">
        {client && <KeyValueList items={[
          { id: "phone", label: "WhatsApp", value: formatPhone(getClientPreferredPhone(client)) },
          { id: "email", label: "E-mail", value: client.email?.trim() || "Não informado" },
          ...(client.telefone?.trim() && client.telefone.replace(/\D/g, "") !== client.whatsapp?.replace(/\D/g, "") ? [{ id: "telephone", label: "Telefone", value: formatPhone(client.telefone) }] : []),
          { id: "responsible", label: "Responsável", value: client.responsavel?.trim() || "Não informado" },
          { id: "notice", label: "Avisos", value: <StatusBadge domain="cliente" status={getClientListNoticeStatus(client)} /> },
          ...(name !== client.nome_razao_social ? [{ id: "original", label: "Nome original do cadastro", value: client.nome_razao_social }] : []),
          { id: "certificates", label: "Certificados vinculados", value: formatCount(client.certificateCount) },
          { id: "updated", label: "Última atualização", value: formatDateTime(client.updated_at) },
        ]} />}
      </Panel>}
  </section>;
}
