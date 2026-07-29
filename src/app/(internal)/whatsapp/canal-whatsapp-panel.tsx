"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { formatDateTimeShort } from "@/lib/utils/format";
import { WHATSAPP_EXTENSION_PROVIDER } from "@/lib/whatsapp/providers";

type EuAtendoConfig = {
  enabled: boolean;
  apiUrlConfigured: boolean;
  tokenConfigured: boolean;
  instanceConfigured: boolean;
};

type ExtensionConfig = {
  enabled: boolean;
  tokenConfigured: boolean;
  activeProvider: boolean;
};

type EuAtendoStats = {
  pending: number;
  retry: number;
  failed: number;
  sentToday: number;
  sentMonth: number;
  processing: number;
  lastSentAt: string | null;
  averageDurationMs: number | null;
};

type EuAtendoState = {
  provider: string;
  last_dispatch_at: string | null;
  next_allowed_send_at: string;
  locked_until: string | null;
  updated_at: string;
} | null;

type EuAtendoLog = {
  id: string;
  event_id: string | null;
  audience: string | null;
  operation: string;
  telefone_mascarado: string | null;
  template_type: string | null;
  duration_ms: number | null;
  status: string;
  attempt_count: number | null;
  error_code: string | null;
  error_message: string | null;
  response_id: string | null;
  created_at: string;
};

type EuAtendoHealthPayload = {
  health?: {
    ok: boolean;
    latencyMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    instance: {
      connected: boolean;
      status: string | null;
      profileName: string | null;
      phoneNumber: string | null;
      serverType: string | null;
      cached: boolean | null;
    } | null;
    listedInstance: {
      id: string;
      name: string | null;
      status: string | null;
      phoneNumber: string | null;
      profileName: string | null;
      serverType: string | null;
    } | null;
  };
  error?: {
    message?: string;
  } | string;
};

type CheckNumberPayload = {
  result?: {
    number: string;
    exists: boolean | null;
    jid_found: boolean;
  };
  error?: {
    message?: string;
  } | string;
};

type TestMessagePayload = {
  result?: {
    accepted: boolean;
    provider: string;
    provider_message_id: string | null;
    provider_status: string | null;
    chat_id: string | null;
    http_status: number | null;
  };
  error?: {
    message?: string;
  } | string;
};

function getErrorMessage(payload: EuAtendoHealthPayload | CheckNumberPayload | TestMessagePayload | null, fallback: string) {
  if (!payload?.error) {
    return fallback;
  }

  return typeof payload.error === "string" ? payload.error : payload.error.message ?? fallback;
}

function MetricCard({
  title,
  value,
  description,
  icon,
  tone = "blue",
}: {
  title: string;
  value: ReactNode;
  description?: string;
  icon: ReactNode;
  tone?: Tone;
}) {
  const toneClasses: Record<Tone, string> = {
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    green: "bg-green-50 text-green-700 ring-green-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${toneClasses[tone]}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-bold tracking-normal text-slate-950">{value}</div>
      {description ? <p className="mt-1 text-sm leading-5 text-slate-600" title={description}>{description}</p> : null}
    </article>
  );
}

function formatDuration(ms: number | null) {
  if (ms === null) {
    return "-";
  }

  if (ms < 1000) {
    return `${ms} ms`;
  }

  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

function getLogStatusMeta(status: string): { label: string; tone: Tone } {
  if (status === "sent") {
    return { label: "Mensagem enviada", tone: "green" };
  }

  if (status === "retry") {
    return { label: "Nova tentativa agendada", tone: "amber" };
  }

  if (status === "failed" || status === "error") {
    return { label: "Não foi possível enviar", tone: "red" };
  }

  return { label: "Registrado", tone: "blue" };
}

function getSafeLogMessage(log: EuAtendoLog) {
  const raw = `${log.error_code ?? ""} ${log.error_message ?? ""}`.toLowerCase();

  if (!raw.trim()) {
    return null;
  }

  if (raw.includes("provider_disabled") || raw.includes("feature flag")) {
    return "Envio automático pausado pela configuração.";
  }

  if (raw.includes("for update") || raw.includes("reserve")) {
    return "Não foi possível reservar a próxima mensagem.";
  }

  if (raw.includes("timeout") || raw.includes("rate")) {
    return "A integração demorou para responder. Uma nova tentativa poderá ser feita automaticamente.";
  }

  return "Não foi possível concluir o envio. Verifique a integração e tente novamente.";
}

export function CanalWhatsAppPanel({
  euAtendo,
}: {
  euAtendo: {
    config: EuAtendoConfig;
    extensionConfig: ExtensionConfig;
    activeProvider: string;
    activeProviderLabel: string;
    notificationSettingsEnabled: boolean;
    stats: EuAtendoStats;
    state: EuAtendoState;
    logs: EuAtendoLog[];
  };
}) {
  const [pending, setPending] = useState<"health" | "number" | "message" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<EuAtendoHealthPayload["health"] | null>(null);
  const [numberCheck, setNumberCheck] = useState<CheckNumberPayload["result"] | null>(null);
  const [testResult, setTestResult] = useState<TestMessagePayload["result"] | null>(null);
  const activeProviderIsExtension = euAtendo.activeProvider === WHATSAPP_EXTENSION_PROVIDER;
  const configured = activeProviderIsExtension
    ? euAtendo.extensionConfig.enabled && euAtendo.extensionConfig.tokenConfigured
    : euAtendo.config.apiUrlConfigured && euAtendo.config.tokenConfigured && euAtendo.config.instanceConfigured;
  const automationEnabled = activeProviderIsExtension
    ? euAtendo.notificationSettingsEnabled && euAtendo.extensionConfig.enabled && euAtendo.extensionConfig.tokenConfigured
    : euAtendo.notificationSettingsEnabled && euAtendo.config.enabled;
  const healthStatus = health?.ok
    ? { label: "Conectado", tone: "green" as const }
    : health
      ? { label: "Desconectado", tone: "red" as const }
      : { label: "Não verificado", tone: "slate" as const };
  const queueTotal = euAtendo.stats.pending + euAtendo.stats.retry;

  async function testHealth() {
    setPending("health");
    setError(null);
    setHealth(null);

    const response = await fetch("/api/whatsapp/euatendo/health", { method: "GET" });
    const payload = (await response.json().catch(() => null)) as EuAtendoHealthPayload | null;

    if (!response.ok || !payload?.health) {
      setError(getErrorMessage(payload, "Não foi possível validar a conexão do WhatsApp. Verifique as configurações da integração."));
      setPending(null);
      return;
    }

    setHealth(payload.health);
    setPending(null);
  }

  async function checkNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("number");
    setError(null);
    setNumberCheck(null);

    const response = await fetch("/api/whatsapp/euatendo/check-number", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: form.get("number") }),
    });
    const payload = (await response.json().catch(() => null)) as CheckNumberPayload | null;

    if (!response.ok || !payload?.result) {
      setError(getErrorMessage(payload, "Não foi possível verificar o número. Revise o telefone informado e tente novamente."));
      setPending(null);
      return;
    }

    setNumberCheck(payload.result);
    setPending(null);
  }

  async function sendTestMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending("message");
    setError(null);
    setTestResult(null);

    const response = await fetch("/api/whatsapp/euatendo/test-message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        number: form.get("number"),
        message: form.get("message"),
        check_number: form.get("check_number") === "on",
        confirm_send: form.get("confirm_send") === "on",
      }),
    });
    const payload = (await response.json().catch(() => null)) as TestMessagePayload | null;

    if (!response.ok || !payload?.result) {
      setError(getErrorMessage(payload, "Não foi possível enviar a mensagem de teste. Verifique a conexão do WhatsApp e tente novamente."));
      setPending(null);
      return;
    }

    setTestResult(payload.result);
    setPending(null);
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-950">WhatsApp automatico</h2>
              <Badge tone="blue">Canal ativo: {euAtendo.activeProviderLabel}</Badge>
              <Badge tone={healthStatus.tone}>{healthStatus.label}</Badge>
              <Badge tone={automationEnabled ? "green" : "slate"}>
                {automationEnabled ? "Envio automático ativo" : "Envio automático pausado"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Acompanhe a fila dos avisos de vencimento e valide o canal oficial quando necessario.
            </p>
            {!euAtendo.notificationSettingsEnabled ? (
              <p className="mt-2 text-sm font-medium text-amber-700">
                O envio automatico esta pausado nas Configuracoes do sistema.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={testHealth}
            disabled={pending === "health"}
            className={buttonClass("primary", "h-10 px-4")}
          >
            {pending === "health" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {pending === "health" ? "Validando conexão" : "Validar conexão"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Integração configurada"
            value={<Badge tone={configured ? "green" : "red"}>{configured ? "Sim" : "Não"}</Badge>}
            description={activeProviderIsExtension ? "Token da extensao configurado no servidor" : "Variáveis server-only presentes"}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone={configured ? "green" : "red"}
          />
          <MetricCard
            title="Instância conectada"
            value={<span className="text-xl">{health?.instance?.profileName ?? health?.listedInstance?.name ?? "-"}</span>}
            description={health?.instance?.phoneNumber ?? "Valide a conexão para ver o número mascarado"}
            icon={<Smartphone className="h-4 w-4" />}
            tone={health?.ok ? "green" : "blue"}
          />
          <MetricCard
            title="Mensagens na fila"
            value={queueTotal}
            description={`${euAtendo.stats.retry} com nova tentativa agendada`}
            icon={<Clock3 className="h-4 w-4" />}
            tone="blue"
          />
          <MetricCard
            title="Mensagens enviadas hoje"
            value={euAtendo.stats.sentToday}
            description={euAtendo.stats.lastSentAt ? `Último envio às ${formatDateTimeShort(euAtendo.stats.lastSentAt)}` : "Nenhum envio hoje"}
            icon={<Send className="h-4 w-4" />}
            tone="green"
          />
          <MetricCard title="Enviadas no mês" value={euAtendo.stats.sentMonth} description="Mensagens aceitas pela integração" icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
          <MetricCard title="Em processamento" value={euAtendo.stats.processing} description="Reservadas ou enviando agora" icon={<Activity className="h-4 w-4" />} tone="amber" />
          <MetricCard title="Envios com falha" value={euAtendo.stats.failed} description="Precisam de atenção" icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
          <MetricCard
            title="Tempo médio de envio"
            value={<span className="text-xl">{formatDuration(euAtendo.stats.averageDurationMs)}</span>}
            description="Média dos envios aceitos hoje"
            icon={<Clock3 className="h-4 w-4" />}
            tone="slate"
          />
        </div>

        {health ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" aria-live="polite">
            <p className="font-semibold text-slate-950">
              Resultado da conexão: {health.ok ? "instância pronta para envio" : "precisa de atenção"}
            </p>
            <p className="mt-1">
              Status: {health.instance?.status ?? "-"} | Servidor: {health.instance?.serverType ?? "-"} | Latência:{" "}
              {health.latencyMs !== null ? formatDuration(health.latencyMs) : "-"}
            </p>
            {!health.ok ? (
              <p className="mt-1 text-red-700">Não foi possível validar a instância. Verifique as configurações da integração.</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <form onSubmit={checkNumber} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Verificar número</h3>
              <p className="mt-1 text-xs text-slate-500">Use números controlados para homologação.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input name="number" required placeholder="(11) 99999-9999" className={inputClass} aria-label="Número para verificar no WhatsApp" />
              <button type="submit" disabled={pending === "number"} className={buttonClass("secondary", "h-10 px-4")}>
                {pending === "number" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {pending === "number" ? "Verificando número" : "Verificar número"}
              </button>
            </div>
            {numberCheck ? (
              <p className="text-sm text-slate-700" aria-live="polite">
                {numberCheck.exists === true
                  ? "Número disponível no WhatsApp."
                  : numberCheck.exists === false
                    ? "O número informado não está disponível no WhatsApp."
                    : "A integração não confirmou a disponibilidade do número."}
              </p>
            ) : null}
          </form>

          <form onSubmit={sendTestMessage} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Mensagem de teste</h3>
              <p className="mt-1 text-xs text-slate-500">
                Não usa dados de certificado, não entra na fila automática e serve apenas para homologação.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
              <input name="number" required placeholder="(11) 99999-9999" className={inputClass} aria-label="Número para mensagem de teste" />
              <input
                name="message"
                required
                maxLength={1200}
                placeholder="Digite uma mensagem para validar o envio"
                className={inputClass}
                aria-label="Mensagem de teste"
              />
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-2">
                <input name="check_number" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                Verificar número antes de enviar
              </label>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-800">
                <input name="confirm_send" type="checkbox" required className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                Confirmo o envio controlado
              </label>
            </div>
            <button type="submit" disabled={pending === "message"} className={buttonClass("primary", "h-10 w-full")}>
              {pending === "message" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {pending === "message" ? "Enviando mensagem" : "Enviar mensagem de teste"}
            </button>
            {testResult ? (
              <p className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" aria-live="polite">
                Mensagem de teste enviada.
              </p>
            ) : null}
          </form>
        </div>

        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p> : null}
      </section>

      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Fila automática</h2>
            <p className="mt-1 text-sm text-slate-600">Cadência, reserva atual e últimos envios sanitizados.</p>
          </div>
          <Badge tone={automationEnabled ? "green" : "slate"}>
            {automationEnabled ? "Envio automático ativo" : "Envio automático pausado"}
          </Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-700">Próximo envio permitido</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {euAtendo.state?.next_allowed_send_at ? formatDateTimeShort(euAtendo.state.next_allowed_send_at) : "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-600">Último envio automático</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {euAtendo.state?.last_dispatch_at ? formatDateTimeShort(euAtendo.state.last_dispatch_at) : "-"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-600">Reserva atual</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">
              {euAtendo.state?.locked_until ? `Reservado até ${formatDateTimeShort(euAtendo.state.locked_until)}` : "Livre"}
            </p>
          </div>
        </div>

        {!euAtendo.logs.length ? (
          <EmptyState
            title="Nenhum envio registrado"
            description="Os envios aparecerão aqui após a homologação da integração."
            icon={MessageCircle}
          />
        ) : (
          <div className="grid gap-2">
            {euAtendo.logs.map((log) => {
              const meta = getLogStatusMeta(log.status);
              const safeMessage = getSafeLogMessage(log);

              return (
                <article key={log.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-xs font-semibold text-slate-600">
                        {log.audience === "client" ? "Cliente" : "Equipe interna"} | {log.telefone_mascarado ?? "-"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTimeShort(log.created_at)} | Tentativa {log.attempt_count ?? "-"} | {formatDuration(log.duration_ms)}
                    </p>
                    {safeMessage ? <p className="mt-1 text-xs text-red-700">{safeMessage}</p> : null}
                  </div>
                  <p className="text-xs text-slate-500">{log.response_id ? `ID técnico ${log.response_id}` : "Sem ID técnico"}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
