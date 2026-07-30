"use client";

import { Copy, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";

type CertificatePasswordRevealProps = {
  certificadoId: string;
};

type ApiPayload = {
  senha?: string;
  error?: {
    message?: string;
  };
};

export function CertificatePasswordReveal({ certificadoId }: CertificatePasswordRevealProps) {
  const [expanded, setExpanded] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [certificatePassword, setCertificatePassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;

      if (!next) {
        setAdminPassword("");
        setCertificatePassword(null);
        setMessage(null);
        setError(null);
      }

      return next;
    });
  }

  async function revealPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setMessage(null);
    setError(null);
    setCertificatePassword(null);

    try {
      const response = await fetch(`/api/certificados/${certificadoId}/senha`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senha_admin: adminPassword }),
      });
      const payload = (await response.json().catch(() => null)) as ApiPayload | null;

      if (!response.ok || !payload?.senha) {
        setError(payload?.error?.message ?? "Não foi possível revelar a senha do certificado. Verifique a senha administrativa.");
        setPending(false);
        return;
      }

      setCertificatePassword(payload.senha);
      setAdminPassword("");
      setMessage("Senha do certificado liberada.");
      setPending(false);
    } catch {
      setError("Não foi possível conversar com o servidor. Verifique sua conexão e tente novamente.");
      setPending(false);
    }
  }

  async function copyPassword() {
    if (!certificatePassword) {
      return;
    }

    await navigator.clipboard.writeText(certificatePassword);
    setMessage("Senha copiada.");
  }

  function hidePassword() {
    setCertificatePassword(null);
    setMessage("Senha ocultada.");
  }

  return (
    <section className="mt-4 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm shadow-slate-950/5 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Senha do certificado</h3>
          <p className="mt-1 text-sm text-slate-600">
            Revele a senha PFX somente quando for necessário. Esta ação exige senha administrativa e fica registrada na auditoria.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleExpanded}
          className={buttonClass(expanded ? "secondary" : "primary")}
          aria-expanded={expanded}
        >
          {expanded ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
          {expanded ? "Fechar" : "Mostrar senha"}
        </button>
      </div>

      {expanded ? (
        <form onSubmit={revealPassword} className="mt-4 grid gap-3">
          <label htmlFor="senha_administrativa_certificado" className="grid gap-2 text-sm font-medium text-slate-800">
            Senha administrativa
            <input
              id="senha_administrativa_certificado"
              type="password"
              value={adminPassword}
              disabled={pending}
              onChange={(event) => setAdminPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              required
              aria-describedby="senha_administrativa_certificado-help"
              className={inputClass}
            />
            <span id="senha_administrativa_certificado-help" className="text-xs font-normal text-slate-500">
              Essa senha é configurada no Supabase como hash administrativo.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className={buttonClass("primary")}>
              {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <KeyRound aria-hidden="true" className="h-4 w-4" />}
              {pending ? "Validando senha" : "Revelar senha"}
            </button>
            {certificatePassword ? (
              <button type="button" onClick={hidePassword} className={buttonClass("secondary")}>
                <EyeOff aria-hidden="true" className="h-4 w-4" />
                Ocultar senha
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {certificatePassword ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">Senha PFX deste certificado</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="break-all rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950">{certificatePassword}</code>
            <button
              type="button"
              onClick={copyPassword}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 transition hover:-translate-y-0.5 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copiar senha
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm font-medium text-slate-700">
          {message}
        </p>
      ) : null}
    </section>
  );
}
