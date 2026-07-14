import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock3,
  FileCheck2,
  FileKey2,
  MessageCircleWarning,
  RefreshCw,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { LazyDonutChart, LazyExpirationBarChart } from "@/components/ui/lazy-dashboard-charts";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CertificadoStatus, Json } from "@/lib/supabase/database.types";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime, formatDaysLabel } from "@/lib/utils/format";

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
  primary_device: {
    name: string | null;
    status: string | null;
    last_seen_at: string | null;
    online: boolean;
  } | null;
  status_bot: boolean;
  mensagens_aguardando: number;
  enviadas_hoje: number;
  falhas_bot: number;
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
  primary_device: null,
  status_bot: false,
  mensagens_aguardando: 0,
  enviadas_hoje: 0,
  falhas_bot: 0,
  status_chart: [
    { name: "Válidos", value: 0, color: "#16A34A" },
    { name: "Vencendo", value: 0, color: "#F59E0B" },
    { name: "Vencidos", value: 0, color: "#DC2626" },
  ],
  expiration_chart: [
    { name: "Vencidos", value: 0, color: "#DC2626" },
    { name: "7 dias", value: 0, color: "#F59E0B" },
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
    Vencidos: "Vencidos",
    Vencendo: "Vencendo",
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

  const primaryDeviceValue = value.primary_device;
  const primaryDevice = isRecord(primaryDeviceValue)
    ? {
        name: typeof primaryDeviceValue.name === "string" ? primaryDeviceValue.name : null,
        status: typeof primaryDeviceValue.status === "string" ? primaryDeviceValue.status : null,
        last_seen_at: typeof primaryDeviceValue.last_seen_at === "string" ? primaryDeviceValue.last_seen_at : null,
        online: primaryDeviceValue.online === true,
      }
    : null;

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
    primary_device: primaryDevice,
    status_bot: value.status_bot === true,
    mensagens_aguardando: toNumber(value.mensagens_aguardando),
    enviadas_hoje: toNumber(value.enviadas_hoje),
    falhas_bot: toNumber(value.falhas_bot),
    status_chart: toChartItems(value.status_chart, emptyMetrics.status_chart),
    expiration_chart: toChartItems(value.expiration_chart, emptyMetrics.expiration_chart),
    attention_certificates: Array.isArray(value.attention_certificates)
      ? (value.attention_certificates as DashboardAttentionCertificate[])
      : [],
  };
}

function buildChartsFromCertificates(certificates: DashboardAttentionCertificate[], counts: Pick<DashboardMetrics, "certificados_validos" | "certificados_vencendo" | "certificados_vencidos">) {
  return {
    statusChart: [
      { name: "Válidos", value: counts.certificados_validos, color: "#16A34A" },
      { name: "Vencendo", value: counts.certificados_vencendo, color: "#F59E0B" },
      { name: "Vencidos", value: counts.certificados_vencidos, color: "#DC2626" },
    ],
    expirationChart: [
      { name: "Vencidos", value: certificates.filter((item) => item.dias_restantes < 0).length, color: "#DC2626" },
      {
        name: "7 dias",
        value: certificates.filter((item) => item.dias_restantes >= 0 && item.dias_restantes <= 7).length,
        color: "#F59E0B",
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

  const [certificatesResult, plannedResult, todayResult, waitingResult, sentTodayResult, failedResult, failedTodayResult, lastSentResult, deviceResult] =
    await Promise.all([
      admin
        .from("certificados")
        .select("id, cnpj, nome_titular, data_vencimento, status, clientes(nome_razao_social)")
        .neq("status", "invalido")
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
      admin
        .from("whatsapp_devices")
        .select("name, status, last_seen_at")
        .eq("is_primary_sender", true)
        .neq("status", "revoked")
        .order("updated_at", { ascending: false })
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
  const deviceLastSeenAt = deviceResult.data?.last_seen_at ?? null;
  const primaryDevice = deviceResult.data
    ? {
        name: deviceResult.data.name,
        status: deviceResult.data.status,
        last_seen_at: deviceLastSeenAt,
        online:
          deviceResult.data.status === "active" &&
          deviceLastSeenAt !== null &&
          new Date(deviceLastSeenAt).getTime() >= Date.now() - 5 * 60 * 1000,
      }
    : null;

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
    primary_device: primaryDevice,
    status_bot: primaryDevice?.online ?? false,
    mensagens_aguardando: waitingResult.count ?? 0,
    enviadas_hoje: sentTodayResult.count ?? 0,
    falhas_bot: failedResult.count ?? 0,
    status_chart: charts.statusChart,
    expiration_chart: charts.expirationChart,
    attention_certificates: mappedCertificates
      .filter((item) => item.dias_restantes < 0 || (item.dias_restantes >= 0 && item.dias_restantes <= maxWarningDays))
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
  const admin = createSupabaseAdminClient();
  const metrics = await loadDashboardMetrics(admin);
  const falhasHoje = metrics.falhas_hoje || metrics.falhas_envio;

  const attentionItems = [
    ...metrics.attention_certificates.map((certificado) => ({
      key: certificado.id,
      title: formatCertificateTitle(certificado.nome_titular, certificado.cnpj),
      description:
        certificado.dias_restantes < 0
          ? `Vencido há ${formatDaysLabel(Math.abs(certificado.dias_restantes))}`
          : certificado.dias_restantes === 0
            ? "Vence hoje"
            : `Vence em ${formatDaysLabel(certificado.dias_restantes)}`,
      meta: `${formatCnpj(certificado.cnpj)} - ${formatDate(certificado.data_vencimento)}`,
      status: certificado.status,
      href: `/certificados/${certificado.id}`,
    })),
    ...(metrics.falhas_envio
      ? [
          {
            key: "failed-messages",
            title: "Falhas no envio de avisos",
            description: `${metrics.falhas_envio} ${metrics.falhas_envio === 1 ? "aviso precisa" : "avisos precisam"} de revisão`,
            meta: "Abra a aba Avisos para tentar novamente",
            status: "vencido" as const,
            href: "/notificacoes?status=failed",
          },
        ]
      : []),
    ...(!metrics.status_bot
      ? [
          {
            key: "bot-offline",
            title: "WhatsApp Bot desconectado",
            description: "O envio automático depende do bot conectado",
            meta: "Verifique a tela WhatsApp Bot",
            status: "vencido" as const,
            href: "/whatsapp",
          },
        ]
      : []),
  ].slice(0, 8);

  return (
    <section>
      <SectionHeader
        title="Painel"
        description="Resumo dos certificados, vencimentos e avisos internos."
      />

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard title="Total" value={metrics.total_certificados} description="Certificados" icon={FileKey2} tone="blue" />
        <StatCard title="Válidos" value={metrics.certificados_validos} description="Fora da janela de aviso" icon={FileCheck2} tone="green" />
        <StatCard title="Vencendo" value={metrics.certificados_vencendo} description="Dentro dos dias configurados" icon={CalendarClock} tone="amber" />
        <StatCard title="Vencidos" value={metrics.certificados_vencidos} description="Exigem ação" icon={XCircle} tone="red" />
        <StatCard title="Avisos hoje" value={metrics.avisos_para_hoje} description="Prontos para envio" icon={Clock3} tone="blue" />
        <StatCard title="Falhas" value={metrics.falhas_envio} description="Avisos com erro" icon={AlertTriangle} tone="red" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        <SectionCard>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Certificados por status</h3>
              <p className="text-xs text-slate-500">Classificação calculada por data de vencimento.</p>
            </div>
            <Badge tone="blue">Tempo real</Badge>
          </div>
          <LazyDonutChart data={metrics.status_chart} total={metrics.total_certificados} />
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizado automaticamente
          </div>
        </SectionCard>

        <SectionCard>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Vencimentos por período</h3>
              <p className="text-xs text-slate-500">Distribuição dos certificados por janela.</p>
            </div>
            <Badge tone="slate">30 dias</Badge>
          </div>
          <LazyExpirationBarChart data={metrics.expiration_chart} />
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizado automaticamente
          </div>
        </SectionCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <SectionCard>
          <div className="mb-2 flex items-center gap-2">
            <MessageCircleWarning className="h-4 w-4 text-red-500" />
            <h3 className="text-base font-semibold text-slate-950">Precisa de atenção</h3>
          </div>
          {attentionItems.length === 0 ? (
            <EmptyState title="Nada urgente no momento" description="Nenhum certificado ou aviso crítico para revisar agora." />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-blue-100/70 bg-white">
              {attentionItems.map((item) => (
                <Link key={item.key} href={item.href} className="flex flex-col gap-2 border-b border-blue-100/70 px-3 py-2.5 outline-none last:border-b-0 transition duration-150 hover:bg-blue-50/55 focus-visible:bg-blue-50/70 focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-blue-100 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950" title={item.title}>{item.title}</p>
                    <p className="text-sm text-slate-600">{item.description}</p>
                    <p className="text-xs text-slate-500">{item.meta}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={item.status} />
                    <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Avisos do dia</h3>
              <p className="text-xs text-slate-500">Resumo da operação de hoje.</p>
            </div>
            {!metrics.status_bot ? <Badge tone="red">Bot desconectado</Badge> : <Badge tone="green">Bot conectado</Badge>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-xs font-semibold text-blue-700">Prontos</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{metrics.avisos_para_hoje}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">Planejados</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{metrics.avisos_planejados}</p>
            </div>
            <div className="rounded-2xl border border-green-100 bg-green-50/70 p-3">
              <p className="text-xs font-semibold text-green-700">Enviados</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{metrics.enviadas_hoje}</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <p className="text-xs font-semibold text-red-700">Falhas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{falhasHoje}</p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Último envio</span>
              <span className="font-semibold text-slate-950">{metrics.ultimo_envio ? formatDateTime(metrics.ultimo_envio) : "Ainda não houve envio"}</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
