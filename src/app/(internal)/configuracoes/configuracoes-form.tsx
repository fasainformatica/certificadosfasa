"use client";

import {
  Bell,
  Bot,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { ActionBar } from "@/components/ui/action-bar";
import { buttonClass, inputClass, textAreaClass } from "@/components/ui/button-styles";
import { Badge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils/cn";
import { formatDaysLabel } from "@/lib/utils/format";

type SettingsFormState = {
  enabled: boolean;
  expired_notifications_enabled: boolean;
  dias_aviso_vencimento: number[];
  delay_minimo_segundos: number;
  delay_maximo_segundos: number;
  max_attempts: number;
  polling_interval_seconds: number;
  heartbeat_interval_seconds: number;
  send_window_start: string;
  send_window_end: string;
  timezone: string;
};

type TemplateFormState = {
  id: string;
  content: string;
};

type Recipient = {
  id: string;
  nome: string;
  telefone: string;
  telefone_normalizado: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

type ApiErrorPayload = {
  error?: {
    message?: string;
  } | string;
};

type SettingsTab = "geral" | "bot" | "mensagens" | "destinatarios" | "seguranca";

const tabs = [
  { key: "geral", label: "Geral", icon: Bell },
  { key: "bot", label: "Bot WhatsApp", icon: Bot },
  { key: "mensagens", label: "Mensagens", icon: MessageSquareText },
  { key: "destinatarios", label: "Destinatários", icon: UsersRound },
  { key: "seguranca", label: "Segurança", icon: ShieldCheck },
] satisfies { key: SettingsTab; label: string; icon: typeof Bell }[];

const panelClass =
  "rounded-3xl border border-blue-100/70 bg-white/84 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 backdrop-blur-xl sm:p-5";

function parseDays(days: string) {
  return days
    .split(/[,\s;]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
}

function getErrorMessage(payload: ApiErrorPayload | null, fallback: string) {
  if (!payload?.error) {
    return fallback;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  return payload.error.message ?? fallback;
}

export function ConfiguracoesForm({
  canEdit,
  initialSettings,
  initialExpiringTemplate,
  initialExpiredTemplate,
  initialRecipients,
}: {
  canEdit: boolean;
  initialSettings: SettingsFormState;
  initialExpiringTemplate: TemplateFormState;
  initialExpiredTemplate: TemplateFormState;
  initialRecipients: Recipient[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");
  const [settings, setSettings] = useState({
    ...initialSettings,
    dias_aviso_vencimento: initialSettings.dias_aviso_vencimento.join(","),
  });
  const [expiringTemplate, setExpiringTemplate] = useState(initialExpiringTemplate.content);
  const [expiredTemplate, setExpiredTemplate] = useState(initialExpiredTemplate.content);
  const [recipients, setRecipients] = useState(initialRecipients);
  const [recipientDraft, setRecipientDraft] = useState({ nome: "", telefone: "", ativo: true });
  const [pending, setPending] = useState(false);
  const [scanPending, setScanPending] = useState(false);
  const [recipientPendingId, setRecipientPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patchSettings(patch: Partial<typeof settings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function patchRecipient(id: string, patch: Partial<Recipient>) {
    setRecipients((current) => current.map((recipient) => (recipient.id === id ? { ...recipient, ...patch } : recipient)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    const settingsResponse = await fetch("/api/notifications/configuration-bundle", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settings: {
          ...settings,
          dias_aviso_vencimento: parseDays(settings.dias_aviso_vencimento),
        },
        expiring_template: initialExpiringTemplate.id
          ? {
              id: initialExpiringTemplate.id,
              content: expiringTemplate,
            }
          : undefined,
        expired_template: initialExpiredTemplate.id
          ? {
              id: initialExpiredTemplate.id,
              content: expiredTemplate,
            }
          : undefined,
      }),
    });
    const settingsPayload = (await settingsResponse.json().catch(() => null)) as ApiErrorPayload | null;

    if (!settingsResponse.ok) {
      setError(getErrorMessage(settingsPayload, "Não foi possível salvar as configurações."));
      setPending(false);
      return;
    }

    setMessage("Configurações salvas e avisos futuros atualizados.");
    setPending(false);
  }

  async function runManualRebuild() {
    if (!canEdit) {
      return;
    }

    setScanPending(true);
    setError(null);
    setMessage(null);

    const response = await fetch("/api/notifications/check-expiring", { method: "POST" });
    const payload = await response.json().catch(() => null);

    if (!response.ok && response.status !== 207) {
      setError(getErrorMessage(payload, "Não foi possível reconstruir os avisos."));
      setScanPending(false);
      return;
    }

    setMessage(
      `Planejamento atualizado: ${payload?.eventos_removidos ?? 0} avisos futuros removidos, ${payload?.eventos_criados ?? 0} planejados, ${payload?.destinatarios_ativos ?? 0} destinatários ativos.`,
    );
    setScanPending(false);
  }

  async function createRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    setRecipientPendingId("new");
    setError(null);
    setMessage(null);

    const response = await fetch("/api/notifications/recipients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(recipientDraft),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(getErrorMessage(payload, "Não foi possível salvar o destinatário."));
      setRecipientPendingId(null);
      return;
    }

    setRecipients((current) => [...current, payload.recipient]);
    setRecipientDraft({ nome: "", telefone: "", ativo: true });
    setMessage("Destinatário salvo e avisos futuros reconstruídos.");
    setRecipientPendingId(null);
  }

  async function saveRecipient(recipient: Recipient) {
    if (!canEdit) {
      return;
    }

    setRecipientPendingId(recipient.id);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/notifications/recipients/${recipient.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nome: recipient.nome,
        telefone: recipient.telefone,
        ativo: recipient.ativo,
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(getErrorMessage(payload, "Não foi possível atualizar o destinatário."));
      setRecipientPendingId(null);
      return;
    }

    patchRecipient(recipient.id, payload.recipient);
    setMessage("Destinatário atualizado e avisos futuros reconstruídos.");
    setRecipientPendingId(null);
  }

  async function removeRecipient(recipient: Recipient) {
    if (!canEdit || !confirm(`Remover ${recipient.nome}?`)) {
      return;
    }

    setRecipientPendingId(recipient.id);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/notifications/recipients/${recipient.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(getErrorMessage(payload, "Não foi possível remover o destinatário."));
      setRecipientPendingId(null);
      return;
    }

    setRecipients((current) => current.filter((item) => item.id !== recipient.id));
    setMessage("Destinatário removido e avisos futuros reconstruídos.");
    setRecipientPendingId(null);
  }

  const disabled = !canEdit || pending;
  const recipientLimitReached = recipients.length >= 5;
  const parsedDays = parseDays(settings.dias_aviso_vencimento);

  return (
    <div className="grid gap-4">
      <div className="flex gap-2 overflow-x-auto rounded-3xl border border-white/75 bg-white/70 p-2 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                  : "text-slate-600 hover:-translate-y-0.5 hover:bg-white/88 hover:text-blue-700",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </div>
      ) : null}

      {activeTab === "destinatarios" ? (
        <section className={panelClass}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Destinatários internos</h3>
              <p className="mt-1 text-sm text-slate-600">Apenas estes números recebem mensagens automáticas do bot.</p>
            </div>
            <Badge tone={recipientLimitReached ? "amber" : "blue"}>{recipients.length}/5 cadastrados</Badge>
          </div>

          <div className="grid gap-2.5">
            {recipients.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-sm text-slate-600">
                Nenhum destinatário cadastrado.
              </p>
            ) : (
              recipients.map((recipient) => (
                <div key={recipient.id} className="grid gap-2.5 rounded-2xl border border-slate-200/80 bg-white/72 p-3 lg:grid-cols-[minmax(180px,1fr)_180px_96px_auto]">
                  <input
                    disabled={!canEdit || recipientPendingId === recipient.id}
                    value={recipient.nome}
                    onChange={(event) => patchRecipient(recipient.id, { nome: event.target.value })}
                    className={inputClass}
                  />
                  <input
                    disabled={!canEdit || recipientPendingId === recipient.id}
                    value={recipient.telefone}
                    onChange={(event) => patchRecipient(recipient.id, { telefone: event.target.value })}
                    className={inputClass}
                  />
                  <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      disabled={!canEdit || recipientPendingId === recipient.id}
                      checked={recipient.ativo}
                      onChange={(event) => patchRecipient(recipient.id, { ativo: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                    Ativo
                  </label>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={recipientPendingId === recipient.id}
                        onClick={() => saveRecipient(recipient)}
                        className={buttonClass("secondary", "h-10 px-3")}
                      >
                        {recipientPendingId === recipient.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </button>
                      <button
                        type="button"
                        disabled={recipientPendingId === recipient.id}
                        onClick={() => removeRecipient(recipient)}
                        className={buttonClass("danger", "h-10 px-3")}
                        aria-label={`Remover ${recipient.nome}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          {canEdit ? (
            <form onSubmit={createRecipient} className="mt-4 grid gap-2.5 rounded-2xl border border-dashed border-blue-200 bg-blue-50/35 p-3 lg:grid-cols-[minmax(180px,1fr)_180px_96px_auto]">
              <input
                required
                disabled={recipientPendingId === "new" || recipientLimitReached}
                value={recipientDraft.nome}
                onChange={(event) => setRecipientDraft((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Nome interno"
                className={inputClass}
              />
              <input
                required
                disabled={recipientPendingId === "new" || recipientLimitReached}
                value={recipientDraft.telefone}
                onChange={(event) => setRecipientDraft((current) => ({ ...current, telefone: event.target.value }))}
                placeholder="(11) 99999-9999"
                className={inputClass}
              />
              <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={recipientPendingId === "new" || recipientLimitReached}
                  checked={recipientDraft.ativo}
                  onChange={(event) => setRecipientDraft((current) => ({ ...current, ativo: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                Ativo
              </label>
              <button
                type="submit"
                disabled={recipientPendingId === "new" || recipientLimitReached}
                className={buttonClass("primary", "h-10 px-3")}
              >
                {recipientPendingId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </form>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">Limite: 5 destinatários cadastrados. Telefones são salvos no formato 55 + DDD + número.</p>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {activeTab === "geral" ? (
            <section className={panelClass}>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-950">Avisos automáticos</h3>
                <p className="mt-1 text-sm text-slate-500">Controle o planejamento dos avisos e os dias antes do vencimento.</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
                <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/62 p-3">
                  <label className="inline-flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 text-sm font-medium text-slate-800">
                    <span>Avisos ativos</span>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enabled}
                      onChange={(event) => patchSettings({ enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </label>
                  <label className="inline-flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2 text-sm font-medium text-slate-800">
                    <span>Avisos de vencidos</span>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.expired_notifications_enabled}
                      onChange={(event) => patchSettings({ expired_notifications_enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </label>
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-2 text-sm font-medium text-slate-800">
                    Dias antes do vencimento
                    <input
                      disabled={disabled}
                      value={settings.dias_aviso_vencimento}
                      onChange={(event) => patchSettings({ dias_aviso_vencimento: event.target.value })}
                      placeholder="30,15,1"
                      className={inputClass}
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {parsedDays.map((day) => (
                      <Badge key={day} tone="blue">{formatDaysLabel(day)}</Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Inicio permitido
                  <input
                    type="time"
                    value={settings.send_window_start}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ send_window_start: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Fim permitido
                  <input
                    type="time"
                    value={settings.send_window_end}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ send_window_end: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Fuso horário
                  <input
                    value={settings.timezone}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ timezone: event.target.value })}
                    className={inputClass}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {activeTab === "bot" ? (
            <section className={panelClass}>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-950">Cadencia do Bot WhatsApp</h3>
                <p className="mt-1 text-sm text-slate-500">Defina como o aplicativo consulta e envia mensagens, sempre uma por vez.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Intervalo mínimo entre mensagens (segundos)
                  <input
                    type="number"
                    min={30}
                    value={settings.delay_minimo_segundos}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ delay_minimo_segundos: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Tempo de espera entre cada mensagem enviada pelo bot.</span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Intervalo máximo entre mensagens (segundos)
                  <input
                    type="number"
                    min={30}
                    value={settings.delay_maximo_segundos}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ delay_maximo_segundos: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Quando maior que o mínimo, o bot alterna o tempo para envio natural.</span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Máximo de tentativas
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.max_attempts}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ max_attempts: Number(event.target.value) })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Consulta automatica do bot (segundos)
                  <input
                    type="number"
                    min={5}
                    max={25}
                    value={settings.polling_interval_seconds}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ polling_interval_seconds: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Frequencia com que o aplicativo procura avisos prontos.</span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Sincronização do bot (segundos)
                  <input
                    type="number"
                    min={15}
                    max={300}
                    value={settings.heartbeat_interval_seconds}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ heartbeat_interval_seconds: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Intervalo usado para mostrar que o aplicativo continua conectado.</span>
                </label>
              </div>
            </section>
          ) : null}

          {activeTab === "mensagens" ? (
            <section className={panelClass}>
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-950">Templates de mensagem</h3>
                <p className="mt-1 text-sm text-slate-500">O sistema substitui as variaveis antes de entregar a mensagem ao bot.</p>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                <details open className="rounded-2xl border border-slate-200/80 bg-slate-50/72 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-950">Certificado a vencer</summary>
                  <textarea
                    value={expiringTemplate}
                    disabled={disabled}
                    onChange={(event) => setExpiringTemplate(event.target.value)}
                    rows={5}
                    className={cn(textAreaClass, "mt-3")}
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Variáveis: {"{cliente_nome}"}, {"{cliente_telefone}"}, {"{cnpj}"}, {"{certificado_nome}"}, {"{data_vencimento}"}, {"{dias}"}.
                  </p>
                </details>
                <details className="rounded-2xl border border-slate-200/80 bg-slate-50/72 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-950">Certificados vencidos</summary>
                  <textarea
                    value={expiredTemplate}
                    disabled={disabled}
                    onChange={(event) => setExpiredTemplate(event.target.value)}
                    rows={5}
                    className={cn(textAreaClass, "mt-3")}
                  />
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    Variáveis: {"{data_hoje}"}, {"{total_vencidos}"}, {"{lista_certificados_vencidos}"}, {"{cliente_telefone}"}.
                  </p>
                </details>
              </div>
            </section>
          ) : null}

          {activeTab === "seguranca" ? (
            <section className={panelClass}>
              <h3 className="text-base font-semibold text-slate-950">Segurança operacional</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-green-100 bg-green-50/70 p-3 text-sm text-green-900">O bot recebe apenas mensagens prontas para envio.</div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">Credenciais e chaves internas não são exibidas nesta tela.</div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-700">Senhas, links e caminhos privados não entram nos avisos.</div>
              </div>
            </section>
          ) : null}

          {canEdit ? (
            <ActionBar>
              <button
                type="button"
                disabled={scanPending}
                onClick={runManualRebuild}
                className={buttonClass("secondary", "h-10")}
              >
                {scanPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar planejamento
              </button>
              <button
                type="submit"
                disabled={pending}
                className={buttonClass("primary", "h-10")}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar configurações
              </button>
            </ActionBar>
          ) : null}
        </form>
      )}
    </div>
  );
}
