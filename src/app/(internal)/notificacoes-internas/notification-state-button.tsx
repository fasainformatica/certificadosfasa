"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cn } from "@/lib/utils/cn";

type NotificationStateButtonProps = {
  notificationId: string;
  action: "read" | "dismiss";
  disabled?: boolean;
};

const actionLabel = {
  read: "Marcar lida",
  dismiss: "Dispensar",
} satisfies Record<NotificationStateButtonProps["action"], string>;

const actionLoadingLabel = {
  read: "Marcando",
  dismiss: "Dispensando",
} satisfies Record<NotificationStateButtonProps["action"], string>;

export function NotificationStateButton({ notificationId, action, disabled = false }: NotificationStateButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isDisabled = disabled || pending;
  const Icon = action === "read" ? Check : X;

  async function handleClick() {
    setError(null);

    try {
      const response = await fetch(`/api/internal-notifications/${notificationId}/${action}`, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("request_failed");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch {
      setError(
        action === "read"
          ? "Não foi possível marcar como lida."
          : "Não foi possível dispensar a notificação.",
      );
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          action === "read"
            ? "text-blue-700 hover:bg-blue-50"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
        )}
        disabled={isDisabled}
        onClick={() => void handleClick()}
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        )}
        {pending ? actionLoadingLabel[action] : actionLabel[action]}
      </button>
      {error ? (
        <span className="max-w-40 text-xs leading-4 text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
