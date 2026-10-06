"use client";

import { Check, Copy, Download, KeyRound, Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { buttonClass, inputClass } from "@/components/ui/button-styles";

const accessSchema = z.object({ session: z.string(), senha_certificado: z.string(), filename: z.string() });
type Access = z.infer<typeof accessSchema>;
const errorSchema = z.object({ error: z.object({ message: z.string() }) });

async function responseError(response: Response, fallback: string) {
  const parsed = errorSchema.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : fallback;
}

export function PublicDownloadForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [pending, setPending] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [unconfirmedTransfer, setUnconfirmedTransfer] = useState<string | null>(null);
  const busy = useRef(false);
  const resultRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const reloadRestoredPage = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", reloadRestoredPage);
    return () => window.removeEventListener("pageshow", reloadRestoredPage);
  }, []);
  useEffect(() => { if (access) resultRef.current?.focus(); }, [access]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPending(true);
    try {
      const response = await fetch(`/api/download/${token}/validar`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ senha_liberacao: password }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Não foi possível liberar o acesso."));
      setAccess(accessSchema.parse(await response.json()));
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o acesso. Verifique sua conexão.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function confirmReceipt(session: string, transfer: string) {
    const response = await fetch(`/api/download/${token}/arquivo`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", keepalive: true,
      body: JSON.stringify({ action: "complete", session, transfer_id: transfer }),
    });
    if (!response.ok) throw new Error("O arquivo foi recebido, mas a confirmação falhou. Tente confirmar novamente.");
    setUnconfirmedTransfer(null);
  }

  async function download() {
    if (!access || busy.current || downloaded) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/download/${token}/arquivo`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ action: "download", session: access.session }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Não foi possível baixar. Tente novamente em até 2 minutos."));
      const transfer = response.headers.get("x-transfer-id");
      if (!transfer) throw new Error("Resposta incompleta. Tente novamente nesta página em até 2 minutos.");
      const file = await response.blob();
      const expectedSize = Number(response.headers.get("content-length"));
      if (expectedSize > 0 && file.size !== expectedSize) throw new Error("O arquivo chegou incompleto. Tente novamente nesta página em até 2 minutos.");
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = access.filename.replace(/[\\/]/g, "_");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setDownloaded(true);
      setUnconfirmedTransfer(transfer);
      setMessage("Arquivo recebido pelo navegador. Confira seus downloads e guarde a senha do certificado antes de fechar esta página.");
      await confirmReceipt(access.session, transfer);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A transferência falhou. Tente novamente nesta página em até 2 minutos.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function retryConfirmation() {
    if (!access || !unconfirmedTransfer || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try { await confirmReceipt(access.session, unconfirmedTransfer); }
    catch { setError("Não foi possível confirmar. O acesso será encerrado automaticamente ao fim da janela de 2 minutos."); }
    finally { busy.current = false; setPending(false); }
  }

  async function copyPassword() {
    if (!access) return;
    try { await navigator.clipboard.writeText(access.senha_certificado); setMessage("Senha do certificado copiada."); }
    catch { setError("Não foi possível copiar. Selecione a senha e copie manualmente."); }
  }

  return (
    <div className="grid gap-4">
      {access ? (
        <>
          <h2 ref={resultRef} tabIndex={-1} className="text-base font-semibold text-slate-950 outline-none">Certificado liberado</h2>
          <p className="break-all text-sm text-slate-600">{access.filename}</p>
          <div className="grid gap-2 border-y border-slate-200 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-800"><KeyRound aria-hidden="true" className="h-4 w-4" />Senha do certificado PFX</p>
            <code className="select-all break-all rounded-md bg-slate-50 p-3 text-base font-semibold text-slate-950">{access.senha_certificado || "Este certificado não possui senha."}</code>
            <button type="button" onClick={copyPassword} className={buttonClass("secondary")}><Copy aria-hidden="true" className="h-4 w-4" />Copiar senha do certificado</button>
          </div>
          <p className="text-sm leading-6 text-slate-600">Não atualize nem feche esta página antes de baixar e guardar a senha. O acesso não poderá ser aberto novamente.</p>
          <button type="button" disabled={pending || downloaded} onClick={download} className={buttonClass("primary", "min-h-11")}>
            {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : downloaded ? <Check aria-hidden="true" className="h-4 w-4" /> : <Download aria-hidden="true" className="h-4 w-4" />}
            {pending ? "Processando download" : downloaded ? "Arquivo recebido" : "Baixar certificado"}
          </button>
          {unconfirmedTransfer && !pending ? <button type="button" onClick={retryConfirmation} className={buttonClass("secondary")}>Confirmar recebimento do arquivo</button> : null}
        </>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="senha_liberacao" className="text-sm font-medium text-slate-800">Senha temporária de acesso</label>
            <p id="senha_liberacao_help" className="text-xs leading-5 text-slate-500">Informe a senha recebida junto com o link, não a senha do certificado.</p>
            <input id="senha_liberacao" name="senha_liberacao" type="password" autoComplete="off" minLength={8} maxLength={128} required disabled={pending}
              value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass}
              aria-describedby={error ? "senha_liberacao_help download_error" : "senha_liberacao_help"} aria-invalid={Boolean(error)} />
          </div>
          <button type="submit" disabled={pending} className={buttonClass("primary", "min-h-11")}>
            {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <KeyRound aria-hidden="true" className="h-4 w-4" />}
            {pending ? "Validando acesso" : "Liberar certificado"}
          </button>
        </form>
      )}
      {error ? <p id="download_error" role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p> : null}
    </div>
  );
}
