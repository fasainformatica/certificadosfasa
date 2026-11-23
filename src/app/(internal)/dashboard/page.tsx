import {
  ArrowRight,
  CalendarClock,
  Clock3,
  FileCheck2,
  FileKey2,
  MessageCircleWarning,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { LazyDonutChart, LazyExpirationBarChart } from "@/components/ui/lazy-dashboard-charts";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { canAccessAdminOnlyArea } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { getOperationProviderLabel, lerCertificadosEmOperacao, lerMetricasOperacao } from "@/lib/metricas/operacao";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CertificadoStatus } from "@/lib/supabase/database.types";
import {
  formatCertificateTitle,
  formatCnpj,
  formatDate,
  formatDateTimeShort,
  formatRelativeExpiration,
} from "@/lib/utils/format";
import { getActiveNotificationProvider, getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { getWhatsAppExtensionConfigStatus } from "@/lib/whatsapp/extension/config";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type ChartItem = {
  name: string;
  value: number;
  color: string;
};

type DashboardAttentionCertificate = {
  id: string;
  cnpj: string;
  nome_titular: string;
  data_vencimento: string;
  status: CertificadoStatus;
  dias_restantes: number;
  clientes: {
    nome_razao_social: string | null;
  } | null;
};

type DashboardMetrics = {
  total_certificados: number;
  certificados_validos: number;
  certificados_vencendo: number;
  certificados_vencidos: number;
  avisos_para_hoje: number;
  mensagens_enviadas: number;
  falhas_envio: number;
  falhas_hoje: number;
  avisos_planejados: number;
  ultimo_envio: string | null;
  status_canal_whatsapp: boolean;
  mensagens_aguardando: number;
  enviadas_hoje: number;
  status_chart: ChartItem[];
  expiration_chart: ChartItem[];
  attention_certificates: DashboardAttentionCertificate[];
};

const emptyMetrics: DashboardMetrics = {
  total_certificados: 0,
  certificados_validos: 0,
  certificados_vencendo: 0,
  certificados_vencidos: 0,
  avisos_para_hoje: 0,
  mensagens_enviadas: 0,
  falhas_envio: 0,
  falhas_hoje: 0,
  avisos_planejados: 0,
  ultimo_envio: null,
  status_canal_whatsapp: false,
  mensagens_aguardando: 0,
  enviadas_hoje: 0,
  status_chart: [
    { name: "Válidos", value: 0, color: "#15803D" },
    { name: "Vencem em breve", value: 0, color: "#D97706" },
    { name: "Vencidos", value: 0, color: "#DC2626" },
  ],
  expiration_chart: [
    { name: "Vencidos", value: 0, color: "#DC2626" },
    { name: "7 dias", value: 0, color: "#D97706" },
    { name: "15 dias", value: 0, color: "#2563EB" },
    { name: "30 dias", value: 0, color: "#60A5FA" },
  ],
  attention_certificates: [],
};

function getActiveWhatsAppAutomationStatus() {
  const activeProvider = getActiveNotificationProvider();

  if (activeProvider === WHATSAPP_EXTENSION_PROVIDER) {
    const extension = getWhatsAppExtensionConfigStatus();

    return {
      activeProvider,
      label: getOperationProviderLabel(activeProvider),
      enabled: extension.enabled && extension.tokenConfigured,
    };
  }

  const euAtendo = getEuAtendoConfigStatus();

  return {
    activeProvider,
    label: "euAtendo",
    enabled: euAtendo.enabled,
  };
}

function buildChartsFromCertificates(
  certificates: DashboardAttentionCertificate[],
  counts: Pick<DashboardMetrics, "certificados_validos" | "certificados_vencendo" | "certificados_vencidos">,
) {
  return {
    statusChart: [
      { name: "Válidos", value: counts.certificados_validos, color: "#15803D" },
      { name: "Vencem em breve", value: counts.certificados_vencendo, color: "#D97706" },
      { name: "Vencidos", value: counts.certificados_vencidos, color: "#DC2626" },
    ],
    expirationChart: [
      { name: "Vencidos", value: certificates.filter((item) => item.dias_restantes < 0).length, color: "#DC2626" },
      {
        name: "7 dias",
        value: certificates.filter((item) => item.dias_restantes >= 0 && item.dias_restantes <= 7).length,
        color: "#D97706",
      },
      {
        name: "15 dias",
        value: certificates.filter((item) => item.dias_restantes > 7 && item.dias_restantes <= 15).length,
        color: "#2563EB",
      },
      {
        name: "30 dias",
        value: certificates.filter((item) => item.dias_restantes > 15 && item.dias_restantes <= 30).length,
        color: "#60A5FA",
      },
    ],
  };
}

async function loadDashboardMetrics(admin: AdminClient): Promise<DashboardMetrics> {
  const { certificates, warningDays, timezone } = await lerCertificadosEmOperacao(admin);
  const { today, warningDays: maxWarningDays } = getCertificateStatusReferenceDates(warningDays, timezone);

  const mappedCertificates = certificates.map((certificado) => {
    const diasRestantes = Math.round(
      (new Date(`${certificado.data_vencimento}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
        86_400_000,
    );
    const status = calculateCertificateStatus(certificado.data_vencimento, warningDays, timezone);
    const cliente = Array.isArray(certificado.clientes) ? certificado.clientes[0] : certificado.clientes;

    return {
      id: certificado.id,
      cnpj: certificado.cnpj,
      nome_titular: certificado.nome_titular,
      data_vencimento: certificado.data_vencimento,
      status,
      dias_restantes: diasRestantes,
      clientes: { nome_razao_social: cliente?.nome_razao_social ?? null },
    } satisfies DashboardAttentionCertificate;
  });

  const counts = {
    certificados_validos: mappedCertificates.filter((item) => item.status === "ativo").length,
    certificados_vencendo: mappedCertificates.filter((item) => item.status === "vencendo").length,
    certificados_vencidos: mappedCertificates.filter((item) => item.status === "vencido").length,
  };
  const charts = buildChartsFromCertificates(mappedCertificates, counts);

  return {
    ...emptyMetrics,
    total_certificados: mappedCertificates.length,
    ...counts,
    status_chart: charts.statusChart,
    expiration_chart: charts.expirationChart,
    attention_certificates: mappedCertificates
      .filter((item) => item.dias_restantes < 0 || (item.dias_restantes >= 0 && item.dias_restantes <= maxWarningDays))
      .sort((left, right) => left.dias_restantes - right.dias_restantes)
      .slice(0, 6),
  };
}

export default async function DashboardPage() {
  const user = await requireInternalUser();
  const canAccessWhatsapp = canAccessAdminOnlyArea(user.role);
  const admin = createSupabaseAdminClient();
  const whatsappAutomation = getActiveWhatsAppAutomationStatus();
  const [certificateMetrics, operation, notificationSettingsResult] = await Promise.all([
    loadDashboardMetrics(admin).catch(() => null),
    lerMetricasOperacao(admin, whatsappAutomation.activeProvider).catch(() => null),
    admin
      .from("notification_settings")
      .select("enabled")
      .eq("id", SETTINGS_ID)
      .maybeSingle(),
  ]);
  const automationEnabled = whatsappAutomation.enabled && notificationSettingsResult.data?.enabled === true;

  const metrics = certificateMetrics ?? emptyMetrics;

  const attentionItems = metrics.attention_certificates
      .sort((left, right) => left.dias_restantes - right.dias_restantes)
      .map((certificado) => ({
        key: certificado.id,
        title: formatCertificateTitle(certificado.nome_titular, certificado.cnpj),
        description: formatRelativeExpiration(certificado.dias_restantes),
        meta: `CNPJ: ${formatCnpj(certificado.cnpj)} · Vencimento: ${formatDate(certificado.data_vencimento)}`,
        status: certificado.status,
        href: `/certificados/${certificado.id}`,
      }))
      .slice(0, 6);

  return (
    <section>
      <SectionHeader
        title="Visão geral"
        description="Acompanhe certificados, vencimentos e o funcionamento dos avisos."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Certificados em operação" value={certificateMetrics?.total_certificados ?? "Indisponível"} description="Não inclui inativos ou fora do acompanhamento" icon={FileKey2} />
        <StatCard title="Certificados válidos" value={certificateMetrics?.certificados_validos ?? "Indisponível"} description="Fora da janela de aviso" icon={FileCheck2} tone="green" />
        <StatCard title="Vencem em breve" value={certificateMetrics?.certificados_vencendo ?? "Indisponível"} description="Dentro da janela configurada" icon={CalendarClock} tone="amber" />
        <StatCard title="Certificados vencidos" value={certificateMetrics?.certificados_vencidos ?? "Indisponível"} description="Prazo de validade encerrado" icon={XCircle} tone="red" />
        <StatCard title="Avisos para hoje" value={operation?.queue?.total ?? "Indisponível"} description="Na fila, previstos até hoje; todos os canais" icon={Clock3} />
        <StatCard title="Envios com falha" value={operation?.failed ?? "Indisponível"} description="Status de falha; todos os canais e datas" tone="red" />
      </div>

      <div className="mb-6 grid gap-5 xl:grid-cols-2">
        <section className="fasa-panel">
          <h2 className="text-base font-semibold text-slate-950">Certificados por status</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">Distribuição pela data de vencimento.</p>
          {certificateMetrics ? <LazyDonutChart data={metrics.status_chart} total={metrics.total_certificados} /> : <p>Indisponível. Não foi possível carregar.</p>}
        </section>
        <section className="fasa-panel">
          <h2 className="text-base font-semibold text-slate-950">Vencimentos por período</h2>
          <p className="mt-1 mb-4 text-sm text-slate-500">Certificados por janela de vencimento.</p>
          {certificateMetrics ? <LazyExpirationBarChart data={metrics.expiration_chart} /> : <p>Indisponível. Não foi possível carregar.</p>}
        </section>
      </div>

      {((operation?.failed != null && operation.failed > 0) || (!automationEnabled && canAccessWhatsapp)) ? (
        <div className="mb-8 border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm text-slate-800">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <MessageCircleWarning aria-hidden="true" className="h-4 w-4 text-amber-700" />
            {operation?.failed != null && operation.failed > 0 ? <Link href="/notificacoes?status=failed" className="font-medium underline hover:text-blue-700">{operation.failed} {operation.failed === 1 ? "envio com falha" : "envios com falha"}. Revisar avisos</Link> : null}
            {!automationEnabled && canAccessWhatsapp ? <Link href="/whatsapp" className="font-medium underline hover:text-blue-700">Envio automático pausado. Ver WhatsApp</Link> : null}
          </div>
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <section className="fasa-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Vencimentos para acompanhar</h2>
            <Link href="/certificados?renovacao=acompanhamento" className="text-sm font-medium text-blue-700 hover:underline">Ver certificados</Link>
          </div>
          {!certificateMetrics ? <p>Indisponível. Não foi possível carregar os certificados.</p> : attentionItems.length === 0 ? (
            <EmptyState title="Nenhum vencimento para revisar" description="Não há certificados que precisem de acompanhamento nesta janela." />
          ) : (
            <div className="border-y border-slate-200 bg-white">
              {attentionItems.map((item) => (
                <Link key={item.key} href={item.href} className="flex min-w-0 flex-col gap-2 border-b border-slate-100 px-1 py-4 last:border-b-0 hover:bg-slate-50 focus-visible:bg-blue-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-950" title={item.title}>{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-700">{item.description}</span>
                    <StatusBadge status={item.status} />
                    <ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="fasa-panel">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Avisos e WhatsApp</h2>
            <Badge tone={automationEnabled ? "green" : "slate"}>{automationEnabled ? "Automação habilitada" : "Automação pausada"}</Badge>
          </div>
          <dl className="border-y border-slate-200 text-sm">
            {[
              ["Mensagens aguardando envio", operation?.queue?.total ?? "Indisponível"],
              ["Avisos em datas futuras", operation?.future ?? "Indisponível"],
              ["Mensagens enviadas hoje", operation?.sentToday ?? "Indisponível"],
              ["Envios com falha", operation?.failed ?? "Indisponível"],
              ["Integração", whatsappAutomation.label],
              ["Último envio", !operation || operation.unavailable.includes("lastSentAt") ? "Indisponível" : operation.lastSentAt ? formatDateTimeShort(operation.lastSentAt) : "Nenhum envio registrado"],
              ["Último despacho/cadência do canal ativo", !operation || operation.unavailable.includes("state") ? "Indisponível" : operation.state?.last_dispatch_at ? formatDateTimeShort(operation.state.last_dispatch_at) : "Nenhuma execução registrada"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
                <dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-500">Automação habilitada não confirma conexão do WhatsApp. A fila conta pendentes e novas tentativas previstas até hoje, em todos os canais. Mensagens futuras e em processamento são contadas separadamente.</p>
        </section>
      </div>

    </section>
  );
}
