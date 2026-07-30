"use client";

import { Eye, EyeOff, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass, selectClass, textAreaClass } from "@/components/ui/button-styles";
import {
  getUploadCommunicationErrorMessage,
  getUploadFallbackErrorMessage,
  getUploadFileSummary,
} from "@/lib/certificados/upload-presentation";
import { cn } from "@/lib/utils/cn";

type ClientOption = {
  id: string;
  nome_razao_social: string;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  whatsapp: string | null;
  whatsapp_notifications_enabled?: boolean | null;
  responsavel: string | null;
  observacoes: string | null;
};

type UploadCertificateFormProps = {
  clients: ClientOption[];
  initialClientId?: string;
};

function getClientFormData(client?: ClientOption) {
  return {
    nome_razao_social: client?.nome_razao_social ?? "",
    cnpj_manual: client?.cnpj ?? "",
    email: client?.email ?? "",
    telefone: client?.telefone ?? "",
    whatsapp: client?.whatsapp ?? "",
    whatsapp_notifications_enabled: client?.whatsapp_notifications_enabled ?? true,
    responsavel: client?.responsavel ?? "",
    observacoes: client?.observacoes ?? "",
  };
}

export function UploadCertificateForm({ clients, initialClientId = "" }: UploadCertificateFormProps) {
  const router = useRouter();
  const initialClient = clients.find((client) => client.id === initialClientId);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [manualClientId, setManualClientId] = useState(initialClient?.id ?? "");
  const [clientData, setClientData] = useState(getClientFormData(initialClient));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileMissing = error === "Selecione um arquivo .pfx.";
  const fileSummary = getUploadFileSummary(file);

  function patchClientData(patch: Partial<typeof clientData>) {
    setClientData((current) => ({ ...current, ...patch }));
  }

  function handleManualClientChange(clientId: string) {
    setManualClientId(clientId);
    const selectedClient = clients.find((client) => client.id === clientId);

    if (!selectedClient) {
      setClientData(getClientFormData());
      return;
    }

    setClientData(getClientFormData(selectedClient));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setError(null);

    if (!file) {
      setError("Selecione um arquivo .pfx.");
      return;
    }

    const body = new FormData();
    body.set("arquivo", file);
    body.set("senha", password);
    body.set("cliente_id_manual", manualClientId);
    body.set("cnpj_manual", clientData.cnpj_manual);
    body.set("nome_razao_social", clientData.nome_razao_social);
    body.set("email", clientData.email);
    body.set("telefone", clientData.telefone);
    body.set("whatsapp", clientData.whatsapp);
    body.set("whatsapp_notifications_enabled", String(clientData.whatsapp_notifications_enabled));
    body.set("responsavel", clientData.responsavel);
    body.set("observacoes", clientData.observacoes);

    setPending(true);

    try {
      const response = await fetch("/api/certificados/upload", {
        method: "POST",
        body,
      });
      const payload = (await response.json()) as {
        certificado?: { id: string };
        error?: { message: string };
      };

      if (!response.ok || !payload.certificado) {
        setError(payload.error?.message ?? getUploadFallbackErrorMessage());
        setPending(false);
        return;
      }

      router.replace(`/certificados/${payload.certificado.id}`);
      router.refresh();
    } catch {
      setError(getUploadCommunicationErrorMessage());
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={pending}
      aria-describedby={error ? "upload-error" : undefined}
      className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5"
    >
      <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-950 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-semibold">Envio seguro de certificado</p>
          <p className="mt-1 text-blue-900/80">
            O sistema valida o PFX, atualiza o cadastro do cliente e recalcula os avisos de vencimento após o envio.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700">
          PFX privado
        </span>
      </div>

      <div className="grid gap-2">
        <label htmlFor="arquivo" className="text-sm font-medium text-slate-800">
          Arquivo PFX
        </label>
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition duration-200 hover:border-blue-300 hover:bg-blue-50/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p id="arquivo-summary" className="text-sm font-semibold text-slate-950">
                {fileSummary}
              </p>
              <p id="arquivo-help" className="mt-1 text-xs text-slate-500">
                Envie um arquivo `.pfx`. A senha é usada apenas para validar e registrar o certificado.
              </p>
            </div>
            <input
              id="arquivo"
              name="arquivo"
              type="file"
              accept=".pfx"
              required
              disabled={pending}
              aria-invalid={fileMissing}
              aria-describedby="arquivo-summary arquivo-help"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                if (error) {
                  setError(null);
                }
              }}
              className="block max-w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none transition file:mr-4 file:h-10 file:border-0 file:bg-blue-600 file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor="senha" className="text-sm font-medium text-slate-800">
          Senha do certificado
        </label>
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={showPassword ? "text" : "password"}
            required
            value={password}
            disabled={pending}
            autoComplete="off"
            aria-describedby="senha-help"
            onChange={(event) => setPassword(event.target.value)}
            className={cn(selectClass, "pr-12")}
          />
          <button
            type="button"
            disabled={pending}
            aria-label={showPassword ? "Ocultar senha do certificado" : "Mostrar senha do certificado"}
            aria-controls="senha"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
            className={buttonClass("ghost", "absolute right-1.5 top-1.5 h-8 min-h-8 w-8 rounded-lg p-0 text-slate-500")}
          >
            {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
          </button>
        </div>
        <p id="senha-help" className="text-xs text-slate-500">
          A senha real não é exibida depois do cadastro.
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor="cliente_id_manual" className="text-sm font-medium text-slate-800">
          Cliente existente
        </label>
        <select
          id="cliente_id_manual"
          name="cliente_id_manual"
          value={manualClientId}
          disabled={pending}
          aria-describedby="cliente_id_manual-help"
          onChange={(event) => handleManualClientChange(event.target.value)}
          className={inputClass}
        >
          <option value="">Criar ou atualizar pelo CNPJ do PFX</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.nome_razao_social} - {client.cnpj}
            </option>
          ))}
        </select>
        <p id="cliente_id_manual-help" className="text-sm text-slate-600">
          Selecione um cliente quando estiver renovando um cadastro existente ou quando o PFX não informar o CNPJ.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-labelledby="dados-cliente-title">
        <div>
          <h3 id="dados-cliente-title" className="text-sm font-semibold text-slate-950">
            Dados do cliente
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Esses dados podem ser ajustados depois no detalhe do certificado.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <label htmlFor="nome_razao_social" className="text-sm font-medium text-slate-800">
              Nome ou razão social <span className="text-slate-500">(obrigatório)</span>
            </label>
            <input
              id="nome_razao_social"
              name="nome_razao_social"
              required
              value={clientData.nome_razao_social}
              disabled={pending}
              autoComplete="organization"
              onChange={(event) => patchClientData({ nome_razao_social: event.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="cnpj_manual" className="text-sm font-medium text-slate-800">
              CNPJ manual
            </label>
            <input
              id="cnpj_manual"
              name="cnpj_manual"
              value={clientData.cnpj_manual}
              disabled={pending}
              inputMode="numeric"
              onChange={(event) => patchClientData({ cnpj_manual: event.target.value })}
              placeholder="00.000.000/0000-00"
              aria-describedby="cnpj_manual-help"
              className={inputClass}
            />
            <p id="cnpj_manual-help" className="text-xs text-slate-500">
              Use quando o certificado não identificar o CNPJ automaticamente.
            </p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="whatsapp" className="text-sm font-medium text-slate-800">
              WhatsApp
            </label>
            <input
              id="whatsapp"
              name="whatsapp"
              value={clientData.whatsapp}
              disabled={pending}
              autoComplete="tel"
              inputMode="tel"
              onChange={(event) => patchClientData({ whatsapp: event.target.value })}
              placeholder="(11) 99999-9999"
              aria-describedby="whatsapp-help"
              className={inputClass}
            />
            <p id="whatsapp-help" className="text-xs text-slate-500">
              Opcional. Quando preenchido, pode receber avisos automáticos conforme as configurações.
            </p>
          </div>
          <label className="inline-flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 md:col-span-2">
            <input
              id="whatsapp_notifications_enabled"
              name="whatsapp_notifications_enabled"
              type="checkbox"
              checked={!clientData.whatsapp_notifications_enabled}
              disabled={pending}
              aria-describedby="whatsapp_notifications_enabled-help"
              onChange={(event) => patchClientData({ whatsapp_notifications_enabled: !event.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span>
              Pausar avisos por WhatsApp para este cliente
              <span id="whatsapp_notifications_enabled-help" className="mt-1 block text-xs font-normal text-slate-500">
                Os avisos internos para a equipe continuam funcionando normalmente.
              </span>
            </span>
          </label>
          <div className="grid gap-2">
            <label htmlFor="responsavel" className="text-sm font-medium text-slate-800">
              Responsável
            </label>
            <input
              id="responsavel"
              name="responsavel"
              value={clientData.responsavel}
              disabled={pending}
              autoComplete="name"
              onChange={(event) => patchClientData({ responsavel: event.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-800">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={clientData.email}
              disabled={pending}
              autoComplete="email"
              onChange={(event) => patchClientData({ email: event.target.value })}
              className={inputClass}
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="telefone" className="text-sm font-medium text-slate-800">
              Telefone alternativo
            </label>
            <input
              id="telefone"
              name="telefone"
              value={clientData.telefone}
              disabled={pending}
              autoComplete="tel"
              inputMode="tel"
              onChange={(event) => patchClientData({ telefone: event.target.value })}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <label htmlFor="observacoes" className="text-sm font-medium text-slate-800">
            Observações
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={3}
            value={clientData.observacoes}
            disabled={pending}
            onChange={(event) => patchClientData({ observacoes: event.target.value })}
            className={textAreaClass}
          />
        </div>
      </div>

      {error ? (
        <div id="upload-error" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary", "h-10")}
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud aria-hidden="true" className="h-4 w-4" />
          )}
          {pending ? "Enviando certificado" : "Enviar certificado"}
        </button>
      </div>
    </form>
  );
}
