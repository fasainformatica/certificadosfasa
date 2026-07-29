import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClass } from "@/components/ui/button-styles";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { wasCertificateRenewed } from "@/lib/certificados/renewal";
import {
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  CERTIFICATE_RENEWAL_STATUS_TONE,
  isCertificateRenewalStatus,
  shouldShowRenewalBadge,
} from "@/lib/certificados/renewal-status";
import { calculateCertificateStatus } from "@/lib/certificados/status";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime, formatDisplayName, formatPhone } from "@/lib/utils/format";

import { CertificatePasswordReveal } from "./certificate-password-reveal";
import { ClientEditForm } from "./client-edit-form";
import { DeleteCertificateButton } from "./delete-certificate-button";
import { DownloadLinkManager } from "./download-link-manager";
import { RenewalStatusForm } from "./renewal-status-form";

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
      "id, cnpj, nome_titular, data_emissao, data_vencimento, status, renovacao_status, renovacao_observacao, renovacao_atualizado_em, nome_arquivo_original, hash_arquivo, ultimo_upload_em, created_at, clientes(id, nome_razao_social, cnpj, email, telefone, whatsapp, whatsapp_notifications_enabled, responsavel, observacoes)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!certificado) {
    notFound();
  }

  const canManageCertificate = canManageOperationalData(user.role);
  const admin = canManageCertificate ? createSupabaseAdminClient() : null;
  const { data: activeLink } = admin
    ? await admin
      .from("links_download")
      .select("id, ativo, usado, usado_em, invalidado_em, criado_em, atualizado_em, ip_uso, user_agent_uso, tentativas_invalidas, bloqueado_ate")
      .eq("certificado_id", id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };
  const { data: settings } = await supabase
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const status = certificado.status === "invalido"
    ? certificado.status
    : calculateCertificateStatus(
      certificado.data_vencimento,
      settings?.dias_aviso_vencimento ?? [30, 15, 7],
      settings?.timezone ?? "America/Sao_Paulo",
    );
  const renovado = wasCertificateRenewed(certificado.created_at, certificado.ultimo_upload_em);
  const renewalStatus = isCertificateRenewalStatus(certificado.renovacao_status)
    ? certificado.renovacao_status
    : "em_acompanhamento";

  const rows = [
    ["Cliente", formatDisplayName(certificado.clientes?.nome_razao_social) || "-"],
    ["WhatsApp", formatPhone(certificado.clientes?.whatsapp ?? certificado.clientes?.telefone)],
    ["Avisos WhatsApp ao cliente", certificado.clientes?.whatsapp_notifications_enabled === false ? "Bloqueados" : "Permitidos"],
    ["Responsável", certificado.clientes?.responsavel ?? "-"],
    ["E-mail", certificado.clientes?.email ?? "-"],
    ["Titular", formatCertificateTitle(certificado.nome_titular, certificado.cnpj)],
    ["CNPJ", formatCnpj(certificado.cnpj)],
    ["Emissão", formatDate(certificado.data_emissao)],
    ["Vencimento", formatDate(certificado.data_vencimento)],
    ["Renovação", CERTIFICATE_RENEWAL_STATUS_LABEL[renewalStatus]],
    [
      "Atualização da renovação",
      certificado.renovacao_atualizado_em ? formatDateTime(certificado.renovacao_atualizado_em) : "-",
    ],
    ["Observação da renovação", certificado.renovacao_observacao ?? "-"],
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
            href={`/certificados/novo?cliente_id=${certificado.clientes?.id ?? ""}`}
            className={buttonClass("secondary")}
          >
            Renovar certificado
          </Link>
        }
      />
      <dl className="grid gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
        <div className="grid gap-1 border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid-cols-[180px_1fr]">
          <dt className="text-sm font-medium text-slate-600">Status</dt>
          <dd className="flex flex-wrap gap-1.5">
            <StatusBadge status={status} />
            {renovado ? <Badge tone="blue">Atualizado</Badge> : null}
            {shouldShowRenewalBadge(renewalStatus) ? (
              <Badge tone={CERTIFICATE_RENEWAL_STATUS_TONE[renewalStatus]}>
                {CERTIFICATE_RENEWAL_STATUS_LABEL[renewalStatus]}
              </Badge>
            ) : null}
          </dd>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 border-b border-slate-200 px-4 py-2.5 last:border-b-0 md:grid-cols-[180px_1fr]">
            <dt className="text-sm font-medium text-slate-600">{label}</dt>
            <dd className="break-words text-sm font-medium text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      {canManageCertificate ? (
        <RenewalStatusForm
          certificadoId={id}
          initialStatus={renewalStatus}
          initialObservation={certificado.renovacao_observacao}
        />
      ) : null}
      {canManageCertificate && certificado.clientes ? (
        <ClientEditForm
          initialClient={{
            nome_razao_social: certificado.clientes.nome_razao_social,
            cnpj: certificado.clientes.cnpj,
            email: certificado.clientes.email,
            telefone: certificado.clientes.telefone,
            whatsapp: certificado.clientes.whatsapp,
            whatsapp_notifications_enabled: certificado.clientes.whatsapp_notifications_enabled,
            responsavel: certificado.clientes.responsavel,
            observacoes: certificado.clientes.observacoes,
          }}
        />
      ) : null}
      {canManageCertificate ? <CertificatePasswordReveal certificadoId={id} /> : null}
      {canManageCertificate ? <DownloadLinkManager certificadoId={id} initialLink={activeLink ?? null} /> : null}
      {canManageCertificate ? <DeleteCertificateButton certificadoId={id} /> : null}
    </section>
  );
}
