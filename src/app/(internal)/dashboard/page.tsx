import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { LazyDonutChart, LazyExpirationBarChart } from "@/components/ui/lazy-dashboard-charts";
import { AlertBanner, KeyValueList, KpiCard, KpiGrid, Panel, StatusBadge } from "@/components/ui/spec";
import { canAccessAdminOnlyArea } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { calculateCertificateStatus, getCertificateStatusReferenceDates } from "@/lib/certificados/status";
import { formatCnpj, formatCount, formatDate, formatDateTime, formatDays, formatRelative } from "@/lib/format";
import { getOperationProviderLabel, lerCertificadosEmOperacao, lerMetricasOperacao } from "@/lib/metricas/operacao";
import { SETTINGS_ID } from "@/lib/notifications/engine";
import { getStatusLabel } from "@/lib/status-labels";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatCertificateTitle } from "@/lib/utils/format";
import { getActiveNotificationProvider, getEuAtendoConfigStatus } from "@/lib/whatsapp/euatendo/config";
import { getWhatsAppExtensionConfigStatus } from "@/lib/whatsapp/extension/config";
import { hasRecentExtensionContact } from "@/lib/whatsapp/extension/heartbeat";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function getActiveWhatsAppAutomationStatus() {
  const activeProvider = getActiveNotificationProvider();
  const extension = activeProvider === WHATSAPP_EXTENSION_PROVIDER ? getWhatsAppExtensionConfigStatus() : null;
  return {
    activeProvider,
    label: getOperationProviderLabel(activeProvider),
    enabled: extension ? extension.enabled && extension.tokenConfigured : getEuAtendoConfigStatus().enabled,
  };
}

async function loadDashboardMetrics(admin: AdminClient) {
  const { certificates, warningDays, timezone } = await lerCertificadosEmOperacao(admin);
  const { today, warningDays: maxWarningDays } = getCertificateStatusReferenceDates(warningDays, timezone);
  const mappedCertificates = certificates.map((certificate) => ({
    ...certificate,
    dias_restantes: Math.round(
      (Date.parse(`${certificate.data_vencimento}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
    ),
    status: calculateCertificateStatus(certificate.data_vencimento, warningDays, timezone),
  }));
  const counts = {
    active: mappedCertificates.length,
    ok: mappedCertificates.filter((item) => item.status === "ativo").length,
    warning: mappedCertificates.filter((item) => item.status === "vencendo").length,
    expired: mappedCertificates.filter((item) => item.status === "vencido").length,
  };
  return {
    ...counts,
    warningDays: maxWarningDays,
    statusChart: [
      { name: getStatusLabel("validade", "em_dia").label, value: counts.ok, color: "var(--chart-ok)" },
      { name: getStatusLabel("validade", "vence_em_breve").label, value: counts.warning, color: "var(--chart-warn)" },
      { name: "Vencidos", value: counts.expired, color: "var(--chart-danger)" },
    ],
    expirationChart: [
      { name: "Vencidos", value: counts.expired, color: "var(--chart-danger)" },
      { name: "0\u20137 dias", value: mappedCertificates.filter((item) => item.dias_restantes >= 0 && item.dias_restantes <= 7).length, color: "var(--chart-warn)" },
      { name: "8\u201315 dias", value: mappedCertificates.filter((item) => item.dias_restantes > 7 && item.dias_restantes <= 15).length, color: "var(--chart-neutral)" },
      { name: "16\u201330 dias", value: mappedCertificates.filter((item) => item.dias_restantes > 15 && item.dias_restantes <= 30).length, color: "var(--chart-neutral)" },
    ],
    attention: mappedCertificates.filter((item) => item.dias_restantes >= 0 && item.dias_restantes <= 30)
      .sort((left, right) => left.dias_restantes - right.dias_restantes).slice(0, 5),
  };
}

export default async function DashboardPage() {
  const user = await requireInternalUser();
  const canAccessWhatsapp = canAccessAdminOnlyArea(user.role);
  const admin = createSupabaseAdminClient();
  const whatsappAutomation = getActiveWhatsAppAutomationStatus();
  const [metrics, operation, notificationSettingsResult, inactiveResult] = await Promise.all([
    loadDashboardMetrics(admin).catch(() => null),
    lerMetricasOperacao(admin, whatsappAutomation.activeProvider).catch(() => null),
    admin.from("notification_settings").select("enabled").eq("id", SETTINGS_ID).maybeSingle(),
    admin.from("certificados").select("id", { count: "exact" }).eq("renovacao_status", "cliente_inativo").limit(0),
  ]);
  const automationEnabled = whatsappAutomation.enabled && notificationSettingsResult.data?.enabled === true;
  const inactive = inactiveResult.error ? null : inactiveResult.count;
  const failed = operation?.failed ?? null;
  const lastSentUnavailable = !operation || operation.unavailable.includes("lastSentAt");
  const operationalCount = (value: number | null | undefined) => value == null ? "Indisponível" : formatCount(value);
  const connection = whatsappAutomation.activeProvider === WHATSAPP_EXTENSION_PROVIDER && hasRecentExtensionContact(operation?.state?.updated_at)
    ? "verificada" as const : "nao_verificada" as const;
  const retry = <Link href="/dashboard" className="text-primary hover:underline">Tentar de novo</Link>;

  return (
    <section className="space-y-8 text-text [letter-spacing:0]">
      <header>
        <h1 className="page-title">Visão geral</h1>
        <p className="page-subtitle mt-1">Certificados, vencimentos e funcionamento dos avisos.</p>
      </header>

      <KpiGrid>
        <KpiCard label="Certificados ativos" value={metrics?.active ?? null} state={metrics ? "ok" : "error"}
          description={inactive == null ? "Indisponível" : inactive === 0 ? "Todos em acompanhamento" : `${formatCount(inactive)} inativos fora do acompanhamento`} href="/certificados?renovacao=em_acompanhamento" />
        <KpiCard label="Em dia" value={metrics?.ok ?? null} state={metrics ? "ok" : "error"} description="Fora da janela de aviso" href="/certificados?situacao=em_dia&renovacao=em_acompanhamento" />
        <KpiCard label="Vencem em breve" value={metrics?.warning ?? null} state={metrics ? "ok" : "error"}
          description={metrics ? `Nos próximos ${formatCount(metrics.warningDays)} dias` : "Dentro da janela configurada"} tone="warning" href="/certificados?situacao=vence_em_breve&renovacao=em_acompanhamento" />
        <KpiCard label="Vencidos" value={metrics?.expired ?? null} state={metrics ? "ok" : "error"} description="Validade encerrada" tone="danger" href="/certificados?situacao=vencido&renovacao=em_acompanhamento" />
        <KpiCard label="Avisos para hoje" value={operation?.queue?.total ?? null} state={operation?.queue ? "ok" : "error"} description="Programados até hoje" href="/notificacoes?aba=hoje" />
        <KpiCard label="Falhas de envio" value={failed} state={failed == null ? "error" : "ok"} description="Aguardando revisão" tone="danger" href="/notificacoes?aba=falhas" />
      </KpiGrid>

      {failed != null && failed > 0 && <AlertBanner tone="danger" link={{ href: "/notificacoes?aba=falhas", label: "Revisar na Central de avisos" }}>
        <strong className="font-semibold">{formatCount(failed)} {failed === 1 ? "envio com falha" : "envios com falha"}</strong> {failed === 1 ? "aguarda" : "aguardam"} revisão antes do próximo disparo.
      </AlertBanner>}

      <div className="grid grid-cols-12 items-stretch gap-4">
        <div className="col-span-12 min-w-0 [&>section]:h-full xl:col-span-5">
          <Panel title="Certificados por situação" description="Distribuição pela data de vencimento.">
            {metrics ? <div className="flex min-h-[220px] items-center"><LazyDonutChart data={metrics.statusChart} total={metrics.active} /></div> : <div className="min-h-[220px] p-8 text-center text-[13px] leading-5 text-text-3"><p>Indisponível</p><p>Não foi possível carregar.</p>{retry}</div>}
          </Panel>
        </div>
        <div className="col-span-12 min-w-0 [&>section]:h-full xl:col-span-7">
          <Panel title="Vencimentos nos próximos 30 dias" description="Certificados por prazo até o vencimento.">
            {metrics ? <LazyExpirationBarChart data={metrics.expirationChart} /> : <div className="min-h-[220px] p-8 text-center text-[13px] leading-5 text-text-3"><p>Indisponível</p><p>Não foi possível carregar.</p>{retry}</div>}
          </Panel>
        </div>
      </div>

      <div className="grid grid-cols-12 items-start gap-4">
        <div className="col-span-12 min-w-0 xl:col-span-7">
          <Panel title="Vencimentos para acompanhar" flush actions={<Link href="/certificados?situacao=vence_em_breve&renovacao=em_acompanhamento" className="shrink-0 text-sm font-medium text-primary hover:underline">Ver todos</Link>}
            state={!metrics ? "error" : metrics.attention.length === 0 ? "empty" : "ok"} emptyMessage="Nenhum certificado vence nos próximos 30 dias.">
            {metrics?.attention.map((certificate) => {
              const title = formatCertificateTitle(certificate.nome_titular, certificate.cnpj);
              return <Link key={certificate.id} href={`/certificados/${certificate.id}`} className="flex min-h-16 min-w-0 flex-col gap-2 border-b border-border px-5 py-3 last:border-b-0 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="cell-primary truncate" title={title}>{title}</p>
                  <p className="cell-secondary mt-1 break-words tabular-nums">{formatCnpj(certificate.cnpj)} · Vence em {formatDate(certificate.data_vencimento)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="w-[120px] text-sm font-semibold tabular-nums sm:text-right" style={{ color: certificate.dias_restantes <= 7 ? "var(--danger)" : certificate.dias_restantes <= 15 ? "var(--warning)" : "var(--text)" }}>{formatDays(certificate.dias_restantes)}</span>
                  <ChevronRight size={16} className="shrink-0 text-text-3" aria-hidden="true" />
                </div>
              </Link>;
            })}
          </Panel>
          {!metrics && <div className="mt-2 text-[13px]">{retry}</div>}
        </div>
        <div className="col-span-12 min-w-0 xl:col-span-5">
          <Panel title="Avisos e WhatsApp" actions={canAccessWhatsapp ? <Link href="/whatsapp" aria-label={`Estado da conexão: ${getStatusLabel("conexao", connection).label}`}><StatusBadge domain="conexao" status={connection} /></Link> : <StatusBadge domain="conexao" status={connection} />}>
            <KeyValueList items={[
              { id: "queue", label: "Na fila agora", value: operationalCount(operation?.queue?.total), href: "/notificacoes?aba=fila" },
              { id: "failed", label: "Falhas aguardando revisão", value: operationalCount(failed), href: "/notificacoes?aba=falhas" },
              { id: "sentToday", label: "Enviadas hoje", value: operationalCount(operation?.sentToday) },
              { id: "lastSentAt", label: "Último envio", value: lastSentUnavailable ? "Indisponível" : operation.lastSentAt ? formatDateTime(operation.lastSentAt) : "Sem medições", secondary: !lastSentUnavailable && operation.lastSentAt ? formatRelative(operation.lastSentAt) : undefined },
              { id: "channel", label: "Canal", value: whatsappAutomation.label },
              { id: "automation", label: "Automação", value: notificationSettingsResult.error ? "Indisponível" : getStatusLabel("automacao", automationEnabled ? "habilitada" : "desligada").label },
            ]} />
            {canAccessWhatsapp && <footer className="-mx-5 -mb-5 mt-5 border-t border-border px-5 py-4">
              <Link href="/whatsapp" className="text-sm font-medium text-primary hover:underline">Abrir automação do WhatsApp</Link>
            </footer>}
          </Panel>
        </div>
      </div>
    </section>
  );
}
