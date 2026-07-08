import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileCheck2,
  FileKey2,
  MessageCircleWarning,
  XCircle,
} from "lucide-react";

import { BotStatusCard } from "@/components/ui/bot-status-card";
import { DonutChart, ExpirationBarChart } from "@/components/ui/charts";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge, getBotStatusMeta, StatusBadge } from "@/components/ui/status-badge";
import { daysUntilDate, refreshCertificateStatuses } from "@/lib/certificados/status";
import { getTodayDateString } from "@/lib/notifications/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatCertificateTitle, formatCnpj, formatDate, formatDateTime, formatDaysLabel } from "@/lib/utils/format";

function isRecent(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Date.now() - new Date(value).getTime() < 5 * 60 * 1000;
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from("notification_settings")
    .select("dias_aviso_vencimento, timezone")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .maybeSingle();
  await refreshCertificateStatuses(settings?.dias_aviso_vencimento ?? [30, 15, 7]);
  const { data: certificados } = await supabase
    .from("certificados")
    .select("id, cnpj, nome_titular, data_vencimento, status, clientes(nome_razao_social)")
    .order("data_vencimento", { ascending: true })
    .limit(500);

  const today = getTodayDateString(settings?.timezone ?? "America/Sao_Paulo");
  const { count: plannedMessages } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "retry"])
    .gt("send_date", today);
  const { count: todayMessages } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "retry"])
    .lte("send_date", today);
  const { count: pendingMessages } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "reserved", "processing", "retry"]);
  const { count: sentMessages } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent");
  const { count: sentToday } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .eq("send_date", today);
  const { count: failedMessages } = await admin
    .from("notification_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed");
  const { data: lastSent } = await admin
    .from("notification_events")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: primaryDevice } = await admin
    .from("whatsapp_devices")
    .select("name, status, last_seen_at")
    .eq("is_primary_sender", true)
    .neq("status", "revoked")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rows = certificados ?? [];
  const activeRows = rows.filter((certificado) => certificado.status !== "substituido");
  const warningDays =
    Array.isArray(settings?.dias_aviso_vencimento) && settings.dias_aviso_vencimento.length > 0
      ? settings.dias_aviso_vencimento
      : [30, 15, 1];
  const maxWarningDays = Math.max(...warningDays, 30);
  const validCount = activeRows.filter((certificado) => certificado.status === "ativo").length;
  const warningCount = activeRows.filter((certificado) => certificado.status === "vencendo").length;
  const expiredCount = activeRows.filter(
    (certificado) => certificado.status === "vencido" || certificado.data_vencimento <= today,
  ).length;
  const totalActive = activeRows.length;
  const botOnline = Boolean(primaryDevice && primaryDevice.status === "active" && isRecent(primaryDevice.last_seen_at));
  const botStatus = getBotStatusMeta(botOnline);

  const donutData = [
    { name: "Validos", value: validCount, color: "#16A34A" },
    { name: "Vencendo", value: warningCount, color: "#F59E0B" },
    { name: "Vencidos", value: expiredCount, color: "#DC2626" },
  ];

  const periodData = [
    {
      name: "Vencidos",
      value: activeRows.filter((certificado) => daysUntilDate(certificado.data_vencimento) <= 0).length,
      color: "#DC2626",
    },
    {
      name: "7 dias",
      value: activeRows.filter((certificado) => {
        const days = daysUntilDate(certificado.data_vencimento);
        return days > 0 && days <= 7;
      }).length,
      color: "#F59E0B",
    },
    {
      name: "15 dias",
      value: activeRows.filter((certificado) => {
        const days = daysUntilDate(certificado.data_vencimento);
        return days > 7 && days <= 15;
      }).length,
      color: "#2563EB",
    },
    {
      name: "30 dias",
      value: activeRows.filter((certificado) => {
        const days = daysUntilDate(certificado.data_vencimento);
        return days > 15 && days <= 30;
      }).length,
      color: "#60A5FA",
    },
  ];

  const attentionCertificates = activeRows
    .map((certificado) => ({
      ...certificado,
      diasRestantes: daysUntilDate(certificado.data_vencimento),
    }))
    .filter((certificado) => certificado.diasRestantes <= maxWarningDays)
    .slice(0, 5);

  const attentionItems = [
    ...attentionCertificates.map((certificado) => ({
      key: certificado.id,
      title: formatCertificateTitle(certificado.nome_titular, certificado.cnpj),
      description:
        certificado.diasRestantes < 0
          ? `Vencido ha ${formatDaysLabel(Math.abs(certificado.diasRestantes))}`
          : `Vence em ${formatDaysLabel(certificado.diasRestantes)}`,
      meta: `${formatCnpj(certificado.cnpj)} - ${formatDate(certificado.data_vencimento)}`,
      status: certificado.status,
    })),
    ...(failedMessages
      ? [
          {
            key: "failed-messages",
            title: "Falhas no envio de avisos",
            description: `${failedMessages} ${failedMessages === 1 ? "aviso precisa" : "avisos precisam"} de revisao`,
            meta: "Abra a aba Avisos para tentar novamente",
            status: "vencido" as const,
          },
        ]
      : []),
    ...(!botOnline
      ? [
          {
            key: "bot-offline",
            title: "WhatsApp Bot desconectado",
            description: "O envio automatico depende do bot conectado",
            meta: "Verifique a tela WhatsApp Bot",
            status: "vencido" as const,
          },
        ]
      : []),
  ];

  return (
    <section>
      <SectionHeader
        title="Painel"
        description="Resumo operacional dos certificados, vencimentos e avisos enviados pelo WhatsApp Bot."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard title="Total" value={totalActive} icon={FileKey2} tone="blue" />
        <StatCard title="Validos" value={validCount} icon={FileCheck2} tone="green" />
        <StatCard title="Vencendo" value={warningCount} icon={CalendarClock} tone="amber" />
        <StatCard title="Vencidos" value={expiredCount} icon={XCircle} tone="red" />
        <StatCard title="Hoje" value={todayMessages ?? 0} icon={Clock3} tone="blue" />
        <StatCard title="Enviadas" value={sentMessages ?? 0} icon={CheckCircle2} tone="green" />
        <StatCard title="Falhas" value={failedMessages ?? 0} icon={AlertTriangle} tone="red" />
        <StatCard title="Bot" value={<Badge tone={botStatus.tone}>{botStatus.label}</Badge>} icon={Bot} tone={botStatus.tone} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.72fr)] 2xl:grid-cols-[minmax(0,1.2fr)_380px_260px]">
        <SectionCard>
          <div className="mb-2">
            <h3 className="text-base font-semibold text-slate-950">Certificados por status</h3>
            <p className="text-sm text-slate-500">Distribuicao atual dos certificados ativos.</p>
          </div>
          <DonutChart data={donutData} total={totalActive} />
        </SectionCard>

        <BotStatusCard
          online={botOnline}
          name={primaryDevice?.name}
          lastSeen={primaryDevice?.last_seen_at}
          pending={pendingMessages ?? 0}
          sentToday={sentToday ?? 0}
          failed={failedMessages ?? 0}
        />

        <SectionCard className="2xl:block">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Fila de hoje</p>
          <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{todayMessages ?? 0}</p>
          <p className="mt-2 text-sm leading-5 text-slate-500">Avisos prontos para envio pelo bot.</p>
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Planejados</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{plannedMessages ?? 0}</p>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.92fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)_260px]">
        <SectionCard>
          <div className="mb-2">
            <h3 className="text-base font-semibold text-slate-950">Vencimentos por periodo</h3>
            <p className="text-sm text-slate-500">Concentracao de vencimentos por janela.</p>
          </div>
          <ExpirationBarChart data={periodData} />
        </SectionCard>

        <SectionCard>
          <div className="mb-3 flex items-center gap-2">
            <MessageCircleWarning className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-semibold text-slate-950">Precisa de atencao</h3>
          </div>
          {attentionItems.length === 0 ? (
            <EmptyState title="Nada urgente no momento" description="Certificados, avisos e bot estao sem pendencias visiveis." />
          ) : (
            <div className="grid gap-2.5">
              {attentionItems.map((item) => (
                <div key={item.key} className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-slate-50/78 p-3 transition duration-200 hover:border-blue-100 hover:bg-blue-50/55 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">{item.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{item.description}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{item.meta}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Ultimo envio</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">
            {lastSent?.sent_at ? formatDateTime(lastSent.sent_at) : "Nenhuma mensagem enviada ainda."}
          </p>
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/78 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Enviadas hoje</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{sentToday ?? 0}</p>
          </div>
        </SectionCard>
      </div>
    </section>
  );
}
