"use client";

import { Activity, KeyRound, Loader2, ShieldCheck, Smartphone, Trash2, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";
import { TableBody, TableCell, TableHead, TableHeaderCell, TableShell } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/status-badge";

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

  if (status === "disconnected") {
    return { label: "Desconectado", tone: "red" as const };
  }

  return { label: "Aguardando conexão", tone: "blue" as const };
}

export function WhatsappDevicesPanel({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const activeDevices = devices.filter((device) => device.status !== "revoked");
  const revokedDevices = devices.filter((device) => device.status === "revoked");
  const connectedDevices = activeDevices.filter((device) => device.status === "active").length;
  const primaryDevice = activeDevices.find((device) => device.is_primary_sender);

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
      setError(getErrorMessage(payload, "Nao foi possivel criar o dispositivo."));
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
      setError(getErrorMessage(payload, "Nao foi possivel executar a acao."));
    }

    setPending(false);
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80">
          <div className="flex items-center gap-3 text-slate-500">
            <Activity className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium">Dispositivo principal</span>
          </div>
          <p className="mt-2 text-xl font-semibold text-slate-950">{primaryDevice?.name ?? "Nao definido"}</p>
        </div>
        <div className="rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80">
          <div className="flex items-center gap-3 text-slate-500">
            <Smartphone className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium">Conectados</span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{connectedDevices}</p>
        </div>
        <div className="rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-blue-200/80">
          <div className="flex items-center gap-3 text-slate-500">
            <WifiOff className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium">Sem conexao</span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{activeDevices.length - connectedDevices}</p>
        </div>
      </div>

      <form onSubmit={createDevice} className="grid gap-3 rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl md:grid-cols-[minmax(280px,1fr)_auto]">
        <label className="grid gap-2 text-sm font-medium text-slate-800">
          Nome do dispositivo
          <input
            name="name"
            required
            placeholder="Bot escritorio principal"
            className={inputClass}
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className={buttonClass("primary", "h-10")}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Criar dispositivo
          </button>
        </div>
      </form>

      {createdCredentials ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg shadow-amber-950/5">
          <p className="font-semibold">Copie estes dados agora. Eles não serão exibidos novamente.</p>
          <div className="mt-3 grid gap-2">
            <label className="grid gap-1">
              Código de conexão
              <input readOnly value={createdCredentials.token} className="rounded-2xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs" />
            </label>
            <label className="grid gap-1">
              Chave de assinatura
              <input readOnly value={createdCredentials.signing_secret} className="rounded-2xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs" />
            </label>
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!activeDevices.length ? (
        <EmptyState title="Nenhum dispositivo ativo" description="Crie um dispositivo para conectar o aplicativo desktop ao sistema." />
      ) : (
        <TableShell>
          <TableHead>
            <tr>
              <TableHeaderCell>Nome</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Principal</TableHeaderCell>
              <TableHeaderCell>Telefone conectado</TableHeaderCell>
              <TableHeaderCell>Última sincronização</TableHeaderCell>
              <TableHeaderCell>Ações</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {activeDevices.map((device) => {
              const status = getDeviceStatus(device.status);

              return (
                <tr key={device.id} className="transition hover:bg-blue-50/40">
                  <TableCell className="font-semibold text-slate-950">{device.name}</TableCell>
                  <TableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-700">{device.is_primary_sender ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-slate-700">{device.connected_phone ?? "-"}</TableCell>
                  <TableCell className="text-slate-700">
                    {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("pt-BR") : "-"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {!device.is_primary_sender && device.status !== "revoked" ? (
                        <button
                          type="button"
                          onClick={() => postAction(`/api/whatsapp/devices/${device.id}/primary`)}
                          className={buttonClass("secondary", "min-h-8 px-3 text-xs")}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Definir principal
                        </button>
                      ) : null}
                      {device.status !== "revoked" ? (
                        <button
                          type="button"
                          onClick={() => postAction(`/api/whatsapp/devices/${device.id}/revoke`)}
                          className={buttonClass("danger", "min-h-8 px-3 text-xs")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Revogar
                        </button>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </TableCell>
                </tr>
              );
            })}
          </TableBody>
        </TableShell>
      )}

      {revokedDevices.length ? (
        <details className="rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700 outline-none transition hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            Ver histórico de dispositivos revogados ({revokedDevices.length})
          </summary>
          <div className="mt-4">
            <TableShell>
              <TableHead>
                <tr>
                  <TableHeaderCell>Nome</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Telefone conectado</TableHeaderCell>
                  <TableHeaderCell>Última sincronização</TableHeaderCell>
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
                      <TableCell className="text-slate-700">{device.connected_phone ?? "-"}</TableCell>
                      <TableCell className="text-slate-700">
                        {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("pt-BR") : "-"}
                      </TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </TableShell>
          </div>
        </details>
      ) : null}
    </div>
  );
}
