"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass, textAreaClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils/cn";

type ClientEditFormProps = {
  initialClient: {
    nome_razao_social: string;
    cnpj: string;
    email: string | null;
    telefone: string | null;
    whatsapp: string | null;
    whatsapp_notifications_enabled?: boolean | null;
    responsavel: string | null;
    observacoes: string | null;
  };
};

type ApiPayload = {
  error?: {
    message?: string;
  };
};

export function ClientEditForm({ initialClient }: ClientEditFormProps) {
  const router = useRouter();
  const [clientData, setClientData] = useState({
    nome_razao_social: initialClient.nome_razao_social,
    email: initialClient.email ?? "",
    telefone: initialClient.telefone ?? "",
    whatsapp: initialClient.whatsapp ?? "",
    whatsapp_notifications_enabled: initialClient.whatsapp_notifications_enabled ?? true,
    responsavel: initialClient.responsavel ?? "",
    observacoes: initialClient.observacoes ?? "",
  });
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function patchClientData(patch: Partial<typeof clientData>) {
    setClientData((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);

    const response = await fetch("/api/clientes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cnpj: initialClient.cnpj,
        ...clientData,
      }),
    });
    const payload = (await response.json().catch(() => null)) as ApiPayload | null;

    if (!response.ok) {
      setError(payload?.error?.message ?? "Não foi possível salvar os dados do cliente. Revise os campos e tente novamente.");
      setPending(false);
      return;
    }

    setMessage("Dados do cliente salvos.");
    setPending(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-busy={pending}
      aria-describedby={error ? "cliente-edit-error" : message ? "cliente-edit-message" : undefined}
      className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5"
    >
      <div>
        <h3 className="text-base font-semibold text-slate-950">Cliente vinculado</h3>
        <p className="mt-1 text-sm text-slate-600">
          Edite os dados de contato usados nos avisos e no acompanhamento. O CNPJ permanece vinculado ao certificado.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <label htmlFor="cliente_nome_razao_social" className="text-sm font-medium text-slate-800">
            Nome ou razão social <span className="text-slate-500">(obrigatório)</span>
          </label>
          <input
            id="cliente_nome_razao_social"
            required
            value={clientData.nome_razao_social}
            disabled={pending}
            autoComplete="organization"
            onChange={(event) => patchClientData({ nome_razao_social: event.target.value })}
            className={inputClass}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="cliente_cnpj" className="text-sm font-medium text-slate-800">
            CNPJ
          </label>
          <input
            id="cliente_cnpj"
            readOnly
            value={initialClient.cnpj}
            aria-describedby="cliente_cnpj-help"
            className={cn(inputClass, "bg-slate-100 text-slate-600")}
          />
          <p id="cliente_cnpj-help" className="text-xs text-slate-500">
            Para trocar o CNPJ, envie um novo certificado ou revise o cadastro de origem.
          </p>
        </div>
        <div className="grid gap-2">
          <label htmlFor="cliente_whatsapp" className="text-sm font-medium text-slate-800">
            WhatsApp
          </label>
          <input
            id="cliente_whatsapp"
            value={clientData.whatsapp}
            disabled={pending}
            autoComplete="tel"
            inputMode="tel"
            onChange={(event) => patchClientData({ whatsapp: event.target.value })}
            placeholder="(11) 99999-9999"
            aria-describedby="cliente_whatsapp-help"
            className={inputClass}
          />
          <p id="cliente_whatsapp-help" className="text-xs text-slate-500">
            Opcional. Quando preenchido, pode receber avisos automáticos conforme as configurações.
          </p>
        </div>
        <label className="inline-flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 md:col-span-2">
          <input
            id="cliente_whatsapp_notifications_enabled"
            type="checkbox"
            checked={!clientData.whatsapp_notifications_enabled}
            disabled={pending}
            aria-describedby="cliente_whatsapp_notifications_enabled-help"
            onChange={(event) => patchClientData({ whatsapp_notifications_enabled: !event.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span>
            Pausar avisos por WhatsApp para este cliente
            <span id="cliente_whatsapp_notifications_enabled-help" className="mt-1 block text-xs font-normal text-slate-500">
              Os avisos internos para a equipe continuam funcionando normalmente.
            </span>
          </span>
        </label>
        <div className="grid gap-2">
          <label htmlFor="cliente_responsavel" className="text-sm font-medium text-slate-800">
            Responsável
          </label>
          <input
            id="cliente_responsavel"
            value={clientData.responsavel}
            disabled={pending}
            autoComplete="name"
            onChange={(event) => patchClientData({ responsavel: event.target.value })}
            className={inputClass}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="cliente_email" className="text-sm font-medium text-slate-800">
            E-mail
          </label>
          <input
            id="cliente_email"
            type="email"
            value={clientData.email}
            disabled={pending}
            autoComplete="email"
            onChange={(event) => patchClientData({ email: event.target.value })}
            className={inputClass}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="cliente_telefone" className="text-sm font-medium text-slate-800">
            Telefone alternativo
          </label>
          <input
            id="cliente_telefone"
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
        <label htmlFor="cliente_observacoes" className="text-sm font-medium text-slate-800">
          Observações
        </label>
        <textarea
          id="cliente_observacoes"
          rows={3}
          value={clientData.observacoes}
          disabled={pending}
          onChange={(event) => patchClientData({ observacoes: event.target.value })}
          className={textAreaClass}
        />
      </div>

      {error ? (
        <p id="cliente-edit-error" role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p id="cliente-edit-message" role="status" className="rounded-2xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className={buttonClass("primary")}
        >
          {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          {pending ? "Salvando cliente" : "Salvar cliente"}
        </button>
      </div>
    </form>
  );
}
