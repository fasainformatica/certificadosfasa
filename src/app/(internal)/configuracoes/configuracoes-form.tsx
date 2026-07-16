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
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { ActionBar } from "@/components/ui/action-bar";
import { buttonClass, inputClass, textAreaClass } from "@/components/ui/button-styles";
import { EmptyState } from "@/components/ui/empty-state";
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
  notificacao_rebuild?: {
    skipped_reason?: string | null;
  };
};

type SettingsTab = "geral" | "canal" | "mensagens" | "destinatarios" | "seguranca";

const tabs = [
  { key: "geral", label: "Geral", icon: Bell },
  { key: "canal", label: "WhatsApp", icon: Bot },
  { key: "mensagens", label: "Mensagens", icon: MessageSquareText },
  { key: "destinatarios", label: "Destinatários", icon: UsersRound },
  { key: "seguranca", label: "Segurança", icon: ShieldCheck },
] satisfies { key: SettingsTab; label: string; icon: typeof Bell }[];

const panelClass = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5";

function normalizeDays(days: number[]) {
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 1 && day <= 365))).sort((a, b) => b - a);
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

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className={panelClass}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function InlineAlert({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700",
      )}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {children}
    </div>
  );
}

export function ConfiguracoesForm({
  canEdit,
  userEmail,
  userRole,
  initialSettings,
  initialExpiringTemplate,
  initialExpiredTemplate,
  initialClientExpiringTemplate,
  initialClientExpiredTemplate,
  initialRecipients,
}: {
  canEdit: boolean;
  userEmail: string | null;
  userRole: "admin" | "financeiro";
  initialSettings: SettingsFormState;
  initialExpiringTemplate: TemplateFormState;
  initialExpiredTemplate: TemplateFormState;
  initialClientExpiringTemplate: TemplateFormState;
  initialClientExpiredTemplate: TemplateFormState;
  initialRecipients: Recipient[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");
  const [settings, setSettings] = useState({
    ...initialSettings,
    dias_aviso_vencimento: normalizeDays(initialSettings.dias_aviso_vencimento),
  });
  const [dayDraft, setDayDraft] = useState("");
  const [dayError, setDayError] = useState<string | null>(null);
  const [expiringTemplate, setExpiringTemplate] = useState(initialExpiringTemplate.content);
  const [expiredTemplate, setExpiredTemplate] = useState(initialExpiredTemplate.content);
  const [clientExpiringTemplate, setClientExpiringTemplate] = useState(initialClientExpiringTemplate.content);
  const [clientExpiredTemplate, setClientExpiredTemplate] = useState(initialClientExpiredTemplate.content);
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

  function addDay() {
    const value = Number(dayDraft);

    if (!Number.isInteger(value) || value < 1 || value > 365) {
      setDayError("Informe um número entre 1 e 365.");
      return;
    }

    if (settings.dias_aviso_vencimento.includes(value)) {
      setDayError("Este dia já está na lista.");
      return;
    }

    patchSettings({ dias_aviso_vencimento: normalizeDays([...settings.dias_aviso_vencimento, value]) });
    setDayDraft("");
    setDayError(null);
  }

  function removeDay(day: number) {
    patchSettings({ dias_aviso_vencimento: settings.dias_aviso_vencimento.filter((item) => item !== day) });
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
        settings,
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
        client_expiring_template: initialClientExpiringTemplate.id
          ? {
              id: initialClientExpiringTemplate.id,
              content: clientExpiringTemplate,
            }
          : undefined,
        client_expired_template: initialClientExpiredTemplate.id
          ? {
              id: initialClientExpiredTemplate.id,
              content: clientExpiredTemplate,
            }
          : undefined,
      }),
    });
    const settingsPayload = (await settingsResponse.json().catch(() => null)) as ApiErrorPayload | null;

    if (!settingsResponse.ok) {
      setError(getErrorMessage(settingsPayload, "Não foi possível salvar as configurações. Revise os campos destacados."));
      setPending(false);
      return;
    }

    if (settingsPayload?.notificacao_rebuild?.skipped_reason === "notifications_disabled") {
      setMessage("Configurações salvas. O envio automático está pausado e nenhum planejamento foi recriado.");
    } else {
      setMessage("Configurações salvas. Os avisos futuros foram atualizados.");
    }
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
      setError(getErrorMessage(payload, "Não foi possível atualizar o planejamento. Tente novamente em alguns instantes."));
      setScanPending(false);
      return;
    }

    if (payload?.skipped_reason === "notifications_disabled") {
      setMessage("Envio automático pausado. Nenhum planejamento foi recriado.");
    } else {
      setMessage(
        `Planejamento atualizado: ${payload?.eventos_removidos ?? 0} avisos futuros removidos, ${payload?.eventos_criados ?? 0} planejados, ${payload?.destinatarios_ativos ?? 0} destinatários ativos.`,
      );
    }
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
      setError(getErrorMessage(payload, "Não foi possível salvar o destinatário. Revise os dados e tente novamente."));
      setRecipientPendingId(null);
      return;
    }

    setRecipients((current) => [...current, payload.recipient]);
    setRecipientDraft({ nome: "", telefone: "", ativo: true });
    setMessage("Destinatário salvo. Os avisos futuros foram reconstruídos.");
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
      setError(getErrorMessage(payload, "Não foi possível atualizar o destinatário. Revise os dados e tente novamente."));
      setRecipientPendingId(null);
      return;
    }

    patchRecipient(recipient.id, payload.recipient);
    setMessage("Destinatário atualizado. Os avisos futuros foram reconstruídos.");
    setRecipientPendingId(null);
  }

  async function removeRecipient(recipient: Recipient) {
    if (!canEdit || !confirm(`Remover ${recipient.nome}? Esta ação remove o destinatário dos próximos avisos internos.`)) {
      return;
    }

    setRecipientPendingId(recipient.id);
    setError(null);
    setMessage(null);

    const response = await fetch(`/api/notifications/recipients/${recipient.id}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setError(getErrorMessage(payload, "Não foi possível remover o destinatário. Tente novamente."));
      setRecipientPendingId(null);
      return;
    }

    setRecipients((current) => current.filter((item) => item.id !== recipient.id));
    setMessage("Destinatário removido. Os avisos futuros foram reconstruídos.");
    setRecipientPendingId(null);
  }

  const disabled = !canEdit || pending;
  const recipientLimitReached = recipients.length >= 5;

  return (
    <div className="grid gap-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Conta e acesso</h2>
            <p className="mt-1 break-all text-sm text-slate-600">{userEmail ?? "Usuário interno"}</p>
          </div>
          <Badge tone="blue">{userRole === "admin" ? "Administrador" : "Financeiro"}</Badge>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-950/5" role="tablist" aria-label="Seções de configuração">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
                active
                  ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      {message ? <InlineAlert tone="success">{message}</InlineAlert> : null}

      {activeTab === "destinatarios" ? (
        <FormSection
          title="Destinatários internos"
          description="Apenas estes números recebem mensagens automáticas destinadas à equipe interna."
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Badge tone={recipientLimitReached ? "amber" : "blue"}>{recipients.length}/5 cadastrados</Badge>
          </div>

          <div className="grid gap-2.5">
            {recipients.length === 0 ? (
              <EmptyState
                title="Nenhum destinatário cadastrado"
                description="Adicione ao menos um destinatário para receber avisos internos por WhatsApp."
                icon={UsersRound}
              />
            ) : (
              recipients.map((recipient) => (
                <div key={recipient.id} className="grid gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(180px,1fr)_180px_96px_auto]">
                  <label className="grid gap-1 text-sm font-medium text-slate-800">
                    Nome
                    <input
                      disabled={!canEdit || recipientPendingId === recipient.id}
                      value={recipient.nome}
                      onChange={(event) => patchRecipient(recipient.id, { nome: event.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-slate-800">
                    WhatsApp
                    <input
                      disabled={!canEdit || recipientPendingId === recipient.id}
                      value={recipient.telefone}
                      onChange={(event) => patchRecipient(recipient.id, { telefone: event.target.value })}
                      className={inputClass}
                      placeholder="(11) 99999-9999"
                    />
                  </label>
                  <label className="inline-flex h-16 items-center gap-2 text-sm font-medium text-slate-700">
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
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        disabled={recipientPendingId === recipient.id}
                        onClick={() => saveRecipient(recipient)}
                        className={buttonClass("secondary", "h-11 px-3")}
                      >
                        {recipientPendingId === recipient.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </button>
                      <button
                        type="button"
                        disabled={recipientPendingId === recipient.id}
                        onClick={() => removeRecipient(recipient)}
                        className={buttonClass("danger", "h-11 px-3")}
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
            <form onSubmit={createRecipient} className="mt-4 grid gap-2.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 lg:grid-cols-[minmax(180px,1fr)_180px_96px_auto]">
              <label className="grid gap-1 text-sm font-medium text-slate-800">
                Nome
                <input
                  required
                  disabled={recipientPendingId === "new" || recipientLimitReached}
                  value={recipientDraft.nome}
                  onChange={(event) => setRecipientDraft((current) => ({ ...current, nome: event.target.value }))}
                  placeholder="Nome interno"
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-800">
                WhatsApp
                <input
                  required
                  disabled={recipientPendingId === "new" || recipientLimitReached}
                  value={recipientDraft.telefone}
                  onChange={(event) => setRecipientDraft((current) => ({ ...current, telefone: event.target.value }))}
                  placeholder="(11) 99999-9999"
                  className={inputClass}
                />
              </label>
              <label className="inline-flex h-16 items-center gap-2 text-sm font-medium text-slate-700">
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
                className={buttonClass("primary", "self-end")}
              >
                {recipientPendingId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar destinatário
              </button>
            </form>
          ) : null}

          <p className="mt-3 text-xs leading-5 text-slate-500">Limite: 5 destinatários. Telefones são salvos no formato 55 + DDD + número.</p>
        </FormSection>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          {activeTab === "geral" ? (
            <FormSection
              title="Planejamento de avisos"
              description="Defina quando os avisos devem ser criados e enviados."
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-800">
                    <span>Envio automático</span>
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enabled}
                      onChange={(event) => patchSettings({ enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </label>
                  <label className="inline-flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-800">
                    <span>Avisos de certificados vencidos</span>
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
                  <div className="grid gap-2">
                    <label htmlFor="dias_aviso" className="text-sm font-medium text-slate-800">
                      Dias de antecedência
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        id="dias_aviso"
                        type="number"
                        min={1}
                        max={365}
                        disabled={disabled}
                        value={dayDraft}
                        onChange={(event) => setDayDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addDay();
                          }
                        }}
                        placeholder="Ex.: 30"
                        className={inputClass}
                      />
                      <button type="button" disabled={disabled} onClick={addDay} className={buttonClass("secondary", "h-11")}>
                        <Plus className="h-4 w-4" />
                        Adicionar dia
                      </button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">Use valores entre 1 e 365 dias. Duplicados são bloqueados.</p>
                    {dayError ? <p className="text-xs font-medium text-red-700">{dayError}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {settings.dias_aviso_vencimento.map((day) => (
                      <span key={day} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                        {formatDaysLabel(day)}
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => removeDay(day)}
                          className="rounded-full p-0.5 text-blue-600 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          aria-label={`Remover ${formatDaysLabel(day)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Horário inicial de envio
                  <input
                    type="time"
                    value={settings.send_window_start}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ send_window_start: event.target.value })}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Horário final de envio
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
            </FormSection>
          ) : null}

          {activeTab === "canal" ? (
            <FormSection
              title="Cadência do WhatsApp"
              description="Defina os intervalos e tentativas do dispatcher euAtendo."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Intervalo mínimo entre mensagens (segundos)
                  <input
                    type="number"
                    min={180}
                    value={settings.delay_minimo_segundos}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ delay_minimo_segundos: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Use pelo menos 180 segundos para reduzir risco de restricao.</span>
                </label>
                <label className="grid gap-2 text-sm font-medium text-slate-800">
                  Intervalo máximo entre mensagens (segundos)
                  <input
                    type="number"
                    min={180}
                    value={settings.delay_maximo_segundos}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ delay_maximo_segundos: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Recomendado: entre 180 e 300 segundos para evitar disparos em rajada.</span>
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
                  Frequência sugerida do dispatcher (segundos)
                  <input
                    type="number"
                    min={5}
                    max={25}
                    value={settings.polling_interval_seconds}
                    disabled={disabled}
                    onChange={(event) => patchSettings({ polling_interval_seconds: Number(event.target.value) })}
                    className={inputClass}
                  />
                  <span className="text-xs font-normal leading-5 text-slate-500">Referência operacional para o cron que chama a fila.</span>
                </label>
              </div>
            </FormSection>
          ) : null}

          {activeTab === "mensagens" ? (
            <FormSection
              title="Templates de mensagem"
              description="O sistema substitui as variáveis antes de entregar a mensagem ao WhatsApp."
            >
              <div className="grid gap-3 xl:grid-cols-2">
                <details open className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
                <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
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
              <div className="mt-4 rounded-2xl border border-green-100 bg-green-50 p-3">
                <h3 className="text-sm font-semibold text-slate-950">Cliente no WhatsApp</h3>
                <p className="mt-1 text-xs text-slate-600">Templates usados apenas quando o cliente tem WhatsApp cadastrado e não está bloqueado.</p>
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <details open className="rounded-2xl border border-slate-200 bg-white p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-950">Aviso de vencimento ao cliente</summary>
                    <textarea
                      value={clientExpiringTemplate}
                      disabled={disabled}
                      onChange={(event) => setClientExpiringTemplate(event.target.value)}
                      rows={5}
                      className={cn(textAreaClass, "mt-3")}
                    />
                  </details>
                  <details className="rounded-2xl border border-slate-200 bg-white p-3 opacity-75">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-950">Certificado vencido ao cliente</summary>
                    <textarea
                      value={clientExpiredTemplate}
                      disabled
                      onChange={(event) => setClientExpiredTemplate(event.target.value)}
                      rows={5}
                      className={cn(textAreaClass, "mt-3")}
                    />
                    <p className="mt-2 text-xs leading-5 text-slate-500">Preparado para fase futura. Ainda não gera eventos automaticamente.</p>
                  </details>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Variáveis: {"{cliente_nome}"}, {"{telefone_cliente}"}, {"{cliente_telefone}"}, {"{cnpj}"}, {"{cpf}"}, {"{certificado_nome}"}, {"{nome_titular}"}, {"{empresa_nome}"}, {"{data_vencimento}"}, {"{dias}"}. Variáveis sem valor são substituídas por vazio.
                </p>
              </div>
            </FormSection>
          ) : null}

          {activeTab === "seguranca" ? (
            <FormSection title="Segurança operacional">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-900">O canal recebe apenas mensagens prontas para envio.</div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">Credenciais e chaves internas não são exibidas nesta tela.</div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">Senhas, links e caminhos privados não entram nos avisos.</div>
              </div>
            </FormSection>
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
                {scanPending ? "Atualizando planejamento" : "Atualizar planejamento"}
              </button>
              <button
                type="submit"
                disabled={pending}
                className={buttonClass("primary", "h-10")}
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {pending ? "Salvando configurações" : "Salvar configurações"}
              </button>
            </ActionBar>
          ) : null}
        </form>
      )}
    </div>
  );
}
