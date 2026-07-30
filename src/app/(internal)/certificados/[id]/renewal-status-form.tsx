"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonClass, selectClass, textAreaClass } from "@/components/ui/button-styles";
import { SectionCard } from "@/components/ui/section-card";
import { Badge } from "@/components/ui/status-badge";
import {
  CERTIFICATE_RENEWAL_STATUS_LABEL,
  CERTIFICATE_RENEWAL_STATUSES,
  getCertificateRenewalPresentation,
} from "@/lib/certificados/renewal-status";
import type { CertificateRenewalStatus } from "@/lib/supabase/database.types";

type RenewalStatusFormProps = {
  certificadoId: string;
  initialStatus: CertificateRenewalStatus;
  initialObservation: string | null;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

export function RenewalStatusForm({ certificadoId, initialStatus, initialObservation }: RenewalStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<CertificateRenewalStatus>(initialStatus);
  const [observation, setObservation] = useState(initialObservation ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const presentation = getCertificateRenewalPresentation(status);

  async function submitRenewalStatus() {
    if (pending) {
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/certificados/${certificadoId}/renovacao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          renovacao_status: status,
          renovacao_observacao: observation,
        }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFeedback({
          tone: "error",
          message: payload?.error?.message ?? "Não foi possível salvar a situação de renovação.",
        });
        return;
      }

      setFeedback({
        tone: "success",
        message: payload?.mensagem ?? "Situação de renovação salva.",
      });
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        message: "Não foi possível salvar. Verifique sua conexão e tente novamente.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Situação da renovação</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Use esta classificação para retirar certificados renovados fora do acompanhamento automático sem apagar o histórico.
          </p>
        </div>
        <Badge tone={presentation.tone}>{presentation.label}</Badge>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Situação
          <select
            className={selectClass}
            value={status}
            onChange={(event) => setStatus(event.target.value as CertificateRenewalStatus)}
            disabled={pending}
          >
            {CERTIFICATE_RENEWAL_STATUSES.map((item) => (
              <option key={item} value={item}>
                {CERTIFICATE_RENEWAL_STATUS_LABEL[item]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Observação
          <textarea
            className={textAreaClass}
            value={observation}
            onChange={(event) => setObservation(event.target.value)}
            maxLength={500}
            placeholder="Ex.: Cliente informou que renovou com outro fornecedor."
            disabled={pending}
          />
        </label>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <p className="font-semibold text-slate-950">{presentation.plannable ? "Permanece na operação" : "Sai da operação automática"}</p>
        <p className="mt-1">{presentation.planningImpact}</p>
        <p className="mt-1">Próxima ação: {presentation.nextAction}</p>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button type="button" className={buttonClass("primary")} onClick={submitRenewalStatus} disabled={pending}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          {pending ? "Salvando situação" : "Salvar situação"}
        </button>
        {feedback ? (
          <p
            aria-live="polite"
            className={feedback.tone === "success" ? "text-sm font-medium text-green-700" : "text-sm font-medium text-red-700"}
          >
            {feedback.message}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
