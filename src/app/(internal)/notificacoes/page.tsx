import { AlertBanner, FilterBar, KpiCard, KpiGrid, Panel, Tabs } from "@/components/ui/spec";
import { canManageOperationalData } from "@/lib/auth/permissions";
import { requireInternalUser } from "@/lib/auth/rbac";
import { daysUntilDate } from "@/lib/certificados/status";
import { formatCount, formatDate, formatMaskedPhone } from "@/lib/format";
import { getMetricDateContext, getOperationProviderLabel, lerMetricasOperacao } from "@/lib/metricas/operacao";
import { buildCentralList, CENTRAL_TABS, centralHref, getOriginalNoticeText, parseCentralParams, type CentralGroup, type CentralParams } from "@/lib/notifications/central-list";
import { getCentralReason } from "@/lib/notifications/central-reason";
import { readCentralEvents } from "@/lib/notifications/central-read";
import { getNotificationRecommendedAction, isRetryableNotificationStatus, NOTIFICATION_EVENT_TYPE_LABELS } from "@/lib/notifications/event-presentation";
import { getNotificationRetryDecision, getRenewalRetryPresentation } from "@/lib/notifications/renewal-retry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getActiveNotificationProvider } from "@/lib/whatsapp/euatendo/config";
import { WHATSAPP_NOTIFICATION_PROVIDERS } from "@/lib/whatsapp/providers";
import { NotificacoesTable, type CentralRow } from "./notificacoes-table";
import styles from "./notificacoes.module.css";

function toRow({ event, times }: CentralGroup, today: string): CentralRow {
  const renewal = getRenewalRetryPresentation(event.payload, event.certificados?.data_vencimento);
  const decision = getNotificationRetryDecision(event.payload, event.certificados?.data_vencimento, event.send_date);
  const retryable = isRetryableNotificationStatus(event.status);
  const retry = !retryable ? "none" : renewal.renewed ? "renewed" : decision.allowed ? "allowed" : "none";
  return {
    id: event.id, status: event.status, type: event.type, original: getOriginalNoticeText(event), repeats: times, retry,
    typeLabel: NOTIFICATION_EVENT_TYPE_LABELS[event.type as keyof typeof NOTIFICATION_EVENT_TYPE_LABELS] ?? "Aviso",
    clientName: event.clientes?.nome_razao_social ?? null, clientCnpj: event.clientes?.cnpj ?? null,
    certificate: event.certificados ? { name: event.certificados.nome_titular, cnpj: event.certificados.cnpj, validity: event.certificados.data_vencimento, days: daysUntilDate(event.certificados.data_vencimento) } : null,
    reference: renewal.referenceDate, audienceLabel: event.audience === "client" ? "Cliente" : "Equipe interna",
    channel: getOperationProviderLabel(event.provider), phone: formatMaskedPhone(event.telefone_destino),
    removed: event.audience === "internal" && !event.notification_recipients,
    currentPhone: event.clientes ? formatMaskedPhone(event.clientes.whatsapp || event.clientes.telefone) : null,
    sendDate: event.send_date, attempts: event.attempt_count, lastAttempt: event.failed_at ?? event.sent_at,
    reason: getCentralReason(event), technicalId: event.provider_message_id,
    recommendation: retryable && !decision.allowed ? decision.message ?? "Nenhuma ação disponível" : getNotificationRecommendedAction(event, { today }),
  };
}

export default async function NotificacoesPage({ searchParams }: { searchParams: Promise<CentralParams> }) {
  const user = await requireInternalUser();
  const filters = parseCentralParams(await searchParams);
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const today = getMetricDateContext(now).today;
  const [summary, events, recipients] = await Promise.all([
    lerMetricasOperacao(admin, getActiveNotificationProvider(), now).catch(() => null),
    readCentralEvents(admin, filters),
    admin.from("notification_recipients").select("id, nome").order("nome", { ascending: true }),
  ]);
  const list = events ? buildCentralList(events, filters, today) : null;
  const queue = summary?.queue ?? null;
  const failed = summary?.failed ?? null;
  const state = (value: number | null | undefined) => value == null ? "error" as const : "ok" as const;
  const query = centralHref(filters).split("?")[1];

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div><h1 className="page-title">Central de avisos</h1><p className="page-subtitle mt-1">Fila, envios e falhas dos avisos de vencimento.</p></div>
        <p className={styles.date}>Data operacional: {formatDate(today)}</p>
      </header>
      <KpiGrid>
        <KpiCard label="Na fila" value={queue?.total ?? null} state={state(queue?.total)} description={queue ? `${formatCount(queue.pending)} aguardando · ${formatCount(queue.retry)} em nova tentativa` : "Indisponível"} href="/notificacoes?aba=fila" />
        <KpiCard label="Enviando" value={summary?.processing ?? null} state={state(summary?.processing)} description="Reservadas pelo canal agora" />
        <KpiCard label="Enviadas hoje" value={summary?.sentToday ?? null} state={state(summary?.sentToday)} description="Aceitas pelo canal" href="/notificacoes?aba=enviados" />
        <KpiCard label="Falhas" value={failed} state={state(failed)} description="Aguardando revisão" tone="danger" href="/notificacoes?aba=falhas" />
        <KpiCard label="Resumos de vencidos" value={summary?.expired ?? null} state={state(summary?.expired)} description="Eventos de resumo, não certificados" href="/notificacoes?tipo=resumo_vencidos&aba=todos" />
        <KpiCard label="Avisos de vencimento" value={summary?.expiring ?? null} state={state(summary?.expiring)} description="Eventos programados, não certificados" href="/notificacoes?tipo=aviso_vencimento&aba=todos" />
      </KpiGrid>
      {failed || queue?.total ? <div className={styles.alerts}>
        {failed ? <AlertBanner tone="danger" link={{ href: "/notificacoes?aba=falhas", label: "Ver falhas" }}><strong>{formatCount(failed)} {failed === 1 ? "envio" : "envios"} com falha.</strong> Revise o motivo antes de reenfileirar.</AlertBanner> : null}
        {queue?.total ? <AlertBanner tone="info" link={{ href: "/notificacoes?aba=fila", label: "Ver fila" }}><strong>{formatCount(queue.total)} {queue.total === 1 ? "mensagem" : "mensagens"} na fila.</strong> {queue.total === 1 ? "Sai" : "Saem"} respeitando pausa, limites e intervalo entre envios.</AlertBanner> : null}
      </div> : null}
      <Panel flush header={<div className={styles.filters}>
        <Tabs label="Situação dos avisos" defaultValue="pendentes" query={query} items={CENTRAL_TABS.map((tab) => ({ ...tab, count: list?.counts[tab.value] }))} />
        <FilterBar action="/notificacoes" query={query} search={{ name: "q", label: "Busca", placeholder: "Cliente, certificado ou destinatário" }} filters={[
          { name: "destinatario", label: "Destinatário", options: [{ value: "", label: "Todos" }, { value: "cliente", label: "Cliente" }, { value: "equipe", label: "Equipe interna" }] },
          { name: "recipient_id", label: "Pessoa da equipe", options: [{ value: "", label: "Todas" }, ...(recipients.data ?? []).map((item) => ({ value: item.id, label: item.nome }))] },
          { name: "canal", label: "Canal", options: [{ value: "", label: "Todos" }, ...WHATSAPP_NOTIFICATION_PROVIDERS.map((value) => ({ value, label: getOperationProviderLabel(value) }))] },
          { name: "tipo", label: "Tipo de aviso", options: [{ value: "", label: "Todos" }, { value: "aviso_vencimento", label: "Aviso de vencimento" }, { value: "resumo_vencidos", label: "Resumo de vencidos" }] },
          { name: "data", label: "Programado em", type: "date" },
        ]} />
      </div>}>
        <NotificacoesTable rows={list?.rows.map((group) => toRow(group, today)) ?? []} filters={filters} total={list?.total ?? 0} page={list?.page ?? 1}
          canManage={canManageOperationalData(user.role)} error={!list} />
      </Panel>
    </section>
  );
}
