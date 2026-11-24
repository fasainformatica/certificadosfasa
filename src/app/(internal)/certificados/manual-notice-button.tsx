"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/spec/button";
import styles from "./certificates.module.css";
import { cn } from "@/lib/utils/cn";

type ManualNoticeButtonProps = {
  certificadoId: string;
  className?: string;
  titular?: string;
  compact?: boolean;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

export function ManualNoticeButton({ certificadoId, className, titular, compact = false }: ManualNoticeButtonProps) {
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
    <div className={cn(styles.notice, className)} data-compact={compact}>
      {compact ? <Button iconOnly icon={Send} variant="secondary" size="sm" aria-label={pending ? `Enviando aviso para ${titular}` : `Enviar aviso para ${titular}`} onClick={sendManualNotice} disabled={pending} aria-busy={pending} /> :
        <Button icon={Send} variant="secondary" size="sm" onClick={sendManualNotice} disabled={pending} aria-busy={pending}>{pending ? "Enviando aviso" : "Enviar aviso"}</Button>}
      {feedback ? (
        <span
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
          className={styles.noticeFeedback}
          data-tone={feedback.tone}
          title={feedback.message}
        >
          {feedback.message}
        </span>
      ) : null}
    </div>
  );
}
