"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";

export function RetryEventButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    await fetch(`/api/notifications/events/${eventId}/retry`, { method: "POST" });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={retry}
      disabled={pending}
      className={buttonClass("secondary", "min-h-8 px-3 text-xs")}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      Tentar novamente
    </button>
  );
}
