"use client";

import { Download, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { buttonClass, inputClass } from "@/components/ui/button-styles";

export function PublicDownloadForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch(`/api/download/${token}/validar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ senha_liberacao: password }),
      });
      const payload = (await response.json()) as {
        download_url?: string;
        error?: { message: string };
      };

      if (!response.ok || !payload.download_url) {
        setError(payload.error?.message ?? "Nao foi possivel liberar o download.");
        setPending(false);
        return;
      }

      window.location.assign(payload.download_url);
      setPending(false);
    } catch {
      setError("Falha de comunicacao com o servidor.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="senha_liberacao" className="text-sm font-medium text-slate-800">
          Senha temporaria
        </label>
        <input
          id="senha_liberacao"
          name="senha_liberacao"
          type="password"
          autoComplete="off"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "h-10")}
      >
        {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
        Liberar download
      </button>
    </form>
  );
}
