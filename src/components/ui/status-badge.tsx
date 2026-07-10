import type { ReactNode } from "react";

import type { CertificadoStatus } from "@/lib/supabase/database.types";
import { CERTIFICATE_STATUS_CLASS, CERTIFICATE_STATUS_LABEL } from "@/lib/certificados/status-labels";
import { cn } from "@/lib/utils/cn";

export type Tone = "blue" | "green" | "amber" | "red" | "slate";

const toneClasses: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  amber: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition duration-200",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: CertificadoStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition duration-200",
        CERTIFICATE_STATUS_CLASS[status],
      )}
    >
      {CERTIFICATE_STATUS_LABEL[status]}
    </span>
  );
}

export function getBotStatusMeta(connected: boolean): { label: string; tone: Tone } {
  return connected ? { label: "Conectado", tone: "green" } : { label: "Desconectado", tone: "red" };
}
