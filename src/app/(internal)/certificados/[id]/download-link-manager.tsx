"use client";

import { Ban, Copy, KeyRound, Link as LinkIcon, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";
import { Badge } from "@/components/ui/status-badge";

type LinkRecord = {
  id: string;
  public_url?: string | null;
  ativo: boolean;
  usado: boolean;
  usado_em: string | null;
  invalidado_em: string | null;
  criado_em: string;
  atualizado_em: string;
  ip_uso: string | null;
  user_agent_uso: string | null;
  tentativas_invalidas: number;
  bloqueado_ate: string | null;
} | null;

type DownloadLinkManagerProps = {
  certificadoId: string;
  initialLink: LinkRecord;
};

function getLinkStatus(link: LinkRecord) {
  if (!link) {
    return { label: "Sem link", tone: "slate" as const };
  }

  if (link.usado) {
    return { label: "Usado", tone: "slate" as const };
  }

  if (!link.ativo) {
    return { label: "Invalidado", tone: "red" as const };
  }

  if (link.bloqueado_ate && new Date(link.bloqueado_ate).getTime() > Date.now()) {
    return { label: "Bloqueado", tone: "amber" as const };
  }

  return { label: "Ativo", tone: "green" as const };
}

export function DownloadLinkManager({ certificadoId, initialLink }: DownloadLinkManagerProps) {
  const [link, setLink] = useState<LinkRecord>(initialLink);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"create" | "invalidate" | "update_password" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const publicUrl = useMemo(() => {
    return link?.public_url ?? "";
  }, [link]);
  const status = getLinkStatus(link);
  const canUseLink = Boolean(link?.ativo && !link.usado);

  async function createLink() {
    setPendingAction("create");
    setMessage(null);
    setGeneratedPassword(null);

    const response = await fetch(`/api/certificados/${certificadoId}/link`, {
      method: "POST",
    });
    const payload = (await response.json()) as {
      link?: LinkRecord;
      senha_gerada?: string;
      error?: { message: string };
    };

    if (!response.ok || !payload.link || !payload.senha_gerada) {
      setMessage(payload.error?.message ?? "Nao foi possivel gerar o link.");
      setPendingAction(null);
      return;
    }

    setLink(payload.link);
    setGeneratedPassword(payload.senha_gerada);
    setMessage("Link criado. Copie a senha agora; ela nao sera exibida novamente.");
    setPendingAction(null);
  }

  async function updatePassword() {
    setPendingAction("update_password");
    setMessage(null);
    setGeneratedPassword(null);

    const response = await fetch(`/api/certificados/${certificadoId}/link`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update_password" }),
    });
    const payload = (await response.json()) as {
      link?: LinkRecord;
      senha_gerada?: string;
      error?: { message: string };
    };

    if (!response.ok || !payload.link || !payload.senha_gerada) {
      setMessage(payload.error?.message ?? "Nao foi possivel atualizar a senha.");
      setPendingAction(null);
      return;
    }

    setLink({ ...payload.link, public_url: link?.public_url ?? null });
    setGeneratedPassword(payload.senha_gerada);
    setMessage("Senha atualizada. Copie a nova senha agora; a anterior foi invalidada.");
    setPendingAction(null);
  }

  async function invalidateLink() {
    setPendingAction("invalidate");
    setMessage(null);
    setGeneratedPassword(null);

    const response = await fetch(`/api/certificados/${certificadoId}/link`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "invalidate" }),
    });
    const payload = (await response.json().catch(() => null)) as {
      link?: LinkRecord;
      error?: { message: string };
    } | null;

    if (!response.ok || !payload?.link) {
      setMessage(payload?.error?.message ?? "Nao foi possivel invalidar o link.");
      setPendingAction(null);
      return;
    }

    setLink(payload.link);
    setMessage("Link invalidado.");
    setPendingAction(null);
  }

  async function copyLink() {
    if (!publicUrl) {
      return;
    }

    await navigator.clipboard.writeText(publicUrl);
    setMessage("Link copiado.");
  }

  async function copyPassword() {
    if (!generatedPassword) {
      return;
    }

    await navigator.clipboard.writeText(generatedPassword);
    setMessage("Senha copiada.");
  }

  return (
    <section className="mt-4 rounded-2xl border border-white/75 bg-white/78 p-4 shadow-sm shadow-blue-950/5 ring-1 ring-blue-100/45 backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-950">Link de download</h3>
          <p className="mt-1 text-sm text-slate-600">
            O link e de uso unico e exige uma senha forte gerada automaticamente. A senha aparece somente uma vez.
          </p>
          <div className="mt-3">
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {link ? (
            <>
              <button
                type="button"
                onClick={copyLink}
                disabled={!canUseLink || !publicUrl}
                className={buttonClass("secondary")}
              >
                <Copy aria-hidden="true" className="h-4 w-4" />
                Copiar link
              </button>
              <button
                type="button"
                onClick={updatePassword}
                disabled={!canUseLink || pendingAction !== null}
                className={buttonClass("secondary")}
              >
                {pendingAction === "update_password" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Atualizar senha do link
              </button>
              <button
                type="button"
                onClick={invalidateLink}
                disabled={!canUseLink || pendingAction !== null}
                className={buttonClass("danger")}
              >
                {pendingAction === "invalidate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Invalidar link
              </button>
              {!canUseLink ? (
                <button
                  type="button"
                  onClick={createLink}
                  disabled={pendingAction !== null}
                  className={buttonClass("primary")}
                >
                  {pendingAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  Criar novo link
                </button>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={createLink}
              disabled={pendingAction !== null}
              className={buttonClass("primary")}
            >
              {pendingAction === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              Criar link de download
            </button>
          )}
        </div>
      </div>

      {link ? (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/78 p-3">
          {publicUrl ? (
            <p className="break-all text-sm font-medium text-slate-950">{publicUrl}</p>
          ) : (
            <p className="text-sm text-slate-600">
              Por segurança, a URL completa só é exibida no momento da criação. Recrie o link se precisar copiar novamente.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Criado em {new Date(link.criado_em).toLocaleString("pt-BR")}
            {link.usado_em ? `; usado em ${new Date(link.usado_em).toLocaleString("pt-BR")}` : ""}
            {link.invalidado_em ? `; invalidado em ${new Date(link.invalidado_em).toLocaleString("pt-BR")}` : ""}
          </p>
          {link.ip_uso ? <p className="mt-1 text-xs text-slate-500">IP de uso: {link.ip_uso}</p> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Nenhum link criado para este certificado.</p>
      )}

      {generatedPassword ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Senha temporaria exibida uma unica vez</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="break-all rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-slate-950">{generatedPassword}</code>
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

      {message ? <p className="mt-3 text-sm font-medium text-slate-700">{message}</p> : null}
    </section>
  );
}
