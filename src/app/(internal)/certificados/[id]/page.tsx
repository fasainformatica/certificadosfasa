import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { buttonClass } from "@/components/ui/button-styles";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import {
  formatCertificateFingerprint,
  getCertificateExpirationPresentation,
  getWhatsAppNoticePresentation,
} from "@/lib/certificados/detail-presentation";
import { wasCertificateRenewed } from "@/lib/certificados/renewal";
import {
  getCertificateRenewalPresentation,
  isCertificateRenewalStatus,
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

type DetailRow = {
  label: string;
  value: ReactNode;
  description?: string;
};

type CertificadoDetalhePageProps = {
  params: Promise<{
    id: string;
  }>;
};

function DetailGroup({ title, description, rows }: { title: string; description?: string; rows: DetailRow[] }) {
  return (
    <SectionCard>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      <dl className="grid gap-0 overflow-hidden rounded-xl border border-slate-200">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 border-b border-slate-200 px-4 py-3 last:border-b-0 md:grid-cols-[190px_1fr]">
            <dt className="text-sm font-medium text-slate-600">{row.label}</dt>
            <dd className="min-w-0 break-words text-sm font-medium text-slate-950">
              {row.value}
              {row.description ? <p className="mt-1 text-xs font-normal leading-5 text-slate-500">{row.description}</p> : null}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

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
  const renewalPresentation = getCertificateRenewalPresentation(renewalStatus);
  const expirationPresentation = getCertificateExpirationPresentation(
    certificado.data_vencimento,
    settings?.timezone ?? "America/Sao_Paulo",
  );
  const whatsappPresentation = getWhatsAppNoticePresentation(certificado.clientes?.whatsapp_notifications_enabled);
  const certificateTitle = formatCertificateTitle(certificado.nome_titular, certificado.cnpj);
  const clientName = formatDisplayName(certificado.clientes?.nome_razao_social);

  const clientRows: DetailRow[] = [
    { label: "Cliente", value: clientName || "-" },
    { label: "CNPJ do cliente", value: certificado.clientes?.cnpj ? formatCnpj(certificado.clientes.cnpj) : "-" },
    { label: "WhatsApp", value: formatPhone(certificado.clientes?.whatsapp ?? certificado.clientes?.telefone) },
    {
      label: "Avisos ao cliente",
      value: <Badge tone={whatsappPresentation.tone}>{whatsappPresentation.label}</Badge>,
      description: whatsappPresentation.description,
    },
    { label: "Responsável", value: certificado.clientes?.responsavel ?? "-" },
    { label: "E-mail", value: certificado.clientes?.email ?? "-" },
  ];
  const certificateRows: DetailRow[] = [
    { label: "Titular", value: certificateTitle },
    { label: "CNPJ do certificado", value: formatCnpj(certificado.cnpj) },
    { label: "Emissão", value: formatDate(certificado.data_emissao) },
    {
      label: "Vencimento",
      value: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{formatDate(certificado.data_vencimento)}</span>
          <Badge tone={expirationPresentation.tone}>{expirationPresentation.label}</Badge>
        </span>
      ),
      description: expirationPresentation.description,
    },
    { label: "Último upload", value: formatDateTime(certificado.ultimo_upload_em) },
    { label: "Arquivo original", value: certificado.nome_arquivo_original },
  ];
  const renewalRows: DetailRow[] = [
    { label: "Situação", value: <Badge tone={renewalPresentation.tone}>{renewalPresentation.label}</Badge> },
    {
      label: "Atualização",
      value: certificado.renovacao_atualizado_em ? formatDateTime(certificado.renovacao_atualizado_em) : "Ainda não revisado",
    },
    { label: "Observação", value: certificado.renovacao_observacao ?? "-" },
  ];

  return (
    <section>
      <SectionHeader
        title="Detalhes do certificado"
        description="Consulte validade, cliente vinculado, renovação e ações administrativas seguras."
        actions={
          canManageCertificate ? (
            <Link
              href={`/certificados/novo?cliente_id=${certificado.clientes?.id ?? ""}`}
              className={buttonClass("secondary")}
            >
              Renovar certificado
            </Link>
          ) : null
        }
      />

      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={status} />
              <Badge tone={expirationPresentation.tone}>{expirationPresentation.label}</Badge>
              {renovado ? <Badge tone="blue">Atualizado</Badge> : null}
              <Badge tone={renewalPresentation.tone}>{renewalPresentation.label}</Badge>
            </div>
            <h2 className="mt-3 break-words text-xl font-semibold text-slate-950">{certificateTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {clientName || "Cliente não informado"} · {formatCnpj(certificado.cnpj)}
            </p>
          </div>
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:min-w-96">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próxima ação</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{expirationPresentation.action}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vencimento</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">{formatDate(certificado.data_vencimento)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contato para aviso</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {formatPhone(certificado.clientes?.whatsapp ?? certificado.clientes?.telefone)}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DetailGroup title="Cliente vinculado" description="Dados usados para contato e acompanhamento." rows={clientRows} />
        <DetailGroup title="Dados do certificado" description="Informações extraídas do PFX atual." rows={certificateRows} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <DetailGroup title="Renovação" description="Situação operacional usada no planejamento de avisos." rows={renewalRows} />
        <SectionCard>
          <h2 className="text-base font-semibold text-slate-950">Dados técnicos</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use estas informações apenas para conferência interna. Nenhum caminho de Storage é exibido.
          </p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="font-medium text-slate-600">Identificador do arquivo</dt>
              <dd className="mt-1 break-all font-mono text-xs font-semibold text-slate-950">
                {formatCertificateFingerprint(certificado.hash_arquivo)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-600">Cadastro</dt>
              <dd className="mt-1 font-semibold text-slate-950">{formatDateTime(certificado.created_at)}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <SectionCard className="mt-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Impacto da renovação</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{renewalPresentation.description}</p>
          </div>
          <Badge tone={renewalPresentation.tone}>{renewalPresentation.label}</Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planejamento</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {renewalPresentation.plannable ? "Incluído nos avisos" : "Fora dos avisos"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">{renewalPresentation.planningImpact}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Próxima ação</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">{renewalPresentation.nextAction}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Última revisão</p>
            <p className="mt-2 text-sm font-semibold text-slate-950">
              {certificado.renovacao_atualizado_em ? formatDateTime(certificado.renovacao_atualizado_em) : "Ainda não revisado"}
            </p>
          </div>
        </div>

        {certificado.renovacao_observacao ? (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            <span className="font-semibold text-slate-950">Observação:</span> {certificado.renovacao_observacao}
          </div>
        ) : null}
      </SectionCard>
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
