"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/spec";

export function RetryEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setPending(true);
    setError(null);

    const response = await fetch(`/api/notifications/events/${eventId}/retry`, { method: "POST" }).catch(() => null);
    const payload = response?.ok ? null : await response?.json().catch(() => null);

    setPending(false);

    if (!response?.ok) {
      setError(payload?.error?.message ?? "Não foi possível reenfileirar o aviso. Atualize a página e tente novamente.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="grid gap-2">
      <Button variant="secondary" size="sm" icon={RotateCcw} onClick={retry} disabled={pending} aria-busy={pending}>
        {pending ? "Reenfileirando" : "Tentar novamente"}
      </Button>
      {error ? <p className="text-[13px] leading-[18px] text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
