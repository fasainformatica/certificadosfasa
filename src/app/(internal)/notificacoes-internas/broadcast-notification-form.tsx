"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle, Megaphone, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { buttonClass, inputClass, selectClass, textAreaClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils/cn";

type BroadcastResponse = {
  active_user_count?: number;
  message?: string;
};

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 500;

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string | { message?: string }; message?: string };

    if (typeof payload.error === "string") {
      return payload.error;
    }

    return payload.error?.message ?? payload.message ?? "Nao foi possivel enviar o aviso interno.";
  } catch {
    return "Nao foi possivel enviar o aviso interno.";
  }
}

export function BroadcastNotificationForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState("info");
  const [expiresInHours, setExpiresInHours] = useState("168");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submitBroadcast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!confirmed) {
      setError("Confirme o envio para todos os usuarios internos antes de continuar.");
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/internal-notifications/broadcast", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          severity,
          expiresInHours: Number(expiresInHours),
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as BroadcastResponse;
      const recipients =
        typeof payload.active_user_count === "number" && payload.active_user_count > 0
          ? `${payload.active_user_count} usuarios internos`
          : "usuarios internos";

      setSuccess(`Aviso enviado para ${recipients} e notificadores Windows conectados.`);
      setTitle("");
      setBody("");
      setSeverity("info");
      setExpiresInHours("168");
      setConfirmed(false);
      window.dispatchEvent(new CustomEvent("fasa:internal-notifications:refresh"));
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Nao foi possivel enviar o aviso interno.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submitBroadcast}
      className="mb-5 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-blue-950/5"
    >
      <div className="grid gap-4 border-b border-slate-100 bg-blue-50/40 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <Megaphone aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-950">Enviar aviso interno</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Envie uma mensagem para todos os usuarios do painel e para os computadores com o notificador Windows ativo.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
          Nao envia WhatsApp
        </span>
      </div>

      <div className="grid gap-4 px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">Titulo</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
              placeholder="Ex.: Reuniao sobre renovacoes"
              maxLength={TITLE_MAX_LENGTH}
              minLength={3}
              required
              disabled={pending}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">Prioridade</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
              className={selectClass}
              disabled={pending}
            >
              <option value="info">Informacao</option>
              <option value="success">Concluido</option>
              <option value="warning">Atencao</option>
              <option value="error">Falha</option>
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-800">Visivel por</span>
            <select
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(event.target.value)}
              className={selectClass}
              disabled={pending}
            >
              <option value="24">24 horas</option>
              <option value="168">7 dias</option>
              <option value="720">30 dias</option>
            </select>
          </label>
        </div>

        <label className="grid gap-1.5">
          <span className="text-sm font-semibold text-slate-800">Mensagem</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className={cn(textAreaClass, "min-h-32")}
            placeholder="Digite o aviso que deve aparecer para a equipe."
            maxLength={BODY_MAX_LENGTH}
            minLength={3}
            required
            disabled={pending}
          />
          <span className="text-xs text-slate-500">{body.length}/{BODY_MAX_LENGTH} caracteres</span>
        </label>

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <label className="flex gap-3 text-sm leading-6 text-slate-700">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              disabled={pending}
            />
            <span>
              Confirmo o envio para todos os usuarios internos e notificadores Windows conectados a este sistema.
            </span>
          </label>
          <button
            type="submit"
            className={buttonClass("primary", "h-10 px-4")}
            disabled={pending || !confirmed}
          >
            {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}
            {pending ? "Enviando aviso" : "Enviar aviso interno"}
          </button>
        </div>

        {success ? (
          <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status" aria-live="polite">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        ) : null}

        {error ? (
          <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>
    </form>
  );
}
