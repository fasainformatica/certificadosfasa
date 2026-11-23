"use client";

import { CirclePause, CirclePlay, RefreshCw, Search, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

import { AlertBanner, Button, Disclosure, Panel, StatInline, StatusBadge, TableText } from "@/components/ui/spec";
import spec from "@/components/ui/spec/spec.module.css";
import { getClientDisplayName } from "@/lib/clientes/list-presentation";
import { formatCnpj, formatCount, formatDateTime, formatRelative } from "@/lib/format";
import { CHANNEL_EVENT_LABELS, CHANNEL_LOG_DISPLAY_STATUS } from "@/lib/status-labels";
import type { WhatsAppOperationalSafetySnapshot } from "@/lib/whatsapp/operational-safety";

import styles from "./whatsapp.module.css";

type ClientRef = { id: string; name: string; cnpj: string };
export type WhatsAppPanelProps = {
  channel: string; configured: boolean; automationEnabled: boolean | null; safety: WhatsAppOperationalSafetySnapshot | null;
  queue: {
    total: number | null; failed: number | null; lastSentAt: string | null; lastSentUnavailable: boolean;
    notice: "unavailable" | "empty" | "interval" | "stalled" | "none"; nextAllowedAt: string | null; knownReason: string;
    lockedUntil: string | null; sentMonth: number | null; processing: number | null; averageMs: number | null | "unavailable";
  };
  logs: Array<{ id: string; audience: string | null; operation: string; duration_ms: number | null; status: string; attempt_count: number | null; response_id: string | null; created_at: string }> | null;
  quality: {
    ready: number; missing: number; invalid: number; repeated: number; groups: number; blocked: number;
    limited: { analyzed: number; total: number } | null; missingSamples: ClientRef[]; duplicates: Array<{ phone: string; clients: ClientRef[] }>;
  } | null;
};

type ApiError = { error?: { message?: string } | string };
type HealthPayload = ApiError & {
  health?: { ok: boolean; errorMessage: string | null; instance: { phoneNumber: string | null } | null };
};
type CheckNumberPayload = ApiError & { result?: { exists: boolean | null } };
type TestMessagePayload = ApiError & { result?: { accepted: boolean } };

function getErrorMessage(payload: ApiError | null, fallback: string) {
  if (!payload?.error) return fallback;
  return typeof payload.error === "string" ? payload.error : payload.error.message ?? fallback;
}

async function request<T extends ApiError>(url: string, init: RequestInit): Promise<{ ok: boolean; payload: T | null }> {
  const response = await fetch(url, init).catch(() => null);
  const payload = (await response?.json().catch(() => null) ?? null) as T | null;
  return { ok: response?.ok === true, payload };
}

function post(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function formatDuration(ms: number) {
  return ms < 1000 ? `${formatCount(ms)} ms` : `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

export function formatFailureWindow(minutes: number) {
  if (minutes === 60) return "na última hora";
  if (minutes === 1440) return "nas últimas 24 horas";
  return minutes % 60 === 0 ? `nas últimas ${minutes / 60} horas` : `nos últimos ${formatCount(minutes)} minutos`;
}

function count(value: number | null) {
  return value === null ? "Indisponível" : formatCount(value);
}

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return <div>
    <div className={styles.meterLabel}>{label}</div>
    <div className={styles.meterValue}>{formatCount(used)} de {formatCount(limit)}</div>
    <div className={styles.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}
      data-tone={ratio >= 1 ? "danger" : ratio >= 0.8 ? "warning" : "none"}><span style={{ width: `${ratio * 100}%` }} /></div>
  </div>;
}

function QueueNotice({ queue }: { queue: WhatsAppPanelProps["queue"] }) {
  if (queue.notice === "empty") return <p className={styles.muted}>Nenhuma mensagem aguardando envio.</p>;
  if (queue.notice === "interval") return <AlertBanner tone="info">Próximo envio liberado a partir de {formatDateTime(queue.nextAllowedAt)}.</AlertBanner>;
  if (queue.notice === "stalled") return <AlertBanner tone="warning">
    <strong>{count(queue.total)} {queue.total === 1 ? "mensagem" : "mensagens"} na fila</strong> e nenhum envio {queue.lastSentAt ? `desde ${formatDateTime(queue.lastSentAt)}` : "registrado"}. {queue.knownReason}
  </AlertBanner>;
  return queue.notice === "unavailable" ? <p className={styles.muted}>Indisponível. Não foi possível carregar.</p> : null;
}

function QueuePanel({ queue, logs }: Pick<WhatsAppPanelProps, "queue" | "logs">) {
  const average = queue.averageMs === "unavailable" ? "Indisponível" : queue.averageMs === null ? "Sem medições" : formatDuration(queue.averageMs);
  return <Panel title="Fila de envio" description="Mensagens aguardando o canal e últimos eventos."
    actions={<Link href="/notificacoes?aba=pendentes" className={styles.link}>Abrir na Central de avisos</Link>}>
    <div className={styles.stack}>
      <div className={styles.stats}>
        <StatInline label="Na fila" value={count(queue.total)} href="/notificacoes?aba=fila" />
        <StatInline label="Falhas aguardando revisão" value={count(queue.failed)} href="/notificacoes?aba=falhas" />
        <StatInline label="Último envio" value={queue.lastSentUnavailable ? "Indisponível" : queue.lastSentAt ? formatDateTime(queue.lastSentAt) : "Sem medições"}
          description={queue.lastSentAt ? formatRelative(queue.lastSentAt) : undefined} />
      </div>
      <QueueNotice queue={queue} />
      {queue.lockedUntil && <p className={styles.muted}>Reservado para envio: até {formatDateTime(queue.lockedUntil)}</p>}
      <p className={styles.muted}>No mês: {count(queue.sentMonth)} enviadas · Tempo médio hoje: {average} · Enviando agora: {count(queue.processing)}</p>
      <h3 className={styles.subtitle} style={{ marginTop: 8 }}>Últimos eventos da fila</h3>
      {logs === null ? <p className={styles.muted}>Indisponível. Não foi possível carregar.</p> : !logs.length ? <p className={styles.muted}>Nenhum evento registrado.</p> :
        <ul className={styles.events}>{logs.map((log) => {
          const status = CHANNEL_LOG_DISPLAY_STATUS[log.status];
          const extra = [log.attempt_count ? `Tentativa ${log.attempt_count}` : null, log.duration_ms !== null ? formatDuration(log.duration_ms) : null].filter(Boolean).join(" · ");
          return <li key={log.id} className={styles.event} title={log.response_id ? `ID técnico: ${log.response_id}` : undefined}>
            <span className={styles.muted}>{formatDateTime(log.created_at)}</span>
            <span>{CHANNEL_EVENT_LABELS[log.operation] ?? "Evento do canal"}{extra && <span className={styles.muted}> · {extra}</span>}</span>
            <span className={styles.muted}>{log.audience === "client" ? "Cliente" : log.audience === "internal" ? "Equipe interna" : ""}</span>
            <span>{status && <StatusBadge domain="aviso" status={status} />}</span>
          </li>;
        })}</ul>}
    </div>
  </Panel>;
}

function QualityPanel({ quality }: Pick<WhatsAppPanelProps, "quality">) {
  return <Panel title="Qualidade dos telefones" description="Cadastros usados pela fila automática. Nenhum número é testado no WhatsApp aqui."
    actions={<Link href="/clientes?contato=sem_contato" className={styles.link}>Revisar na lista de clientes</Link>} state={quality ? "ok" : "error"}>
    {quality && <div className={styles.stack} style={{ gap: 20 }}>
      {quality.limited && <p className={styles.muted}>Foram analisados {formatCount(quality.limited.analyzed)} de {formatCount(quality.limited.total)} clientes.</p>}
      <div className={styles.stats}>
        <StatInline label="Prontos para envio" value={formatCount(quality.ready)} description="Avisos permitidos e telefone válido" />
        <StatInline label="Sem telefone" value={<span className={quality.missing ? styles.warningValue : undefined}>{formatCount(quality.missing)}</span>} description="Não recebem aviso" />
        <StatInline label="Formato inválido" value={formatCount(quality.invalid)} description="Revisar DDD e número" />
        <StatInline label="Números repetidos" value={formatCount(quality.repeated)} description={`${formatCount(quality.groups)} ${quality.groups === 1 ? "grupo" : "grupos"}`} />
        <StatInline label="Avisos bloqueados" value={formatCount(quality.blocked)} description="Fora da fila automática" />
      </div>
      <div className={styles.columns}>
        <div>
          <h3 className={styles.subtitle}>Sem telefone ({formatCount(quality.missingSamples.length)} de {formatCount(quality.missing)})</h3>
          <p className={styles.muted}>Cadastre um WhatsApp ou desative os avisos de cada cliente.</p>
          {quality.missingSamples.length > 0 && <>
            <ul className={styles.box}>{quality.missingSamples.map((client) => <li key={client.id}>
              <div><TableText primary={getClientDisplayName(client.name, client.cnpj)} secondary={formatCnpj(client.cnpj)} /></div>
              <Link href={`/clientes/${client.id}`} className={styles.link}>Abrir cadastro</Link>
            </li>)}</ul>
            <Link href="/clientes?contato=sem_contato" className={styles.link}>Ver os {formatCount(quality.missing)} em Clientes</Link>
          </>}
        </div>
        <div>
          <h3 className={styles.subtitle}>Números repetidos ({formatCount(quality.groups)} {quality.groups === 1 ? "grupo" : "grupos"})</h3>
          <p className={styles.muted}>Pode estar certo quando o mesmo responsável recebe avisos de vários clientes.</p>
          {!quality.duplicates.length ? <p className={styles.muted}>Nenhum número repetido.</p> : quality.duplicates.map((group, index) =>
            <div key={index} className={styles.group}>
              <div className={styles.row}><strong>{group.phone}</strong><span className={`${spec.badge} ${styles.plain}`} data-tone="neutral">{formatCount(group.clients.length)} clientes</span></div>
              {group.clients.map((client) => <span key={client.id}>{getClientDisplayName(client.name, client.cnpj)} · {formatCnpj(client.cnpj)}</span>)}
            </div>)}
        </div>
      </div>
    </div>}
  </Panel>;
}

function HomologationPanel() {
  const id = useId();
  const [pending, setPending] = useState<"number" | "message" | null>(null);
  const [numberResult, setNumberResult] = useState<{ tone: "success" | "danger" | "muted"; text: string } | null>(null);
  const [messageResult, setMessageResult] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirmError, setConfirmError] = useState(false);

  async function checkNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("number");
    setNumberResult(null);
    const { ok, payload } = await request<CheckNumberPayload>("/api/whatsapp/euatendo/check-number", post({ number: form.get("number") }));
    setPending(null);
    if (!ok || !payload?.result) {
      setNumberResult({ tone: "danger", text: getErrorMessage(payload, "Não foi possível verificar o número. Revise o telefone informado e tente novamente.") });
      return;
    }
    const { exists } = payload.result;
    setNumberResult(exists === true ? { tone: "success", text: "Número disponível no WhatsApp." }
      : exists === false ? { tone: "danger", text: "O número informado não está disponível no WhatsApp." }
        : { tone: "muted", text: "A integração não confirmou a disponibilidade do número." });
  }

  async function sendTestMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const confirmed = form.get("confirm_send") === "on";
    setConfirmError(!confirmed);
    setMessageResult(null);
    if (!confirmed) return;
    setPending("message");
    const { ok, payload } = await request<TestMessagePayload>("/api/whatsapp/euatendo/test-message", post({
      number: form.get("number"), message: form.get("message"), check_number: form.get("check_number") === "on", confirm_send: confirmed,
    }));
    setPending(null);
    setMessageResult(ok && payload?.result ? { tone: "success", text: "Mensagem de teste enviada." }
      : { tone: "danger", text: getErrorMessage(payload, "Não foi possível enviar a mensagem de teste. Verifique a conexão do WhatsApp e tente novamente.") });
  }

  return <Disclosure title="Testes de homologação" description="Use só números controlados. Não usa dados de certificado e não entra na fila automática." storageKey="fasa-whatsapp-homologacao">
    <div className={styles.tests}>
      <form onSubmit={checkNumber} className={styles.form}>
        <h3 className={styles.subtitle}>Verificar número</h3>
        <div className={styles.inline}>
          <div className={styles.field}><label htmlFor={`${id}-check`}>Telefone</label>
            <input id={`${id}-check`} name="number" type="tel" required placeholder="(15) 99999-9999" className={spec.input} /></div>
          <Button type="submit" variant="secondary" icon={Search} disabled={pending === "number"}>{pending === "number" ? "Verificando" : "Verificar"}</Button>
        </div>
        <div aria-live="polite">{numberResult && <p className={styles[numberResult.tone]}>{numberResult.text}</p>}</div>
      </form>
      <form onSubmit={sendTestMessage} className={styles.form}>
        <h3 className={styles.subtitle}>Mensagem de teste</h3>
        <div className={styles.field}><label htmlFor={`${id}-number`}>Telefone</label>
          <input id={`${id}-number`} name="number" type="tel" required placeholder="(15) 99999-9999" className={spec.input} /></div>
        <div className={styles.field}><label htmlFor={`${id}-message`}>Mensagem</label>
          <textarea id={`${id}-message`} name="message" rows={3} required maxLength={1200} placeholder="Mensagem para validar o envio" className={styles.textarea} /></div>
        <label className={styles.check}><input name="check_number" type="checkbox" defaultChecked />Verificar o número antes de enviar</label>
        <div><label className={styles.check}><input name="confirm_send" type="checkbox" aria-invalid={confirmError} aria-describedby={confirmError ? `${id}-confirm` : undefined} onChange={() => setConfirmError(false)} />Confirmo que é um envio controlado</label>
          {confirmError && <p id={`${id}-confirm`} role="alert" className={styles.danger}>Marque a confirmação para enviar.</p>}</div>
        <Button type="submit" variant="secondary" icon={Send} disabled={pending === "message"}>{pending === "message" ? "Enviando mensagem" : "Enviar mensagem de teste"}</Button>
        <div aria-live="polite">{messageResult && <p className={styles[messageResult.tone]}>{messageResult.text}</p>}</div>
      </form>
    </div>
  </Disclosure>;
}

export function CanalWhatsAppPanel({ channel, configured, automationEnabled, safety, queue, logs, quality }: WhatsAppPanelProps) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; detail: string } | null>(null);
  const [paused, setPaused] = useState(safety?.dispatchPaused ?? false);
  const [pausing, setPausing] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  async function testHealth() {
    setChecking(true);
    setHealth(null);
    const { ok, payload } = await request<HealthPayload>("/api/whatsapp/euatendo/health", { method: "GET" });
    const fallback = "Não foi possível validar a conexão do WhatsApp. Verifique as configurações da integração.";
    const result = ok ? payload?.health : undefined;
    setHealth(result?.ok ? { ok: true, detail: `Número: ${result.instance?.phoneNumber ?? "Não informado"} · verificado ${formatRelative(new Date())}` }
      : { ok: false, detail: result ? "Não foi possível validar a instância. Verifique as configurações da integração." : getErrorMessage(payload, fallback) });
    setChecking(false);
  }

  async function setAutomationPaused(next: boolean) {
    setPausing(true);
    setPauseError(null);
    const { ok, payload } = await request<ApiError>("/api/whatsapp/automation", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paused: next, reason: next ? "Pausa manual acionada na central do WhatsApp." : null }),
    });
    setPausing(false);
    if (!ok) {
      setPauseError(getErrorMessage(payload, "Não foi possível alterar a pausa operacional do WhatsApp."));
      return;
    }
    setPaused(next);
    router.refresh();
  }

  const blocked = paused || safety?.allowed === false;
  return <section className={styles.page}>
    <header className={styles.header}>
      <div><h1 className="page-title">Automação do WhatsApp</h1><p className="page-subtitle mt-1">Estado do canal, limites de segurança e fila de envio.</p></div>
      <Button variant={health?.ok ? "secondary" : "primary"} icon={RefreshCw} onClick={testHealth} disabled={checking} aria-busy={checking}>{checking ? "Validando conexão" : "Validar conexão"}</Button>
    </header>

    <Panel title="Estado do canal">
      <div className={styles.channel}>
        <div className={styles.block}><span className={styles.blockLabel}>Configuração</span><StatusBadge domain="canal" status={configured ? "configurado" : "nao_configurado"} /><p className={styles.muted}>Canal: {channel}</p></div>
        <div className={styles.block} aria-live="polite"><span className={styles.blockLabel}>Conexão</span>
          <StatusBadge domain="conexao" status={health ? health.ok ? "verificada" : "falhou" : "nao_verificada"} />
          <p className={`${styles.muted} ${styles.clamp}`} title={health?.detail}>{health?.detail ?? "Use Validar conexão para confirmar o número."}</p></div>
        <div className={styles.block}><span className={styles.blockLabel}>Automação</span>
          {automationEnabled === null ? <span className={styles.muted}>Indisponível</span> : <StatusBadge domain="automacao" status={automationEnabled ? "habilitada" : "desligada"} />}
          <p className={`${styles.muted} ${styles.clamp}`}>Envia sozinha quando há mensagens na fila e a conexão responde.</p></div>
      </div>
    </Panel>

    <Panel title="Segurança operacional" description="Limites que seguram o envio para proteger o número." state={safety ? "ok" : "error"} onRetry={() => router.refresh()}
      actions={safety ? paused
        ? <Button variant="primary" icon={CirclePlay} disabled={pausing} onClick={() => setAutomationPaused(false)}>Retomar envio</Button>
        : <Button variant="danger" icon={CirclePause} disabled={pausing} onClick={() => setAutomationPaused(true)}>Pausar envio agora</Button> : undefined}>
      {safety && <div className={styles.stack}>
        <div className={styles.row}><StatusBadge domain="envio" status={blocked ? "pausado" : "liberado"} />
          <span>{safety.autoPauseEnabled ? `Pausa por falhas: ligada (pausa ao chegar em ${formatCount(safety.failurePauseThreshold)} falhas)` : "Pausa por falhas: desligada"}</span></div>
        {blocked && safety.blockedMessage && <p className={styles.muted}>{safety.blockedMessage}</p>}
        {pauseError && <p role="alert" className={styles.danger}>{pauseError}</p>}
        <div className={styles.meters}>
          <Meter label="Envios hoje" used={safety.sentToday} limit={safety.dailyLimit} />
          <Meter label="Envios na última hora" used={safety.sentLastHour} limit={safety.hourlyLimit} />
          <Meter label={`Falhas ${formatFailureWindow(safety.failurePauseWindowMinutes)}`} used={safety.failuresInWindow} limit={safety.failurePauseThreshold} />
        </div>
      </div>}
    </Panel>

    <QueuePanel queue={queue} logs={logs} />
    <QualityPanel quality={quality} />
    <HomologationPanel />
  </section>;
}
