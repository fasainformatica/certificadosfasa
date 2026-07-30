"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";

export function RetryEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/notifications/events/${eventId}/retry`, { method: "POST" }).catch(() => null);

    setPending(false);

    if (!response?.ok) {
      setError("Não foi possível reenfileirar o aviso. Atualize a página e tente novamente.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className={buttonClass("secondary", "min-h-8 px-3 text-xs")}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {pending ? "Reenfileirando" : "Tentar novamente"}
      </button>
      {error ? <p className="text-xs font-medium text-red-700" role="alert">{error}</p> : null}
    </div>
  );
}
