import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClass } from "@/components/ui/button-styles";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalUser } from "@/lib/auth/rbac";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime, formatPhone } from "@/lib/utils/format";

import { ClientEditForm } from "./client-edit-form";
import { DeleteCertificateButton } from "./delete-certificate-button";
import { DownloadLinkManager } from "./download-link-manager";

type CertificadoDetalhePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CertificadoDetalhePage({ params }: CertificadoDetalhePageProps) {
  const { id } = await params;
  const user = await requireInternalUser();
  const supabase = await createServerSupabaseClient();
  const { data: certificado } = await supabase
    .from("certificados")
    .select(
      "id, cnpj, nome_titular, data_emissao, data_vencimento, status, nome_arquivo_original, hash_arquivo, ultimo_upload_em, created_at, clientes(id, nome_razao_social, cnpj, email, telefone, whatsapp, responsavel, observacoes)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!certificado) {
    notFound();
  }

  const { data: activeLink } = user.role === "admin"
    ? await supabase
      .from("links_download")
      .select("id, ativo, usado, usado_em, invalidado_em, criado_em, atualizado_em, ip_uso, user_agent_uso, tentativas_invalidas, bloqueado_ate")
      .eq("certificado_id", id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };

  const rows = [
    ["Cliente", certificado.clientes?.nome_razao_social ?? "-"],
    ["WhatsApp", formatPhone(certificado.clientes?.whatsapp ?? certificado.clientes?.telefone)],
    ["Responsável", certificado.clientes?.responsavel ?? "-"],
    ["E-mail", certificado.clientes?.email ?? "-"],
    ["Titular", formatCertificateTitle(certificado.nome_titular, certificado.cnpj)],
    ["CNPJ", formatCnpj(certificado.cnpj)],
    ["Emissão", formatDate(certificado.data_emissao)],
    ["Vencimento", formatDate(certificado.data_vencimento)],
    ["Arquivo", certificado.nome_arquivo_original],
    ["Identificador do arquivo", certificado.hash_arquivo],
    ["Último upload", formatDateTime(certificado.ultimo_upload_em)],
  ];

  return (
    <section>
      <SectionHeader
        title="Detalhes do certificado"
        description="Informações do certificado, cliente vinculado e ações administrativas seguras."
        actions={
          <Link
            href="/certificados/novo"
            className={buttonClass("secondary")}
          >
            Renovar certificado
          </Link>
        }
      />
      <dl className="grid gap-0 overflow-hidden rounded-3xl border border-blue-100/70 bg-white/86 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl">
        <div className="grid gap-1 border-b border-blue-100/80 bg-blue-50/70 px-4 py-3 md:grid-cols-[180px_1fr]">
          <dt className="text-sm font-medium text-slate-600">Status</dt>
          <dd>
            <StatusBadge status={certificado.status} />
          </dd>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b border-blue-100/70 px-4 py-2.5 last:border-b-0 md:grid-cols-[180px_1fr]">
            <dt className="text-sm font-medium text-slate-600">{label}</dt>
            <dd className="break-words text-sm font-medium text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      {user.role === "admin" && certificado.clientes ? (
        <ClientEditForm
          initialClient={{
            nome_razao_social: certificado.clientes.nome_razao_social,
            cnpj: certificado.clientes.cnpj,
            email: certificado.clientes.email,
            telefone: certificado.clientes.telefone,
            whatsapp: certificado.clientes.whatsapp,
            responsavel: certificado.clientes.responsavel,
            observacoes: certificado.clientes.observacoes,
          }}
        />
      ) : null}
      {user.role === "admin" ? <DownloadLinkManager certificadoId={id} initialLink={activeLink ?? null} /> : null}
      {user.role === "admin" ? <DeleteCertificateButton certificadoId={id} /> : null}
    </section>
  );
}
