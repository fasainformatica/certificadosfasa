"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { buttonClass } from "@/components/ui/button-styles";
import { cn } from "@/lib/utils/cn";

type ManualNoticeButtonProps = {
  certificadoId: string;
  className?: string;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

export function ManualNoticeButton({ certificadoId, className }: ManualNoticeButtonProps) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function sendManualNotice() {
    if (pending) {
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/certificados/${certificadoId}/aviso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({
          tone: "error",
          message: payload?.error?.message ?? "Não foi possível enviar o aviso. Verifique o WhatsApp do cliente e tente novamente.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message: payload?.mensagem ?? "Aviso adicionado à fila de envio.",
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Não foi possível enviar o aviso. Verifique sua conexão e tente novamente.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <button
        type="button"
        className={buttonClass("secondary", "min-h-8 px-3 text-xs")}
        onClick={sendManualNotice}
        disabled={pending}
        aria-live="polite"
      >
        <Send aria-hidden="true" className="h-3.5 w-3.5" />
        {pending ? "Enviando aviso" : "Enviar aviso"}
      </button>
      {feedback ? (
        <span
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
          className={cn(
            "max-w-52 text-xs font-medium leading-4",
            feedback.tone === "success" ? "text-green-700" : "text-red-700",
          )}
          title={feedback.message}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
