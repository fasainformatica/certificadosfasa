import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildCentralList, centralHref, getOriginalNoticeText, matchesCentralTab, parseCentralParams, type CentralEvent } from "@/lib/notifications/central-list";
import { getCentralReason } from "@/lib/notifications/central-reason";
import { centralDetails, NotificacoesTable, type CentralRow } from "@/app/(internal)/notificacoes/notificacoes-table";
import { CanalWhatsAppPanel, formatFailureWindow, type WhatsAppPanelProps } from "@/app/(internal)/whatsapp/canal-whatsapp-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const today = "2026-11-23";
let sequence = 0;
function event(overrides: Partial<CentralEvent> = {}): CentralEvent {
  return { id: `synthetic-${++sequence}`, certificado_id: "cert", recipient_id: "person", telefone_destino: "5511999999999", type: "certificate_expiring",
    audience: "internal", provider: "whatsapp_extension", payload: {}, dias_restantes: 1, send_date: today, status: "pending", sent_at: null, failed_at: null,
    attempt_count: 0, next_retry_at: null, error_message: null, provider_message_id: null, created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
    clientes: null, certificados: null, notification_recipients: { nome: "Sintetico" }, ...overrides };
}
const defaults = parseCentralParams({});

describe("Central stage 6", () => {
  it("opens on Pendentes, oldest first, without future events", () => {
    const list = buildCentralList([event({ send_date: "2026-11-25" }), event(), event({ id: "old", status: "failed", send_date: "2026-07-01" })], defaults, today);
    expect(defaults.tab).toBe("pendentes");
    expect(list.rows.map((row) => row.event.id)[0]).toBe("old");
    expect(list.counts).toMatchObject({ pendentes: 2, fila: 1, hoje: 1, falhas: 1, todos: 3 });
    expect(matchesCentralTab(event({ send_date: "2026-11-25" }), "fila", today)).toBe(false);
  });
  it("orders other tabs by last activity and honours the chosen order", () => {
    const events = [event({ id: "a", status: "sent", certificado_id: "1", send_date: "2026-09-01", sent_at: "2026-09-01T10:00:00Z" }), event({ id: "b", status: "sent", certificado_id: "2", send_date: "2026-08-01", sent_at: "2026-10-01T10:00:00Z" })];
    expect(buildCentralList(events, { ...defaults, tab: "enviados" }, today).rows[0].event.id).toBe("b");
    expect(buildCentralList(events, { ...defaults, tab: "enviados", order: "desc" }, today).rows[0].event.id).toBe("a");
  });
  it("groups sent repeats only, keeping every time and every failure", () => {
    const sent = { status: "sent", sent_at: "2026-11-20T10:00:00Z" };
    const list = buildCentralList([event(sent), event(sent), event({ ...sent, telefone_destino: "5511888888888" }), event({ status: "failed" }), event({ status: "failed" })], { ...defaults, tab: "todos" }, today);
    expect(list.total).toBe(4);
    expect(list.rows.filter((row) => row.times.length === 2)).toHaveLength(1);
    expect(list.counts.enviados).toBe(3);
  });
  it("keeps legacy links and round-trips filters", () => {
    expect(parseCentralParams({ status: "failed" }).tab).toBe("falhas");
    expect(parseCentralParams({ type: "certificate_expired" })).toMatchObject({ tab: "todos", type: "certificate_expired" });
    const filters = parseCentralParams({ aba: "todos", destinatario: "cliente", tipo: "resumo_vencidos", data: today, ordem: "asc", page: "2" });
    expect(parseCentralParams(Object.fromEntries(new URLSearchParams(centralHref(filters).split("?")[1])))).toEqual(filters);
  });
  it("never shows a failure reason on a cancelled event nor recalculates the original deadline", () => {
    expect(getCentralReason({ status: "cancelled", error_message: "network timeout" })).toBeNull();
    expect(getCentralReason({ status: "cancelled", error_message: "Aviso cancelado: destinatario desativado ou categoria desmarcada." })?.short).toBe("Cancelado: contato desativado");
    expect(getCentralReason({ status: "failed", error_message: "network timeout" })?.full).toContain("A integração demorou");
    expect(getOriginalNoticeText({ type: "certificate_expiring", dias_restantes: null })).toBe("não registrado");
  });
  const row: CentralRow = { id: "r", status: "failed", type: "certificate_expired", typeLabel: "Resumo de vencidos", original: "resumo diário", repeats: ["2026-11-20T10:00:00Z"],
    clientName: null, clientCnpj: null, certificate: null, reference: null, audienceLabel: "Equipe interna", channel: "Extensão do Chrome", phone: "x", removed: true, currentPhone: null,
    sendDate: today, attempts: 1, lastAttempt: null, reason: null, recommendation: "Revisar", technicalId: null, retry: "allowed" };
  it("renders absence vocabulary, retry permission and renewed state", () => {
    const render = (value: CentralRow, canManage = true) => renderToStaticMarkup(<NotificacoesTable rows={[value]} filters={defaults} total={1} page={1} canManage={canManage} />);
    expect(render(row)).toContain("Resumo consolidado");
    expect(render(row)).toContain("Contato removido");
    expect(render(row)).toContain("Tentar novamente");
    expect(render(row, false)).not.toContain("Tentar novamente");
    expect(render({ ...row, retry: "renewed" })).toContain("Certificado renovado");
    expect(render({ ...row, retry: "renewed" })).not.toContain("Tentar novamente");
    expect(centralDetails(row).map((item) => item.label)).not.toContain("ID técnico");
    expect(centralDetails({ ...row, repeats: ["2026-11-20T10:00:00Z", "2026-11-20T11:00:00Z"] }).map((item) => item.label)).toContain("Envios agrupados");
  });
});

describe("WhatsApp stage 7", () => {
  const props: WhatsAppPanelProps = { channel: "Extensão do Chrome", configured: true, automationEnabled: true, logs: [], quality: null,
    safety: { enabled: true, timezone: "America/Sao_Paulo", dispatchPaused: false, pauseReason: null, dailyLimit: 25, hourlyLimit: 10, autoPauseEnabled: true, failurePauseThreshold: 3,
      failurePauseWindowMinutes: 60, sentToday: 20, sentLastHour: 10, failuresInWindow: 0, provider: "whatsapp_extension", allowed: true, blockedReason: null, blockedMessage: null, autoPauseRecommended: false },
    queue: { total: 0, failed: 3, lastSentAt: "2026-11-20T03:00:55Z", lastSentUnavailable: false, notice: "empty", nextAllowedAt: null, knownReason: "Motivo não identificado. Valide a conexão.", lockedUntil: null, sentMonth: 22, processing: 0, averageMs: null } };
  const render = (patch: Partial<WhatsAppPanelProps> = {}) => renderToStaticMarkup(<CanalWhatsAppPanel {...props} {...patch} />);
  it("never deduces the connection and isolates panel errors", () => {
    const html = render();
    expect(html).toContain("Ainda não verificada");
    expect(html).not.toContain("Conectada");
    expect(html).toContain("Pausa por falhas: ligada (pausa ao chegar em 3 falhas)");
    expect(html).toContain("Falhas na última hora");
    expect(html).toContain("Tempo médio hoje: Sem medições");
    expect(html).toContain("Nenhum evento registrado.");
    expect(html).toContain("Indisponível");
    expect(html).toContain('data-tone="warning"');
    expect(html).toContain('data-tone="danger"');
  });
  it("orders panels and keeps homologation closed", () => {
    const html = render();
    const titles = ["Estado do canal", "Segurança operacional", "Fila de envio", "Qualidade dos telefones", "Testes de homologação"].map((title) => html.indexOf(`>${title}<`));
    expect([...titles].sort((a, b) => a - b)).toEqual(titles);
    expect(titles).not.toContain(-1);
    expect(html).toContain('aria-expanded="false"');
  });
  it("explains a stalled queue and a running interval", () => {
    expect(render({ queue: { ...props.queue, total: 4, notice: "stalled" } })).toContain("Motivo não identificado. Valide a conexão.");
    expect(render({ queue: { ...props.queue, total: 4, notice: "interval", nextAllowedAt: "2026-11-23T18:28:00Z" } })).toContain("Próximo envio liberado a partir de 23/11/2026 às 15:28.");
    expect([60, 1440, 120, 45].map(formatFailureWindow)).toEqual(["na última hora", "nas últimas 24 horas", "nas últimas 2 horas", "nos últimos 45 minutos"]);
  });
});
