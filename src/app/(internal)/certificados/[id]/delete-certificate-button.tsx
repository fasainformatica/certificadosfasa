"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";

export function DeleteCertificateButton({ certificadoId }: { certificadoId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      "Excluir este certificado? Esta ação remove o registro, o arquivo PFX, links vinculados e também o cliente se ele não possuir outros certificados.",
    );

    if (!confirmed) {
      return;
    }

    setPending(true);
    setError(null);
    const response = await fetch(`/api/certificados/${certificadoId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message: string } } | null;
      setError(payload?.error?.message ?? "Não foi possível excluir o certificado.");
      setPending(false);
      return;
    }

    router.replace("/certificados");
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-3xl border border-red-200 bg-white/84 p-4 shadow-sm shadow-red-100/60 ring-1 ring-red-100/60 backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-red-800">Exclusão administrativa</h3>
          <p className="mt-1 text-sm text-slate-600">
            Use somente para remover registros cadastrados por engano. A exclusão remove o cadastro e o arquivo armazenado.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className={buttonClass("danger")}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Excluir certificado
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
