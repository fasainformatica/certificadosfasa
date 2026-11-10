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
import { PLANNABLE_CERTIFICATE_RENEWAL_STATUSES } from "@/lib/certificados/renewal-status";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CertificadoStatus, Json } from "@/lib/supabase/database.types";
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

function isRecord(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeChartName(value: unknown) {
  if (typeof value !== "string") {
    return "Sem nome";
  }

  const labels: Record<string, string> = {
    Validos: "Válidos",
    "Válidos": "Válidos",
    Vencidos: "Vencidos",
    Vencendo: "Vencem em breve",
  };

  return labels[value] ?? value;
}

function toChartItems(value: unknown, fallback: ChartItem[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.map((item) => ({
    name: normalizeChartName(item?.name),
    value: toNumber(item?.value),
    color: typeof item?.color === "string" ? item.color : "#64748B",
  }));
}

function normalizeMetrics(value: Json | null): DashboardMetrics {
  if (!isRecord(value)) {
    return emptyMetrics;
  }

  return {
    total_certificados: toNumber(value.total_certificados),
    certificados_validos: toNumber(value.certificados_validos),
    certificados_vencendo: toNumber(value.certificados_vencendo),
    certificados_vencidos: toNumber(value.certificados_vencidos),
    avisos_para_hoje: toNumber(value.avisos_para_hoje),
    mensagens_enviadas: toNumber(value.mensagens_enviadas),
    falhas_envio: toNumber(value.falhas_envio),
    falhas_hoje: toNumber(value.falhas_hoje),
    avisos_planejados: toNumber(value.avisos_planejados),
    ultimo_envio: typeof value.ultimo_envio === "string" ? value.ultimo_envio : null,
    status_canal_whatsapp: value.status_canal_whatsapp === true,
    mensagens_aguardando: toNumber(value.mensagens_aguardando),
    enviadas_hoje: toNumber(value.enviadas_hoje),
    status_chart: toChartItems(value.status_chart, emptyMetrics.status_chart),
    expiration_chart: toChartItems(value.expiration_chart, emptyMetrics.expiration_chart),
    attention_certificates: Array.isArray(value.attention_certificates)
      ? (value.attention_certificates as DashboardAttentionCertificate[])
      : [],
  };
}

function getActiveWhatsAppAutomationStatus() {
  const activeProvider = getActiveNotificationProvider();

  if (activeProvider === WHATSAPP_EXTENSION_PROVIDER) {
    const extension = getWhatsAppExtensionConfigStatus();

    return {
      activeProvider,
      label: "Extensao do Chrome",
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

async function loadDashboardMetricsFallback(admin: AdminClient): Promise<DashboardMetrics> {
  const { data: settings } = await admin
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  const warningDays = settings?.dias_aviso_vencimento ?? [30, 15, 7];
  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const { today, warningDays: maxWarningDays } = getCertificateStatusReferenceDates(warningDays, timezone);

  const [certificatesResult, plannedResult, todayResult, waitingResult, sentTodayResult, failedResult, failedTodayResult, lastSentResult] =
    await Promise.all([
      admin
        .from("certificados")
        .select("id, cnpj, nome_titular, data_vencimento, status, renovacao_status, clientes(nome_razao_social)")
        .neq("status", "invalido")
        .in("renovacao_status", [...PLANNABLE_CERTIFICATE_RENEWAL_STATUSES])
        .order("data_vencimento", { ascending: true })
        .limit(1000),
      admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "retry"])
        .gt("send_date", today),
      admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "retry"])
        .lte("send_date", today),
      admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "reserved", "processing", "retry"]),
      admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", `${today}T00:00:00`),
      admin.from("notification_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin
        .from("notification_events")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("failed_at", `${today}T00:00:00`),
      admin
        .from("notification_events")
        .select("sent_at")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const mappedCertificates = (certificatesResult.data ?? []).map((certificado) => {
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
    avisos_para_hoje: todayResult.count ?? 0,
    mensagens_enviadas: sentTodayResult.count ?? 0,
    falhas_envio: failedResult.count ?? 0,
    falhas_hoje: failedTodayResult.count ?? 0,
    avisos_planejados: plannedResult.count ?? 0,
    ultimo_envio: lastSentResult.data?.sent_at ?? null,
    status_canal_whatsapp: getActiveWhatsAppAutomationStatus().enabled,
    mensagens_aguardando: waitingResult.count ?? 0,
    enviadas_hoje: sentTodayResult.count ?? 0,
    status_chart: charts.statusChart,
    expiration_chart: charts.expirationChart,
    attention_certificates: mappedCertificates
      .filter((item) => item.dias_restantes < 0 || (item.dias_restantes >= 0 && item.dias_restantes <= maxWarningDays))
      .sort((left, right) => left.dias_restantes - right.dias_restantes)
      .slice(0, 6),
  };
}

async function loadDashboardMetrics(admin: AdminClient) {
  const { data, error } = await admin.rpc("get_dashboard_metrics");

  if (error || !data) {
    return loadDashboardMetricsFallback(admin);
  }

  return normalizeMetrics(data);
}

export default async function DashboardPage() {
  const user = await requireInternalUser();
  const canAccessWhatsapp = canAccessAdminOnlyArea(user.role);
  const admin = createSupabaseAdminClient();
  const whatsappAutomation = getActiveWhatsAppAutomationStatus();
  const [metrics, whatsappStateResult, whatsappPendingResult, notificationSettingsResult] = await Promise.all([
    loadDashboardMetrics(admin),
    admin
      .from("whatsapp_dispatcher_state")
      .select("last_dispatch_at, next_allowed_send_at, locked_until, updated_at")
      .eq("provider", whatsappAutomation.activeProvider)
      .maybeSingle(),
    admin
      .from("notification_events")
      .select("id", { count: "exact", head: true })
      .eq("provider", whatsappAutomation.activeProvider)
      .in("status", ["pending", "retry", "reserved", "processing"]),
    admin
      .from("notification_settings")
      .select("enabled")
      .eq("id", SETTINGS_ID)
      .maybeSingle(),
  ]);
  const automationEnabled = whatsappAutomation.enabled && notificationSettingsResult.data?.enabled === true;
  const falhasHoje = metrics.falhas_hoje || metrics.falhas_envio;

  const attentionItems = metrics.attention_certificates
      .sort((left, right) => left.dias_restantes - right.dias_restantes)
      .map((certificado) => ({
        key: certificado.id,
        title: formatCertificateTitle(certificado.nome_titular, certificado.cnpj),
        description: formatRelativeExpiration(certificado.dias_restantes),
        meta: `${formatCnpj(certificado.cnpj)} - ${formatDate(certificado.data_vencimento)}`,
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

      {(metrics.falhas_envio > 0 || (!automationEnabled && canAccessWhatsapp)) ? (
        <div className="mb-8 border-l-2 border-amber-500 bg-amber-50/60 px-4 py-3 text-sm text-slate-800">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <MessageCircleWarning aria-hidden="true" className="h-4 w-4 text-amber-700" />
            {metrics.falhas_envio > 0 ? <Link href="/notificacoes?status=failed" className="font-medium underline hover:text-blue-700">{metrics.falhas_envio} {metrics.falhas_envio === 1 ? "envio com falha" : "envios com falha"}. Revisar avisos</Link> : null}
            {!automationEnabled && canAccessWhatsapp ? <Link href="/whatsapp" className="font-medium underline hover:text-blue-700">Envio automático pausado. Ver WhatsApp</Link> : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.8fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Vencimentos para acompanhar</h2>
            <Link href="/certificados?renovacao=acompanhamento" className="text-sm font-medium text-blue-700 hover:underline">Ver certificados</Link>
          </div>
          {attentionItems.length === 0 ? (
            <EmptyState title="Nenhum vencimento para revisar" description="Não há certificados que precisem de acompanhamento nesta janela." />
          ) : (
            <div className="border-y border-slate-200 bg-white">
              {attentionItems.map((item) => (
                <Link key={item.key} href={item.href} className="flex min-w-0 flex-col gap-2 border-b border-slate-100 px-1 py-4 last:border-b-0 hover:bg-slate-50 focus-visible:bg-blue-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950" title={item.title}>{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm text-slate-700">{item.description}</span>
                    <StatusBadge status={item.status} />
                    <ArrowRight aria-hidden="true" className="h-4 w-4 text-slate-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-950">Avisos e WhatsApp</h2>
            <Badge tone={automationEnabled ? "green" : "red"}>{automationEnabled ? "Envio ativo" : "Envio pausado"}</Badge>
          </div>
          <dl className="border-y border-slate-200 text-sm">
            {[
              ["Fila do WhatsApp", whatsappPendingResult.count ?? 0],
              ["Planejadas", metrics.avisos_planejados],
              ["Enviadas hoje", metrics.enviadas_hoje],
              ["Com falha", falhasHoje],
              ["Integração", whatsappAutomation.label],
              ["Último envio", metrics.ultimo_envio ? formatDateTimeShort(metrics.ultimo_envio) : "Ainda não houve envio"],
              ["Última sincronização", whatsappStateResult.data?.last_dispatch_at ? formatDateTimeShort(whatsappStateResult.data.last_dispatch_at) : "-"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
                <dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="fasa-metrics mt-10 grid grid-cols-2 overflow-hidden border-y border-slate-200 bg-white md:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Cadastrados" value={metrics.total_certificados} icon={FileKey2} />
        <StatCard title="Válidos" value={metrics.certificados_validos} icon={FileCheck2} tone="green" />
        <StatCard title="Próximos" value={metrics.certificados_vencendo} icon={CalendarClock} tone="amber" />
        <StatCard title="Vencidos" value={metrics.certificados_vencidos} icon={XCircle} tone="red" />
        <StatCard title="Avisos para hoje" value={metrics.avisos_para_hoje} icon={Clock3} />
        <StatCard title="Com falha" value={metrics.falhas_envio} tone="red" />
      </div>

      <div className="mt-10 grid gap-10 border-t border-slate-200 pt-8 xl:grid-cols-2">
        <section className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">Certificados por status</h2>
          <p className="mt-1 text-sm text-slate-500">Distribuição pela data de vencimento.</p>
          <LazyDonutChart data={metrics.status_chart} total={metrics.total_certificados} />
        </section>
        <section className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">Vencimentos por período</h2>
          <p className="mt-1 text-sm text-slate-500">Certificados por janela de vencimento.</p>
          <LazyExpirationBarChart data={metrics.expiration_chart} />
        </section>
      </div>
    </section>
  );
}
