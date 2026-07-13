"use client";

import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { formatDateTime, formatPhone } from "@/lib/utils/format";

type Device = {
  id: string;
  name: string;
  status: string;
  is_primary_sender: boolean;
  connected_phone: string | null;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type CreatedCredentials = {
  token: string;
  signing_secret: string;
};

type ApiPayload = {
  device?: Device;
  token?: string;
  signing_secret?: string;
  error?: {
    message?: string;
  } | string;
};

type BotStats = {
  waiting: number;
  readyToday: number;
  planned: number;
  sentToday: number;
  failed: number;
  lastSentAt: string | null;
};

function getErrorMessage(payload: ApiPayload | null, fallback: string) {
  if (!payload?.error) {
    return fallback;
  }

  return typeof payload.error === "string" ? payload.error : payload.error.message ?? fallback;
}

function getDeviceStatus(status: string) {
  if (status === "active") {
    return { label: "Conectado", tone: "green" as const };
  }

  if (status === "revoked") {
    return { label: "Revogado", tone: "slate" as const };
  }

  if (status === "disconnected" || status === "error") {
    return { label: "Desconectado", tone: "red" as const };
  }

  return { label: "Aguardando conexão", tone: "blue" as const };
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
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    green: "bg-green-50 text-green-700 ring-green-100",
    amber: "bg-orange-50 text-orange-700 ring-orange-100",
    red: "bg-red-50 text-red-700 ring-red-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <article className="rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 transition duration-150 hover:-translate-y-0.5 hover:border-blue-200">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ring-1 ${toneClasses[tone]}`}>{icon}</span>
        <p className="text-xs font-semibold text-slate-600">{title}</p>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      {description ? <p className="mt-1 text-xs text-slate-500" title={description}>{description}</p> : null}
    </article>
  );
}

type DeviceActionsProps = {
  device: Device;
  pending: boolean;
  onAction: (path: string) => void;
  mobile?: boolean;
};

function DeviceActions({ device, pending, onAction, mobile = false }: DeviceActionsProps) {
  return (
    <div className={mobile ? "grid gap-2" : "flex flex-wrap gap-2"}>
      {!device.is_primary_sender && device.status !== "revoked" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(`/api/whatsapp/devices/${device.id}/primary`)}
          className={buttonClass("secondary", mobile ? "min-h-10 w-full px-3 text-sm" : "min-h-8 px-3 text-xs")}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Definir principal
        </button>
      ) : null}
      {device.status !== "revoked" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => onAction(`/api/whatsapp/devices/${device.id}/revoke`)}
          className={buttonClass("danger", mobile ? "min-h-10 w-full px-3 text-sm" : "min-h-8 px-3 text-xs")}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Revogar
        </button>
      ) : (
        <span className="text-slate-400">-</span>
      )}
    </div>
  );
}

export function WhatsappDevicesPanel({
  devices,
  stats,
}: {
  devices: Device[];
  stats: BotStats;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const activeDevices = devices.filter((device) => device.status !== "revoked");
  const revokedDevices = devices.filter((device) => device.status === "revoked");
  const primaryDevice = activeDevices.find((device) => device.is_primary_sender);
  const primaryStatus = getDeviceStatus(primaryDevice?.status ?? "disconnected");

  async function createDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError(null);
    setCreatedCredentials(null);

    const form = new FormData(formElement);
    const response = await fetch("/api/whatsapp/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: form.get("name") }),
    });
    const payload = (await response.json().catch(() => null)) as ApiPayload | null;

    if (!response.ok || !payload?.token || !payload.signing_secret) {
      setError(getErrorMessage(payload, "Não foi possível criar o dispositivo."));
      setPending(false);
      return;
    }

    formElement.reset();
    setCreatedCredentials({ token: payload.token, signing_secret: payload.signing_secret });
    setPending(false);
    router.refresh();
  }

  async function postAction(path: string) {
    setPending(true);
    setError(null);
    const response = await fetch(path, { method: path.endsWith("/primary") ? "PATCH" : "POST" });
    const payload = (await response.json().catch(() => null)) as ApiPayload | null;

    if (!response.ok) {
      setError(getErrorMessage(payload, "Não foi possível executar a ação."));
    }

    setPending(false);
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          title="Status geral"
          value={<Badge tone={primaryStatus.tone}>{primaryStatus.label}</Badge>}
          description={primaryDevice ? primaryDevice.name : "Nenhum principal"}
          icon={<Activity className="h-4 w-4" />}
          tone={primaryStatus.tone}
        />
        <MetricCard
          title="Dispositivo principal"
          value={<span className="text-xl">{primaryDevice?.name ?? "Não definido"}</span>}
          description={primaryDevice?.connected_phone ? formatPhone(primaryDevice.connected_phone) : "Sem telefone conectado"}
          icon={<Smartphone className="h-4 w-4" />}
          tone="blue"
        />
        <MetricCard
          title="Última conexão"
          value={<span className="text-xl">{primaryDevice?.last_seen_at ? formatDateTime(primaryDevice.last_seen_at) : "-"}</span>}
          description="Último contato do bot"
          icon={<Clock3 className="h-4 w-4" />}
          tone="slate"
        />
        <MetricCard
          title="Aguardando envio"
          value={stats.waiting}
          description="Fila elegível"
          icon={<Clock3 className="h-4 w-4" />}
          tone="blue"
        />
        <MetricCard
          title="Enviadas hoje"
          value={stats.sentToday}
          description="Confirmadas pelo bot"
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="green"
        />
        <MetricCard title="Falhas" value={stats.failed} description="Precisam de revisão" icon={<AlertTriangle className="h-4 w-4" />} tone="red" />
        <MetricCard
          title="Fila de hoje"
          value={stats.readyToday}
          description={`${stats.planned} planejados`}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
        />
        <MetricCard
          title="Último envio"
          value={<span className="text-xl">{stats.lastSentAt ? formatDateTime(stats.lastSentAt) : "-"}</span>}
          description="Mensagem confirmada"
          icon={<Send className="h-4 w-4" />}
          tone="green"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]">
        <form onSubmit={createDevice} className="grid gap-3 rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 sm:p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Criar dispositivo</h3>
            <p className="mt-1 text-sm text-slate-500">Gere credenciais para conectar o aplicativo desktop ao sistema.</p>
          </div>
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Nome do dispositivo
            <input name="name" required placeholder="Bot escritório principal" className={inputClass} />
          </label>
          <button type="submit" disabled={pending} className={buttonClass("primary", "h-10 w-full")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Criar dispositivo
          </button>
        </form>

        <div className="rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Operação do bot</h3>
              <p className="mt-1 text-sm text-slate-500">Resumo da fila e do envio automático.</p>
            </div>
            <Badge tone={primaryStatus.tone}>{primaryStatus.label}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-xs font-semibold text-blue-700">Prontos</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{stats.readyToday}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600">Planejados</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{stats.planned}</p>
            </div>
            <div className="rounded-2xl border border-green-100 bg-green-50/70 p-3">
              <p className="text-xs font-semibold text-green-700">Enviados</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{stats.sentToday}</p>
            </div>
            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <p className="text-xs font-semibold text-red-700">Falhas</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{stats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {createdCredentials ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm shadow-amber-950/5 sm:p-4">
          <p className="font-semibold">Copie estes dados agora. Eles não serão exibidos novamente.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">
              Código de conexão
              <input readOnly value={createdCredentials.token} className="w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs" />
            </label>
            <label className="grid gap-1">
              Chave de assinatura
              <input readOnly value={createdCredentials.signing_secret} className="w-full rounded-2xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs" />
            </label>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!activeDevices.length ? (
        <EmptyState title="Nenhum dispositivo ativo" description="Crie um dispositivo para conectar o aplicativo desktop ao sistema." />
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-3 md:hidden">
            {activeDevices.map((device) => {
              const status = getDeviceStatus(device.status);

              return (
                <article key={device.id} className="rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-slate-950">{device.name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{device.is_primary_sender ? "Dispositivo principal" : "Dispositivo ativo"}</p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div className="rounded-2xl bg-blue-50/65 p-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Telefone conectado</dt>
                      <dd className="mt-1 text-slate-800">{formatPhone(device.connected_phone)}</dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Última conexão</dt>
                      <dd className="mt-1 text-slate-800">{device.last_seen_at ? formatDateTime(device.last_seen_at) : "-"}</dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <DeviceActions device={device} pending={pending} onAction={postAction} mobile />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden md:block">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Principal</TableHeaderCell>
                  <TableHeaderCell>Telefone conectado</TableHeaderCell>
                  <TableHeaderCell>Última conexão</TableHeaderCell>
                  <TableHeaderCell>Ações</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {activeDevices.map((device) => {
                  const status = getDeviceStatus(device.status);

                  return (
                    <tr key={device.id} className="transition duration-150 hover:bg-blue-50/48">
                      <TableCell className="font-semibold text-slate-950">{device.name}</TableCell>
                      <TableCell>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-700">{device.is_primary_sender ? "Sim" : "Não"}</TableCell>
                      <TableCell className="text-slate-700">{formatPhone(device.connected_phone)}</TableCell>
                      <TableCell className="text-slate-700">
                        {device.last_seen_at ? formatDateTime(device.last_seen_at) : "-"}
                      </TableCell>
                      <TableCell>
                        <DeviceActions device={device} pending={pending} onAction={postAction} />
                      </TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>
        </div>
      )}

      {revokedDevices.length ? (
        <details className="rounded-2xl border border-blue-100/70 bg-white p-3 shadow-sm shadow-blue-950/5 ring-1 ring-white/80 sm:p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 outline-none transition hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            Ver histórico de dispositivos revogados ({revokedDevices.length})
          </summary>
          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 md:hidden">
              {revokedDevices.map((device) => {
                const status = getDeviceStatus(device.status);

                return (
                  <article key={device.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-950">{device.name}</h3>
                        <p className="mt-1 text-xs text-slate-500">{formatPhone(device.connected_phone)}</p>
                      </div>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Última conexão: {device.last_seen_at ? formatDateTime(device.last_seen_at) : "-"}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="hidden md:block">
              <TableShell>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Nome</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Telefone conectado</TableHeaderCell>
                    <TableHeaderCell>Última conexão</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {revokedDevices.map((device) => {
                    const status = getDeviceStatus(device.status);

                    return (
                      <tr key={device.id} className="transition hover:bg-slate-50">
                        <TableCell className="font-semibold text-slate-950">{device.name}</TableCell>
                        <TableCell>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-700">{formatPhone(device.connected_phone)}</TableCell>
                        <TableCell className="text-slate-700">
                          {device.last_seen_at ? formatDateTime(device.last_seen_at) : "-"}
                        </TableCell>
                      </tr>
                    );
                  })}
                </TableBody>
              </TableShell>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
